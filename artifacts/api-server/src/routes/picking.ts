import { Router } from "express";
import { eq, desc, asc, and, count, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  pickOrdersTable,
  pickItemsTable,
  productsTable,
  locationsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { generateId } from "../lib/id.js";
import { writeAuditLog } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { parsePagination } from "../lib/pagination.js";
import { z } from "zod/v4";

const router = Router();

// ── Schemas ──────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "El ID del producto es requerido"),
        quantity: z.number().int().min(1, "La cantidad debe ser al menos 1"),
      }),
    )
    .min(1, "Debe incluir al menos un producto"),
});

const scanSchema = z.object({
  barcode: z.string().min(1, "El código de barras es requerido"),
});

// ── List Orders ──────────────────────────────────────────────────────────────

/**
 * @route GET /picking/orders
 * @description Lista órdenes de picking con el nombre del creador.
 */
router.get(
  "/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

    const [countResult, orders] = await Promise.all([
      db.select({ total: count() }).from(pickOrdersTable),
      db
        .select({
          id: pickOrdersTable.id,
          createdBy: pickOrdersTable.createdBy,
          status: pickOrdersTable.status,
          notes: pickOrdersTable.notes,
          createdAt: pickOrdersTable.createdAt,
          completedAt: pickOrdersTable.completedAt,
          createdByName: usersTable.name,
        })
        .from(pickOrdersTable)
        .leftJoin(usersTable, eq(pickOrdersTable.createdBy, usersTable.id))
        .orderBy(desc(pickOrdersTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    res.json({ data: orders, total: countResult[0]?.total ?? 0, page, limit });
  }),
);

// ── Create Order ─────────────────────────────────────────────────────────────

/**
 * @route POST /picking/orders
 * @description Crea una orden de picking con sus ítems ordenados por ubicación.
 */
router.post(
  "/orders",
  requireAuth,
  requireRole("admin", "supervisor", "operator"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const { items, notes } = parsed.data;
    const orderId = generateId();

    // Fetch products with their location data for sorting
    const productIds = items.map((i) => i.productId);
    const productRows = await db
      .select({
        id: productsTable.id,
        locationId: productsTable.locationId,
        code: productsTable.code,
        name: productsTable.name,
      })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    const productMap = new Map(productRows.map((p) => [p.id, p]));

    // Fetch location data for sorting
    const locationIds = productRows
      .map((p) => p.locationId)
      .filter((id): id is string => id != null);
    const locationRows =
      locationIds.length > 0
        ? await db
            .select()
            .from(locationsTable)
            .where(inArray(locationsTable.id, locationIds))
        : [];

    const locationMap = new Map(locationRows.map((l) => [l.id, l]));

    // Build enriched items and sort by rack asc
    const enrichedItems = items.map((item) => {
      const product = productMap.get(item.productId);
      const loc = product?.locationId ? locationMap.get(product.locationId) : undefined;
      return {
        ...item,
        productCode: product?.code ?? null,
        productName: product?.name ?? null,
        locationId: product?.locationId ?? null,
        rack: loc?.rack ?? null,
        shelf: loc?.shelf ?? null,
        position: loc?.position ?? null,
      };
    });

    enrichedItems.sort((a, b) => {
      if (!a.rack && !b.rack) return 0;
      if (!a.rack) return 1;
      if (!b.rack) return -1;
      return a.rack.localeCompare(b.rack, undefined, { numeric: true });
    });

    // Validate all products exist
    const missing = enrichedItems.filter((i) => !productMap.has(i.productId));
    if (missing.length > 0) {
      res.status(400).json({
        error: `Productos no encontrados: ${missing.map((m) => m.productId).join(", ")}`,
      });
      return;
    }

    let order: typeof pickOrdersTable.$inferSelect | undefined;
    let createdItems: (typeof pickItemsTable.$inferSelect)[] = [];

    await db.transaction(async (tx) => {
      [order] = await tx
        .insert(pickOrdersTable)
        .values({
          id: orderId,
          createdBy: authedReq.userId,
          notes: notes ?? null,
        })
        .returning();

      if (!order) throw new Error("Error al crear la orden de picking");

      // FIX: Bulk insert ALL items in ONE query instead of N individual inserts.
      // Before: for (const item of enrichedItems) { await tx.insert(...) }
      // After:  single tx.insert with an array of values.
      const itemValues = enrichedItems.map((item) => ({
        id: generateId(),
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        locationId: item.locationId,
      }));

      await tx.insert(pickItemsTable).values(itemValues);

      createdItems = await tx
        .select()
        .from(pickItemsTable)
        .where(eq(pickItemsTable.orderId, orderId))
        .orderBy(pickItemsTable.locationId);
    });

    void writeAuditLog({
      userId: authedReq.userId,
      action: "create",
      resource: "pick_orders",
      resourceId: orderId,
      details: { itemsCount: items.length },
      ipAddress: req.ip,
    });

    logger.info({ orderId, itemsCount: items.length }, "Pick order created");

    res.status(201).json({ order, items: createdItems });
  }),
);

// ── Get Order ────────────────────────────────────────────────────────────────

/**
 * @route GET /picking/orders/:id
 * @description Obtiene una orden de picking con sus ítems ordenados por ubicación.
 */
router.get(
  "/orders/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [order] = await db
      .select({
        id: pickOrdersTable.id,
        createdBy: pickOrdersTable.createdBy,
        status: pickOrdersTable.status,
        notes: pickOrdersTable.notes,
        createdAt: pickOrdersTable.createdAt,
        completedAt: pickOrdersTable.completedAt,
        createdByName: usersTable.name,
      })
      .from(pickOrdersTable)
      .leftJoin(usersTable, eq(pickOrdersTable.createdBy, usersTable.id))
      .where(eq(pickOrdersTable.id, id as string))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Orden de picking no encontrada" });
      return;
    }

    const items = await db
      .select({
        id: pickItemsTable.id,
        orderId: pickItemsTable.orderId,
        productId: pickItemsTable.productId,
        quantity: pickItemsTable.quantity,
        pickedQuantity: pickItemsTable.pickedQuantity,
        locationId: pickItemsTable.locationId,
        pickedAt: pickItemsTable.pickedAt,
        productCode: productsTable.code,
        productName: productsTable.name,
        barcode: productsTable.barcode,
        warehouse: locationsTable.warehouse,
        zone: locationsTable.zone,
        rack: locationsTable.rack,
        shelf: locationsTable.shelf,
        position: locationsTable.position,
      })
      .from(pickItemsTable)
      .innerJoin(productsTable, eq(pickItemsTable.productId, productsTable.id))
      .leftJoin(locationsTable, eq(pickItemsTable.locationId, locationsTable.id))
      .where(eq(pickItemsTable.orderId, id as string))
      .orderBy(asc(locationsTable.rack), asc(locationsTable.shelf), asc(locationsTable.position));

    res.json({ order, items });
  }),
);

