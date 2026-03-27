import { Router } from "express";
import { db } from "@workspace/db";
import { cuadreRecordsTable, cuadreItemsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

const cuadreItemSchema = z.object({
  code: z.string().min(1),
  productDescription: z.string().min(1),
  unit: z.string().min(1),
  systemBalance: z.string().default("0"),
  physicalCount: z.string().default("0"),
  notes: z.string().optional(),
});

const cuadreSchema = z.object({
  warehouse: z.string().min(1),
  cuadreDate: z.string().min(1),
  responsible: z.string().min(1),
  notes: z.string().optional(),
  status: z.enum(["pending", "completed", "approved"]).default("pending"),
  items: z.array(cuadreItemSchema).optional(),
});

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  let query = db.select().from(cuadreRecordsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(cuadreRecordsTable.warehouse, warehouse));
  }
  const records = await query.orderBy(desc(cuadreRecordsTable.cuadreDate), desc(cuadreRecordsTable.createdAt));
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(cuadreRecordsTable).where(eq(cuadreRecordsTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Cuadre no encontrado" }); return; }
  const items = await db.select().from(cuadreItemsTable).where(eq(cuadreItemsTable.cuadreId, id as string));
  res.json({ ...records[0], items });
}));

router.post("/", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = cuadreSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const { items, ...cuadreData } = parsed.data;
  const id = generateId();
  const [created] = await db.insert(cuadreRecordsTable).values({
    id,
    ...cuadreData,
    registeredBy: req.userId,
  }).returning();

  if (items && items.length > 0) {
    const itemRows = items.map(item => {
      const sys = parseFloat(item.systemBalance) || 0;
      const phys = parseFloat(item.physicalCount) || 0;
      return {
        id: generateId(),
        cuadreId: id,
        ...item,
        difference: String(phys - sys),
      };
    });
    await db.insert(cuadreItemsTable).values(itemRows);
  }

  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const parsed = cuadreSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const { items, ...cuadreData } = parsed.data as { items?: z.infer<typeof cuadreItemSchema>[]; [k: string]: unknown };
  const [updated] = await db.update(cuadreRecordsTable)
    .set({ ...(cuadreData as object), updatedAt: new Date() })
    .where(eq(cuadreRecordsTable.id, id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Cuadre no encontrado" }); return; }

  if (items) {
    await db.delete(cuadreItemsTable).where(eq(cuadreItemsTable.cuadreId, id as string));
    if (items.length > 0) {
      const itemRows = items.map(item => {
        const sys = parseFloat(item.systemBalance) || 0;
        const phys = parseFloat(item.physicalCount) || 0;
        return {
          id: generateId(),
          cuadreId: id,
          ...item,
          difference: String(phys - sys),
        };
      });
      await db.insert(cuadreItemsTable).values(itemRows);
    }
  }

  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(cuadreRecordsTable).where(eq(cuadreRecordsTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Cuadre no encontrado" }); return; }
  res.json({ message: "Cuadre eliminado" });
}));

export default router;
