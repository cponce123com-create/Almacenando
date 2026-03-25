import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryRecordsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

const inventorySchema = z.object({
  productId: z.string().min(1),
  recordDate: z.string().min(1),
  previousBalance: z.string().default("0"),
  inputs: z.string().default("0"),
  outputs: z.string().default("0"),
  finalBalance: z.string().default("0"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db.select().from(inventoryRecordsTable).orderBy(desc(inventoryRecordsTable.recordDate));
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(inventoryRecordsTable).where(eq(inventoryRecordsTable.id, id as string)).limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = inventorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const id = generateId();
  const [created] = await db.insert(inventoryRecordsTable).values({
    id,
    ...parsed.data,
    registeredBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = inventorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(inventoryRecordsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(inventoryRecordsTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(inventoryRecordsTable).where(eq(inventoryRecordsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Registro no encontrado" });
    return;
  }
  res.json({ message: "Registro eliminado" });
}));

export default router;
