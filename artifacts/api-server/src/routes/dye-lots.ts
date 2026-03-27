import { Router } from "express";
import { db } from "@workspace/db";
import { dyeLotsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { sendDyeLotNotificationEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

const dyeLotSchema = z.object({
  productId: z.string().min(1),
  lotNumber: z.string().min(1),
  quantity: z.string().min(1),
  expirationDate: z.string().optional(),
  receiptDate: z.string().min(1),
  supplier: z.string().optional(),
  certificateNumber: z.string().optional(),
  qualityStatus: z.enum(["pending", "approved", "rejected"]).default("pending"),
  notes: z.string().optional(),
  // Usuarios a notificar (array de emails). Si no se envía, se notifica a todos.
  notifyEmails: z.array(z.string().email()).optional(),
});

// ---------------------------------------------------------------------------
// Helper: obtiene el nombre del usuario y todos los emails activos a notificar.
// ---------------------------------------------------------------------------
async function getNotificationData(userId: string): Promise<{
  changedByName: string;
  allActiveEmails: Array<{ email: string; name: string }>;
}> {
  const users = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, status: usersTable.status })
    .from(usersTable);

  const changedByUser = users.find((u) => u.id === userId);
  const allActiveEmails = users
    .filter((u) => u.status === "active" && u.email)
    .map((u) => ({ email: u.email, name: u.name }));

  return {
    changedByName: changedByUser?.name ?? "Sistema",
    allActiveEmails,
  };
}

// ---------------------------------------------------------------------------
// Helper: dispara los emails sin bloquear la respuesta HTTP.
// ---------------------------------------------------------------------------
function dispatchNotifications({
  recipients,
  lotNumber,
  productName,
  changeType,
  changedByName,
  qualityStatus,
  quantity,
  supplier,
  notes,
}: {
  recipients: Array<{ email: string; name: string }>;
  lotNumber: string;
  productName: string;
  changeType: "created" | "updated" | "status_changed";
  changedByName: string;
  qualityStatus: string;
  quantity: string;
  supplier?: string;
  notes?: string;
}) {
  const appUrl = process.env.APP_URL ?? "http://localhost:5173";

  for (const recipient of recipients) {
    sendDyeLotNotificationEmail({
      toEmail: recipient.email,
      toName: recipient.name,
      lotNumber,
      productName,
      changeType,
      changedByName,
      qualityStatus,
      quantity,
      supplier,
      notes,
      appUrl,
    }).catch((err) => {
      logger.error({ err, toEmail: recipient.email }, "[dye-lots] Error enviando notificación de lote");
    });
  }
}

// ---------------------------------------------------------------------------
// GET /dye-lots — lista todos los lotes con nombre de producto
// ---------------------------------------------------------------------------
router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const records = await db
    .select({
      id: dyeLotsTable.id,
      productId: dyeLotsTable.productId,
      lotNumber: dyeLotsTable.lotNumber,
      quantity: dyeLotsTable.quantity,
      expirationDate: dyeLotsTable.expirationDate,
      receiptDate: dyeLotsTable.receiptDate,
      supplier: dyeLotsTable.supplier,
      certificateNumber: dyeLotsTable.certificateNumber,
      qualityStatus: dyeLotsTable.qualityStatus,
      approvedBy: dyeLotsTable.approvedBy,
      approvedAt: dyeLotsTable.approvedAt,
      notes: dyeLotsTable.notes,
      registeredBy: dyeLotsTable.registeredBy,
      createdAt: dyeLotsTable.createdAt,
      updatedAt: dyeLotsTable.updatedAt,
    })
    .from(dyeLotsTable)
    .orderBy(desc(dyeLotsTable.receiptDate));
  res.json(records);
}));

// ---------------------------------------------------------------------------
// GET /dye-lots/:id
// ---------------------------------------------------------------------------
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(dyeLotsTable).where(eq(dyeLotsTable.id, id as string)).limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }
  res.json(records[0]);
}));

