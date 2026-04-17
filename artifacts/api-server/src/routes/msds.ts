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
  const msdsData = {
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
  };

  // Update all products with the same code across all warehouses
  await db.update(productsTable)
    .set(msdsData)
    .where(eq(productsTable.code, product.code));

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

  // Track codes already processed to avoid duplicate work for same-code products
  // (products with same code share the same MSDS — match once, apply to all by code)
  const processedCodes = new Set<string>();

  for (const product of products) {
    // Skip if already processed this code (handled via bulk update by code)
    if (processedCodes.has(product.code)) {
      skipped++;
      continue;
    }

    // Protect manual links: if ANY product with this code was manually confirmed, skip all
    // unless force=true
    if (!force && product.msdsMatchedBy === "manual") {
      // Mark all products with same code as skipped
      processedCodes.add(product.code);
      skipped++;
      continue;
    }

    // Also protect if the product has EXACT status from a manual link,
    // even if msdsMatchedBy was not saved as "manual" (legacy records)
    if (!force && product.msdsStatus === "EXACT" && product.msds && product.msdsUrl) {
      processedCodes.add(product.code);
      skipped++;
      continue;
    }

    const match = matchProductWithFiles(
      { code: product.code, name: product.name, supplier: product.supplier, casNumber: product.casNumber },
      files,
    );

    const best = match.best;
    const status = match.status as MsdsMatchStatus;

    // Apply to ALL products with the same code across all warehouses (not just this row)
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
              msds: false,
              msdsUrl: null,
              updatedAt: now,
            }),
      })
      .where(eq(productsTable.code, product.code));

    processedCodes.add(product.code);
    updated++;
  }

  res.json({
    message: "Rescan completado",
    filesScanned: files.length,
    productsProcessed: updated,
    productsSkipped: skipped,
    totalProducts: products.length,
    uniqueCodes: processedCodes.size,
  });
}));

// ── POST /api/msds/:productId/candidates ─────────────────────────────────────
// Returns fresh match candidates from Drive for a single product.
// Unlike GET /match/:productId, this always fetches fresh Drive file list
// and returns ALL candidates (up to 10). Used for the "Re-buscar" button
// on products with NONE status.

router.post("/:productId/candidates", requireAuth, asyncHandler(async (req, res) => {
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

  const files = await getDriveMsdsFiles();
  const match = matchProductWithFiles(
    { code: product.code, name: product.name, supplier: product.supplier, casNumber: product.casNumber },
    files,
  );

  // Return top 10 candidates (more than the default 5)
  const allCandidates = match.candidates;

  res.json({
    product: {
      id: product.id,
      code: product.code,
      name: product.name,
      warehouse: product.warehouse,
      msdsStatus: product.msdsStatus,
    },
    filesScanned: files.length,
    status: match.status,
    score: match.score,
    candidates: allCandidates,
    hasCandidates: allCandidates.length > 0,
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
  const msdsResetData = {
    msds: false,
    msdsUrl: null,
    msdsStatus: "NONE" as MsdsMatchStatus,
    msdsScore: 0,
    msdsFileId: null,
    msdsFileName: null,
    msdsMatchReason: null,
    msdsMatchedBy: null,
    msdsLastCheckedAt: now,
    updatedAt: now,
  };

  // Update all products with the same code across all warehouses
  await db.update(productsTable)
    .set(msdsResetData)
    .where(eq(productsTable.code, product.code));

  const [updated] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  // Also return all products with the same code to show the global update
  const allUpdated = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.code, product.code));

  res.json({
    message: "MSDS desvinculado de todos los almacenes con el mismo codigo",
    updated: allUpdated,
  });
}));

// ── POST /api/msds/:productId/confirm ────────────────────────────────────────────────────────
// Confirms a single product's MSDS link and propagates to all warehouses with same code.