// ── Get Order Items ──────────────────────────────────────────────────────────

/**
 * @route GET /picking/orders/:id/items
 * @description Obtiene los ítems de una orden de picking ordenados por ubicación.
 */
router.get(
  "/orders/:id/items",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const items = await db
      .select({
        id: pickItemsTable.id,
        orderId: pickItemsTable.orderId,
        productId: pickItemsTable.productId,
        quantity: pickItemsTable.quantity,
        pickedQuantity: pickItemsTable.pickedQuantity,
        locationId: pickItemsTable.locationId,
        pickedAt: pickItemsTable.pickedAt,
        productCode: productsTable.code,
        productName: productsTable.name,
        barcode: productsTable.barcode,
        warehouse: locationsTable.warehouse,
        zone: locationsTable.zone,
        rack: locationsTable.rack,
        shelf: locationsTable.shelf,
        position: locationsTable.position,
      })
      .from(pickItemsTable)
      .innerJoin(productsTable, eq(pickItemsTable.productId, productsTable.id))
      .leftJoin(locationsTable, eq(pickItemsTable.locationId, locationsTable.id))
      .where(eq(pickItemsTable.orderId, id as string))
      .orderBy(asc(locationsTable.rack), asc(locationsTable.shelf), asc(locationsTable.position));

    res.json(items);
  }),
);

// ── Scan Item ────────────────────────────────────────────────────────────────

/**
 * @route PUT /picking/items/:id/scan
 * @description Marca un ítem como picking completado validando el código de barras.
 */
router.put(
  "/items/:id/scan",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const { barcode } = parsed.data;

    // Find the pick item
    const [pickItem] = await db
      .select()
      .from(pickItemsTable)
      .where(eq(pickItemsTable.id, id as string))
      .limit(1);

    if (!pickItem) {
      res.status(404).json({ error: "Ítem de picking no encontrado" });
      return;
    }

    // Find the product and validate barcode
    const [product] = await db
      .select({ id: productsTable.id, barcode: productsTable.barcode, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.id, pickItem.productId))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Producto asociado no encontrado" });
      return;
    }

    if (product.barcode !== barcode) {
      res.status(400).json({ error: "El código de barras no coincide con el producto esperado" });
      return;
    }

    // Mark item as fully picked
    const now = new Date();
    const [updatedItem] = await db
      .update(pickItemsTable)
      .set({
        pickedQuantity: pickItem.quantity,
        pickedAt: now,
      })
      .where(eq(pickItemsTable.id, id as string))
      .returning();

    if (!updatedItem) {
      res.status(500).json({ error: "Error al actualizar el ítem" });
      return;
    }

    const authedReq = req as AuthenticatedRequest;

    void writeAuditLog({
      userId: authedReq.userId,
      action: "update",
      resource: "pick_items",
      resourceId: id,
      details: { orderId: pickItem.orderId, productName: product.name, barcode, action: "item_picked" },
      ipAddress: req.ip,
    });

    // Check if all items in the order are now picked
    const [pendingCount] = await db
      .select({ total: count() })
      .from(pickItemsTable)
      .where(
        and(
          eq(pickItemsTable.orderId, pickItem.orderId),
          eq(pickItemsTable.pickedQuantity, 0),
        ),
      );

    let orderStatus: string | undefined;

    if ((pendingCount?.total ?? 0) === 0) {
      const [updatedOrder] = await db
        .update(pickOrdersTable)
        .set({ status: "completed", completedAt: now })
        .where(eq(pickOrdersTable.id, pickItem.orderId))
        .returning();

      if (updatedOrder) {
        orderStatus = updatedOrder.status;
        logger.info({ orderId: pickItem.orderId }, "Pick order completed");
      }
    }

    res.json({
      item: updatedItem,
      orderCompleted: orderStatus === "completed",
      ...(orderStatus ? { orderStatus } : {}),
    });
  }),
);

export default router;
