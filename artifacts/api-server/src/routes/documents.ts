import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const ALLOWED_TYPES = [
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png", "image/jpeg", "image/jpg",
  "text/plain",
];

const documentMetaSchema = z.object({
  title: z.string().min(1),
  documentType: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  issueDate: z.preprocess(v => (v === "" || v == null) ? null : v, z.string().nullable().optional()),
  expirationDate: z.preprocess(v => (v === "" || v == null) ? null : v, z.string().nullable().optional()),
  responsibleParty: z.string().optional(),
  status: z.enum(["active", "archived", "expired"]).default("active"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db.select({
    id: documentsTable.id,
    title: documentsTable.title,
    documentType: documentsTable.documentType,
    category: documentsTable.category,
    description: documentsTable.description,
    fileName: documentsTable.fileName,
    fileSize: documentsTable.fileSize,
    version: documentsTable.version,
    issueDate: documentsTable.issueDate,
    expirationDate: documentsTable.expirationDate,
    responsibleParty: documentsTable.responsibleParty,
    status: documentsTable.status,
    notes: documentsTable.notes,
    uploadedBy: documentsTable.uploadedBy,
    createdAt: documentsTable.createdAt,
    updatedAt: documentsTable.updatedAt,
  }).from(documentsTable).orderBy(desc(documentsTable.createdAt));
  res.json(records);
}));

router.get("/:id/download", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(documentsTable).where(eq(documentsTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Documento no encontrado" }); return; }
  const doc = records[0];
  if (!doc.fileData) { res.status(404).json({ error: "Este documento no tiene archivo adjunto" }); return; }
  const base64Data = doc.fileData.split(",")[1] ?? doc.fileData;
  const buffer = Buffer.from(base64Data, "base64");
  const mimeMatch = doc.fileData.match(/^data:([^;]+);base64,/);
  const mime = mimeMatch?.[1] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName ?? "document"}"`);
  res.send(buffer);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(documentsTable).where(eq(documentsTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Documento no encontrado" }); return; }
  res.json(records[0]);
}));

router.post(
  "/",
  requireAuth,
  requireRole("supervisor", "admin", "quality"),
  upload.single("file"), asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const body = typeof req.body === "object" ? req.body : {};
    const parsed = documentMetaSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }
    let fileData: string | undefined;
    let fileName: string | undefined;
    let fileSize: string | undefined;
    if (req.file) {
      if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
        res.status(400).json({ error: "Tipo de archivo no permitido" });
        return;
      }
      const base64 = req.file.buffer.toString("base64");
      fileData = `data:${req.file.mimetype};base64,${base64}`;
      fileName = req.file.originalname;
      fileSize = String(req.file.size);
    }
    const id = generateId();
    const [created] = await db.insert(documentsTable).values({
      id,
      ...parsed.data,
      fileData,
      fileName,
      fileSize,
      uploadedBy: authedReq.userId,
    }).returning();
    const { fileData: _fd, ...safeDoc } = created;
    res.status(201).json(safeDoc);
  })
);

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = documentMetaSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
  const [updated] = await db.update(documentsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(documentsTable.id, id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Documento no encontrado" }); return; }
  const { fileData: _fd, ...safeDoc } = updated;
  res.json(safeDoc);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(documentsTable).where(eq(documentsTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Documento no encontrado" }); return; }
  res.json({ message: "Documento eliminado" });
}));

export default router;
