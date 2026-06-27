import { Router } from "express";
import { db, inventoryRoundsTable, inventoryRecordsTable, inventoryBoxesTable } from "@workspace/db";
import { eq, desc, asc, and, sql, count } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

/**
 * GET /api/rounds
 * Lista todas las rondas de un almac\u00e9n, con resumen de cada una
 */
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string || "General";
  const rounds = await db.select({
    id: inventoryRoundsTable.id,
    roundNumber: inventoryRoundsTable.roundNumber,
    warehouse: inventoryRoundsTable.warehouse,
    balanceDate: inventoryRoundsTable.balanceDate,
    status: inventoryRoundsTable.status,
    totalSystemBalance: inventoryRoundsTable.totalSystemBalance,
    totalPhysical: inventoryRoundsTable.totalPhysical,
    difference: inventoryRoundsTable.difference,
    recordCount: inventoryRoundsTable.recordCount,
    startedAt: inventoryRoundsTable.startedAt,
    closedAt: inventoryRoundsTable.closedAt,
  })
    .from(inventoryRoundsTable)
    .where(eq(inventoryRoundsTable.warehouse, warehouse))
    .orderBy(desc(inventoryRoundsTable.roundNumber))
    .limit(50);

  res.json(rounds);
}));

/**
 * GET /api/rounds/:id
 * Detalle completo de una ronda: registros de inventario + boxes
 */

/**
 * GET /api/rounds/active?warehouse=QA
 * Devuelve la ronda activa para un almacén
 */
router.get("/active", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string || "General";
  const [round] = await db.select()
    .from(inventoryRoundsTable)
    .where(and(eq(inventoryRoundsTable.warehouse, warehouse), eq(inventoryRoundsTable.status, "active")))
    .limit(1);
  res.json(round || null);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [round] = await db.select()
    .from(inventoryRoundsTable)
    .where(eq(inventoryRoundsTable.id, id as string))
    .limit(1);

  if (!round) {
    res.status(404).json({ error: "Ronda no encontrada" });
    return;
  }

  // Obtener todos los registros de esta ronda
  const records = await db.select()
    .from(inventoryRecordsTable)
    .where(eq(inventoryRecordsTable.roundId, id as string))
    .orderBy(asc(inventoryRecordsTable.recordDate), asc(inventoryRecordsTable.createdAt));

  // Obtener las cajas de esos registros
  const recordIds = records.map(r => r.id);
  const boxes = recordIds.length > 0
    ? await db.select().from(inventoryBoxesTable)
      .where(sql`${inventoryBoxesTable.inventoryRecordId} = ANY(${recordIds})`)
      .orderBy(inventoryBoxesTable.inventoryRecordId, inventoryBoxesTable.boxNumber)
    : [];

  // Agrupar cajas por recordId
  const boxesByRecord = new Map<string, typeof boxes>();
  for (const box of boxes) {
    if (!boxesByRecord.has(box.inventoryRecordId)) boxesByRecord.set(box.inventoryRecordId, []);
    boxesByRecord.get(box.inventoryRecordId)!.push(box);
  }

  res.json({
    round,
    records: records.map(r => ({
      ...r,
      boxes: boxesByRecord.get(r.id) ?? [],
    })),
  });
}));

export default router;
