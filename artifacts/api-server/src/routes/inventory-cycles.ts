import { Router } from "express";
import { db } from "@workspace/db";
import {
  inventoryCyclesTable,
  inventoryCycleProductsTable,
  productsTable,
  balanceRecordsTable,
  inventoryRecordsTable,
} from "@workspace/db";
import { eq, and, desc, count, sql, inArray, not, isNull, lte } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { parsePagination } from "../lib/pagination.js";
import { logger } from "../lib/logger.js";

/**
 * Ciclos de Inventario
 * GET /inventory-cycles, POST /inventory-cycles, GET /inventory-cycles/:id,
 * PATCH /inventory-cycles/:id, POST /inventory-cycles/:id/close,
 * GET /inventory-cycles/:id/progress, GET /inventory-cycles/:id/recommendations
 * PATCH /inventory-cycles/:id/products/:productId
 */

const router = Router();

const createCycleSchema = z.object({
  warehouse: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
});

const updateProductStatusSchema = z.object({
  status: z.enum(["pending", "counted", "verified", "skipped"]),
  physicalCount: z.string().optional(),
  notes: z.string().optional(),
  inventoryRecordId: z.string().optional(),
});

// ── List cycles ─────────────────────────────────────────────────────────────

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

  const condition = warehouse && warehouse !== "all"
    ? eq(inventoryCyclesTable.warehouse, warehouse)
    : undefined;

  const [{ total }] = await db.select({ total: count() }).from(inventoryCyclesTable).where(condition);

  const cycles = await db.select().from(inventoryCyclesTable)
    .where(condition)
    .orderBy(desc(inventoryCyclesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ data: cycles, total, page, limit });
}));

// ── Get single cycle ────────────────────────────────────────────────────────

router.get("/active", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const condition = warehouse && warehouse !== "all"
    ? and(
        eq(inventoryCyclesTable.status, "active"),
        eq(inventoryCyclesTable.warehouse, warehouse)
      )
    : eq(inventoryCyclesTable.status, "active");

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(condition)
    .orderBy(desc(inventoryCyclesTable.createdAt))
    .limit(1);

  if (!cycle) {
    res.json(null);
    return;
  }

  // Get progress stats
  const statusCounts = await db.select({
    status: inventoryCycleProductsTable.status,
    count: count(),
  })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, cycle.id))
    .groupBy(inventoryCycleProductsTable.status);

  const stats = {
    pending: 0,
    counted: 0,
    verified: 0,
    withoutMovement: 0,
    skipped: 0,
    total: 0,
  };

  for (const s of statusCounts) {
    const key = s.status as keyof typeof stats;
    if (key in stats) stats[key] = Number(s.count);
    stats.total += Number(s.count);
  }

  res.json({ ...cycle, stats });
}));

