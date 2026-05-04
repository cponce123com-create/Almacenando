import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import {
  sendLotChangeNotificationEmail, LOT_CHANGE_RECIPIENTS,
  sendProductOutEmail, PRODUCT_OUT_TO, PRODUCT_OUT_CC,
  sendStockColoranteEmail, STOCK_COLOR_TO, STOCK_COLOR_CC,
  sendStockAuxiliarEmail, STOCK_AUX_TO, STOCK_AUX_CC,
  sendOrderApprovalEmail, ORDER_APPROVAL_TO,
  sendPlasticBagEmail, PLASTIC_BAG_TO, PLASTIC_BAG_CC,
} from "../lib/email.js";
import { z } from "zod/v4";

const router = Router();

// ── Shared Schema for Item List Templates ─────────────────────────────────────

const itemSchema = z.object({
  code: z.string(),
  name: z.string().min(1),
  quantity: z.coerce.number().min(0, "La cantidad debe ser un número positivo"),
  unit: z.string().min(1),
});

const itemListSchema = z.object({
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem"),
  notes: z.string().optional(),
});

// ── Lot Change ────────────────────────────────────────────────────────────────

const lotChangeSchema = z.object({
  productId: z.string().min(1, "El ID del producto es requerido"),
  oldLot: z.string().min(1, "El lote antiguo es requerido"),
  newLot: z.string().min(1, "El nuevo lote es requerido"),
  productionOrder: z.string().min(1, "La orden de producción es requerida"),
});

/**
 * @route POST /lot-change
 * @description Notifica un cambio de lote para un producto específico.
 * @param {string} productId - ID del producto.
 * @param {string} oldLot - Lote antiguo.
 * @param {string} newLot - Nuevo lote.
 * @param {string} productionOrder - Orden de producción.
 */
router.post(
  "/lot-change",
  requireAuth,
  requireRole("operator", "supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;

    const parsed = lotChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const { productId, oldLot, newLot, productionOrder } = parsed.data;

    try {
      const [product] = await db
        .select({ id: productsTable.id, name: productsTable.name })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);

      if (!product) {
        res.status(404).json({ error: "Producto no encontrado" });
        return;
      }

      const [sender] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, authedReq.userId))
        .limit(1);
      const senderName = sender?.name ?? authedReq.userId;

      await Promise.all([
        sendLotChangeNotificationEmail({ productName: product.name, oldLot, newLot, productionOrder, senderName }),
        writeAuditLog({
          userId: authedReq.userId,
          action: "lot_change_notification",
          resource: "products",
          resourceId: productId,
          details: { productName: product.name, oldLot, newLot, productionOrder, recipients: [...LOT_CHANGE_RECIPIENTS] },
          ipAddress: req.ip,
        }),
      ]);

      res.json({ message: "Notificación enviada correctamente", productName: product.name, recipients: LOT_CHANGE_RECIPIENTS.length });
    } catch (error) {
      console.error("Error en /lot-change:", error);
      res.status(500).json({ error: "No se pudo procesar la solicitud" });
    }
  })
);

// ── Product Out ───────────────────────────────────────────────────────────────

const productOutSchema = z.object({
  productCode: z.string(),
  productName: z.string().min(1, "El nombre del producto es requerido"),
});

/**
 * @route POST /product-out
 * @description Notifica que un producto ha salido.
 * @param {string} productCode - Código del producto.
 * @param {string} productName - Nombre del producto.
 */
router.post(
  "/product-out",
  requireAuth,
  requireRole("operator", "supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;

    const parsed = productOutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    const { productCode, productName } = parsed.data;

    try {
      await Promise.all([
        sendProductOutEmail({ productCode, productName }),
        writeAuditLog({
          userId: authedReq.userId,
          action: "email_notification",
          resource: "products",
          resourceId: productCode || productName,
          details: { template: "product_out", productCode, productName, to: PRODUCT_OUT_TO, cc: [...PRODUCT_OUT_CC] },
          ipAddress: req.ip,
        }),
      ]);

      res.json({ message: "Notificación enviada correctamente", productName, to: PRODUCT_OUT_TO, cc: PRODUCT_OUT_CC.length });
    } catch (error) {
      console.error("Error en /product-out:", error);
      res.status(500).json({ error: "No se pudo procesar la solicitud" });
    }
  })
);

