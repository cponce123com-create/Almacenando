import { Router } from "express";
import { db } from "@workspace/db";
import { immobilizedProductsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

const immobilizedSchema = z.object({
  productId: z.string().min(1),
  quantity: z.string().min(1),
  reason: z.string().min(1),
  immobilizedDate: z.string().min(1),
  status: z.enum(["immobilized", "released", "disposed"]).default("immobilized"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db.select().from(immobilizedProductsTable).orderBy(desc(immobilizedProductsTable.immobilizedDate));
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
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
  void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "immobilized_product", resourceId: id, ipAddress: req.ip });
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
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
  void writeAuditLog({ userId: authedReq.userId, action: "release", resource: "immobilized_product", resourceId: id, ipAddress: req.ip });
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(immobilizedProductsTable).where(eq(immobilizedProductsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  res.json({ message: "Registro eliminado" });
}));

export default router;
