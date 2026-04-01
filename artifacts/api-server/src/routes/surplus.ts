import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { surplusProductsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import { uploadFileToDrive, isDriveConfigured } from "../lib/google-drive.js";
import { validateMimeType } from "../lib/validate-mime.js";
import path from "path";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) cb(new Error("Solo imágenes"));
    else cb(null, true);
  },
});

function buildPhotoName(code: string, index: number, ext: string): string {
  const name = code.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return `sobrante_${name}_foto${index}${ext}`;
}

const router = Router();

const surplusSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().optional(),
  surplusCode: z.string().min(1),
  quantity: z.string().min(1),
  unit: z.string().min(1),
  surplusDate: z.string().min(1),
  origin: z.string().optional(),
  reason: z.string().optional(),
  status: z.enum(["pending", "reviewed", "returned", "disposed"]).default("pending"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "200"), 500);
  const records = await db.select().from(surplusProductsTable)
    .orderBy(desc(surplusProductsTable.surplusDate))
    .limit(limit);
  res.json({ data: records, total: records.length });
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const records = await db.select().from(surplusProductsTable)
    .where(eq(surplusProductsTable.id, req.params.id as string)).limit(1);
  if (!records[0]) { res.status(404).json({ error: "No encontrado" }); return; }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = surplusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return;
  }
  const { productId, productName, ...rest } = parsed.data;
  if (!productId && !productName) {
    res.status(400).json({ error: "Debe indicar un nombre de producto" }); return;
  }
  const id = generateId();
  const [created] = await db.insert(surplusProductsTable).values({
    id,
    productId: productId || null,
    productName: productName || null,
    ...rest,
    photos: [],
    registeredBy: authedReq.user.id,
  }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [existing] = await db.select().from(surplusProductsTable).where(eq(surplusProductsTable.id, id as string)).limit(1);
  if (!existing) { res.status(404).json({ error: "No encontrado" }); return; }
  const parsed = surplusSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const [updated] = await db.update(surplusProductsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(surplusProductsTable.id, id as string)).returning();
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const [deleted] = await db.delete(surplusProductsTable)
    .where(eq(surplusProductsTable.id, req.params.id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "No encontrado" }); return; }
  res.json({ message: "Eliminado" });
}));

// ── Photos ────────────────────────────────────────────────────────────────────
router.post("/:id/photos", requireAuth, upload.array("photos", 5), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const [record] = await db.select().from(surplusProductsTable).where(eq(surplusProductsTable.id, id as string)).limit(1);
  if (!record) { res.status(404).json({ error: "No encontrado" }); return; }
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) { res.status(400).json({ error: "No se enviaron archivos" }); return; }
  const existing = (record.photos as string[]) ?? [];
  if (existing.length >= 5) { res.status(400).json({ error: "Máximo 5 fotos por sobrante" }); return; }
  const slots = 5 - existing.length;
  const toUpload = files.slice(0, slots);

  if (!isDriveConfigured()) {
    res.status(503).json({ error: "Google Drive no configurado" }); return;
  }

  const uploaded: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < toUpload.length; i++) {
    const f = toUpload[i]!;
    const ext = path.extname(f.originalname || ".jpg") || ".jpg";
    const fname = buildPhotoName(record.surplusCode, existing.length + uploaded.length + 1, ext);
    try {
      await validateMimeType(f.buffer, "image");
      const url = await uploadFileToDrive(f.buffer, fname, f.mimetype);
      uploaded.push(url);
    } catch (e) {
      errors.push((e as Error).message ?? "Error");
    }
  }

  const newPhotos = [...existing, ...uploaded];
  const [updated] = await db.update(surplusProductsTable)
    .set({ photos: newPhotos, updatedAt: new Date() })
    .where(eq(surplusProductsTable.id, id as string)).returning();

  res.status(errors.length > 0 ? 207 : 201).json({
    record: updated,
    uploaded: uploaded.length,
    errors,
    uploadedBy: authedReq.user.id,
  });
}));

router.delete("/:id/photos/:idx", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
  const { id, idx } = req.params;
  const photoIdx = parseInt(idx as string);
  const [record] = await db.select().from(surplusProductsTable).where(eq(surplusProductsTable.id, id as string)).limit(1);
  if (!record) { res.status(404).json({ error: "No encontrado" }); return; }
  const photos = [...((record.photos as string[]) ?? [])];
  if (isNaN(photoIdx) || photoIdx < 0 || photoIdx >= photos.length) {
    res.status(400).json({ error: "Índice inválido" }); return;
  }
  photos.splice(photoIdx, 1);
  const [updated] = await db.update(surplusProductsTable)
    .set({ photos, updatedAt: new Date() })
    .where(eq(surplusProductsTable.id, id as string)).returning();
  res.json(updated);
}));

export default router;