// ── Create cycle ────────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = createCycleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { warehouse } = parsed.data;
  const id = generateId();

  // Check if there's already an active cycle for this warehouse
  const [existing] = await db.select({ id: inventoryCyclesTable.id })
    .from(inventoryCyclesTable)
    .where(and(
      eq(inventoryCyclesTable.warehouse, warehouse),
      eq(inventoryCyclesTable.status, "active")
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({
      error: `Ya existe un ciclo activo para el almacén ${warehouse}. Ciérralo antes de crear uno nuevo.`,
      existingCycleId: existing.id,
    });
    return;
  }

  // Get all active products in this warehouse to populate the cycle
  const products = await db.select({
    id: productsTable.id,
    code: productsTable.code,
    warehouse: productsTable.warehouse,
  })
    .from(productsTable)
    .where(and(
      eq(productsTable.warehouse, warehouse),
      eq(productsTable.status, "active")
    ));

  if (products.length === 0) {
    res.status(400).json({ error: `No hay productos activos en el almacén ${warehouse}` });
    return;
  }

  // Get latest balance for each product to calculate priority
  const latestBalances = await db.execute(sql`
    SELECT DISTINCT ON (br.code)
      br.code, br.quantity, br.ultimo_consumo, br.batch_id
    FROM balance_records br
    WHERE br.warehouse = ${warehouse}
    ORDER BY br.code, br.balance_date DESC, br.created_at DESC
  `);

  const balanceByCode = new Map<string, { quantity: string; ultimoConsumo: string | null; batchId: string }>();
  for (const row of latestBalances.rows as {
    code: string; quantity: string; ultimo_consumo: string | null; batch_id: string;
  }[]) {
    balanceByCode.set(row.code, {
      quantity: row.quantity,
      ultimoConsumo: row.ultimo_consumo,
      batchId: row.batch_id,
    });
  }

  // Get latest inventory record date per product for priority calculation
  const lastInventories = await db.execute(sql`
    SELECT DISTINCT ON (ir.product_id)
      ir.product_id, ir.record_date
    FROM inventory_records ir
    JOIN products p ON p.id = ir.product_id AND p.warehouse = ${warehouse}
    ORDER BY ir.product_id, ir.record_date DESC
  `);

  const inventoryDateMap = new Map<string, string>();
  for (const row of lastInventories.rows as { product_id: string; record_date: string }[]) {
    inventoryDateMap.set(row.product_id, row.record_date);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Build cycle products with priority: higher priority = more urgent to count
  const cycleProducts = products.map((p) => {
    const balance = balanceByCode.get(p.code);
    const lastInvDate = inventoryDateMap.get(p.id);
    const balanceBatchId = balance?.batchId ?? null;
    const initialQty = balance?.quantity ? parseFloat(balance.quantity) : null;
    const ultimoConsumo = balance?.ultimoConsumo ?? null;

    // Priority calculation:
    // - Products never inventoried: highest priority (base 100)
    // - Products with older last inventory: higher priority
    // - Products with very old ultimoConsumo: medium priority
    let priority = 0;

    if (!lastInvDate) {
      // Never inventoried — highest priority
      priority = 100;
    } else {
      const daysSinceInv = Math.floor(
        (new Date(today).getTime() - new Date(lastInvDate).getTime()) / 86400000
      );
      priority = Math.min(Math.floor(daysSinceInv / 7), 50); // 1 point per week, max 50
    }

    if (ultimoConsumo && ultimoConsumo > "2013-01-01") {
      const monthsSinceConsumo = Math.floor(
        (new Date(today).getTime() - new Date(ultimoConsumo).getTime()) / (86400000 * 30.44)
      );
      if (monthsSinceConsumo > 12) priority += 30; // > 1 year without consumption
      else if (monthsSinceConsumo > 6) priority += 15; // > 6 months
    }

    return {
      id: generateId(),
      cycleId: id,
      productId: p.id,
      initialBalanceBatchId: balanceBatchId,
      initialQuantity: initialQty,
      initialUltimoConsumo: ultimoConsumo,
      status: "pending" as const,
      priority,
    };
  });

  await db.transaction(async (tx) => {
    const [cycle] = await tx.insert(inventoryCyclesTable).values({
      id,
      warehouse,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
      totalProducts: cycleProducts.length,
      createdBy: req.userId,
    }).returning();

    // Batch insert cycle products
    await tx.insert(inventoryCycleProductsTable).values(cycleProducts);

    res.status(201).json(cycle);
  });
}));

// ── Get cycle progress ──────────────────────────────────────────────────────

router.get("/:id/progress", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .limit(1);

  if (!cycle) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }

  // Build conditions
  const conditions = [eq(inventoryCycleProductsTable.cycleId, id as string)];
  if (status && status !== "all") conditions.push(eq(inventoryCycleProductsTable.status, status));

  // Get cycle products with product info
  let query = db.select({
    cp: inventoryCycleProductsTable,
    product: productsTable,
  })
    .from(inventoryCycleProductsTable)
    .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
    .where(and(...conditions))
    .orderBy(
      desc(inventoryCycleProductsTable.priority),
      productsTable.code
    );

  let results = await query;

  // Client-side search filter (code/name)
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(r =>
      r.product.code.toLowerCase().includes(q) ||
      r.product.name.toLowerCase().includes(q)
    );
  }

  // Stats
  const statusCounts = await db.select({
    status: inventoryCycleProductsTable.status,
    count: count(),
  })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, id as string))
    .groupBy(inventoryCycleProductsTable.status);

  const stats = {
    pending: 0, counted: 0, verified: 0,
    withoutMovement: 0, skipped: 0, total: 0,
  };

  for (const s of statusCounts) {
    const key = s.status as keyof typeof stats;
    if (key in stats) stats[key] = Number(s.count);
    stats.total += Number(s.count);
  }

  res.json({
    cycle,
    stats,
    products: results.map(r => ({
      ...r.cp,
      code: r.product.code,
      productName: r.product.name,
      unit: r.product.unit,
      warehouse: r.product.warehouse,
      location: r.product.location,
      category: r.product.category,
      hazardClass: r.product.hazardClass,
    })),
  });
}));

