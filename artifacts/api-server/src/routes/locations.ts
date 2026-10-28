import { Router } from "express";
import { and, eq, like, count, isNotNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { locationsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { generateId } from "../lib/id.js";
import { writeAuditLog } from "../lib/audit.js";
import { parsePagination } from "../lib/pagination.js";
import { z } from "zod/v4";

/**
 * Ubicaciones Físicas del Almacén
 * CRUD de ubicaciones físicas del almacén
 */

const router = Router();

const locationSchema = z.object({
  warehouse: z.string().min(1, "Almacén es requerido"),
  zone: z.string().optional(),
  rack: z.string().optional(),
  shelf: z.string().optional(),
  position: z.string().optional(),
  barcode: z.string().optional(),
  type: z.enum(["warehouse", "zone", "rack", "shelf", "position", "pallet"]).default("rack"),
  parentLocationId: z.string().optional(),
  isActive: z.boolean().default(true),
  isNearScale: z.boolean().default(false),
  mapSection: z.enum(["colorantes", "auxiliares", "reference"]).optional(),
  mapLabel: z.string().trim().max(120).optional(),
  mapX: z.number().min(0).max(100).optional(),
  mapY: z.number().min(0).max(100).optional(),
  mapWidth: z.number().min(5).max(100).optional(),
  mapHeight: z.number().min(5).max(100).optional(),
});

const mapLayoutSchema = z.object({
  mapX: z.number().min(0).max(95),
  mapY: z.number().min(0).max(95),
  mapWidth: z.number().min(5).max(100),
  mapHeight: z.number().min(5).max(100),
});

/**
 * @route GET /locations
 * @description Lista ubicaciones con filtros opcionales (warehouse, zone, rack) paginado.
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const { warehouse, zone, rack } = req.query as Record<string, string | undefined>;

    const conditions = [];

    if (warehouse) conditions.push(eq(locationsTable.warehouse, warehouse));
    if (zone) conditions.push(eq(locationsTable.zone, zone));
    if (rack) conditions.push(eq(locationsTable.rack, rack));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, data] = await Promise.all([
      db.select({ total: count() }).from(locationsTable).where(where),
      db
        .select()
        .from(locationsTable)
        .where(where)
        .orderBy(
          locationsTable.warehouse,
          locationsTable.zone,
          sql`CASE ${locationsTable.type} WHEN 'zone' THEN 0 WHEN 'rack' THEN 1 WHEN 'shelf' THEN 2 ELSE 3 END`,
          locationsTable.rack,
          locationsTable.shelf,
          locationsTable.position,
        )
        .limit(limit)
        .offset(offset),
    ]);

    res.json({ data, total: countResult[0]?.total ?? 0, page, limit });
  }),
);

/**
 * @route POST /locations
 * @description Crea una nueva ubicación (admin/supervisor).
 */
router.post(
  "/",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const id = generateId();
    const [created] = await db
      .insert(locationsTable)
      .values({ id, ...parsed.data })
      .returning();

    void writeAuditLog({
      userId: authedReq.userId,
      action: "create",
      resource: "locations",
      resourceId: id,
      details: { warehouse: parsed.data.warehouse, rack: parsed.data.rack ?? null },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  }),
);

router.patch(
  "/:id/map-layout",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const parsed = mapLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Tamaño o posición inválidos." });
      return;
    }
    const layout = parsed.data;
    if (layout.mapX + layout.mapWidth > 100 || layout.mapY + layout.mapHeight > 100) {
      res.status(400).json({ error: "La zona debe quedar dentro del plano." });
      return;
    }
    const [updated] = await db.update(locationsTable).set(layout)
      .where(eq(locationsTable.id, req.params.id as string)).returning();
    if (!updated) {
      res.status(404).json({ error: "No se encontró la zona del mapa." });
      return;
    }
    res.json(updated);
  }),
);

router.delete(
  "/:id/map-layout",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, id)).limit(1);
    if (!location || !location.mapSection || !["zone", "rack"].includes(location.type) || location.zone === "REFERENCIAS") {
      res.status(404).json({ error: "No se encontró una zona o rack editable en el plano." });
      return;
    }

    // Retira el bloque del mapa, pero conserva la ubicación física y sus vínculos.
    const [updated] = await db.update(locationsTable).set({
      mapSection: null,
      mapLabel: null,
      mapX: null,
      mapY: null,
      mapWidth: null,
      mapHeight: null,
    }).where(eq(locationsTable.id, id)).returning();

    void writeAuditLog({
      userId: (req as AuthenticatedRequest).userId,
      action: "update",
      resource: "locations-map",
      resourceId: id,
      details: { operation: "remove_from_map", label: location.mapLabel ?? location.rack ?? location.zone },
      ipAddress: req.ip,
    });

    res.json(updated);
  }),
);

/**
 * @route GET /locations/racks
 * @description Lista racks distintos (para mapa de almacén).
 */
router.get(
  "/racks",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { warehouse } = req.query as Record<string, string | undefined>;
    const conditions = [isNotNull(locationsTable.rack)];

    if (warehouse) conditions.push(eq(locationsTable.warehouse, warehouse));

    const rows = await db
      .select({
        warehouse: locationsTable.warehouse,
        zone: locationsTable.zone,
        rack: locationsTable.rack,
      })
      .from(locationsTable)
      .where(and(...conditions))
      .orderBy(locationsTable.warehouse, locationsTable.zone, locationsTable.rack);

    // Deduplicate by (warehouse, zone, rack)
    const seen = new Set<string>();
    const distinct: typeof rows = [];
    for (const row of rows) {
      const key = `${row.warehouse}|${row.zone ?? ""}|${row.rack ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        distinct.push(row);
      }
    }

    res.json(distinct);
  }),
);

/**
 * @route GET /locations/near-scale
 * @description Lista ubicaciones cercanas a la báscula (is_near_scale = true).
 */
router.get(
  "/near-scale",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const data = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.isNearScale, true))
      .orderBy(locationsTable.warehouse, locationsTable.zone, locationsTable.rack);

    res.json(data);
  }),
);

export default router;
