import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import type { Product } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { getDriveMsdsFiles, isMsdsDriveConfigured } from "../lib/google-drive.js";
import { extractMsdsDataFromDrive } from "../lib/extract-msds-data.js";
import { logger } from "../lib/logger.js";
import {
  matchProductWithFiles,
  classifyMatch,
  type MsdsMatchStatus,
} from "../lib/msds-matcher.js";
import { z } from "zod/v4";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function guardDriveConfig(res: Parameters<typeof asyncHandler>[0] extends (...args: infer A) => unknown ? A[1] : never): boolean {
  if (!isMsdsDriveConfigured()) {
    (res as any).status(503).json({
      error: "Google Drive MSDS no configurado. Agrega GOOGLE_DRIVE_MSDS_FOLDER_ID y GOOGLE_SERVICE_ACCOUNT_JSON.",
    });
    return false;
  }
  return true;
}

// ── GET /api/msds/stats ───────────────────────────────────────────────────────
// Returns counts per msdsStatus for the given warehouse.

router.get("/stats", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const condition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const rows = await db
    .select({
      status: productsTable.msdsStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(productsTable)
    .where(condition)
    .groupBy(productsTable.msdsStatus);

  const stats: Record<string, number> = { EXACT: 0, PROBABLE: 0, MANUAL_REVIEW: 0, NONE: 0 };
  for (const row of rows) {
    const key = (row.status ?? "NONE") as string;
    stats[key] = (stats[key] ?? 0) + row.count;
  }
  res.json(stats);
}));

// ── GET /api/msds/match ───────────────────────────────────────────────────────
// Runs the matcher against ALL products and returns dry-run results (no DB save).

router.get("/match", requireAuth, asyncHandler(async (req, res) => {
  if (!guardDriveConfig(res)) return;

  const warehouse = req.query.warehouse as string | undefined;
  const condition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const [products, files] = await Promise.all([
    db.select().from(productsTable).where(condition),
    getDriveMsdsFiles(),
  ]);

  const results = products.map((p) => {
    const match = matchProductWithFiles(
      { code: p.code, name: p.name, supplier: p.supplier, casNumber: p.casNumber },
      files,
    );
    return {
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      warehouse: p.warehouse,
      currentMsdsUrl: p.msdsUrl,
      currentMsds: p.msds,
      match,
    };
  });

  res.json({
    total: results.length,
    filesScanned: files.length,
    results,
  });
}));

// ── GET /api/msds/match/:productId ────────────────────────────────────────────
// Returns match candidates for a single product.

router.get("/match/:productId", requireAuth, asyncHandler(async (req, res) => {
  if (!guardDriveConfig(res)) return;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, req.params["productId"]!))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const files = await getDriveMsdsFiles();
  const match = matchProductWithFiles(
    { code: product.code, name: product.name, supplier: product.supplier, casNumber: product.casNumber },
    files,
  );

  res.json({
    product: {
      id: product.id,
      code: product.code,
      name: product.name,
      warehouse: product.warehouse,
      currentMsdsUrl: product.msdsUrl,
      currentMsds: product.msds,
    },
    filesScanned: files.length,
    match,
  });
}));

// ── POST /api/msds/link ───────────────────────────────────────────────────────
// Manually links a product to a specific Drive file.

const linkSchema = z.object({
  productId: z.string().min(1),
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  link: z.string().url(),
  score: z.number().optional().default(0),
  reason: z.string().optional().default("Vinculación manual"),
});

router.post("/link", requireAuth, requireRole("admin", "supervisor", "operator"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }

  const { productId, fileId, fileName, link, score, reason } = parsed.data;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const now = new Date();
  await db.update(productsTable)
    .set({
      msds: true,
      msdsUrl: link,
      msdsStatus: "EXACT" as MsdsMatchStatus,
      msdsScore: score,
      msdsFileId: fileId,
      msdsFileName: fileName,
      msdsMatchReason: reason,
      msdsMatchedBy: "manual",
      msdsLastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(productsTable.id, productId));

  const [updated] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  res.json(updated);
}));

// ── POST /api/msds/rescan ─────────────────────────────────────────────────────
// Runs the full matcher and saves results to the database for all products.
// Respects warehouse filter. Only updates products that don't already have
// a manual link (msdsMatchedBy = 'manual') unless force=true is passed.

const rescanSchema = z.object({
  warehouse: z.string().optional(),
  force: z.boolean().optional().default(false),
});

