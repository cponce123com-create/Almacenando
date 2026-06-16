import { Router } from "express";
import { eq, and, gte, sql, inArray, isNotNull, desc, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  balanceRecordsTable,
  productsTable,
  locationsTable,
  immobilizedProductsTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { logger } from "../lib/logger.js";

/**
 * Reorganización / Reubicación
 * Reorganización y reubicación de productos
 */

const router = Router();

/**
 * @route POST /reorganization/suggest-reorganization
 * @description Ejecuta el algoritmo de rotación y sugiere reorganización.
 */
router.post(
  "/suggest-reorganization",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const { warehouse } = req.body as { warehouse?: string };

    // ── 1. Get last 30 days consumption ──────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const consumptionConditions = [
      eq(balanceRecordsTable.type, "output"),
      gte(balanceRecordsTable.balanceDate, thirtyDaysAgo.toISOString().slice(0, 10)),
    ];
    if (warehouse) consumptionConditions.push(eq(balanceRecordsTable.warehouse, warehouse));

    const consumptionRows = await db
      .select({
        code: balanceRecordsTable.code,
        totalOutput: sql<number>`COALESCE(SUM(${balanceRecordsTable.quantity}), 0)`,
      })
      .from(balanceRecordsTable)
      .where(and(...consumptionConditions))
      .groupBy(balanceRecordsTable.code);

    const consumptionMap = new Map<string, number>();
    for (const row of consumptionRows) {
      consumptionMap.set(row.code, row.totalOutput);
    }

    // ── 2. Get non-immobilized products with stock and location ──────────
    const productConditions = [eq(productsTable.status, "active")];
    if (warehouse) productConditions.push(eq(productsTable.warehouse, warehouse));

    // Get immobilized product IDs to exclude
    const immobilizedRows = await db
      .select({ productId: immobilizedProductsTable.productId })
      .from(immobilizedProductsTable)
      .where(eq(immobilizedProductsTable.status, "immobilized"));

    const immobilizedProductIds = new Set(immobilizedRows.map((r) => r.productId));

    const products = await db
      .select({
        id: productsTable.id,
        code: productsTable.code,
        name: productsTable.name,
        stock: productsTable.stock,
        warehouse: productsTable.warehouse,
        locationId: productsTable.locationId,
      })
      .from(productsTable)
      .where(and(...productConditions));

    const nonImmobilized = products.filter((p) => !immobilizedProductIds.has(p.id));

    // ── 3. Load location data for products ───────────────────────────────
    const locationIds = nonImmobilized
      .map((p) => p.locationId)
      .filter((id): id is string => id != null);

    const locationMap = new Map<string, typeof locationsTable.$inferSelect>();
    if (locationIds.length > 0) {
      const uniqueIds = [...new Set(locationIds)];
      const locationRows = await db
        .select()
        .from(locationsTable)
        .where(inArray(locationsTable.id, uniqueIds));
      for (const loc of locationRows) {
        locationMap.set(loc.id, loc);
      }
    }

    // ── 3. Calculate rotation index ──────────────────────────────────────
    const rotationData = nonImmobilized.map((p) => {
      const consumption = consumptionMap.get(p.code) ?? 0;
      const stock = p.stock ?? 0;
      const rotationIndex = stock > 0 ? consumption / stock : 0;
      const loc = p.locationId ? locationMap.get(p.locationId) : undefined;
      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        stock,
        consumption,
        rotationIndex,
        currentLocation: loc
          ? `${loc.warehouse} / ${loc.zone ?? ""} / ${loc.rack ?? ""} / ${loc.shelf ?? ""} / ${loc.position ?? ""}`
          : null,
        locationId: p.locationId,
        warehouse: p.warehouse,
      };
    });

    // Sort by rotation index descending
    rotationData.sort((a, b) => b.rotationIndex - a.rotationIndex);

    // ── 4. Top 20% highest rotation ──────────────────────────────────────
    const top20Count = Math.max(1, Math.ceil(rotationData.length * 0.2));
    const topRotation = rotationData.slice(0, top20Count);

    // ── 5. Get locations near scale ──────────────────────────────────────
    const nearScaleConditions = [eq(locationsTable.isNearScale, true)];
    if (warehouse) nearScaleConditions.push(eq(locationsTable.warehouse, warehouse));

    const nearScaleLocations = await db
      .select()
      .from(locationsTable)
      .where(and(...nearScaleConditions))
      .orderBy(asc(locationsTable.warehouse), asc(locationsTable.zone), asc(locationsTable.rack));

    // ── 6. Get immobilized products suggestions ──────────────────────────
    const immobilizedProducts = await db
      .select({
        id: immobilizedProductsTable.id,
        productId: immobilizedProductsTable.productId,
        quantity: immobilizedProductsTable.quantity,
        reason: immobilizedProductsTable.reason,
        status: immobilizedProductsTable.status,
        productCode: productsTable.code,
        productName: productsTable.name,
      })
      .from(immobilizedProductsTable)
      .innerJoin(productsTable, eq(immobilizedProductsTable.productId, productsTable.id))
      .where(eq(immobilizedProductsTable.status, "immobilized"))
      .orderBy(desc(immobilizedProductsTable.immobilizedDate));

    // ── 7. Build suggestions ─────────────────────────────────────────────
    // Suggest moving high-rotation products to near-scale locations
    const suggestions: Array<{
      productId: string;
      productCode: string;
      productName: string;
      currentLocation: string | null;
      suggestedLocation: string | null;
      reason: string;
      rotationIndex: number;
    }> = [];

    const usedNearScaleIds = new Set<string>();

    for (const product of topRotation) {
      const available = nearScaleLocations.find((l) => !usedNearScaleIds.has(l.id));
      if (!available) break;

      const suggestedLoc = `${available.warehouse} / ${available.zone ?? ""} / ${available.rack ?? ""} / ${available.shelf ?? ""} / ${available.position ?? ""}`;

      suggestions.push({
        productId: product.productId,
        productCode: product.productCode,
        productName: product.productName,
        currentLocation: product.currentLocation,
        suggestedLocation: suggestedLoc,
        reason: `Alta rotacion (indice: ${product.rotationIndex.toFixed(2)}). Mover cerca de la bascula para agilizar despachos.`,
        rotationIndex: product.rotationIndex,
      });

      usedNearScaleIds.add(available.id);
    }

    // Suggest removing immobilized products from regular locations
    const immobilizedSuggestions = immobilizedProducts.map((p) => ({
      productId: p.productId,
      productCode: p.productCode,
      productName: p.productName,
      reason: p.reason,
      suggestion: "Retirar de ubicacion regular y trasladar a zona de inmovilizados.",
    }));

    void writeAuditLog({
      userId: authedReq.userId,
      action: "view",
      resource: "reorganization",
      details: {
        productsAnalyzed: rotationData.length,
        top20Count,
        suggestionsCount: suggestions.length,
        immobilizedCount: immobilizedProducts.length,
      },
      ipAddress: req.ip,
    });

    logger.info(
      { productsAnalyzed: rotationData.length, suggestionsCount: suggestions.length },
      "Reorganization suggestion generated",
    );

    res.json({
      suggestions,
      immobilizedSuggestions,
      summary: {
        productsAnalyzed: rotationData.length,
        highRotationProducts: topRotation.length,
        nearScaleLocationsAvailable: nearScaleLocations.length,
        immobilizedProductsCount: immobilizedProducts.length,
      },
    });
  }),
);

export default router;
