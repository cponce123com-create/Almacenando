import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { samplesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import { uploadFileToDrive, deleteFileFromDrive, extractFileId, isDriveConfigured } from "../lib/google-drive.js";
import { validateMimeType } from "../lib/validate-mime.js";
import { parsePagination } from "../lib/pagination.js";

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


function buildPhotoName(productName: string, sampleDate: string, index: number, ext: string): string {
  const product = productName
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 30)
    .replace(/^_|_$/g, "");
  const date = sampleDate.replace(/-/g, "");
  return `${product}_${date}_foto${index}${ext}`;
}

const router = Router();

const sampleSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().optional(),
  supplier: z.string().optional(),
  sampleCode: z.string().min(1),
  quantity: z.string().min(1),
  unit: z.string().min(1),
  sampleDate: z.string().min(1),
  purpose: z.string().min(1),
  destination: z.string().optional(),
  labReference: z.string().optional(),
  status: z.enum(["pending", "in_lab", "completed", "rejected"]).default("pending"),
  result: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
  const [{ total }] = await db.select({ total: count() }).from(samplesTable);
  const records = await db.select().from(samplesTable)
    .orderBy(desc(samplesTable.sampleDate))
    .limit(limit)
    .offset(offset);
  res.json({ data: records, total, page, limit });
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(samplesTable).where(eq(samplesTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Muestra no encontrada" }); return; }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "quality", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = sampleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { productId, productName, supplier, ...rest } = parsed.data;
  if (!productName && !productId) {
    res.status(400).json({ error: "Debe indicar un nombre de producto" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(samplesTable).values({
    id,
    productId: productId || null,
    productName: productName || null,
    supplier: supplier || null,
    ...rest,
    takenBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = sampleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(samplesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(samplesTable.id, id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Muestra no encontrada" }); return; }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(samplesTable).where(eq(samplesTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Muestra no encontrada" }); return; }
  res.json({ message: "Muestra eliminada" });
}));

router.get("/:id/photos/status", requireAuth, asyncHandler(async (_req, res) => {
  res.json({ configured: isDriveConfigured() });
}));

router.post(
  "/:id/photos",
  requireAuth,
  requireRole("supervisor", "admin", "quality", "operator"),
  upload.array("photos", 5),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No se enviaron archivos" }); return;
    }

    const [record] = await db.select().from(samplesTable).where(eq(samplesTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Muestra no encontrada" }); return; }

    const existing = (record.photos as string[] | null) ?? [];
    const slots = 5 - existing.length;
    if (slots <= 0) {
      res.status(400).json({ error: "Ya se alcanzó el límite de 5 fotos por muestra" }); return;
    }

    const toUpload = files.slice(0, slots);
    const productName = record.productName ?? record.productId ?? "muestra";
    const sampleDate = record.sampleDate ?? new Date().toISOString().slice(0, 10);
    const startIndex = existing.length + 1;

    const uploaded: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i]!;
      try {
        await validateMimeType(file.buffer, "image");
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildPhotoName(productName, sampleDate, startIndex + i, ext);
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
    const [updated] = await db.update(samplesTable)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(samplesTable.id, id as string)).returning();

    res.status(errors.length > 0 ? 207 : 201).json({
      record: updated,
      uploaded: uploaded.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  })
);

router.delete(
  "/:id/photos/:photoIndex",
  requireAuth,
  requireRole("supervisor", "admin", "quality"),
  asyncHandler(async (req, res) => {
    const { id, photoIndex } = req.params;
    const idx = parseInt(photoIndex as string, 10);

    const [record] = await db.select().from(samplesTable).where(eq(samplesTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Muestra no encontrada" }); return; }

    const photos = [...((record.photos as string[] | null) ?? [])];
    if (isNaN(idx) || idx < 0 || idx >= photos.length) {
      res.status(400).json({ error: "Índice de foto inválido" }); return;
    }

    const url = photos[idx]!;
    const fileId = extractFileId(url);
    if (fileId) { await deleteFileFromDrive(fileId); }

    photos.splice(idx, 1);

    const [updated] = await db.update(samplesTable)
      .set({ photos, updatedAt: new Date() })
      .where(eq(samplesTable.id, id as string)).returning();

    res.json(updated);
  })
);

router.patch(
  "/:id/photos",
  requireAuth,
  requireRole("supervisor", "admin", "quality", "operator"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const urlsSchema = z.object({ photos: z.array(z.string().url("URL inválida")).max(5, "Máximo 5 URLs") });
    const parsed = urlsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
    const [updated] = await db.update(samplesTable)
      .set({ photos: parsed.data.photos, updatedAt: new Date() })
      .where(eq(samplesTable.id, id as string)).returning();
    if (!updated) { res.status(404).json({ error: "Muestra no encontrada" }); return; }
    res.json(updated);
  })
);

export default router;