// ── Get recommendations (next N products to count) ─────────────────────────

router.get("/:id/recommendations", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit as string) || 5;

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .limit(1);

  if (!cycle) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }

  // Get top N pending products ordered by priority descending
  const pending = await db.select({
    cp: inventoryCycleProductsTable,
    product: productsTable,
  })
    .from(inventoryCycleProductsTable)
    .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.status, "pending")
    ))
    .orderBy(
      desc(inventoryCycleProductsTable.priority),
      productsTable.code
    )
    .limit(limit);

  const recommendations = pending.map(r => ({
    ...r.cp,
    code: r.product.code,
    productName: r.product.name,
    unit: r.product.unit,
    location: r.product.location,
    category: r.product.category,
  }));

  // Summary
  const totalPending = await db.select({ total: count() })
    .from(inventoryCycleProductsTable)
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.status, "pending")
    ));

  res.json({
    recommendations,
    totalPending: Number(totalPending[0]?.total ?? 0),
    suggestedCount: Math.min(limit, Number(totalPending[0]?.total ?? 0)),
  });
}));

// ── Update product status in cycle (mark as counted) ─────────────────────

router.patch("/:id/products/:productId", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id, productId } = req.params;
  const parsed = updateProductStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const [existing] = await db.select()
    .from(inventoryCycleProductsTable)
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.productId, productId as string)
    ))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Producto no encontrado en el ciclo" });
    return;
  }

  const updateData: Record<string, unknown> = {
    status: parsed.data.status,
    updatedAt: new Date(),
  };

  if (parsed.data.status === "counted") {
    updateData.countedDate = new Date().toISOString().slice(0, 10);
    updateData.countedBy = req.userId;
    if (parsed.data.physicalCount) {
      updateData.physicalCount = parseFloat(parsed.data.physicalCount);
      if (existing.initialQuantity !== null) {
        updateData.difference = (updateData.physicalCount as number) - existing.initialQuantity;
      }
    }
    if (parsed.data.inventoryRecordId) {
      updateData.inventoryRecordId = parsed.data.inventoryRecordId;
    }
  }

  if (parsed.data.notes) {
    updateData.notes = parsed.data.notes;
  }

  await db.update(inventoryCycleProductsTable)
    .set(updateData)
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.productId, productId as string)
    ));

  // Update cycle counters
  const statusCounts = await db.select({
    status: inventoryCycleProductsTable.status,
    count: count(),
  })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, id as string))
    .groupBy(inventoryCycleProductsTable.status);

  const counters = { counted: 0, withoutMovement: 0 };
  for (const s of statusCounts) {
    if (s.status === "counted" || s.status === "verified") {
      counters.counted += Number(s.count);
    }
    if (s.status === "without_movement") {
      counters.withoutMovement += Number(s.count);
    }
  }

  await db.update(inventoryCyclesTable)
    .set({
      countedProducts: counters.counted,
      withoutMovement: counters.withoutMovement,
      updatedAt: new Date(),
    })
    .where(eq(inventoryCyclesTable.id, id as string));

  void writeAuditLog({
    userId: req.userId,
    action: "update",
    resource: "inventory_cycle_product",
    resourceId: `${id}::${productId}`,
    details: { status: parsed.data.status },
    ipAddress: req.ip,
  });

  res.json({ message: "Producto actualizado en el ciclo" });
}));

// ── Mark products as "without movement" (batch) ─────────────────────────

