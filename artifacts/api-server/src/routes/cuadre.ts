import { Router } from "express";
import { db } from "@workspace/db";
import { cuadreRecordsTable, cuadreItemsTable, balanceRecordsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * Cuadres / Arqueos
 * GET /cuadre, POST /cuadre, GET /cuadre/:id, PUT /cuadre/:id, DELETE /cuadre/:id
 */

const router = Router();

const cuadreItemSchema = z.object({
  code: z.string().min(1),
  productDescription: z.string().min(1),
  unit: z.string().min(1),
  systemBalance: z.coerce.number().finite().default(0),
  physicalCount: z.coerce.number().finite().default(0),
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

router.get("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  let query = db.select().from(cuadreRecordsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(cuadreRecordsTable.warehouse, warehouse));
  }
  const records = await query.orderBy(desc(cuadreRecordsTable.cuadreDate), desc(cuadreRecordsTable.createdAt));
  if (records.length === 0) { res.json(records); return; }

  const ids = records.map(r => r.id);
  const allItems = await db.select().from(cuadreItemsTable).where(inArray(cuadreItemsTable.cuadreId, ids));

  // Last consumption date per product code — dual source: ERP (balance_records) > Sistema (inventory_records)
  const codes = [...new Set(allItems.map(i => i.code))];
  const warehouseByCuadreId = new Map(records.map(r => [r.id, r.warehouse]));
  const lcMap = new Map<string, string>();
  const sourceMap = new Map<string, "ERP" | "Sistema">();

  if (codes.length > 0) {
    // Source 1: ERP — the same code can refer to different products by warehouse.
    const erpRows = await db.execute(sql`
      SELECT cr.warehouse, br.code, MAX(br.ultimo_consumo) AS ultimo_consumo
      FROM balance_records br
      JOIN cuadre_records cr ON cr.warehouse = br.warehouse
      WHERE cr.id = ANY(${ids}) AND br.code = ANY(${codes})
      GROUP BY cr.warehouse, br.code
    `);
    for (const row of erpRows.rows as { warehouse: string; code: string; ultimo_consumo: string | null }[]) {
      if (row.ultimo_consumo && row.ultimo_consumo > "2013-01-01") {
        const key = `${row.warehouse}::${row.code}`;
        lcMap.set(key, row.ultimo_consumo);
        sourceMap.set(key, "ERP");
      }
    }

    // Source 2: Sistema — MAX(record_date) from inventory_records as fallback
    const sysRows = await db.execute(sql`
      SELECT p.warehouse, p.code, MAX(ir.record_date) AS last_consumption_date
      FROM inventory_records ir
      JOIN products p ON ir.product_id = p.id
      WHERE p.code = ANY(${codes}) AND p.warehouse IN (
        SELECT warehouse FROM cuadre_records WHERE id = ANY(${ids})
      )
      GROUP BY p.warehouse, p.code
    `);
    for (const row of sysRows.rows as { warehouse: string; code: string; last_consumption_date: string | null }[]) {
      const key = `${row.warehouse}::${row.code}`;
      if (row.last_consumption_date && !lcMap.has(key)) {
        lcMap.set(key, row.last_consumption_date);
        sourceMap.set(key, "Sistema");
      }
    }
  }

  const itemMap = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (!itemMap.has(item.cuadreId)) itemMap.set(item.cuadreId, []);
    const key = `${warehouseByCuadreId.get(item.cuadreId) ?? ""}::${item.code}`;
    itemMap.get(item.cuadreId)!.push({
      ...item,
      lastConsumptionDate: lcMap.get(key) ?? null,
      sourceLabel: sourceMap.get(key) ?? "Sistema",
    } as typeof item & { lastConsumptionDate: string | null; sourceLabel: "ERP" | "Sistema" });
  }
  res.json(records.map(r => ({ ...r, items: itemMap.get(r.id) ?? [] })));
}));

router.get("/:id", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
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
      const sys = item.systemBalance;
      const phys = item.physicalCount;
      return {
        id: generateId(),
        cuadreId: id,
        ...item,
        difference: phys - sys,
      };
    });
    await db.insert(cuadreItemsTable).values(itemRows);
  }

  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const id = req.params.id as string;
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
        const sys = item.systemBalance;
        const phys = item.physicalCount;
        return {
          id: generateId(),
          cuadreId: id,
          ...item,
          difference: phys - sys,
        };
      });
      await db.insert(cuadreItemsTable).values(itemRows);
    }
  }

  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [deleted] = await db.delete(cuadreRecordsTable).where(eq(cuadreRecordsTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Cuadre no encontrado" }); return; }
  res.json({ message: "Cuadre eliminado" });
}));

export default router;
