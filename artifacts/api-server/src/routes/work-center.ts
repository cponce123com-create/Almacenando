import { Router } from "express";
import { db } from "@workspace/db";
import { balanceSyncRunsTable, inventoryCyclesTable } from "@workspace/db";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

router.get("/summary", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = typeof req.query.warehouse === "string" ? req.query.warehouse : "Q1";
  const [run] = await db.select({ id: balanceSyncRunsTable.id, extractedAt: balanceSyncRunsTable.extractedAt, payload: balanceSyncRunsTable.payload })
    .from(balanceSyncRunsTable)
    .where(and(like(balanceSyncRunsTable.id, "availability-%"), eq(balanceSyncRunsTable.status, "completed")))
    .orderBy(desc(balanceSyncRunsTable.requestedAt)).limit(1);
  const [cycle] = await db.select({ id: inventoryCyclesTable.id, name: inventoryCyclesTable.name, warehouse: inventoryCyclesTable.warehouse })
    .from(inventoryCyclesTable)
    .where(and(eq(inventoryCyclesTable.status, "active"), eq(inventoryCyclesTable.warehouse, warehouse)))
    .orderBy(desc(inventoryCyclesTable.createdAt)).limit(1);

  const cycleAlerts = cycle ? await db.execute(sql`
    SELECT cp.product_id AS "productId", p.code, p.name, cp.status, cp.counted_date AS "countedDate",
      cp.physical_count AS "physicalCount", cp.final_quantity AS "systemBalance", cp.difference
    FROM inventory_cycle_products cp
    JOIN products p ON p.id = cp.product_id
    WHERE cp.cycle_id = ${cycle.id} AND cp.status = 'consumption_alert'
    ORDER BY cp.priority DESC, p.code
    LIMIT 50
  `) : { rows: [] };
  const cycleStats = cycle ? await db.execute(sql`
    SELECT status, COUNT(*)::int AS total
    FROM inventory_cycle_products WHERE cycle_id = ${cycle.id}
    GROUP BY status
  `) : { rows: [] };

  const incidents = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (ir.product_id) ir.*
      FROM inventory_records ir
      WHERE ir.warehouse = ${warehouse}
      ORDER BY ir.product_id, ir.record_date DESC, ir.created_at DESC, ir.id DESC
    )
    SELECT ir.id, ir.warehouse, ir.record_date AS "recordDate", ir.physical_count AS "physicalCount",
      ir.previous_balance AS "systemBalance", ir.missing_label AS "missingLabel", ir.location,
      p.id AS "productId", p.code, p.name, p.unit,
      COALESCE(boxes.lots, '') AS lots,
      CASE WHEN COALESCE(ir.missing_label, false) THEN 'missing_label' ELSE 'count_difference' END AS kind
    FROM latest ir
    JOIN products p ON p.id = ir.product_id
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT NULLIF(b.lot, ''), ', ' ORDER BY NULLIF(b.lot, '')) AS lots
      FROM inventory_boxes b WHERE b.inventory_record_id = ir.id
    ) boxes ON true
    WHERE (COALESCE(ir.missing_label, false)
        OR (ir.physical_count IS NOT NULL AND ABS(ir.physical_count - ir.previous_balance) >= 0.01))
    ORDER BY ir.record_date DESC, p.code
    LIMIT 50
  `);

  const payload = run?.payload as { rows?: unknown[]; config?: unknown } | null;
  const availabilityRows = (payload?.rows ?? []) as Array<Record<string, unknown>>;
  const allPurchaseCandidates = availabilityRows.map(row => {
    const availability = Number(row.availability ?? 0) || 0;
    const consumptionTwoDays = Number(row.consumptionTwoDays ?? 0) || 0;
    const dailyConsumption = Math.max(0, consumptionTwoDays / 2);
    const recommendation = Math.max(0, dailyConsumption * 7 - availability);
    return { code: String(row.code ?? ""), description: String(row.description ?? ""), unit: String(row.unit ?? ""), availability, dailyConsumption, recommendation };
  }).filter(row => row.recommendation > 0).sort((a, b) => a.availability - b.availability);
  const purchaseCandidates = allPurchaseCandidates.slice(0, 100);

  res.json({
    warehouse,
    updatedAt: run?.extractedAt ?? null,
    purchaseCandidates,
    activeCycle: cycle ?? null,
    cycleAlerts: cycleAlerts.rows,
    incidents: incidents.rows,
    counts: {
      purchaseCandidates: allPurchaseCandidates.length,
      pendingCounts: Number((cycleStats.rows as Array<{ status: string; total: number }>).find(row => row.status === "pending")?.total ?? 0),
      cycleAlerts: cycleAlerts.rows.length,
      incidents: incidents.rows.length,
      labelIssues: incidents.rows.filter((row: any) => row.kind === "missing_label").length,
      countDifferences: incidents.rows.filter((row: any) => row.kind === "count_difference").length,
    },
  });
}));

router.get("/traceability", requireAuth, asyncHandler(async (req, res) => {
  const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if (term.length < 2) { res.json({ query: term, rows: [] }); return; }
  const pattern = `%${term}%`;
  const result = await db.execute(sql`
    WITH latest_snapshot AS (
      SELECT DISTINCT ON (warehouse) warehouse, balance_date, batch_id
      FROM balance_records
      ORDER BY warehouse, balance_date DESC, created_at DESC, id DESC
    ), current_balance AS (
      SELECT br.warehouse, br.type, br.code, SUM(br.quantity)::float AS quantity,
        MAX(br.ultimo_consumo)::text AS last_consumption
      FROM balance_records br
      JOIN latest_snapshot s ON s.warehouse = br.warehouse
        AND s.balance_date = br.balance_date
        AND s.batch_id IS NOT DISTINCT FROM br.batch_id
      GROUP BY br.warehouse, br.type, br.code
    )
    SELECT ir.id AS "recordId", ir.warehouse, p.type, p.code, p.name AS description, p.unit,
      ir.record_date AS "recordDate", ir.physical_count AS "physicalCount",
      ir.previous_balance AS "systemBalance", ir.location, ir.missing_label AS "missingLabel",
      b.lot, b.weight, b.tare, cb.quantity AS "currentBalance", cb.last_consumption AS "lastConsumption"
    FROM inventory_records ir
    JOIN products p ON p.id = ir.product_id
    LEFT JOIN inventory_boxes b ON b.inventory_record_id = ir.id
    LEFT JOIN current_balance cb ON cb.warehouse = p.warehouse AND cb.type = p.type AND cb.code = p.code
    WHERE p.code ILIKE ${pattern} OR p.name ILIKE ${pattern} OR COALESCE(b.lot, '') ILIKE ${pattern}
    ORDER BY ir.record_date DESC, ir.created_at DESC, p.code, b.box_number
    LIMIT 150
  `);
  res.json({ query: term, rows: result.rows });
}));

export default router;
