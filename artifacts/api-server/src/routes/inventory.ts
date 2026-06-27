import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { parseExcelBuffer, normalizeHeaders } from "../lib/excel-parser.js";
import { db } from "@workspace/db";
import { inventoryRecordsTable, productsTable, inventoryBoxesTable, inventoryCyclesTable, inventoryCycleProductsTable, inventoryRoundsTable } from "@workspace/db";
import { eq, desc, asc, sql, and, inArray, count, max } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import { uploadFileToDrive } from "../lib/google-drive.js";
import { writeAuditLog } from "../lib/audit.js";
import { parsePagination } from "../lib/pagination.js";
import { logger } from "../lib/logger.js";
import { validateMimeType } from "../lib/validate-mime.js";

/**
 * Inventario
 * GET /inventory, POST /inventory, POST /inventory/:id/photos, DELETE /inventory/:id/photos/:idx
 */

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

const boxUpload = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "photo0", maxCount: 1 },
  { name: "photo1", maxCount: 1 },
  { name: "photo2", maxCount: 1 },
  { name: "photo3", maxCount: 1 },
  { name: "photo4", maxCount: 1 },
]);

const inventorySchema = z.object({
  warehouse: z.string().min(1).default("General"),
  productId: z.string().min(1),
  recordDate: z.string().min(1),
  responsible: z.string().optional(),
  previousBalance: z.string().default("0"),
  inputs: z.string().default("0"),
  outputs: z.string().default("0"),
  finalBalance: z.string().default("0"),
  physicalCount: z.preprocess(v => (v === "" || v == null) ? null : v, z.string().nullable().optional()),
  location: z.string().optional(),
  missingLabel: z.preprocess(v => v === "true" || v === true, z.boolean().optional().default(false)),
  notes: z.string().optional(),
  boxesData: z.string().optional(),
});

type Files = { [fieldname: string]: Express.Multer.File[] };

function buildInventoryPhotoName(productLabel: string, date: string, boxIndex: number, ext: string): string {
  const slug = productLabel
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 30)
    .replace(/^_|_$/g, "");
  const d = date.replace(/-/g, "");
  return `inv_${slug}_${d}_caja${boxIndex}${ext}`;
}

async function uploadBoxPhotos(files: Files, productLabel: string, date: string): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];
  for (let i = 0; i < 5; i++) {
    const fieldFiles = files[`photo${i}`];
    if (fieldFiles && fieldFiles.length > 0) {
      try {
        const file = fieldFiles[0]!;
        await validateMimeType(file.buffer, "image");
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildInventoryPhotoName(productLabel, date, i + 1, ext);
        const { url } = await uploadFileToDrive(file.buffer, fileName, file.mimetype);
        urls.push(url);
      } catch (err) {
        logger.warn({ err }, `Photo upload failed for box ${i}`);
        urls.push(null);
      }
    } else {
      urls.push(null);
    }
  }
  return urls;
}

// ── Live Progress ──────────────────────────────────────────────────────────────
// Progreso en tiempo real basado en registros de inventario (no depende de ciclos)

router.get("/progress", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;

  // Total productos activos en el almacén
  const warehouseCondition = warehouse && warehouse !== "all"
    ? eq(productsTable.warehouse, warehouse)
    : undefined;

  const [totalProducts] = await db.select({ total: count() })
    .from(productsTable)
    .where(warehouseCondition ? and(eq(productsTable.status, "active"), warehouseCondition) : eq(productsTable.status, "active"));

  // Productos que ya tienen al menos un registro de inventario
  // NOTA: Usamos p.warehouse en vez de ir.warehouse porque la columna warehouse
  // en inventory_records se agregó después (migración 0002, DEFAULT 'General'),
  // lo que dejaba registros antiguos fuera del progreso.
  const inventoriedResult = await db.execute(sql`
    SELECT COUNT(DISTINCT ir.product_id)::int AS inventoried
    FROM inventory_records ir
    INNER JOIN products p ON p.id = ir.product_id AND p.status = 'active'
    ${warehouse && warehouse !== "all" ? sql`WHERE p.warehouse = ${warehouse}` : sql``}
  `);
  const inventoried = (inventoriedResult.rows[0] as { inventoried: number } | undefined)?.inventoried ?? 0;
  const total = Number(totalProducts?.total ?? 0);
  const pending = Math.max(0, total - inventoried);
  const percentage = total > 0 ? Math.round((inventoried / total) * 100) : 0;

  res.json({
    totalProducts: total,
    inventoried,
    pending,
    percentage,
  });
}));

