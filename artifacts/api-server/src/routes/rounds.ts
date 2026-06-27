import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

/**
 * GET /api/rounds
 * Lista todas las rondas de un almac\u00e9n, con resumen de cada una
 */
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string || "General";
  const result = await db.execute(sql`
    SELECT id, round_number, warehouse, balance_date, status,
           total_system_balance, total_physical, difference, record_count,
           started_at, closed_at
    FROM inventory_rounds
    WHERE warehouse = ${warehouse}
    ORDER BY round_number DESC
    LIMIT 50
  `);
  res.json(result.rows);
}));

/**
 * GET /api/rounds/active?warehouse=QA
 * Devuelve la ronda activa para un almac\u00e9n
 */
router.get("/active", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string || "General";
  const result = await db.execute(sql`
    SELECT id, round_number, warehouse, balance_date, status,
           total_system_balance, total_physical, difference, record_count,
           started_at, closed_at
    FROM inventory_rounds
    WHERE warehouse = ${warehouse} AND status = 'active'
    LIMIT 1
  `);
  res.json(result.rows[0] || null);
}));

/**
 * GET /api/rounds/:id
 * Detalle completo de una ronda: registros de inventario + boxes
 */
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const roundResult = await db.execute(sql`
    SELECT id, round_number, warehouse, balance_date, status,
           total_system_balance, total_physical, difference, record_count,
           started_at, closed_at
    FROM inventory_rounds
    WHERE id = ${id as string}
    LIMIT 1
  `);

  if (roundResult.rows.length === 0) {
    res.status(404).json({ error: "Ronda no encontrada" });
    return;
  }

  const round = roundResult.rows[0];

  // Obtener todos los registros de esta ronda
  const recordsResult = await db.execute(sql`
    SELECT id, product_id, record_date, physical_count, location, notes, missing_label
    FROM inventory_records
    WHERE round_id = ${id as string}
    ORDER BY record_date ASC, created_at ASC
  `);
  const records = recordsResult.rows;

  // Obtener las cajas de esos registros
  const recordIds = records.map((r: any) => r.id);
  const boxesResult = recordIds.length > 0
    ? await db.execute(sql`
        SELECT id, inventory_record_id, box_number, weight, tare, lot
        FROM inventory_boxes
        WHERE inventory_record_id = ANY(${recordIds})
        ORDER BY inventory_record_id, box_number
      `)
    : { rows: [] };

  // Agrupar cajas por recordId
  const boxesByRecord = new Map<string, any[]>();
  for (const box of boxesResult.rows as any[]) {
    if (!boxesByRecord.has(box.inventory_record_id)) boxesByRecord.set(box.inventory_record_id, []);
    boxesByRecord.get(box.inventory_record_id)!.push(box);
  }

  res.json({
    round,
    records: records.map((r: any) => ({
      ...r,
      boxes: boxesByRecord.get(r.id) ?? [],
    })),
  });
}));

export default router;