router.post("/:productId/confirm", requireAuth, requireRole("admin", "supervisor", "operator"), asyncHandler(async (req: AuthenticatedRequest, res) => {
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
    res.status(400).json({ error: "El producto no tiene un archivo MSDS vinculado" });
    return;
  }

  if (product.msdsStatus === "EXACT") {
    res.status(400).json({ error: "El producto ya esta confirmado como Exacto" });
    return;
  }

  const msdsUrl = product.msdsUrl
    ?? (product.msdsFileId
      ? `https://drive.google.com/file/d/${product.msdsFileId}/view`
      : null);

  if (!msdsUrl) {
    res.status(400).json({ error: "No se puede determinar la URL del MSDS" });
    return;
  }

  const now = new Date();
  const confirmData = {
    msds: true,
    msdsUrl: msdsUrl ?? product.msdsUrl,
    msdsStatus: "EXACT" as MsdsMatchStatus,
    msdsMatchedBy: "manual",
    msdsMatchReason: product.msdsMatchReason
      ? `${product.msdsMatchReason} (confirmado manualmente)`
      : "Confirmado manualmente",
    msdsLastCheckedAt: now,
    updatedAt: now,
  };

  // Update all products with the same code across all warehouses
  await db.update(productsTable)
    .set(confirmData)
    .where(eq(productsTable.code, product.code));

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

// "Días sin consumo" badge colors (applied to cell background only)
function diasFill(dias: number | null): ExcelJS.Fill {
  if (dias === null) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }; // gray-200 – sin dato
  if (dias <= 30)   return { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }; // green-100
  if (dias <= 90)   return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }; // yellow-100
  if (dias <= 180)  return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } }; // orange-100
  return               { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; // red-100 > 6 meses
}

function applyHeaderRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; // teal-700
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top:    { style: "thin", color: { argb: "FF0D9488" } },
      bottom: { style: "medium", color: { argb: "FF0D9488" } },
      left:   { style: "thin", color: { argb: "FF0D9488" } },
      right:  { style: "thin", color: { argb: "FF0D9488" } },
    };
  });
  row.height = 26;
}

function applyDataRow(
  ws: ExcelJS.Worksheet,
  values: (string | number | null)[],
  status: string,
  diasSinConsumo: number | null,
) {
  const row = ws.addRow(values);
  const fill = STATUS_FILL[status] ?? STATUS_FILL.NONE;

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    // Last column = "Días sin consumo" → special color coding
    const isLastCol = colNumber === values.length;
    cell.fill = isLastCol ? diasFill(diasSinConsumo) : fill;
    cell.alignment = { vertical: "middle", wrapText: false };
    cell.font = { size: 10 };
    cell.border = {
      bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
      right:  { style: "hair", color: { argb: "FFD1D5DB" } },
    };
  });
  row.height = 18;
}

/** Computes the number of days between a date string (YYYY-MM-DD) and today. */
function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

