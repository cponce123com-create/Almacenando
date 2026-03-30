import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { sendLotChangeNotificationEmail, LOT_CHANGE_RECIPIENTS } from "../lib/email.js";
import { z } from "zod/v4";

const router = Router();

const lotChangeSchema = z.object({
  productId: z.string().min(1, "El producto es requerido"),
  oldLot: z.string().min(1, "El lote antiguo es requerido"),
  newLot: z.string().min(1, "El nuevo lote es requerido"),
  productionOrder: z.string().min(1, "La orden de producción es requerida"),
});

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

    await sendLotChangeNotificationEmail({
      productName: product.name,
      oldLot,
      newLot,
      productionOrder,
      senderName,
    });

    await writeAuditLog({
      userId: authedReq.userId,
      action: "lot_change_notification",
      resource: "products",
      resourceId: productId,
      details: {
        productName: product.name,
        oldLot,
        newLot,
        productionOrder,
        recipients: [...LOT_CHANGE_RECIPIENTS],
      },
      ipAddress: req.ip,
    });

    res.json({
      message: "Notificación enviada correctamente",
      productName: product.name,
      recipients: LOT_CHANGE_RECIPIENTS.length,
    });
  })
);

export default router;