router.post("/rescan", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!guardDriveConfig(res)) return;

  const parsed = rescanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }

  const { warehouse, force } = parsed.data;
  const condition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const [products, files] = await Promise.all([
    db.select().from(productsTable).where(condition),
    getDriveMsdsFiles(),
  ]);

  let updated = 0;
  let skipped = 0;

  const now = new Date();

  for (const product of products) {
    // Skip manually linked products unless force=true
    if (!force && product.msdsMatchedBy === "manual") {
      skipped++;
      continue;
    }

    const match = matchProductWithFiles(
      { code: product.code, name: product.name, supplier: product.supplier, casNumber: product.casNumber },
      files,
    );

    const best = match.best;
    const status = match.status as MsdsMatchStatus;

    await db.update(productsTable)
      .set({
        msdsStatus: status,
        msdsScore: match.score,
        msdsFileId: best?.fileId ?? null,
        msdsFileName: best?.fileName ?? null,
        msdsMatchReason: match.reason,
        msdsMatchedBy: "auto",
        msdsLastCheckedAt: now,
        // Only update msdsUrl and msds flag if we have a confident match
        ...(status === "EXACT" || status === "PROBABLE"
          ? {
              msds: true,
              msdsUrl: best!.link,
              updatedAt: now,
            }
          : {
              updatedAt: now,
            }),
      })
      .where(eq(productsTable.id, product.id));

    updated++;
  }

  res.json({
    message: "Rescan completado",
    filesScanned: files.length,
    productsProcessed: updated,
    productsSkipped: skipped,
    totalProducts: products.length,
  });
}));

// ── POST /api/msds/unlink ─────────────────────────────────────────────────────
// Removes the MSDS link from a product and resets match fields.

router.post("/unlink", requireAuth, requireRole("admin", "supervisor", "operator"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { productId } = z.object({ productId: z.string().min(1) }).parse(req.body);

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const now = new Date();
  await db.update(productsTable)
    .set({
      msds: false,
      msdsUrl: null,
      msdsStatus: "NONE",
      msdsScore: 0,
      msdsFileId: null,
      msdsFileName: null,
      msdsMatchReason: null,
      msdsMatchedBy: null,
      msdsLastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(productsTable.id, productId));

  const [updated] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  res.json(updated);
}));

// ── POST /api/msds/:productId/confirm ────────────────────────────────────────
// Promotes a PROBABLE or MANUAL_REVIEW match to EXACT after human verification.

router.post("/:productId/confirm", requireAuth, requireRole("admin", "supervisor", "operator"), asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  if (!product.msds || product.msdsStatus === "NONE") {
    res.status(400).json({ error: "El producto no tiene un MSDS vinculado" });
    return;
  }

  if (product.msdsStatus === "EXACT") {
    res.status(400).json({ error: "El MSDS ya está marcado como exacto" });
    return;
  }

  const now = new Date();
  await db.update(productsTable)
    .set({
      msdsStatus: "EXACT",
      msdsMatchedBy: "manual",
      msdsMatchReason: product.msdsMatchReason
        ? `${product.msdsMatchReason} (confirmado manualmente)`
        : "Confirmado manualmente",
      updatedAt: now,
    })
    .where(eq(productsTable.id, productId));

  const [updated] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  res.json(updated);
}));

// ── POST /api/msds/:productId/extract ────────────────────────────────────────
// Downloads the linked MSDS PDF from Drive, extracts text, and uses AI to
// parse the 7 key safety fields. Saves the result to the product record.

router.post("/:productId/extract", requireAuth, requireRole("admin", "supervisor", "quality"), asyncHandler(async (req, res) => {
  if (!guardDriveConfig(res as any)) return;

  const { productId } = req.params;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  if (!product.msdsFileId) {
    res.status(400).json({ error: "El producto no tiene una MSDS vinculada. Primero vincula una MSDS desde el Cruce Inteligente." });
    return;
  }

  logger.info({ productId, fileId: product.msdsFileId }, "MSDS extraction requested");

  const extracted = await extractMsdsDataFromDrive(product.msdsFileId);

  await db.update(productsTable)
    .set({
      msdsExtractedData: extracted as any,
      msdsExtractedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(productsTable.id, productId));

  const [updated] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  res.json({ product: updated, extracted });
}));

// ── DELETE /api/msds/:productId/extract ──────────────────────────────────────
// Clears the extracted MSDS data from a product.

router.delete("/:productId/extract", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req, res) => {
  const { productId } = req.params;

  await db.update(productsTable)
    .set({ msdsExtractedData: null, msdsExtractedAt: null, updatedAt: new Date() })
    .where(eq(productsTable.id, productId));

  res.json({ message: "Datos extraídos eliminados correctamente" });
}));

export default router;
