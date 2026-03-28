import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { inventoryRecordsTable, productsTable, inventoryBoxesTable } from "@workspace/db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { uploadToCloudinary } from "../lib/cloudinary.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

// Accept up to 5 box photos (photo0..photo4) + legacy single photo
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
  // JSON array of {weight, lot} objects for up to 5 boxes
  boxesData: z.string().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

type Files = { [fieldname: string]: Express.Multer.File[] };

async function uploadBoxPhotos(files: Files): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];
  for (let i = 0; i < 5; i++) {
    const fieldFiles = files[`photo${i}`];
    if (fieldFiles && fieldFiles.length > 0) {
      const result = await uploadToCloudinary(fieldFiles[0]!.buffer, {
        resource_type: "image",
        folder: "almacenando/inventario",
      });
      urls.push(result.secure_url as string);
    } else {
      urls.push(null);
    }
  }
  return urls;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const warehouseFilter = warehouse && warehouse !== "all"
    ? sql`WHERE p.status = 'active' AND p.warehouse = ${warehouse}`
    : sql`WHERE p.status = 'active'`;

  const productCount = await db.execute(sql`SELECT COUNT(*) as n FROM products p ${warehouseFilter}`);
  const totalProducts = parseInt(String((productCount.rows[0] as any).n)) || 0;

  if (totalProducts === 0) {
    res.json({ totalProducts: 0, withoutRecords: 0, exact: 0, withDifference: 0, surplus: 0, shortage: 0 });
    return;
  }

  const allProducts = await db.select({ id: productsTable.id })
    .from(productsTable)
    .where(
      warehouse && warehouse !== "all"
        ? and(eq(productsTable.status, "active"), eq(productsTable.warehouse, warehouse))
        : eq(productsTable.status, "active")
    );

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
  let query = db.select().from(inventoryRecordsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(inventoryRecordsTable.warehouse, warehouse));
  }
  const records = await query.orderBy(desc(inventoryRecordsTable.recordDate));

  if (records.length === 0) { res.json(records); return; }

  const ids = records.map(r => r.id);

  // Boxes
  const boxes = await db.select().from(inventoryBoxesTable)
    .where(inArray(inventoryBoxesTable.inventoryRecordId, ids))
    .orderBy(inventoryBoxesTable.inventoryRecordId, inventoryBoxesTable.boxNumber);

  const boxMap = new Map<string, typeof boxes>();
  for (const box of boxes) {
    if (!boxMap.has(box.inventoryRecordId)) boxMap.set(box.inventoryRecordId, []);
    boxMap.get(box.inventoryRecordId)!.push(box);
  }

  // Last consumption date per product_id
  const productIds = [...new Set(records.map(r => r.productId))];
  const lcRows = await db.execute(sql`
    SELECT ir.product_id, MAX(ir.record_date) AS last_consumption_date
    FROM inventory_records ir
    WHERE ir.product_id = ANY(${productIds})
    GROUP BY ir.product_id
  `);
  const lcMap = new Map<string, string>();
  for (const row of lcRows.rows as { product_id: string; last_consumption_date: string | null }[]) {
    if (row.last_consumption_date) lcMap.set(row.product_id, row.last_consumption_date);
  }

  res.json(records.map(r => ({
    ...r,
    boxes: boxMap.get(r.id) ?? [],
    lastConsumptionDate: lcMap.get(r.productId) ?? null,
  })));
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

    // Parse box entries
    let boxEntries: { weight: string; lot: string }[] = [];
    if (parsed.data.boxesData) {
      try { boxEntries = JSON.parse(parsed.data.boxesData); } catch { /* ignore */ }
    }
    const activeBoxes = boxEntries.filter(b => b.weight && parseFloat(b.weight) > 0);

    // Calculate total physicalCount from boxes (if any boxes have data)
    let physicalCount = parsed.data.physicalCount ?? null;
    if (activeBoxes.length > 0) {
      const total = activeBoxes.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0);
      physicalCount = String(total);
    }

    // Upload box photos
    const photoUrls = await uploadBoxPhotos(files);

    // Legacy single photo fallback
    let legacyPhotoUrl: string | null = null;
    if (files["photo"]?.[0]) {
      const result = await uploadToCloudinary(files["photo"][0].buffer, {
        resource_type: "image",
        folder: "almacenando/inventario",
      });
      legacyPhotoUrl = result.secure_url as string;
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

    // Insert box records
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
      const result = await uploadToCloudinary(req.file.buffer, {
        resource_type: "image",
        folder: "almacenando/inventario",
      });
      photoUrl = result.secure_url as string;
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