router.get("/export", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const useWarehouse = warehouse && warehouse !== "all";
  const condition = useWarehouse ? eq(productsTable.warehouse, warehouse) : undefined;

  // ── Fetch products + last-consumption in parallel ─────────────────────────
  const [products, consumoRows] = await Promise.all([
    db
      .select()
      .from(productsTable)
      .where(condition)
      .orderBy(asc(productsTable.warehouse), asc(productsTable.type), asc(productsTable.name)),
    db.execute(
      useWarehouse
        ? sql`SELECT DISTINCT ON (code) code, ultimo_consumo AS "ultimoConsumo"
               FROM balance_records
               WHERE warehouse = ${warehouse}
               ORDER BY code, balance_date DESC`
        : sql`SELECT DISTINCT ON (code) code, ultimo_consumo AS "ultimoConsumo"
               FROM balance_records
               ORDER BY code, balance_date DESC`
    ) as Promise<{ rows: Array<{ code: string; ultimoConsumo: string | null }> }>,
  ]);

  // Build a quick lookup: code → ultimoConsumo string
  const consumoMap = new Map<string, string>();
  for (const row of consumoRows.rows) {
    if (row.ultimoConsumo) consumoMap.set(row.code, row.ultimoConsumo);
  }

  const withMsds    = products.filter(p => p.msds);
  const withoutMsds = products.filter(p => !p.msds);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Almacén Químico";
  wb.created = new Date();

  // ── Column definitions (shared between data sheets) ───────────────────────
  const HEADERS = [
    "Almacén", "Tipo", "Código", "Nombre", "Ubicación",
    "Estado MSDS", "Puntuación", "Archivo MSDS", "Razón de coincidencia",
    "Vinculado por", "Última verificación",
    "Último consumo", "Días sin consumo",
  ];
  // Column widths match the header order above
  const COL_WIDTHS = [14, 14, 16, 36, 14, 16, 11, 34, 36, 14, 22, 16, 16];

  function productRow(p: typeof products[number]): (string | number | null)[] {
    const ultimoConsumo = consumoMap.get(p.code) ?? null;
    const dias = daysSince(ultimoConsumo);
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
      ultimoConsumo
        ? new Date(ultimoConsumo + "T00:00:00").toLocaleDateString("es-SV")
        : "Sin registro",
      dias !== null ? dias : "Sin registro",
    ];
  }

  /** Adds the shared title block above the header row. */
  function addSheetTitle(ws: ExcelJS.Worksheet, title: string, colCount: number) {
    const titleRow = ws.addRow([title]);
    const titleCell = titleRow.getCell(1);
    titleCell.font  = { bold: true, size: 14, color: { argb: "FF0F766E" } };
    titleCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDFA" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleRow.height = 28;

    // Sub-title row: generation date
    const subRow = ws.addRow([
      `Generado: ${new Date().toLocaleDateString("es-SV", { day: "2-digit", month: "long", year: "numeric" })}`,
    ]);
    subRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    subRow.height = 14;

    // Empty separator
    ws.addRow([]);
  }

  /** Applies freeze + filter to the header row (row number passed in). */
  function finalizeSheet(ws: ExcelJS.Worksheet, headerRowNum: number, colCount: number) {
    const lastCol = String.fromCharCode(64 + colCount); // A=65 → 'A'+colCount
    ws.autoFilter = { from: `A${headerRowNum}`, to: `${lastCol}${headerRowNum}` };
    ws.views = [{ state: "frozen", ySplit: headerRowNum }];
  }

  // ── Sheet 1: Con MSDS ──────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Con MSDS");
  ws1.columns = COL_WIDTHS.map((width, i) => ({ header: "", key: `c${i}`, width }));
  addSheetTitle(ws1, `Con MSDS (${withMsds.length} productos)`, HEADERS.length);
  const ws1HeaderRow = ws1.rowCount + 1;
  applyHeaderRow(ws1, HEADERS);
  for (const p of withMsds) {
    const ultimoConsumo = consumoMap.get(p.code) ?? null;
    applyDataRow(ws1, productRow(p), p.msdsStatus ?? "NONE", daysSince(ultimoConsumo));
  }
  finalizeSheet(ws1, ws1HeaderRow, HEADERS.length);

  // ── Sheet 2: Sin MSDS ─────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Sin MSDS");
  ws2.columns = COL_WIDTHS.map((width, i) => ({ header: "", key: `c${i}`, width }));
  addSheetTitle(ws2, `Sin MSDS (${withoutMsds.length} productos)`, HEADERS.length);
  const ws2HeaderRow = ws2.rowCount + 1;
  applyHeaderRow(ws2, HEADERS);
  for (const p of withoutMsds) {
    const ultimoConsumo = consumoMap.get(p.code) ?? null;
    applyDataRow(ws2, productRow(p), "NONE", daysSince(ultimoConsumo));
  }
  finalizeSheet(ws2, ws2HeaderRow, HEADERS.length);

  // ── Sheet 3: Resumen ──────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet("Resumen");
  ws3.columns = [{ width: 28 }, { width: 16 }, { width: 16 }];

  // Title
  const summaryTitle = ws3.addRow(["Informe MSDS — Resumen", "", ""]);
  summaryTitle.getCell(1).font = { bold: true, size: 14, color: { argb: "FF0F766E" } };
  summaryTitle.height = 28;
  const subTitle = ws3.addRow([
    `Generado: ${new Date().toLocaleDateString("es-SV", { day: "2-digit", month: "long", year: "numeric" })}`,
    "", "",
  ]);
  subTitle.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  ws3.addRow([]);

  // Status breakdown
  const hdr = ws3.addRow(["Estado MSDS", "Cantidad", "% del total"]);
  hdr.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { bottom: { style: "medium", color: { argb: "FF0D9488" } } };
  });
  hdr.height = 22;

  const statusSummary = [
    { label: "Exacto",          key: "EXACT",         argb: "FFD1FAE5", text: "FF065F46" },
    { label: "Probable",        key: "PROBABLE",       argb: "FFFEF9C3", text: "FF854D0E" },
    { label: "Revisión manual", key: "MANUAL_REVIEW",  argb: "FFFFEDD5", text: "FF9A3412" },
    { label: "Sin MSDS",        key: "NONE",           argb: "FFFEE2E2", text: "FF991B1B" },
  ];
  const counts: Record<string, number> = { EXACT: 0, PROBABLE: 0, MANUAL_REVIEW: 0, NONE: 0 };
  for (const p of products) { const k = p.msdsStatus ?? "NONE"; counts[k] = (counts[k] ?? 0) + 1; }
  const total = products.length || 1;

  for (const s of statusSummary) {
    const cnt = counts[s.key] ?? 0;
    const r = ws3.addRow([s.label, cnt, `${((cnt / total) * 100).toFixed(1)}%`]);
    r.eachCell(c => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.argb } };
      c.font = { bold: true, color: { argb: s.text }, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    r.height = 18;
  }

  ws3.addRow([]);
  const totalRow = ws3.addRow(["Total productos", products.length, "100%"]);
  totalRow.eachCell(c => {
    c.font = { bold: true, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  totalRow.height = 20;

  // Consumption aging breakdown
  ws3.addRow([]);
  ws3.addRow([]);
  const agingHdr = ws3.addRow(["Antigüedad de consumo", "Cantidad", "% del total"]);
  agingHdr.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }; // blue-700
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { bottom: { style: "medium", color: { argb: "FF1D4ED8" } } };
  });
  agingHdr.height = 22;

  const agingBuckets = [
    { label: "≤ 30 días",        argb: "FFD1FAE5", text: "FF065F46", test: (d: number | null) => d !== null && d <= 30 },
    { label: "31 – 90 días",     argb: "FFFEF9C3", text: "FF854D0E", test: (d: number | null) => d !== null && d > 30 && d <= 90 },
    { label: "91 – 180 días",    argb: "FFFFEDD5", text: "FF9A3412", test: (d: number | null) => d !== null && d > 90 && d <= 180 },
    { label: "> 180 días",       argb: "FFFEE2E2", text: "FF991B1B", test: (d: number | null) => d !== null && d > 180 },
    { label: "Sin registro",     argb: "FFE5E7EB", text: "FF374151", test: (d: number | null) => d === null },
  ];

  for (const bucket of agingBuckets) {
    const cnt = products.filter(p => bucket.test(daysSince(consumoMap.get(p.code) ?? null))).length;
    const r = ws3.addRow([bucket.label, cnt, `${((cnt / total) * 100).toFixed(1)}%`]);
    r.eachCell(c => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bucket.argb } };
      c.font = { bold: true, color: { argb: bucket.text }, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    r.height = 18;
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const warehouseSlug = (warehouse && warehouse !== "all" ? warehouse : "todos").replace(/\s+/g, "_");
  const filename = `informe_msds_${warehouseSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
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

// ── POST /api/msds/reset-only ──────────────────────────────────────────────────
// Resets matched products back to NONE using a single bulk SQL UPDATE.
// resetManual=false (default): preserves manually confirmed links.
// resetManual=true: resets everything including manual links.

const resetSchema = z.object({
  warehouse: z.string().optional(),
  resetManual: z.boolean().optional().default(false),
});

router.post("/reset-only", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }

  const { warehouse, resetManual } = parsed.data;
  const now = new Date();

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

  res.json({
    message: `Reset completado — ${resetCount} productos limpiados. Ahora presiona 'Escanear Drive' para re-clasificar.`,
    resetCount,
  });
}));

// ── POST /api/msds/reset-all ──────────────────────────────────────────────────
// Deprecated: Use reset-only instead. Kept for backward compatibility but 
// Step 2 (re-scan) is removed to avoid the "instant-EXACT" bug.

router.post("/reset-all", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }

  const { warehouse, resetManual } = parsed.data;
  const now = new Date();

  const warehouseCond = warehouse && warehouse !== "all"
    ? sql`AND warehouse = ${warehouse}`
    : sql``;

  const manualCond = resetManual
    ? sql``
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

  res.json({
    message: "Reinicio completado",
    resetCount,
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
