/**
 * Búsqueda Global
 * Endpoint unificado que busca en múltiples tablas del sistema.
 * GET /api/v1/search?q=term
 */

import { Router } from "express";
import { db, productsTable, locationsTable, suppliesTable, samplesTable, personnelTable, dyeLotsTable } from "@workspace/db";
import { or, ilike, sql, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

const SEARCH_LIMIT_PER_CATEGORY = 5;
const TOTAL_LIMIT = 20;

/**
 * GET /api/v1/search?q=termino
 *
 * Busca en productos, ubicaciones, insumos, muestras, personal y lotes.
 * Resultados agrupados por categoría con link al módulo correspondiente.
 */
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const q = (req.query.q as string ?? "").trim();
  if (!q || q.length < 2) {
    res.json({ query: q, results: [] });
    return;
  }

  const term = `%${q}%`;

  const [products, locations, supplies, samples, personnel, lots] = await Promise.all([
    // ── Products ──────────────────────────────────────────────────────────
    db
      .select({
        id: productsTable.id,
        label: sql<string>`${productsTable.code} || ' — ' || ${productsTable.name}`,
        subtitle: productsTable.supplier,
        category: sql<string>`'producto'`,
        link: sql<string>`'/products?id=' || ${productsTable.id}`,
      })
      .from(productsTable)
      .where(
        or(
          ilike(productsTable.code, term),
          ilike(productsTable.name, term),
          ilike(productsTable.supplier, term),
          ilike(productsTable.casNumber, term),
        ),
      )
      .limit(SEARCH_LIMIT_PER_CATEGORY),

    // ── Locations ─────────────────────────────────────────────────────────
    db
      .select({
        id: locationsTable.id,
        label: sql<string>`${locationsTable.warehouse} || ' / ' || COALESCE(${locationsTable.zone}, '') || ' / ' || COALESCE(${locationsTable.rack}, '') || ' / ' || COALESCE(${locationsTable.shelf}, '')`,
        subtitle: locationsTable.barcode,
        category: sql<string>`'ubicación'`,
        link: sql<string>`'/locations?id=' || ${locationsTable.id}`,
      })
      .from(locationsTable)
      .where(
        or(
          ilike(locationsTable.warehouse, term),
          ilike(locationsTable.zone, term),
          ilike(locationsTable.rack, term),
          ilike(locationsTable.shelf, term),
          ilike(locationsTable.barcode, term),
        ),
      )
      .limit(SEARCH_LIMIT_PER_CATEGORY),

    // ── Supplies ──────────────────────────────────────────────────────────
    db
      .select({
        id: suppliesTable.id,
        label: sql<string>`${suppliesTable.code} || ' — ' || ${suppliesTable.description}`,
        subtitle: suppliesTable.unit,
        category: sql<string>`'insumo'`,
        link: sql<string>`'/supplies?id=' || ${suppliesTable.id}`,
      })
      .from(suppliesTable)
      .where(
        or(
          ilike(suppliesTable.code, term),
          ilike(suppliesTable.description, term),
        ),
      )
      .limit(SEARCH_LIMIT_PER_CATEGORY),

    // ── Samples ───────────────────────────────────────────────────────────
    db
      .select({
        id: samplesTable.id,
        label: sql<string>`${samplesTable.sampleCode} || ' — ' || COALESCE(${samplesTable.productName}, '')`,
        subtitle: samplesTable.purpose,
        category: sql<string>`'muestra'`,
        link: sql<string>`'/samples?id=' || ${samplesTable.id}`,
      })
      .from(samplesTable)
      .where(
        or(
          ilike(samplesTable.sampleCode, term),
          ilike(samplesTable.productName, term),
        ),
      )
      .limit(SEARCH_LIMIT_PER_CATEGORY),

    // ── Personnel ─────────────────────────────────────────────────────────
    db
      .select({
        id: personnelTable.id,
        label: personnelTable.name,
        subtitle: personnelTable.position,
        category: sql<string>`'personal'`,
        link: sql<string>`'/personnel?id=' || ${personnelTable.id}`,
      })
      .from(personnelTable)
      .where(
        or(
          ilike(personnelTable.name, term),
          ilike(personnelTable.position, term),
        ),
      )
      .limit(SEARCH_LIMIT_PER_CATEGORY),

    // ── Dye lots ──────────────────────────────────────────────────────────
    db
      .select({
        id: dyeLotsTable.id,
        label: dyeLotsTable.lotNumber,
        subtitle: dyeLotsTable.qualityStatus,
        category: sql<string>`'lote'`,
        link: sql<string>`'/dye-lots?id=' || ${dyeLotsTable.id}`,
      })
      .from(dyeLotsTable)
      .where(ilike(dyeLotsTable.lotNumber, term))
      .limit(SEARCH_LIMIT_PER_CATEGORY),
  ]);

  // Armar respuesta agrupada (solo categorías con resultados)
  const results: Array<{
    category: string;
    label: string;
    items: Array<{ id: string; label: string; subtitle: string | null; link: string }>;
  }> = [];

  const allCategories = [
    { key: "producto", label: "Productos", data: products },
    { key: "ubicación", label: "Ubicaciones", data: locations },
    { key: "insumo", label: "Insumos", data: supplies },
    { key: "muestra", label: "Muestras", data: samples },
    { key: "personal", label: "Personal", data: personnel },
    { key: "lote", label: "Lotes", data: lots },
  ];

  for (const cat of allCategories) {
    if (cat.data.length > 0) {
      results.push({
        category: cat.key,
        label: cat.label,
        items: cat.data.map((r: any) => ({
          id: r.id,
          label: r.label,
          subtitle: r.subtitle,
          link: r.link,
        })),
      });
    }
  }

  res.json({ query: q, total: results.reduce((s, r) => s + r.items.length, 0), results });
}));

export default router;
