import { Router } from "express";
import { db, productsTable, balanceRecordsTable } from "@workspace/db";
import type { Product } from "@workspace/db";
import { eq, and, sql, asc, max } from "drizzle-orm";
import ExcelJS from "exceljs";
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

// ── GET /api/msds/last-movements ─────────────────────────────────────────────
// Returns { [code]: lastBalanceDate } for all products in the warehouse.
// Used by the MSDS panel to show "last movement" age per product.

router.get("/last-movements", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const useWarehouse = warehouse && warehouse !== "all";

  // DISTINCT ON gets the most recent balance record's ultimoConsumo per code
  // (mirrors how Maestro de Productos computes "sin movimiento")
  const rows = await db.execute(
    useWarehouse
      ? sql`SELECT DISTINCT ON (code) code, ultimo_consumo AS "ultimoConsumo"
             FROM balance_records
             WHERE warehouse = ${warehouse}
             ORDER BY code, balance_date DESC`
      : sql`SELECT DISTINCT ON (code) code, ultimo_consumo AS "ultimoConsumo"
             FROM balance_records
             ORDER BY code, balance_date DESC`
  ) as { rows: Array<{ code: string; ultimoConsumo: string | null }> };

  const result: Record<string, string> = {};
  for (const row of rows.rows) {
    if (row.ultimoConsumo) result[row.code] = row.ultimoConsumo;
  }
  res.json(result);
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
    // Skip products already confirmed as EXACT unless force=true
    // (preserves manually-confirmed and auto-confirmed exact matches across rescans)
    if (!force && product.msdsStatus === "EXACT") {
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

// ── GET /api/msds/export ─────────────────────────────────────────────────────
// Generates a colored Excel report with two sheets: "Con MSDS" and "Sin MSDS".

const STATUS_LABEL: Record<string, string> = {
  EXACT: "Exacto",
  PROBABLE: "Probable",
  MANUAL_REVIEW: "Revisión manual",
  NONE: "Sin MSDS",
};

// Row fill colors by MSDS status
const STATUS_FILL: Record<string, ExcelJS.Fill> = {
  EXACT:         { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }, // green-100
  PROBABLE:      { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }, // yellow-100
  MANUAL_REVIEW: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } }, // orange-100
  NONE:          { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }, // red-100
};

function applyHeaderRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; // teal-700
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF0D9488" } },
    };
  });
  row.height = 22;
}

function applyDataRow(ws: ExcelJS.Worksheet, values: (string | number | null)[], status: string) {
  const row = ws.addRow(values);
  const fill = STATUS_FILL[status] ?? STATUS_FILL.NONE;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill;
    cell.alignment = { vertical: "middle", wrapText: false };
    cell.font = { size: 10 };
  });
  row.height = 18;
}

