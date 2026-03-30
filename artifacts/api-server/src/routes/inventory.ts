import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { inventoryRecordsTable, productsTable, inventoryBoxesTable } from "@workspace/db";
import { eq, desc, sql, and, inArray, count, max } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { uploadFileToDrive } from "../lib/google-drive.js";
import { writeAuditLog } from "../lib/audit.js";

function parsePagination(q: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(String(q.limit ?? "50"), 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

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
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildInventoryPhotoName(productLabel, date, i + 1, ext);
        const { url } = await uploadFileToDrive(file.buffer, fileName, file.mimetype);
        urls.push(url);
      } catch {
        urls.push(null);
      }
    } else {
      urls.push(null);
    }
  }
  return urls;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;

  const allProducts = await db.select({ id: productsTable.id })
    .from(productsTable)
    .where(
      warehouse && warehouse !== "all"
        ? and(eq(productsTable.status, "active"), eq(productsTable.warehouse, warehouse))
        : eq(productsTable.status, "active")
    );

  const totalProducts = allProducts.length;

  if (totalProducts === 0) {
    res.json({ totalProducts: 0, withoutRecords: 0, exact: 0, withDifference: 0, surplus: 0, shortage: 0 });
    return;
  }

  const warehouseCondition = warehouse && warehouse !== "all"
    ? sql`AND warehouse = ${warehouse}`
    : sql``;

  const latestPerProduct = await db.execute(sql`
    SELECT DISTINCT ON (product_id)
      product_id, previous_balance, physical_count
    FROM inventory_records
    WHERE 1=1 ${warehouseCondition}
    ORDER BY product_id, record_date DESC, created_at DESC
  `);

  const latestMap = new Map<string, { previousBalance: string; physicalCount: string | null }>();
  for (const row of latestPerProduct.rows as any[]) {
    latestMap.set(row.product_id, {
      previousBalance: row.previous_balance ?? "0",
      physicalCount: row.physical_count ?? null,
    });
  }

  let withoutRecords = 0, exact = 0, surplus = 0, shortage = 0;

  for (const product of allProducts) {
    const latest = latestMap.get(product.id);
    if (!latest) { withoutRecords++; continue; }
    if (latest.physicalCount === null) { exact++; continue; }
    const sys = parseFloat(latest.previousBalance) || 0;
    const phys = parseFloat(latest.physicalCount) || 0;
    const diff = phys - sys;
    if (Math.abs(diff) < 0.01) exact++;
    else if (diff > 0) surplus++;
    else shortage++;
  }

  res.json({ totalProducts, withoutRecords, exact, withDifference: surplus + shortage, surplus, shortage });
}));

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
  const condition = warehouse && warehouse !== "all"
    ? eq(inventoryRecordsTable.warehouse, warehouse)
    : undefined;

  const [{ total }] = await db.select({ total: count() }).from(inventoryRecordsTable).where(condition);
  const records = await db.select().from(inventoryRecordsTable)
    .where(condition)
    .orderBy(desc(inventoryRecordsTable.recordDate))
    .limit(limit)
    .offset(offset);

  if (records.length === 0) {
    res.json({ data: [], total, page, limit });
    return;
  }

  const ids = records.map(r => r.id);

  const boxes = await db.select().from(inventoryBoxesTable)
    .where(inArray(inventoryBoxesTable.inventoryRecordId, ids))
    .orderBy(inventoryBoxesTable.inventoryRecordId, inventoryBoxesTable.boxNumber);

  const boxMap = new Map<string, typeof boxes>();
  for (const box of boxes) {
    if (!boxMap.has(box.inventoryRecordId)) boxMap.set(box.inventoryRecordId, []);
    boxMap.get(box.inventoryRecordId)!.push(box);
  }

  const productIds = [...new Set(records.map(r => r.productId))];
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
    data: records.map(r => ({
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

    let boxEntries: { weight: string; lot: string }[] = [];
    if (parsed.data.boxesData) {
      try { boxEntries = JSON.parse(parsed.data.boxesData); } catch { /* ignore */ }
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
      } catch { /* ignore */ }
    }
    const mainPhotoUrl = photoUrls[0] ?? legacyPhotoUrl;

    const id = generateId();
    const [created] = await db.insert(inventoryRecordsTable).values({
      id,
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
      notes: parsed.data.notes,
      registeredBy: authedReq.userId,
    }).returning();

    for (let i = 0; i < boxEntries.length; i++) {
      const box = boxEntries[i]!;
      if (!box.weight && !box.lot && !photoUrls[i]) continue;
      await db.insert(inventoryBoxesTable).values({
        id: generateId(),
        inventoryRecordId: id,
        boxNumber: i + 1,
        weight: box.weight || null,
        lot: box.lot || null,
        photoUrl: photoUrls[i],
      });
    }

    const boxes = await db.select().from(inventoryBoxesTable)
      .where(eq(inventoryBoxesTable.inventoryRecordId, id))
      .orderBy(inventoryBoxesTable.boxNumber);

    void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "inventory_record", resourceId: id, ipAddress: req.ip });
    res.status(201).json({ ...created, boxes });
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
        const ext = "." + (req.file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildInventoryPhotoName(parsed.data.productId ?? id, parsed.data.recordDate ?? new Date().toISOString().slice(0, 10), 0, ext);
        const { url } = await uploadFileToDrive(req.file.buffer, fileName, req.file.mimetype);
        photoUrl = url;
      } catch { /* ignore */ }
    }

    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    delete updateData.boxesData;
    if (photoUrl) updateData.photoUrl = photoUrl;

    const authedReq = req as AuthenticatedRequest;
    const [updated] = await db.update(inventoryRecordsTable)
      .set(updateData)
      .where(eq(inventoryRecordsTable.id, id as string)).returning();

    if (!updated) { res.status(404).json({ error: "Registro no encontrado" }); return; }
    void writeAuditLog({ userId: authedReq.userId, action: "update", resource: "inventory_record", resourceId: id, ipAddress: req.ip });
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
    void writeAuditLog({ userId: authedReq.userId, action: "delete", resource: "inventory_record", resourceId: id, ipAddress: req.ip });
    res.json({ message: "Registro eliminado" });
  })
);

export default router;