// ── Stats ─────────────────────────────────────────────────────────────────────
// Optimizado: una sola consulta SQL agregada en vez de N iteraciones en JS.

router.get("/stats", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const warehouseCond = warehouse && warehouse !== "all"
    ? sql`AND p.warehouse = ${warehouse}`
    : sql``;

  const result = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (ir.product_id)
        ir.product_id,
        ir.previous_balance::numeric,
        ir.physical_count::numeric
      FROM inventory_records ir
      JOIN products p ON p.id = ir.product_id
      WHERE p.status = 'active' ${warehouseCond}
      ORDER BY ir.product_id, ir.record_date DESC, ir.created_at DESC
    )
    SELECT
      COUNT(*)::int AS total_products,
      COUNT(*) FILTER (WHERE l.product_id IS NULL)::int AS without_records,
      COUNT(*) FILTER (
        WHERE l.product_id IS NOT NULL AND l.physical_count IS NOT NULL
          AND ABS(l.physical_count - l.previous_balance) < 0.01
      )::int AS exact,
      COUNT(*) FILTER (
        WHERE l.product_id IS NOT NULL AND l.physical_count IS NOT NULL
          AND (l.physical_count - l.previous_balance) >= 0.01
      )::int AS surplus,
      COUNT(*) FILTER (
        WHERE l.product_id IS NOT NULL AND l.physical_count IS NOT NULL
          AND (l.physical_count - l.previous_balance) <= -0.01
      )::int AS shortage
    FROM products p
    LEFT JOIN latest l ON l.product_id = p.id
    WHERE p.status = 'active' ${warehouseCond}
  `);

  const row = result.rows[0] as Record<string, number> | undefined;
  const totalProducts = row?.total_products ?? 0;
  const withoutRecords = row?.without_records ?? 0;
  const exact = row?.exact ?? 0;
  const surplus = row?.surplus ?? 0;
  const shortage = row?.shortage ?? 0;

  res.json({ totalProducts, withoutRecords, exact, withDifference: surplus + shortage, surplus, shortage });
}));

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
  const conditions: ReturnType<typeof and>[] = [];
  if (warehouse && warehouse !== "all") {
    conditions.push(eq(inventoryRecordsTable.warehouse, warehouse) as any);
  }
  if (req.query.productId) {
    conditions.push(eq(inventoryRecordsTable.productId, req.query.productId as string) as any);
  }
  const condition = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, records] = await Promise.all([
    db.select({ total: count() }).from(inventoryRecordsTable).where(condition),
    db.select()
      .from(inventoryRecordsTable)
      .innerJoin(productsTable, eq(inventoryRecordsTable.productId, productsTable.id))
      .where(condition)
      .orderBy(asc(productsTable.code), desc(inventoryRecordsTable.recordDate))
      .limit(limit)
      .offset(offset),
  ]);
  // Flatten joined result — extract inventory record only
  const flatRecords = records.map(r => r.inventory_records);
  const total = countResult[0]?.total ?? 0;

  if (flatRecords.length === 0) {
    res.json({ data: [], total, page, limit });
    return;
  }

  const ids = flatRecords.map(r => r.id);

  const boxes = await db.select().from(inventoryBoxesTable)
    .where(inArray(inventoryBoxesTable.inventoryRecordId, ids))
    .orderBy(inventoryBoxesTable.inventoryRecordId, inventoryBoxesTable.boxNumber);

  const boxMap = new Map<string, typeof boxes>();
  for (const box of boxes) {
    if (!boxMap.has(box.inventoryRecordId)) boxMap.set(box.inventoryRecordId, []);
    boxMap.get(box.inventoryRecordId)!.push(box);
  }

  const productIds = [...new Set(flatRecords.map(r => r.productId))];
  const lcRows = await db.select({
    productId: inventoryRecordsTable.productId,
    lastConsumptionDate: max(inventoryRecordsTable.recordDate),
  })
    .from(inventoryRecordsTable)
    .where(inArray(inventoryRecordsTable.productId, productIds))
    .groupBy(inventoryRecordsTable.productId);

  const lcMap = new Map<string, string>();
  for (const row of lcRows) {
    if (row.lastConsumptionDate) lcMap.set(row.productId, row.lastConsumptionDate);
  }

  res.json({
    data: flatRecords.map(r => ({
      ...r,
      boxes: boxMap.get(r.id) ?? [],
      lastConsumptionDate: lcMap.get(r.productId) ?? null,
    })),
    total,
    page,
    limit,
  });
}));

// ── Single ────────────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(inventoryRecordsTable)
    .where(eq(inventoryRecordsTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  const boxes = await db.select().from(inventoryBoxesTable)
    .where(eq(inventoryBoxesTable.inventoryRecordId, id as string))
    .orderBy(inventoryBoxesTable.boxNumber);
  res.json({ ...records[0], boxes });
}));

// ── Create ────────────────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  boxUpload,
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = inventorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const files = (req.files ?? {}) as Files;

    let boxEntries: { weight: string; tare?: string; lot: string }[] = [];
    if (parsed.data.boxesData) {
      try { boxEntries = JSON.parse(parsed.data.boxesData); } catch (err) { logger.warn({ err }, "boxesData JSON inválido — se ignorarán las cajas"); }
    }
    const activeBoxes = boxEntries.filter(b => b.weight && parseFloat(b.weight) > 0);

    let physicalCount = parsed.data.physicalCount ?? null;
    if (activeBoxes.length > 0) {
      const total = activeBoxes.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0);
      physicalCount = String(total);
    }

    // Get product info for photo naming
    const [product] = await db.select({ code: productsTable.code, name: productsTable.name })
      .from(productsTable).where(eq(productsTable.id, parsed.data.productId)).limit(1);
    const productLabel = product?.code ?? product?.name ?? parsed.data.productId;
    const recordDate = parsed.data.recordDate;

    // Upload box photos to Drive
    const photoUrls = await uploadBoxPhotos(files, productLabel, recordDate);

    // Legacy single photo fallback
    let legacyPhotoUrl: string | null = null;
    if (files["photo"]?.[0]) {
      try {
        const file = files["photo"][0]!;
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildInventoryPhotoName(productLabel, recordDate, 0, ext);
        const { url } = await uploadFileToDrive(file.buffer, fileName, file.mimetype);
        legacyPhotoUrl = url;
      } catch { logger.warn("Legacy photo upload failed"); }
    }
    const mainPhotoUrl = photoUrls[0] ?? legacyPhotoUrl;

    // Detect photo upload failures
    const photoWarnings = photoUrls.reduce((acc, url, i) => {
      if (url === null && files[`photo${i}`]?.[0]) return acc + 1;
      return acc;
    }, 0);

    const id = generateId();
    let created: (typeof inventoryRecordsTable.$inferSelect) | undefined;
    let boxes: (typeof inventoryBoxesTable.$inferSelect)[] = [];

    // Obtener ronda activa para asignar round_id
    let activeRoundId: string | null = null;
    try {
      const [activeRound] = await db.select({ id: inventoryRoundsTable.id })
        .from(inventoryRoundsTable)
        .where(and(eq(inventoryRoundsTable.warehouse, parsed.data.warehouse), eq(inventoryRoundsTable.status, "active")))
        .limit(1);
      if (activeRound) activeRoundId = activeRound.id;
    } catch { /* si no hay ronda activa, se guarda sin round_id */ }

    await db.transaction(async (tx) => {
      const [newRecord] = await tx.insert(inventoryRecordsTable).values({
        id,
        roundId: activeRoundId,
        warehouse: parsed.data.warehouse,
        productId: parsed.data.productId,
        recordDate: parsed.data.recordDate,
        responsible: parsed.data.responsible,
        previousBalance: parsed.data.previousBalance,
        inputs: parsed.data.inputs,
        outputs: parsed.data.outputs,
        finalBalance: parsed.data.finalBalance ?? physicalCount ?? parsed.data.previousBalance,
        physicalCount: physicalCount ?? null,
        photoUrl: mainPhotoUrl,
        location: parsed.data.location ?? null,
        missingLabel: parsed.data.missingLabel ?? false,
        notes: parsed.data.notes,
        registeredBy: authedReq.userId,
      } as any).returning();
      created = newRecord;

      for (let i = 0; i < boxEntries.length; i++) {
        const box = boxEntries[i]!;
        if (!box.weight && !box.lot && !photoUrls[i]) continue;
        await tx.insert(inventoryBoxesTable).values({
          id: generateId(),
          inventoryRecordId: id,
          boxNumber: i + 1,
          weight: box.weight || null,
          lot: box.lot || null,
          photoUrl: photoUrls[i] ?? null,
        });
      }

      boxes = await tx.select().from(inventoryBoxesTable)
        .where(eq(inventoryBoxesTable.inventoryRecordId, id))
        .orderBy(inventoryBoxesTable.boxNumber);
    });

    // ── Auto-update cycle progress if an active cycle exists ───────────
    try {
      const [activeCycle] = await db.select({ id: inventoryCyclesTable.id })
        .from(inventoryCyclesTable)
        .where(and(
          eq(inventoryCyclesTable.warehouse, parsed.data.warehouse),
          eq(inventoryCyclesTable.status, "active")
        ))
        .orderBy(desc(inventoryCyclesTable.createdAt))
        .limit(1);

      if (activeCycle && created) {
        const [existingCp] = await db.select({
          id: inventoryCycleProductsTable.id,
          initialQuantity: inventoryCycleProductsTable.initialQuantity,
        })
          .from(inventoryCycleProductsTable)
          .where(and(
            eq(inventoryCycleProductsTable.cycleId, activeCycle.id),
            eq(inventoryCycleProductsTable.productId, created.productId)
          ))
          .limit(1);

        if (existingCp) {
          const updateData: Partial<typeof inventoryCycleProductsTable.$inferSelect> = {
            status: "counted" as const,
            countedDate: created.recordDate,
            countedBy: authedReq.userId,
            updatedAt: new Date(),
            inventoryRecordId: id,
          };
          if (physicalCount) {
            const pCount = parseFloat(physicalCount);
            updateData.physicalCount = pCount;
            updateData.finalQuantity = pCount;
            // Usar initialQuantity del ciclo para la diferencia
            let initQty: number | null = existingCp.initialQuantity;
            if (initQty === null && created.previousBalance) {
              initQty = Number(created.previousBalance);
            }
            if (initQty !== null) {
              updateData.difference = pCount - initQty;
            }
          }
          await db.update(inventoryCycleProductsTable)
            .set(updateData as any)
            .where(eq(inventoryCycleProductsTable.id, existingCp.id));

          // Update cycle counters
          const statusCounts = await db.select({
            status: inventoryCycleProductsTable.status,
            count: count(),
          })
            .from(inventoryCycleProductsTable)
            .where(eq(inventoryCycleProductsTable.cycleId, activeCycle.id))
            .groupBy(inventoryCycleProductsTable.status);

          let counted = 0;
          let withoutMovement = 0;
          for (const s of statusCounts) {
            if (s.status === "counted" || s.status === "verified") counted += Number(s.count);
            if (s.status === "without_movement") withoutMovement += Number(s.count);
          }

          await db.update(inventoryCyclesTable)
            .set({
              countedProducts: counted,
              withoutMovement,
              updatedAt: new Date(),
            })
            .where(eq(inventoryCyclesTable.id, activeCycle.id));
        }
      }
    } catch (err) {
      logger.warn({ err }, "Failed to auto-update cycle progress from inventory record");
    }

    void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "inventory_record", resourceId: id, ipAddress: req.ip as string });
    const responseBody: Record<string, unknown> = { ...created, boxes };
    if (photoWarnings > 0) responseBody.photoWarnings = photoWarnings;
    res.status(201).json(responseBody);
  })
);

// ── Update ────────────────────────────────────────────────────────────────────

router.put(
  "/:id",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = inventorySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    let photoUrl: string | undefined;
    if (req.file) {
      try {
        await validateMimeType(req.file.buffer, "image");
        const ext = "." + (req.file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildInventoryPhotoName(parsed.data.productId ?? (id as string), parsed.data.recordDate ?? new Date().toISOString().slice(0, 10), 0, ext);
        const { url } = await uploadFileToDrive(req.file.buffer, fileName, req.file.mimetype);
        photoUrl = url;
      } catch { logger.warn({ fileId: id }, "Failed to upload inventory photo"); }
    }
    const updateData: Record<string, unknown> = { ...parsed.data };
    delete updateData.boxesData;
    if (photoUrl) updateData.photoUrl = photoUrl;

    const authedReq = req as AuthenticatedRequest;
    const [updated] = await db.update(inventoryRecordsTable)
      .set(updateData)
      .where(eq(inventoryRecordsTable.id, id as string)).returning();

    if (!updated) { res.status(404).json({ error: "Registro no encontrado" }); return; }
    void writeAuditLog({ userId: authedReq.userId, action: "update", resource: "inventory_record", resourceId: id as string, ipAddress: req.ip as string });
    res.json(updated);
  })
);

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete(
  "/:id",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const [deleted] = await db.delete(inventoryRecordsTable)
      .where(eq(inventoryRecordsTable.id, id as string)).returning();
    if (!deleted) { res.status(404).json({ error: "Registro no encontrado" }); return; }
    void writeAuditLog({ userId: authedReq.userId, action: "delete", resource: "inventory_record", resourceId: id as string, ipAddress: req.ip as string });
    res.json({ message: "Registro eliminado" });
  })
);

// ── Template ───────────────────────────────────────────────────────────────────

const IMPORT_TEMPLATE_HEADERS = [
  "almacen",
  "codigo",
  "cantidad_fisica",
  "ubicacion",
  "observaciones",
  "peso_caja",
  "lote_caja",
];

router.get("/template", requireAuth, asyncHandler(async (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    [Object.fromEntries(IMPORT_TEMPLATE_HEADERS.map(h => [h, ""]))],
    { header: IMPORT_TEMPLATE_HEADERS }
  );
  ws["!cols"] = IMPORT_TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
  // Add a sample row
  XLSX.utils.sheet_add_aoa(ws, [["General", "ABC-001", "50.5", "Rack A / Nivel 2", "Inventario nocturno", "25.0", "LOTE-001"]], { origin: "A2" });
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_inventario.xlsx"');
  res.send(buf);
}));

// ── Import ─────────────────────────────────────────────────────────────────────

const uploadImport = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post(
  "/import",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  uploadImport.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo" });
      return;
    }

    const authedReq = req as AuthenticatedRequest;
    const defaultWarehouse = (req.query.warehouse as string) || (req.body.warehouse as string) || "General";
    const defaultDate = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    let rawRows: Record<string, unknown>[];
    try {
      rawRows = parseExcelBuffer(req.file.buffer).rawRows;
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const headers = normalizeHeaders(rawRows);
    const required = ["codigo", "cantidad_fisica"];
    const missingCols = required.filter((col) => !headers.includes(col));
    if (missingCols.length > 0) {
      res.status(400).json({
        error: `Columnas requeridas faltantes: ${missingCols.join(", ")}`,
        missing: missingCols,
      });
      return;
    }

    const normalizedRows = rawRows.map((row) => {
      const n: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row))
        n[k.toLowerCase().trim().replace(/\\s+/g, "_")] = v;
      return n;
    });

    // Pre-load product map
    const allCodes = [...new Set(normalizedRows.map(r => String(r.codigo ?? "").trim()).filter(Boolean))];
    // Load product map for all codes
    const productMap = new Map<string, { id: string; code: string; name: string; unit: string; warehouse: string }>();
    if (allCodes.length > 0) {
      const products = await db.select({ id: productsTable.id, code: productsTable.code, name: productsTable.name, unit: productsTable.unit, warehouse: productsTable.warehouse })
        .from(productsTable)
        .where(inArray(productsTable.code, allCodes));
      for (const p of products) productMap.set(p.code.toLowerCase(), p);
    }

    const inserted: Array<{ code: string; productName: string; quantity: string; }> = [];
    const errors: Array<{ row: number; code: string; error: string }> = [];
    const recordsToCreate: Array<{
      warehouse: string; productId: string; recordDate: string; physicalCount: number;
      location: string | null; notes: string | null; boxWeight: string | null; boxLot: string | null;
    }> = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i]!;
      const rowNum = i + 2;
      const code = String(row.codigo ?? "").trim();

      if (!code) {
        errors.push({ row: rowNum, code: "(vacío)", error: "El campo 'codigo' es obligatorio" });
        continue;
      }

      const product = productMap.get(code.toLowerCase());
      if (!product) {
        errors.push({ row: rowNum, code, error: "Producto no encontrado en la base de datos" });
        continue;
      }

      const qtyStr = String(row.cantidad_fisica ?? "").trim().replace(",", ".");
      const qty = parseFloat(qtyStr);
      if (!qtyStr || isNaN(qty) || qty < 0) {
        errors.push({ row: rowNum, code, error: "La 'cantidad_fisica' debe ser un número válido mayor o igual a 0" });
        continue;
      }

      recordsToCreate.push({
        warehouse: String(row.almacen ?? "").trim() || defaultWarehouse,
        productId: product.id,
        recordDate: defaultDate,
        physicalCount: qty,
        location: String(row.ubicacion ?? "").trim() || null,
        notes: String(row.observaciones ?? "").trim() || null,
        boxWeight: String(row.peso_caja ?? "").trim() || null,
        boxLot: String(row.lote_caja ?? "").trim() || null,
      });

      inserted.push({
        code: product.code,
        productName: product.name,
        quantity: qtyStr,
      });
    }

    // Actually create records in DB
    let createdCount = 0;
    if (recordsToCreate.length > 0) {
      await db.transaction(async (tx) => {
        for (const rec of recordsToCreate) {
          const id = generateId();
          const physicalCount = String(rec.physicalCount);
          await tx.insert(inventoryRecordsTable).values({
            id,
            warehouse: rec.warehouse,
            productId: rec.productId,
            recordDate: rec.recordDate,
            responsible: authedReq.userId,
            previousBalance: "0",
            physicalCount,
            finalBalance: physicalCount,
            location: rec.location,
            notes: rec.notes,
            registeredBy: authedReq.userId,
          } as any);

          if (rec.boxWeight || rec.boxLot) {
            await tx.insert(inventoryBoxesTable).values({
              id: generateId(),
              inventoryRecordId: id,
              boxNumber: 1,
              weight: rec.boxWeight,
              lot: rec.boxLot,
            });
          }

          // Auto-update cycle progress
          try {
            const [activeCycle] = await tx.select({ id: inventoryCyclesTable.id })
              .from(inventoryCyclesTable)
              .where(and(
                eq(inventoryCyclesTable.warehouse, rec.warehouse),
                eq(inventoryCyclesTable.status, "active")
              ))
              .orderBy(desc(inventoryCyclesTable.createdAt))
              .limit(1);

            if (activeCycle) {
              const [existingCp] = await tx.select({ id: inventoryCycleProductsTable.id })
                .from(inventoryCycleProductsTable)
                .where(and(
                  eq(inventoryCycleProductsTable.cycleId, activeCycle.id),
                  eq(inventoryCycleProductsTable.productId, rec.productId)
                ))
                .limit(1);

              if (existingCp) {
                await tx.update(inventoryCycleProductsTable)
                  .set({
                    status: "counted",
                    physicalCount: rec.physicalCount,
                    finalQuantity: rec.physicalCount,
                    countedDate: rec.recordDate,
                    countedBy: authedReq.userId,
                    inventoryRecordId: id,
                    updatedAt: new Date(),
                  })
                  .where(eq(inventoryCycleProductsTable.id, existingCp.id));
              }
            }
          } catch { /* cycle update is best-effort */ }

          createdCount++;
        }
      });
    }

    void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "inventory_import", details: { inserted: createdCount, errors: errors.length }, ipAddress: req.ip as string });

    res.json({
      inserted: createdCount,
      errors,
      total: normalizedRows.length,
      data: inserted,
    });
  })
);

export default router;
