import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { sendLotChangeNotificationEmail, sendProductOutEmail, sendStockColoranteEmail, sendStockAuxiliarEmail, sendOrderApprovalEmail, sendPlasticBagEmail } from "../lib/email/index.js";
import { getLotChangeRecipients, getProductOutRecipients, getStockColorRecipients, getStockAuxRecipients, getOrderApprovalRecipient, getPlasticBagRecipients } from "../lib/email-recipients.js";
import { z } from "zod/v4";

const router = Router();

// ── Lot Change ────────────────────────────────────────────────────────────────

const lotChangeSchema = z.object({
  productId: z.string().min(1, "El producto es requerido"),
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

    await writeAuditLog({
      userId: authedReq.userId,
      action: "lot_change_notification",
      resource: "products",
      resourceId: productId,
      details: { productName: product.name, oldLot, newLot, productionOrder, recipients: getLotChangeRecipients() },
      ipAddress: req.ip,
    });

    res.json({ message: "Notificación enviada correctamente", productName: product.name, recipients: getLotChangeRecipients().length });

    // Enviar email en background, sin bloquear la respuesta
    sendLotChangeNotificationEmail({ productName: product.name, oldLot, newLot, productionOrder, senderName })
      .catch((err) => logger.error({ err }, "Error enviando email de lote"));
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
    const { to: outTo, cc: outCc } = getProductOutRecipients();

    await sendProductOutEmail({ productCode, productName });
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "products",
      resourceId: productCode || productName,
      details: { template: "product_out", productCode, productName, to: outTo, cc: outCc },
      ipAddress: req.ip,
    });

    res.json({ message: "Notificación enviada correctamente", productName, to: outTo, cc: outCc.length });
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

    await sendStockColoranteEmail(parsed.data.items);
    const { to: colorTo, cc: colorCc } = getStockColorRecipients();
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "stock_colorante", items: parsed.data.items, to: colorTo, cc: colorCc },
      ipAddress: req.ip,
    });

    res.json({ message: "Correo de stock de colorante enviado", to: colorTo, cc: colorCc.length });
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

    await sendStockAuxiliarEmail(parsed.data.items);
    const { to: auxTo, cc: auxCc } = getStockAuxRecipients();
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "stock_auxiliar", items: parsed.data.items, to: auxTo, cc: auxCc },
      ipAddress: req.ip,
    });

    res.json({ message: "Correo de stock de auxiliar enviado", to: auxTo, cc: auxCc.length });
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

    await sendOrderApprovalEmail(parsed.data.items, parsed.data.notes);
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "order_approval", items: parsed.data.items, to: getOrderApprovalRecipient() },
      ipAddress: req.ip,
    });

    res.json({ message: "Solicitud de aprobación enviada", to: getOrderApprovalRecipient() });
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

    await sendPlasticBagEmail(parsed.data.items, parsed.data.notes);
    const { to: bagTo, cc: bagCc } = getPlasticBagRecipients();
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "plastic_bag", items: parsed.data.items, to: bagTo, cc: bagCc },
      ipAddress: req.ip,
    });

    res.json({ message: "Solicitud de bolsas enviada", to: bagTo.length, cc: bagCc.length });
  })
);

// ── Shared Schema for Item List Templates ─────────────────────────────────────

const itemSchema = z.object({
  code: z.string(),
  name: z.string().min(1),
  quantity: z.string().min(1),
  unit: z.string().min(1),
});

const itemListSchema = z.object({
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem"),
  notes: z.string().optional(),
});

export default router;
