import { Router } from "express";
import { db } from "@workspace/db";
import { samplesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

function parsePagination(q: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(String(q.limit ?? "50"), 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
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

export default router;
