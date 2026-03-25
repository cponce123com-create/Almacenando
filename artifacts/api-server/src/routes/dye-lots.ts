import { Router } from "express";
import { db } from "@workspace/db";
import { dyeLotsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

const dyeLotSchema = z.object({
  productId: z.string().min(1),
  lotNumber: z.string().min(1),
  quantity: z.string().min(1),
  expirationDate: z.string().optional(),
  receiptDate: z.string().min(1),
  supplier: z.string().optional(),
  certificateNumber: z.string().optional(),
  qualityStatus: z.enum(["pending", "approved", "rejected"]).default("pending"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db.select().from(dyeLotsTable).orderBy(desc(dyeLotsTable.receiptDate));
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(dyeLotsTable).where(eq(dyeLotsTable.id, id as string)).limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "quality", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = dyeLotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(dyeLotsTable).values({
    id,
    ...parsed.data,
    registeredBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authedReq = req as AuthenticatedRequest;
  const parsed = dyeLotSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.qualityStatus === "approved") {
    updateData.approvedBy = authedReq.userId;
    updateData.approvedAt = new Date();
  }
  const [updated] = await db.update(dyeLotsTable).set(updateData).where(eq(dyeLotsTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(dyeLotsTable).where(eq(dyeLotsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }
  res.json({ message: "Lote eliminado" });
}));

export default router;