router.get("/export", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const condition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const products = await db
    .select()
    .from(productsTable)
    .where(condition)
    .orderBy(asc(productsTable.warehouse), asc(productsTable.type), asc(productsTable.name));

  const withMsds    = products.filter(p => p.msds);
  const withoutMsds = products.filter(p => !p.msds);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Almacén Químico";
  wb.created = new Date();

  const HEADERS = [
    "Almacén", "Tipo", "Código", "Nombre", "Ubicación",
    "Estado MSDS", "Puntuación", "Archivo MSDS", "Razón de coincidencia",
    "Vinculado por", "Última verificación",
  ];
  const COL_WIDTHS = [14, 14, 16, 36, 14, 16, 12, 34, 36, 14, 22];

  function productRow(p: Product): (string | number | null)[] {
    return [
      p.warehouse ?? "",
      p.type ?? "",
      p.code,
      p.name,
      p.location ?? "",
      STATUS_LABEL[p.msdsStatus ?? "NONE"] ?? (p.msdsStatus ?? ""),
      p.msdsScore ?? 0,
      p.msdsFileName ?? "",
      p.msdsMatchReason ?? "",
      p.msdsMatchedBy ?? "",
      p.msdsLastCheckedAt ? new Date(p.msdsLastCheckedAt).toLocaleDateString("es-SV") : "",
    ];
  }

  // ── Sheet 1: Con MSDS ──────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Con MSDS", { views: [{ state: "frozen", ySplit: 1 }] });
  ws1.columns = COL_WIDTHS.map((width, i) => ({ header: "", key: `c${i}`, width }));
  applyHeaderRow(ws1, HEADERS);
  for (const p of withMsds) {
    applyDataRow(ws1, productRow(p), p.msdsStatus ?? "NONE");
  }
  ws1.autoFilter = { from: "A1", to: `K1` };

  // ── Sheet 2: Sin MSDS ─────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Sin MSDS", { views: [{ state: "frozen", ySplit: 1 }] });
  ws2.columns = COL_WIDTHS.map((width, i) => ({ header: "", key: `c${i}`, width }));
  applyHeaderRow(ws2, HEADERS);
  for (const p of withoutMsds) {
    applyDataRow(ws2, productRow(p), "NONE");
  }
  ws2.autoFilter = { from: "A1", to: `K1` };

  // ── Sheet 3: Resumen ──────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet("Resumen");
  ws3.columns = [{ width: 26 }, { width: 14 }];
  const summaryTitle = ws3.addRow(["Resumen MSDS", ""]);
  summaryTitle.getCell(1).font = { bold: true, size: 13, color: { argb: "FF0F766E" } };
  ws3.addRow([]);
  const hdr = ws3.addRow(["Estado", "Cantidad"]);
  hdr.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; });

  const summary = [
    { label: "Exacto",          key: "EXACT",         argb: "FFD1FAE5", text: "FF065F46" },
    { label: "Probable",        key: "PROBABLE",       argb: "FFFEF9C3", text: "FF854D0E" },
    { label: "Revisión manual", key: "MANUAL_REVIEW",  argb: "FFFFEDD5", text: "FF9A3412" },
    { label: "Sin MSDS",        key: "NONE",           argb: "FFFEE2E2", text: "FF991B1B" },
  ];
  const counts: Record<string, number> = { EXACT: 0, PROBABLE: 0, MANUAL_REVIEW: 0, NONE: 0 };
  for (const p of products) { const k = p.msdsStatus ?? "NONE"; counts[k] = (counts[k] ?? 0) + 1; }

  for (const s of summary) {
    const r = ws3.addRow([s.label, counts[s.key] ?? 0]);
    r.eachCell(c => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.argb } };
      c.font = { bold: true, color: { argb: s.text } };
    });
  }
  ws3.addRow([]);
  const total = ws3.addRow(["Total productos", products.length]);
  total.eachCell(c => { c.font = { bold: true }; });

  // ── Send ──────────────────────────────────────────────────────────────────
  const warehouseSlug = (warehouse && warehouse !== "all" ? warehouse : "todos").replace(/\s+/g, "_");
  const filename = `informe_msds_${warehouseSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
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

  // A confirmable product needs at least a fileId or existing msds link.
  // MANUAL_REVIEW products have msdsFileId set but msds=false intentionally by rescan.
  const hasLinkedFile = product.msdsFileId || product.msdsUrl;
  if (!hasLinkedFile || product.msdsStatus === "NONE") {
    res.status(400).json({ error: "El producto no tiene un MSDS candidato vinculado" });
    return;
  }

  if (product.msdsStatus === "EXACT") {
    res.status(400).json({ error: "El MSDS ya está marcado como exacto" });
    return;
  }

  // For MANUAL_REVIEW products the URL was not saved; reconstruct it from the fileId.
  const msdsUrl = product.msdsUrl
    ?? (product.msdsFileId
      ? `https://drive.google.com/file/d/${product.msdsFileId}/view`
      : null);

  const now = new Date();
  await db.update(productsTable)
    .set({
      msds: true,
      msdsUrl: msdsUrl ?? product.msdsUrl,
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

// ── POST /api/msds/confirm-all ───────────────────────────────────────────────
// Bulk-promotes PROBABLE products (that already have a linked MSDS file) to EXACT.
// Designed to recover exact matches that were accidentally downgraded by a rescan.

router.post("/confirm-all", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const warehouse = req.body?.warehouse as string | undefined;

  // Promote all products with msds=true that are not yet EXACT.
  // This syncs Gestión Manual (msds flag) with Cruce Inteligente (msdsStatus).
  const warehouseCondition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const products = await db.select().from(productsTable)
    .where(
      warehouseCondition
        ? and(warehouseCondition, eq(productsTable.msds, true), sql`msds_status != 'EXACT'`)
        : and(eq(productsTable.msds, true), sql`msds_status != 'EXACT'`)
    );

  if (products.length === 0) {
    res.json({ confirmed: 0, message: "Todos los productos con MSDS ya son Exactos" });
    return;
  }

  const now = new Date();
  let confirmed = 0;
  for (const p of products) {
    const msdsUrl = p.msdsUrl ?? (p.msdsFileId ? `https://drive.google.com/file/d/${p.msdsFileId}/view` : null);
    if (!msdsUrl) continue;
    await db.update(productsTable)
      .set({
        msds: true,
        msdsUrl,
        msdsStatus: "EXACT" as MsdsMatchStatus,
        msdsMatchedBy: "manual",
        msdsMatchReason: p.msdsMatchReason
          ? `${p.msdsMatchReason} (confirmado)`
          : "Con MSDS en Gestión Manual",
        updatedAt: now,
      })
      .where(eq(productsTable.id, p.id));
    confirmed++;
  }

  res.json({ confirmed, message: `${confirmed} producto(s) sincronizados como Exacto` });
}));

