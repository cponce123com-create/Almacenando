import { Router } from "express";
import { db } from "@workspace/db";
import {
  inventoryCyclesTable,
  inventoryCycleProductsTable,
  productsTable,
  balanceRecordsTable,
  inventoryRecordsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, asc, count, sql, inArray, not, isNull, lte } from "drizzle-orm";
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
 * GET /inventory-cycles/history, GET /inventory-cycles/:id/summary
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
    // Primary: days since last consumption (ultimo_consumo).
    //   More days sin movimiento = higher priority.
    //   Products without consumption data get moderate priority.
    // Secondary: never inventoried gets a boost.
    let priority = 0;

    if (ultimoConsumo && ultimoConsumo > "2013-01-01") {
      const daysSinceConsumo = Math.floor(
        (new Date(today).getTime() - new Date(ultimoConsumo).getTime()) / 86400000
      );
      // ~1 point per week, max 80 for very old consumption
      priority = Math.min(Math.floor(daysSinceConsumo / 7), 80);
    } else {
      // No consumption date or default date → sin dato de movimiento
      priority = 50;
    }

    // Boost for products never inventoried (secondary factor)
    if (!lastInvDate) {
      priority = Math.max(priority, 70);
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
      asc(productsTable.code),
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

// ── Sync cycle with actual inventory records ─────────────────────────
// Sincroniza manualmente el progreso del ciclo con todos los registros
// de inventario reales del almacén. Útil cuando el auto-update no
// alcanzó a registrar productos o cuando se importaron registros.

router.post("/:id/sync", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .limit(1);

  if (!cycle) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }
  if (cycle.status !== "active") { res.status(400).json({ error: "El ciclo ya está cerrado. No se puede sincronizar." }); return; }

  // Obtener todos los registros de inventario del almacén, agrupados por producto
  const inventoryRecords = await db.execute(sql`
    SELECT
      ir.product_id,
      COUNT(*)::int AS total_records,
      MAX(ir.record_date) AS latest_date,
      SUM(COALESCE(ir.physical_count, 0)) AS total_physical,
      AVG(COALESCE(ir.previous_balance, 0)) AS avg_balance
    FROM inventory_records ir
    JOIN products p ON p.id = ir.product_id
    WHERE p.warehouse = ${cycle.warehouse}
      AND p.status = 'active'
    GROUP BY ir.product_id
  `);

  const rows = inventoryRecords.rows as {
    product_id: string;
    total_records: number;
    latest_date: string;
    total_physical: number;
    avg_balance: number;
  }[];

  let synced = 0;
  let added = 0;
  let skipped = 0;

  for (const row of rows) {
    // Buscar si el producto ya está en el ciclo
    const [existingCp] = await db.select({ id: inventoryCycleProductsTable.id })
      .from(inventoryCycleProductsTable)
      .where(and(
        eq(inventoryCycleProductsTable.cycleId, id as string),
        eq(inventoryCycleProductsTable.productId, row.product_id)
      ))
      .limit(1);

    const physicalCount = row.total_physical;
    const balance = row.avg_balance;
    const diff = physicalCount - balance;

    if (existingCp) {
      // Actualizar el producto existente
      await db.update(inventoryCycleProductsTable)
        .set({
          status: "counted",
          physicalCount,
          finalQuantity: physicalCount,
          difference: diff,
          countedDate: row.latest_date,
          updatedAt: new Date(),
        } as any)
        .where(eq(inventoryCycleProductsTable.id, existingCp.id));
      synced++;
    } else if (row.total_records > 0) {
      // Agregar el producto al ciclo (no estaba registrado)
      const id_gen = generateId();
      await db.insert(inventoryCycleProductsTable).values({
        id: id_gen,
        cycleId: id as string,
        productId: row.product_id,
        status: "counted",
        physicalCount,
        finalQuantity: physicalCount,
        difference: diff,
        countedDate: row.latest_date,
        initialQuantity: balance,
        updatedAt: new Date(),
      } as any);
      added++;
    }
  }

  // Recalcular contadores del ciclo
  const totalProducts = await db.select({ total: count() })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, id as string));

  const statusCounts = await db.select({
    status: inventoryCycleProductsTable.status,
    count: count(),
  })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, id as string))
    .groupBy(inventoryCycleProductsTable.status);

  let counted = 0;
  let withoutMovement = 0;
  for (const s of statusCounts) {
    if (s.status === "counted" || s.status === "verified") counted += Number(s.count);
    if (s.status === "without_movement") withoutMovement += Number(s.count);
  }

  await db.update(inventoryCyclesTable)
    .set({
      totalProducts: Number(totalProducts[0]?.total ?? 0),
      countedProducts: counted,
      withoutMovement,
      updatedAt: new Date(),
    })
    .where(eq(inventoryCyclesTable.id, id as string));

  void writeAuditLog({
    userId: req.userId,
    action: "sync",
    resource: "inventory_cycle",
    resourceId: id as string,
    details: { synced, added, skipped },
    ipAddress: req.ip,
  });

  res.json({
    message: `Sincronización completada: ${synced} actualizados, ${added} agregados, ${skipped} saltados`,
    synced,
    added,
    skipped,
    totalProducts: Number(totalProducts[0]?.total ?? 0),
    countedProducts: counted,
    withoutMovement,
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

  // ── Get critical differences (top 10) ──
  const criticalProducts = await db.select({
    cp: inventoryCycleProductsTable,
    product: productsTable,
  })
    .from(inventoryCycleProductsTable)
    .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.status, "counted"),
      sql`ABS(${inventoryCycleProductsTable.difference}) >= 0.01`
    ))
    .orderBy(sql`ABS(${inventoryCycleProductsTable.difference}) DESC`)
    .limit(10);

  const criticalDifferences = criticalProducts.map(r => ({
    code: r.product.code,
    productName: r.product.name,
    unit: r.product.unit,
    initialQuantity: r.cp.initialQuantity,
    physicalCount: r.cp.physicalCount,
    difference: r.cp.difference,
  }));

  void writeAuditLog({
    userId: req.userId,
    action: "close",
    resource: "inventory_cycle",
    resourceId: id as string,
    details: { pending: counters.pending, counted: counters.counted, withoutMovement: counters.withoutMovement, criticalCount: criticalDifferences.length },
    ipAddress: req.ip,
  });

  res.json({
    ...updated,
    pendingProducts: counters.pending,
    criticalDifferences,
  });
}));

