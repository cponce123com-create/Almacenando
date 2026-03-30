import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { finalDispositionTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
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

function buildPhotoName(productName: string, date: string, index: number, ext: string): string {
  const name = productName
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 30)
    .replace(/^_|_$/g, "");
  const d = date.replace(/-/g, "");
  return `disp_${name}_${d}_foto${index}${ext}`;
}

const router = Router();

const dispositionSchema = z.object({
  productId: z.string().optional().nullable(),
  productNameManual: z.string().optional(),
  quantity: z.string().min(1),
  unit: z.string().min(1),
  dispositionType: z.string().min(1),
  dispositionDate: z.string().min(1),
  contractor: z.string().optional(),
  manifestNumber: z.string().optional(),
  certificateNumber: z.string().optional(),
  cost: z.preprocess(v => (v === "" || v == null) ? null : v, z.string().nullable().optional()),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db.select().from(finalDispositionTable).orderBy(desc(finalDispositionTable.dispositionDate));
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(finalDispositionTable).where(eq(finalDispositionTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = dispositionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { productId, productNameManual, ...rest } = parsed.data;
  if (!productId && !productNameManual) {
    res.status(400).json({ error: "Debe seleccionar un producto o ingresar un nombre manualmente" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(finalDispositionTable).values({
    id,
    productId: productId || null,
    productNameManual: productNameManual || null,
    ...rest,
    registeredBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authedReq = req as AuthenticatedRequest;
  const parsed = dispositionSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "completed") { updateData.approvedBy = authedReq.userId; }
  const [updated] = await db.update(finalDispositionTable).set(updateData).where(eq(finalDispositionTable.id, id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(finalDispositionTable).where(eq(finalDispositionTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json({ message: "Registro eliminado" });
}));

router.post(
  "/:id/photos",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.array("photos", 5),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No se enviaron archivos" }); return;
    }

    const [record] = await db.select().from(finalDispositionTable).where(eq(finalDispositionTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Registro no encontrado" }); return; }

    const existing = (record.photos as string[] | null) ?? [];
    const slots = 5 - existing.length;
    if (slots <= 0) {
      res.status(400).json({ error: "Ya se alcanzó el límite de 5 fotos" }); return;
    }

    const toUpload = files.slice(0, slots);
    const productName = record.productNameManual ?? record.productId ?? "disposicion";
    const date = record.dispositionDate ?? new Date().toISOString().slice(0, 10);
    const startIndex = existing.length + 1;

    const uploaded: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i]!;
      try {
        const ext = "." + (file.mimetype.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = buildPhotoName(productName, date, startIndex + i, ext);
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
    const [updated] = await db.update(finalDispositionTable)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(finalDispositionTable.id, id as string)).returning();

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
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const { id, photoIndex } = req.params;
    const idx = parseInt(photoIndex as string, 10);

    const [record] = await db.select().from(finalDispositionTable).where(eq(finalDispositionTable.id, id as string)).limit(1);
    if (!record) { res.status(404).json({ error: "Registro no encontrado" }); return; }

    const photos = [...((record.photos as string[] | null) ?? [])];
    if (isNaN(idx) || idx < 0 || idx >= photos.length) {
      res.status(400).json({ error: "Índice de foto inválido" }); return;
    }

    const url = photos[idx]!;
    const fileId = extractFileId(url);
    if (fileId) { await deleteFileFromDrive(fileId); }

    photos.splice(idx, 1);
    const [updated] = await db.update(finalDispositionTable)
      .set({ photos, updatedAt: new Date() })
      .where(eq(finalDispositionTable.id, id as string)).returning();

    res.json(updated);
  })
);

export default router;
