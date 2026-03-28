import { Router } from "express";
import { db } from "@workspace/db";
import { personnelTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

function parsePagination(q: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(String(q.limit ?? "50"), 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

const router = Router();

const personnelSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  position: z.string().min(1),
  department: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  hireDate: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
  const [{ total }] = await db.select({ total: count() }).from(personnelTable);
  const records = await db.select().from(personnelTable)
    .orderBy(personnelTable.name)
    .limit(limit)
    .offset(offset);
  res.json({ data: records, total, page, limit });
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(personnelTable).where(eq(personnelTable.id, id as string)).limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Personal no encontrado" });
    return;
  }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const parsed = personnelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [created] = await db.insert(personnelTable).values({ id: generateId(), ...parsed.data }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = personnelSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(personnelTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(personnelTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Personal no encontrado" });
    return;
  }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(personnelTable).where(eq(personnelTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Personal no encontrado" });
    return;
  }
  res.json({ message: "Personal eliminado" });
}));

export default router;