// ── Stock Colorante ───────────────────────────────────────────────────────────

/**
 * @route POST /stock-colorante
 * @description Notifica sobre el stock de colorante.
 * @param {Array} items - Lista de ítems con código, nombre, cantidad y unidad.
 */
router.post(
  "/stock-colorante",
  requireAuth,
  requireRole("operator", "supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = itemListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    try {
      await Promise.all([
        sendStockColoranteEmail(parsed.data.items),
        writeAuditLog({
          userId: authedReq.userId,
          action: "email_notification",
          resource: "notifications",
          details: { template: "stock_colorante", items: parsed.data.items, to: STOCK_COLOR_TO, cc: [...STOCK_COLOR_CC] },
          ipAddress: req.ip,
        }),
      ]);

      res.json({ message: "Correo de stock de colorante enviado", to: STOCK_COLOR_TO, cc: STOCK_COLOR_CC.length });
    } catch (error) {
      console.error("Error en /stock-colorante:", error);
      res.status(500).json({ error: "No se pudo procesar la solicitud" });
    }
  })
);

// ── Stock Auxiliar ────────────────────────────────────────────────────────────

/**
 * @route POST /stock-auxiliar
 * @description Notifica sobre el stock auxiliar.
 * @param {Array} items - Lista de ítems con código, nombre, cantidad y unidad.
 */
router.post(
  "/stock-auxiliar",
  requireAuth,
  requireRole("operator", "supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = itemListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    try {
      await Promise.all([
        sendStockAuxiliarEmail(parsed.data.items),
        writeAuditLog({
          userId: authedReq.userId,
          action: "email_notification",
          resource: "notifications",
          details: { template: "stock_auxiliar", items: parsed.data.items, to: STOCK_AUX_TO, cc: [...STOCK_AUX_CC] },
          ipAddress: req.ip,
        }),
      ]);

      res.json({ message: "Correo de stock de auxiliar enviado", to: STOCK_AUX_TO, cc: STOCK_AUX_CC.length });
    } catch (error) {
      console.error("Error en /stock-auxiliar:", error);
      res.status(500).json({ error: "No se pudo procesar la solicitud" });
    }
  })
);

// ── Order Approval ────────────────────────────────────────────────────────────

/**
 * @route POST /order-approval
 * @description Solicita aprobación para una orden.
 * @param {Array} items - Lista de ítems con código, nombre, cantidad y unidad.
 * @param {string} notes - Notas adicionales.
 */
router.post(
  "/order-approval",
  requireAuth,
  requireRole("operator", "supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = itemListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    try {
      await Promise.all([
        sendOrderApprovalEmail(parsed.data.items, parsed.data.notes),
        writeAuditLog({
          userId: authedReq.userId,
          action: "email_notification",
          resource: "notifications",
          details: { template: "order_approval", items: parsed.data.items, to: ORDER_APPROVAL_TO },
          ipAddress: req.ip,
        }),
      ]);

      res.json({ message: "Solicitud de aprobación enviada", to: ORDER_APPROVAL_TO });
    } catch (error) {
      console.error("Error en /order-approval:", error);
      res.status(500).json({ error: "No se pudo procesar la solicitud" });
    }
  })
);

// ── Plastic Bag ───────────────────────────────────────────────────────────────

/**
 * @route POST /plastic-bag
 * @description Solicita bolsas plásticas.
 * @param {Array} items - Lista de ítems con código, nombre, cantidad y unidad.
 * @param {string} notes - Notas adicionales.
 */
router.post(
  "/plastic-bag",
  requireAuth,
  requireRole("operator", "supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = itemListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      return;
    }

    try {
      await Promise.all([
        sendPlasticBagEmail(parsed.data.items, parsed.data.notes),
        writeAuditLog({
          userId: authedReq.userId,
          action: "email_notification",
          resource: "notifications",
          details: { template: "plastic_bag", items: parsed.data.items, to: [...PLASTIC_BAG_TO], cc: [...PLASTIC_BAG_CC] },
          ipAddress: req.ip,
        }),
      ]);

      res.json({ message: "Solicitud de bolsas enviada", to: PLASTIC_BAG_TO.length, cc: PLASTIC_BAG_CC.length });
    } catch (error) {
      console.error("Error en /plastic-bag:", error);
      res.status(500).json({ error: "No se pudo procesar la solicitud" });
    }
  })
);

export default router;
