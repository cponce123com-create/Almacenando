import { Router } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, locationsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { z } from "zod/v4";

/**
 * Código de Barras
 * Búsqueda de productos por código de barras
 */

const router = Router();

const generateSchema = z.object({
  productId: z.string().min(1, "El ID del producto es requerido"),
});

/**
 * @route GET /barcode/by-barcode/:barcode
 * @description Busca un producto por su código de barras, incluyendo datos de ubicación.
 */
router.get(
  "/by-barcode/:barcode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { barcode } = req.params;

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.barcode, barcode as string))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Producto no encontrado para este código de barras" });
      return;
    }

    let location = null;
    if (product.locationId) {
      const [loc] = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.id, product.locationId))
        .limit(1);
      location = loc ?? null;
    }

    res.json({ product, location });
  }),
);

/**
 * @route POST /barcode/generate
 * @description Genera un código de barras único para un producto (admin/supervisor).
 */
router.post(
  "/generate",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const { productId } = parsed.data;

    const [product] = await db
      .select({ id: productsTable.id, name: productsTable.name, barcode: productsTable.barcode })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    if (product.barcode) {
      res.status(409).json({ error: "El producto ya tiene un código de barras", barcode: product.barcode });
      return;
    }

    const barcode = `BRC-${randomBytes(8).toString("hex").toUpperCase()}`;

    const [updated] = await db
      .update(productsTable)
      .set({ barcode, updatedAt: new Date() })
      .where(eq(productsTable.id, productId))
      .returning({ id: productsTable.id, name: productsTable.name, barcode: productsTable.barcode });

    if (!updated) {
      res.status(500).json({ error: "Error al asignar el código de barras" });
      return;
    }

    logger.info({ productId, barcode }, "Barcode generated");

    void writeAuditLog({
      userId: authedReq.userId,
      action: "update",
      resource: "products",
      resourceId: productId,
      details: { barcode, action: "barcode_generated" },
      ipAddress: req.ip,
    });

    res.status(201).json(updated);
  }),
);

export default router;