// ---------------------------------------------------------------------------
// POST /dye-lots — crea lote y notifica a todos los usuarios activos
// ---------------------------------------------------------------------------
router.post("/", requireAuth, requireRole("supervisor", "admin", "quality", "operator"), asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;

  const parsed = dyeLotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { notifyEmails, ...lotData } = parsed.data;
  const id = generateId();
  const [created] = await db.insert(dyeLotsTable).values({
    id,
    ...lotData,
    registeredBy: authedReq.userId,
  }).returning();

  res.status(201).json(created);

  // ── Notificaciones en background ──
  try {
    const { changedByName, allActiveEmails } = await getNotificationData(authedReq.userId);

    // Si se enviaron emails específicos, filtrar; si no, notificar a todos
    const recipients = notifyEmails && notifyEmails.length > 0
      ? allActiveEmails.filter((u) => notifyEmails.includes(u.email))
      : allActiveEmails;

    // Necesitamos el nombre del producto; lo buscamos rápido
    const { productsTable } = await import("@workspace/db");
    const [product] = await db.select({ name: productsTable.name }).from(productsTable)
      .where(eq(productsTable.id, lotData.productId)).limit(1);

    dispatchNotifications({
      recipients,
      lotNumber: lotData.lotNumber,
      productName: product?.name ?? lotData.productId,
      changeType: "created",
      changedByName,
      qualityStatus: lotData.qualityStatus ?? "pending",
      quantity: lotData.quantity,
      supplier: lotData.supplier,
      notes: lotData.notes,
    });
  } catch (err) {
    logger.error({ err }, "[dye-lots] Error preparando notificaciones POST");
  }
}));

// ---------------------------------------------------------------------------
// PUT /dye-lots/:id — actualiza lote y notifica cambios relevantes
// ---------------------------------------------------------------------------
router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authedReq = req as AuthenticatedRequest;

  // Guardamos el estado anterior para detectar si cambió el qualityStatus
  const [before] = await db.select().from(dyeLotsTable).where(eq(dyeLotsTable.id, id as string)).limit(1);
  if (!before) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }

  const parsed = dyeLotSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { notifyEmails, ...updateFields } = parsed.data as typeof parsed.data & { notifyEmails?: string[] };

  const updateData: Record<string, unknown> = { ...updateFields, updatedAt: new Date() };
  if (updateFields.qualityStatus === "approved") {
    updateData.approvedBy = authedReq.userId;
    updateData.approvedAt = new Date();
  }

  const [updated] = await db.update(dyeLotsTable).set(updateData).where(eq(dyeLotsTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }

  res.json(updated);

  // ── Notificaciones en background ──
  try {
    const statusChanged = updateFields.qualityStatus && updateFields.qualityStatus !== before.qualityStatus;
    const changeType = statusChanged ? "status_changed" : "updated";

    const { changedByName, allActiveEmails } = await getNotificationData(authedReq.userId);

    const recipients = notifyEmails && notifyEmails.length > 0
      ? allActiveEmails.filter((u) => notifyEmails.includes(u.email))
      : allActiveEmails;

    const { productsTable } = await import("@workspace/db");
    const [product] = await db.select({ name: productsTable.name }).from(productsTable)
      .where(eq(productsTable.id, updated.productId)).limit(1);

    dispatchNotifications({
      recipients,
      lotNumber: updated.lotNumber,
      productName: product?.name ?? updated.productId,
      changeType,
      changedByName,
      qualityStatus: updated.qualityStatus,
      quantity: updated.quantity,
      supplier: updated.supplier ?? undefined,
      notes: updated.notes ?? undefined,
    });
  } catch (err) {
    logger.error({ err }, "[dye-lots] Error preparando notificaciones PUT");
  }
}));

// ---------------------------------------------------------------------------
// DELETE /dye-lots/:id
// ---------------------------------------------------------------------------
router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(dyeLotsTable).where(eq(dyeLotsTable.id, id as string)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Lote no encontrado" });
    return;
  }
  res.json({ message: "Lote eliminado" });
}));

export default router;
