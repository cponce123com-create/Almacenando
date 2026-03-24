import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";

const router = Router();

const documentSchema = z.object({
  title: z.string().min(1),
  documentType: z.string().min(1),
  fileUrl: z.string().optional(),
  version: z.string().optional(),
  issueDate: z.string().optional(),
  expirationDate: z.string().optional(),
  responsibleParty: z.string().optional(),
  status: z.enum(["active", "archived", "expired"]).default("active"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, async (_req, res) => {
  const records = await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));
  res.json(records);
});

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(documentsTable).where(eq(documentsTable.id, id as string)).limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Documento no encontrado" });
    return;
  }
  res.json(records[0]);
});

router.post("/", requireAuth, requireRole("supervisor", "admin", "quality"), async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = documentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(documentsTable).values({
    id,
    ...parsed.data,
    uploadedBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
});

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), async (req, res) => {
  const { id } = req.params;
  const parsed = documentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(documentsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(documentsTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Documento no encontrado" });
    return;
  }
  res.json(updated);
});

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(documentsTable).where(eq(documentsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Documento no encontrado" });
    return;
  }
  res.json({ message: "Documento eliminado" });
});

export default router;