// ── History ─────────────────────────────────────────────────────────────────

router.get("/history", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

  const conditions = [eq(inventoryCyclesTable.status, "closed")];
  if (warehouse && warehouse !== "all") {
    conditions.push(eq(inventoryCyclesTable.warehouse, warehouse));
  }

  const [{ total }] = await db.select({ total: count() })
    .from(inventoryCyclesTable)
    .where(and(...conditions));

  const cycles = await db.select({
    id: inventoryCyclesTable.id,
    warehouse: inventoryCyclesTable.warehouse,
    name: inventoryCyclesTable.name,
    description: inventoryCyclesTable.description,
    startDate: inventoryCyclesTable.startDate,
    endDate: inventoryCyclesTable.endDate,
    totalProducts: inventoryCyclesTable.totalProducts,
    countedProducts: inventoryCyclesTable.countedProducts,
    withoutMovement: inventoryCyclesTable.withoutMovement,
    closedAt: inventoryCyclesTable.closedAt,
    createdAt: inventoryCyclesTable.createdAt,
    closedByName: usersTable.name,
  })
    .from(inventoryCyclesTable)
    .leftJoin(usersTable, eq(inventoryCyclesTable.closedBy, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(inventoryCyclesTable.closedAt))
    .limit(limit)
    .offset(offset);

  // Calcular pending para cada ciclo
  const data = cycles.map(c => ({
    ...c,
    pending: Math.max(0, c.totalProducts - c.countedProducts - c.withoutMovement),
  }));

  res.json({ data, total, page, limit });
}));

// ── Summary ─────────────────────────────────────────────────────────────────

router.get("/:id/summary", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [cycle] = await db.select().from(inventoryCyclesTable)
    .where(eq(inventoryCyclesTable.id, id as string))
    .limit(1);

  if (!cycle) { res.status(404).json({ error: "Ciclo no encontrado" }); return; }

  // ── Stats ──
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

  // ── Difference analysis ──
  const productsWithCount = await db.select({
    cp: inventoryCycleProductsTable,
    product: productsTable,
  })
    .from(inventoryCycleProductsTable)
    .innerJoin(productsTable, eq(inventoryCycleProductsTable.productId, productsTable.id))
    .where(and(
      eq(inventoryCycleProductsTable.cycleId, id as string),
      eq(inventoryCycleProductsTable.status, "counted"),
    ));

  let exactMatch = 0;
  let surplus = 0;
  let shortage = 0;

  for (const r of productsWithCount) {
    const diff = r.cp.difference;
    if (diff === null || Math.abs(diff) < 0.01) exactMatch++;
    else if (diff > 0) surplus++;
    else shortage++;
  }

  // Top 10 largest absolute differences
  const largestDiff = [...productsWithCount]
    .filter(r => r.cp.difference !== null)
    .sort((a, b) => Math.abs(b.cp.difference ?? 0) - Math.abs(a.cp.difference ?? 0))
    .slice(0, 10)
    .map(r => ({
      code: r.product.code,
      productName: r.product.name,
      unit: r.product.unit,
      initialQuantity: r.cp.initialQuantity,
      physicalCount: r.cp.physicalCount,
      difference: r.cp.difference,
    }));

  const notCounted = stats.total - stats.counted - stats.verified - stats.withoutMovement - stats.skipped;

  // ── Sessions (group inventory_records by date) ──
  const cycleProductIds = await db.select({ productId: inventoryCycleProductsTable.productId })
    .from(inventoryCycleProductsTable)
    .where(eq(inventoryCycleProductsTable.cycleId, id as string));

  if (cycleProductIds.length === 0) {
    res.json({
      cycle,
      stats,
      differences: {
        exactMatch, surplus, shortage,
        notCounted,
        largestDifferences: largestDiff,
      },
      sessions: [],
    });
    return;
  }

  const pidList = cycleProductIds.map(r => r.productId);

  const sessionRows = await db.execute(sql`
    SELECT
      ir.record_date,
      COUNT(DISTINCT ir.product_id) AS product_count,
      COUNT(*)::int AS record_count
    FROM inventory_records ir
    WHERE ir.product_id IN (${sql.join(pidList.map(id => sql`${id}`), sql`, `)})    GROUP BY ir.record_date
    ORDER BY ir.record_date DESC
  `);

  const sessions = (sessionRows.rows as {
    record_date: string;
    product_count: number;
    record_count: number;
  }[]).map(r => ({
    date: r.record_date,
    productCount: Number(r.product_count),
    recordCount: r.record_count,
  }));

  res.json({
    cycle,
    stats,
    differences: {
      exactMatch, surplus, shortage,
      notCounted,
      largestDifferences: largestDiff,
    },
    sessions,
  });
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
