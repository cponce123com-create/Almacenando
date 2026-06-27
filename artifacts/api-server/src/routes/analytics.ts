/**
 * Analytics / Dashboard
 * Endpoints con datos enriquecidos para el dashboard analítico.
 * GET /api/v1/analytics/dashboard
 * GET /api/v1/analytics/stock-trends
 * GET /api/v1/analytics/top-consumption
 */

import { Router } from "express";
import { db, productsTable, inventoryRecordsTable, immobilizedProductsTable, samplesTable, suppliesTable, usersTable, notificationsTable, balanceRecordsTable } from "@workspace/db";
import { count, sql, and, gte, lte, eq, desc, ilike, or, lt, sum, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

/**
 * GET /api/v1/analytics/dashboard
 *
 * Métricas principales del dashboard:
 * - Totales (productos, movimientos, inmovilizados, etc.)
 * - Alertas activas (stock bajo, lotes por vencer)
 * - Actividad reciente
 * - Distribución por almacén
 */
router.get("/dashboard", requireAuth, asyncHandler(async (_req, res) => {
  const [
    productCount,
    inventoryCount,
    immobilizedCount,
    sampleCount,
    lowStockCount,
    totalSupplies,
    totalUsers,
    lastMovements,
  ] = await Promise.all([
    db.select({ total: count() }).from(productsTable),
    db.select({ total: count() }).from(inventoryRecordsTable),
    db.select({ total: count() }).from(immobilizedProductsTable).where(eq(immobilizedProductsTable.status, "immobilized")),
    db.select({ total: count() }).from(samplesTable),
    db.select({ total: count() }).from(productsTable).where(
      and(
        eq(productsTable.status, "active"),
        lt(productsTable.stock, productsTable.minimumStock),
      ),
    ),
    db.select({ total: count() }).from(suppliesTable),
    db.select({ total: count() }).from(usersTable).where(eq(usersTable.status, "active")),
    // Últimos 10 movimientos de inventario
    db
      .select({
        id: (inventoryRecordsTable as any).id,
        type: (inventoryRecordsTable as any).type,
        quantity: (inventoryRecordsTable as any).quantity,
        date: inventoryRecordsTable.recordDate,        productName: productsTable.name,
        productCode: productsTable.code,
      })
      .from(inventoryRecordsTable)
      .leftJoin(productsTable, eq(inventoryRecordsTable.productId, productsTable.id))
      .orderBy(desc(inventoryRecordsTable.recordDate))
      .limit(10),
  ]);

  // Stock agrupado por almacén
  const warehouseStats = await db
    .select({
      warehouse: productsTable.warehouse,
      total: count(),
    })
    .from(productsTable)
    .groupBy(productsTable.warehouse)
    .orderBy(asc(productsTable.warehouse));

  res.json({
    totals: {
      products: Number(productCount[0]?.total ?? 0),
      movements: Number(inventoryCount[0]?.total ?? 0),
      immobilized: Number(immobilizedCount[0]?.total ?? 0),
      samples: Number(sampleCount[0]?.total ?? 0),
      lowStock: Number(lowStockCount[0]?.total ?? 0),
      supplies: Number(totalSupplies[0]?.total ?? 0),
      activeUsers: Number(totalUsers[0]?.total ?? 0),
    },
    alerts: {
      lowStock: Number(lowStockCount[0]?.total ?? 0),
      immobilized: Number(immobilizedCount[0]?.total ?? 0),
    },
    warehouseDistribution: warehouseStats.map((w) => ({
      warehouse: w.warehouse,
      count: Number(w.total),
    })),
    recentMovements: lastMovements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      date: m.date,
      product: m.productName ? `${m.productCode ?? ""} — ${m.productName}` : null,
    })),
  });
}));

/**
 * GET /api/v1/analytics/stock-trends?days=30
 *
 * Tendencia de movimientos de inventario en los últimos N días.
 */
router.get("/stock-trends", requireAuth, asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const trends = await db
    .select({
      date: inventoryRecordsTable.recordDate,
      type: sql`'record'`,
      total: count(),
      quantity: sql<string>`SUM(CAST(${inventoryRecordsTable.finalBalance} AS DECIMAL))`,
    })
    .from(inventoryRecordsTable)
    .where(gte(inventoryRecordsTable.recordDate, since.toISOString().slice(0, 10)))
    .groupBy(inventoryRecordsTable.recordDate, sql`'record'`)
    .orderBy(asc(inventoryRecordsTable.recordDate))
    .limit(365);

  res.json({ days, trends });
}));

/**
 * GET /api/v1/analytics/top-consumption?limit=10
 *
 * Productos más movidos (entradas + salidas).
 */
router.get("/top-consumption", requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

  const topProducts = await db
    .select({
      productId: inventoryRecordsTable.productId,
      productCode: productsTable.code,
      productName: productsTable.name,
      totalMovements: count(),
    })
    .from(inventoryRecordsTable)
    .leftJoin(productsTable, eq(inventoryRecordsTable.productId, productsTable.id))
    .groupBy(inventoryRecordsTable.productId, productsTable.code, productsTable.name)
    .orderBy(desc(count()))
    .limit(limit);

  res.json({ limit, topProducts });
}));

export default router;