router.post("/:id/detect-no-movement", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { batchId } = req.body as { batchId?: string };

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .limit(1);

  if (!cycle) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }

  // Get all pending products in this cycle with their current balance info
  const pendingProducts = await db.select({
    cp: inventoryCycleProductsTable,
    product: productsTable,
  })
    .from(inventoryCycleProductsTable)
    .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.status, "pending")
    ));

  if (pendingProducts.length === 0) {
    res.json({ message: "No hay productos pendientes en el ciclo", marked: 0 });
    return;
  }

  // Get latest balances for comparison (using batchId if provided)
  const balanceCondition = batchId
    ? and(
        eq(balanceRecordsTable.warehouse, cycle.warehouse),
        eq(balanceRecordsTable.batchId, batchId)
      )
    : eq(balanceRecordsTable.warehouse, cycle.warehouse);

  const latestBalances = await db.execute(sql`
    SELECT DISTINCT ON (br.code)
      br.code, br.quantity, br.ultimo_consumo, br.batch_id
    FROM balance_records br
    WHERE br.warehouse = ${cycle.warehouse}
      ${batchId ? sql`AND br.batch_id = ${batchId}` : sql``}
    ORDER BY br.code, br.balance_date DESC, br.created_at DESC
  `);

  const balanceMap = new Map<string, { quantity: string | null; ultimoConsumo: string | null }>();
  for (const row of latestBalances.rows as { code: string; quantity: string | null; ultimo_consumo: string | null }[]) {
    balanceMap.set(row.code, { quantity: row.quantity, ultimoConsumo: row.ultimo_consumo });
  }

  let marked = 0;
  const updates: Array<{ productId: string; update: Record<string, unknown> }> = [];

  for (const { cp, product } of pendingProducts) {
    const currentBalance = balanceMap.get(product.code);
    if (!currentBalance) continue;

    // Check: same ultimo_consumo AND same quantity → no movement
    const initialUC = cp.initialUltimoConsumo;
    const currentUC = currentBalance.ultimoConsumo;
    const initialQty = cp.initialQuantity;
    const currentQty = currentBalance.quantity ? parseFloat(currentBalance.quantity) : null;

    const sameConsumo = initialUC && currentUC && initialUC === currentUC;
    const sameQuantity = initialQty !== null && currentQty !== null &&
      Math.abs(initialQty - currentQty) < 0.001;

    if (sameConsumo && sameQuantity) {
      updates.push({
        productId: product.id,
        update: {
          status: "without_movement",
          finalUltimoConsumo: currentUC,
          finalQuantity: currentQty,
          finalBalanceBatchId: (currentBalance as unknown as { batch_id: string }).batch_id ?? null,
          updatedAt: new Date(),
        },
      });
      marked++;
    }
  }

  // Apply batch updates
  for (const { productId, update } of updates) {
    await db.update(inventoryCycleProductsTable)
      .set(update)
      .where(and(
        eq(inventoryCycleProductsTable.cycleId, id as string),
        eq(inventoryCycleProductsTable.productId, productId)
      ));
  }

  // Update cycle counter
  await db.update(inventoryCyclesTable)
    .set({
      withoutMovement: marked,
      updatedAt: new Date(),
    })
    .where(eq(inventoryCyclesTable.id, id as string));

  void writeAuditLog({
    userId: req.userId,
    action: "update",
    resource: "inventory_cycle_detect_no_movement",
    resourceId: id as string,
    details: { marked },
    ipAddress: req.ip,
  });

  res.json({
    message: `Se marcaron ${marked} productos como "sin movimiento"`,
    marked,
    total: pendingProducts.length,
  });
}));

// ── Close cycle ─────────────────────────────────────────────────────────────

router.post("/:id/close", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .limit(1);

  if (!cycle) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }
  if (cycle.status !== "active") { res.status(400).json({ error: "El ciclo ya está cerrado" }); return; }

  // Count final stats
  const statusCounts = await db.select({
    status: inventoryCycleProductsTable.status,
    count: count(),
  })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, id as string))
    .groupBy(inventoryCycleProductsTable.status);

  const counters = { counted: 0, withoutMovement: 0, pending: 0 };
  for (const s of statusCounts) {
    if (s.status === "counted" || s.status === "verified") counters.counted += Number(s.count);
    else if (s.status === "without_movement") counters.withoutMovement += Number(s.count);
    else if (s.status === "pending") counters.pending += Number(s.count);
  }

  const [updated] = await db.update(inventoryCyclesTable)
    .set({
      status: "closed",
      endDate: new Date().toISOString().slice(0, 10),
      countedProducts: counters.counted,
      withoutMovement: counters.withoutMovement,
      closedBy: req.userId,
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(inventoryCyclesTable.id, id as string))
    .returning();

  void writeAuditLog({
    userId: req.userId,
    action: "close",
    resource: "inventory_cycle",
    resourceId: id as string,
    details: { pending: counters.pending, counted: counters.counted, withoutMovement: counters.withoutMovement },
    ipAddress: req.ip,
  });

  res.json(updated);
}));

// ── Delete cycle ────────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, requireRole("admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }

  void writeAuditLog({
    userId: req.userId,
    action: "delete",
    resource: "inventory_cycle",
    resourceId: id as string,
    ipAddress: req.ip,
  });

  res.json({ message: "Ciclo eliminado" });
}));

export default router;
