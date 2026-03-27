import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { inventoryRecordsTable, productsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { uploadToCloudinary } from "../lib/cloudinary.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

const inventorySchema = z.object({
  warehouse: z.string().min(1).default("General"),
  productId: z.string().min(1),
  recordDate: z.string().min(1),
  responsible: z.string().optional(),
  previousBalance: z.string().default("0"),
  inputs: z.string().default("0"),
  outputs: z.string().default("0"),
  finalBalance: z.string().default("0"),
  physicalCount: z.string().optional(),
  notes: z.string().optional(),
});

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

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  let query = db.select().from(inventoryRecordsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(inventoryRecordsTable.warehouse, warehouse));
  }
  const records = await query.orderBy(desc(inventoryRecordsTable.recordDate));
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(inventoryRecordsTable)
    .where(eq(inventoryRecordsTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json(records[0]);
}));

router.post(
  "/",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = inventorySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }

    let photoUrl: string | undefined;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        resource_type: "image",
        folder: "almacenando/inventario",
      });
      photoUrl = result.secure_url as string;
    }

    const id = generateId();
    const [created] = await db.insert(inventoryRecordsTable).values({
      id,
      ...parsed.data,
      physicalCount: parsed.data.physicalCount ?? null,
      photoUrl: photoUrl ?? null,
      registeredBy: authedReq.userId,
    }).returning();

    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = inventorySchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }

    let photoUrl: string | undefined;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        resource_type: "image",
        folder: "almacenando/inventario",
      });
      photoUrl = result.secure_url as string;
    }

    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (photoUrl) updateData.photoUrl = photoUrl;

    const [updated] = await db.update(inventoryRecordsTable)
      .set(updateData)
      .where(eq(inventoryRecordsTable.id, id as string)).returning();

    if (!updated) { res.status(404).json({ error: "Registro no encontrado" }); return; }
    res.json(updated);
  })
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [deleted] = await db.delete(inventoryRecordsTable)
      .where(eq(inventoryRecordsTable.id, id as string)).returning();
    if (!deleted) { res.status(404).json({ error: "Registro no encontrado" }); return; }
    res.json({ message: "Registro eliminado" });
  })
);

export default router;