// ── POST /api/msds/reset-all ──────────────────────────────────────────────────
// Resets matched products back to NONE using a single bulk SQL UPDATE,
// then immediately re-scans with the latest algorithm.
// resetManual=false (default): preserves manually confirmed links.
// resetManual=true: resets everything including manual links.

const resetAllSchema = z.object({
  warehouse: z.string().optional(),
  resetManual: z.boolean().optional().default(false),
});

router.post("/reset-all", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!guardDriveConfig(res)) return;

  const parsed = resetAllSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }

  const { warehouse, resetManual } = parsed.data;
  const now = new Date();

  // ── Step 1: Bulk reset via single SQL UPDATE (avoids N sequential awaits) ──
  // Build WHERE clause dynamically
  const warehouseCond = warehouse && warehouse !== "all"
    ? sql`AND warehouse = ${warehouse}`
    : sql``;

  const manualCond = resetManual
    ? sql``                                       // reset everything
    : sql`AND (msds_matched_by IS NULL OR msds_matched_by != 'manual')`;

  const resetResult = await db.execute(sql`
    UPDATE products
    SET
      msds              = false,
      msds_url          = NULL,
      msds_status       = 'NONE',
      msds_score        = 0,
      msds_file_id      = NULL,
      msds_file_name    = NULL,
      msds_match_reason = NULL,
      msds_matched_by   = NULL,
      msds_last_checked_at = ${now},
      updated_at        = ${now}
    WHERE
      msds_status IS NOT NULL
      AND msds_status != 'NONE'
      ${warehouseCond}
      ${manualCond}
  `);

  const resetCount = (resetResult as any).rowCount ?? 0;

  // ── Step 2: Re-scan with new matcher ─────────────────────────────────────
  const warehouseCondition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const [products, files] = await Promise.all([
    db.select().from(productsTable).where(warehouseCondition),
    getDriveMsdsFiles(),
  ]);

  // Batch DB writes: collect all updates then execute in parallel batches of 20
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const product of products) {
    if (!resetManual && product.msdsMatchedBy === "manual") continue;

    const match = matchProductWithFiles(
      { code: product.code, name: product.name, supplier: product.supplier, casNumber: product.casNumber },
      files,
    );
    const best = match.best;
    const status = match.status as MsdsMatchStatus;

    updates.push({
      id: product.id,
      data: {
        msdsStatus:       status,
        msdsScore:        match.score,
        msdsFileId:       best?.fileId ?? null,
        msdsFileName:     best?.fileName ?? null,
        msdsMatchReason:  match.reason,
        msdsMatchedBy:    "auto",
        msdsLastCheckedAt: now,
        ...(status === "EXACT" || status === "PROBABLE"
          ? { msds: true, msdsUrl: best!.link, updatedAt: now }
          : { updatedAt: now }),
      },
    });
  }

  // Execute in batches of 25 concurrent updates
  const BATCH_SIZE = 25;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ id, data }) =>
        db.update(productsTable).set(data as any).where(eq(productsTable.id, id)),
      ),
    );
  }

  res.json({
    message: "Reinicio y re-escaneo completados",
    resetCount,
    rescanned: updates.length,
    filesScanned: files.length,
    totalProducts: products.length,
  });
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
