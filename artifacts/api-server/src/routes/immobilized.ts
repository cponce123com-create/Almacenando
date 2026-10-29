import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { immobilizedProductsTable, productsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { uploadFileToDrive, deleteFileFromDrive, extractFileId } from "../lib/google-drive.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Solo se permiten archivos de imagen"));
    } else {
      cb(null, true);
    }
  },
});

function buildPhotoName(productLabel: string, date: string, index: number, ext: string): string {
  const slug = productLabel
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 30)
    .replace(/^_|_$/g, "");
  const d = date.replace(/-/g, "");
  return `inmov_${slug}_${d}_foto${index}${ext}`;
}

const router = Router();

const immobilizedSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().finite(),
  reason: z.string().min(1),
  immobilizedDate: z.string().min(1),
  status: z.enum(["immobilized", "released", "disposed"]).default("immobilized"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db.select().from(immobilizedProductsTable).orderBy(desc(immobilizedProductsTable.immobilizedDate));
  res.json(records);
}));

// Stock in Q1 whose latest reliable movement is at least one full year old.
// NOW uses 2013-01-01 as a sentinel when it has no trustworthy consumption date;
// those products are returned with a null movement date for a separate review bucket.
router.get("/stagnant-stock", requireAuth, asyncHandler(async (_req, res) => {
  const result = await db.execute(sql`
    WITH latest_snapshot AS (
      SELECT DISTINCT ON (warehouse) warehouse, balance_date, batch_id
      FROM balance_records
      WHERE warehouse = 'Q1'
      ORDER BY warehouse, balance_date DESC, created_at DESC, id DESC
    ), aggregated_stock AS (
      SELECT
        br.warehouse,
        COALESCE(br.type, '') AS product_type,
        br.code,
        SUM(br.quantity)::numeric AS balance,
        MAX(br.ultimo_consumo) AS raw_last_movement,
        MAX(br.balance_date) AS balance_date,
        STRING_AGG(DISTINCT NULLIF(CONCAT_WS(' / ', NULLIF(BTRIM(br.zone_summary), ''), NULLIF(BTRIM(br.location_summary), '')), ''), ', ') AS source_location
      FROM balance_records br
      JOIN latest_snapshot s
        ON s.warehouse = br.warehouse
       AND s.balance_date = br.balance_date
       AND s.batch_id IS NOT DISTINCT FROM br.batch_id
      WHERE br.warehouse = 'Q1'
      GROUP BY br.warehouse, COALESCE(br.type, ''), br.code
    ), reliable_stock AS (
      SELECT *,
        CASE
          WHEN raw_last_movement IS NULL OR raw_last_movement <= DATE '2013-01-01' THEN NULL
          ELSE raw_last_movement
        END AS last_movement
      FROM aggregated_stock
    )
    SELECT
      p.id AS "productId",
      p.warehouse,
      p.type,
      p.code,
      p.name,
      p.unit,
      p.status AS "productStatus",
      s.balance::text AS balance,
      s.balance_date AS "balanceDate",
      s.last_movement AS "lastMovement",
      CASE WHEN s.last_movement IS NULL THEN NULL
        ELSE EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.last_movement))::int
      END AS "yearsWithoutMovement",
      CASE WHEN s.last_movement IS NULL THEN NULL
        ELSE GREATEST(CURRENT_DATE - s.last_movement, 0)
      END AS "daysWithoutMovement",
      s.source_location AS "sourceLocation",
      latest_inventory.record_date AS "lastInventoryDate",
      latest_inventory.physical_count::text AS "lastPhysicalCount"
    FROM reliable_stock s
    JOIN products p
      ON p.warehouse = s.warehouse
     AND COALESCE(p.type, '') = s.product_type
     AND p.code = s.code
    LEFT JOIN LATERAL (
      SELECT ir.record_date, ir.physical_count
      FROM inventory_records ir
      WHERE ir.product_id = p.id
        AND ir.warehouse = p.warehouse
        AND ir.physical_count IS NOT NULL
      ORDER BY ir.record_date DESC, ir.created_at DESC
      LIMIT 1
    ) latest_inventory ON TRUE
    WHERE s.balance > 0
      AND (s.last_movement IS NULL OR s.last_movement <= CURRENT_DATE - INTERVAL '1 year')
    ORDER BY s.last_movement ASC NULLS FIRST, p.code ASC
  `);
  res.json(result.rows);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const records = await db.select().from(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = immobilizedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(immobilizedProductsTable).values({
    id,
    ...parsed.data,
    registeredBy: authedReq.userId,
  }).returning();
  void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "immobilized_product", resourceId: id as string, ipAddress: req.ip });
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const authedReq = req as AuthenticatedRequest;
  const releaseSchema = z.object({
    status: z.enum(["immobilized", "released", "disposed"]).optional(),
    notes: z.string().optional(),
    releasedAt: z.string().optional(),
  });
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "released") {
    updateData.releasedBy = authedReq.userId;
    updateData.releasedAt = new Date();
  }
  const [updated] = await db.update(immobilizedProductsTable).set(updateData).where(eq(immobilizedProductsTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  void writeAuditLog({ userId: authedReq.userId, action: "release", resource: "immobilized_product", resourceId: id as string, ipAddress: req.ip });
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [deleted] = await db.delete(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  res.json({ message: "Registro eliminado" });
}));

// ── Photo upload (Drive) ───────────────────────────────────────────────────────

router.post(
  "/:id/photos",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.array("photos", 5),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No se enviaron archivos" }); return;
    }

    const [record] = await db.select().from(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Registro no encontrado" }); return; }

    const existing = (record.photos as string[] | null) ?? [];
    const slots = 5 - existing.length;
    if (slots <= 0) {
      res.status(400).json({ error: "Ya se alcanzó el límite de 5 fotos" }); return;
    }

    // Get product name for naming
    const [product] = await db.select({ code: productsTable.code, name: productsTable.name })
      .from(productsTable).where(eq(productsTable.id, record.productId)).limit(1);
    const productLabel = product?.code ?? product?.name ?? "inmov";
    const date = record.immobilizedDate ?? new Date().toISOString().slice(0, 10);
    const startIndex = existing.length + 1;

    const toUpload = files.slice(0, slots);
    const uploaded: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i]!;
      try {
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildPhotoName(productLabel, date, startIndex + i, ext);
        const { url } = await uploadFileToDrive(file.buffer, fileName, file.mimetype);
        uploaded.push(url);
      } catch (err) {
        errors.push(`Foto ${i + 1}: ${err instanceof Error ? err.message : "Error desconocido"}`);
      }
    }

    if (uploaded.length === 0) {
      res.status(500).json({ error: "No se pudo subir ninguna foto", details: errors }); return;
    }

    const newPhotos = [...existing, ...uploaded];
    const [updated] = await db.update(immobilizedProductsTable)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(immobilizedProductsTable.id, id as string)).returning();

    res.status(errors.length > 0 ? 207 : 201).json({
      record: updated,
      uploaded: uploaded.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  })
);

// ── Photo delete (Drive) ───────────────────────────────────────────────────────

router.delete(
  "/:id/photos/:photoIndex",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const { id, photoIndex } = req.params;
    const idx = parseInt(photoIndex as string, 10);

    const [record] = await db.select().from(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Registro no encontrado" }); return; }

    const photos = [...((record.photos as string[] | null) ?? [])];
    if (isNaN(idx) || idx < 0 || idx >= photos.length) {
      res.status(400).json({ error: "Índice de foto inválido" }); return;
    }

    const url = photos[idx]!;
    const fileId = extractFileId(url);
    if (fileId) { await deleteFileFromDrive(fileId); }

    photos.splice(idx, 1);
    const [updated] = await db.update(immobilizedProductsTable)
      .set({ photos, updatedAt: new Date() })
      .where(eq(immobilizedProductsTable.id, id as string)).returning();

    const authedReq2 = req as AuthenticatedRequest;
    void writeAuditLog({ userId: authedReq2.userId, action: "delete", resource: "immobilized_photo", resourceId: id as string, details: { photoIndex: idx }, ipAddress: req.ip });
    res.json(updated);
  })
);

export default router;
