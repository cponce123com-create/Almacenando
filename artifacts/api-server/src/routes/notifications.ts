import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { writeAuditLog } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { sendLotChangeNotificationEmail, sendProductOutEmail, sendStockColoranteEmail, sendStockAuxiliarEmail, sendOrderApprovalEmail, sendPlasticBagEmail } from "../lib/email/index.js";
import { z } from "zod/v4";
import { emitNotification, onNotification } from "../lib/notification-events.js";

/**
 * Notificaciones
 * Notificaciones push internas, mark-read, mark-all-read
 */

const router = Router();

const emailListSchema = z.string().trim().transform((value) => value.split(/[;,]/).map((email) => email.trim()).filter(Boolean))
  .refine((emails) => emails.length > 0, "Ingresa al menos un destinatario")
  .refine((emails) => emails.every((email) => z.email().safeParse(email).success), "Uno o más correos no tienen un formato válido");
const optionalEmailListSchema = z.string().optional().default("")
  .transform((value) => value.split(/[;,]/).map((email) => email.trim()).filter(Boolean))
  .refine((emails) => emails.every((email) => z.email().safeParse(email).success), "Uno o más correos en CC no tienen un formato válido");
const recipientsSchema = z.object({ to: emailListSchema, cc: optionalEmailListSchema });

// ── Lot Change ────────────────────────────────────────────────────────────────

const lotChangeSchema = z.object({
  productId: z.string().min(1, "El producto es requerido"),
  oldLot: z.string().min(1, "El lote antiguo es requerido"),
  newLot: z.string().min(1, "El nuevo lote es requerido"),
  productionOrder: z.string().min(1, "La orden de producción es requerida"),
}).extend({ to: emailListSchema, cc: optionalEmailListSchema });

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

    const { productId, oldLot, newLot, productionOrder, to: recipientsTo, cc: recipientsCc } = parsed.data;

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

    // Confirmar el envío antes de responder como exitoso.
    await sendLotChangeNotificationEmail({ productName: product.name, oldLot, newLot, productionOrder, senderName, to: recipientsTo, cc: recipientsCc });

    await writeAuditLog({
      userId: authedReq.userId,
      action: "lot_change_notification",
      resource: "products",
      resourceId: productId,
      details: { productName: product.name, oldLot, newLot, productionOrder, to: recipientsTo, cc: recipientsCc },
      ipAddress: req.ip,
    });

    res.json({ message: "Notificación enviada correctamente", productName: product.name, recipients: recipientsTo.length, ccCount: recipientsCc.length });
  })
);

// ── Product Out ───────────────────────────────────────────────────────────────

const productOutSchema = z.object({
  productCode: z.string(),
  productName: z.string().min(1, "El nombre del producto es requerido"),
}).extend(recipientsSchema.shape);

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

    const { productCode, productName, to: outTo, cc: outCc } = parsed.data;

    await sendProductOutEmail({ productCode, productName, to: outTo, cc: outCc });
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

    await sendStockColoranteEmail(parsed.data.items, { to: parsed.data.to, cc: parsed.data.cc });
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "stock_colorante", items: parsed.data.items, to: parsed.data.to, cc: parsed.data.cc },
      ipAddress: req.ip,
    });

    res.json({ message: "Correo de stock de colorante enviado", to: parsed.data.to.length, cc: parsed.data.cc.length });
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

    await sendStockAuxiliarEmail(parsed.data.items, { to: parsed.data.to, cc: parsed.data.cc });
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "stock_auxiliar", items: parsed.data.items, to: parsed.data.to, cc: parsed.data.cc },
      ipAddress: req.ip,
    });

    res.json({ message: "Correo de stock de auxiliar enviado", to: parsed.data.to.length, cc: parsed.data.cc.length });
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

    await sendOrderApprovalEmail(parsed.data.items, parsed.data.notes, { to: parsed.data.to, cc: parsed.data.cc });
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "order_approval", items: parsed.data.items, to: parsed.data.to, cc: parsed.data.cc },
      ipAddress: req.ip,
    });

    res.json({ message: "Solicitud de aprobación enviada", to: parsed.data.to.length, cc: parsed.data.cc.length });
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

    await sendPlasticBagEmail(parsed.data.items, parsed.data.notes, { to: parsed.data.to, cc: parsed.data.cc });
    await writeAuditLog({
      userId: authedReq.userId,
      action: "email_notification",
      resource: "notifications",
      details: { template: "plastic_bag", items: parsed.data.items, to: parsed.data.to, cc: parsed.data.cc },
      ipAddress: req.ip,
    });

    res.json({ message: "Solicitud de bolsas enviada", to: parsed.data.to.length, cc: parsed.data.cc.length });
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
}).extend(recipientsSchema.shape);

// ── GET /api/notifications/recipients ─────────────────────────────────────────
// Los destinatarios ahora se ingresan en el formulario de envío; no se exponen variables del servidor.

router.get("/recipients", requireAuth, asyncHandler(async (_req, res) => {
  res.json({ recipientsAreProvidedAtSendTime: true });
}));

// ── GET /api/notifications/smtp-status ────────────────────────────────────────
// Diagnóstico del estado de la configuración SMTP.

router.get("/smtp-status", requireAuth, asyncHandler(async (_req, res) => {
  const smtpEmail = process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  const resendKey = process.env.RESEND_API_KEY;

  const config = {
    smtpEmail: smtpEmail ? `${smtpEmail.slice(0, 3)}...${smtpEmail.split("@")[1]}` : "(no configurado)",
    smtpPassword: smtpPass ? `configurado (${smtpPass.length} caracteres)` : "(no configurado)",
    resendApiKey: resendKey ? "configurado" : "(no configurado)",
    willUse: smtpPass && smtpEmail ? "SMTP Gmail" : "NINGUNO — los correos internos no se enviarán",
  };

  // Probar conexión SMTP si está configurado
  let smtpTest = { status: "no probado" as string, error: null as string | null };
  if (smtpPass && smtpEmail) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: smtpEmail, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
      });
      await transporter.verify();
      smtpTest = { status: "✅ conexión SMTP exitosa", error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      smtpTest = { status: "❌ falló conexión SMTP", error: msg };
    }
  }

  res.json({ config, smtpTest });
}));

// ── Notification CRUD ────────────────────────────────────────────────────────

const createNotificationSchema = z.object({
  userId: z.string().optional(),
  title: z.string().min(1, "El titulo es requerido"),
  message: z.string().min(1, "El mensaje es requerido"),
  type: z.enum(["low_stock", "expiring_lot", "info", "warning"]).default("info"),
  link: z.string().optional(),
});

/**
 * @route GET /api/notifications/unread
 * @description Obtiene notificaciones no leidas para el usuario actual. Si es admin, ve todas.
 */
router.get("/unread", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const isAdmin = authedReq.userRole === "admin";
  const conditions = [eq(notificationsTable.isRead, false)];
  if (!isAdmin) conditions.push(eq(notificationsTable.userId, authedReq.userId));

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt));

  res.json(notifications);
}));

/**
 * @route PUT /api/notifications/:id/read
 * @description Marca una notificacion como leida.
 */
router.put("/:id/read", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const authedReq = req as AuthenticatedRequest;

  const [notification] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id as string))
    .limit(1);

  if (!notification) { res.status(404).json({ error: "Notificacion no encontrada" }); return; }

  if (notification.userId && notification.userId !== authedReq.userId && authedReq.userRole !== "admin") {
    res.status(403).json({ error: "No tienes permiso para modificar esta notificacion" }); return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, id as string))
    .returning();

  res.json(updated);
}));

/**
 * @route POST /api/notifications
 * @description Crea una nueva notificacion (admin only).
 */
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const authedReq = req as AuthenticatedRequest;
    const parsed = createNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" });
      return;
    }

    const id = generateId();
    const [created] = await db
      .insert(notificationsTable)
      .values({ id, ...parsed.data, userId: parsed.data.userId ?? null, link: parsed.data.link ?? null })
      .returning();

    void writeAuditLog({ userId: authedReq.userId, action: "create", resource: "notifications", resourceId: id, details: { title: parsed.data.title, type: parsed.data.type }, ipAddress: req.ip });
    logger.info({ notificationId: id, title: parsed.data.title }, "Notification created");

    // Emitir evento SSE para notificaciones en tiempo real
    emitNotification({
      id,
      title: parsed.data.title,
      message: parsed.data.message,
      type: parsed.data.type,
      userId: parsed.data.userId ?? null,
      createdAt: created.createdAt.toISOString(),
    });

    res.status(201).json(created);
  }),
);

// ── GET /api/notifications/stream ─────────────────────────────────────────────
// SSE endpoint: el cliente se conecta y recibe notificaciones en tiempo real.
// Usa ?token=xxx en la query porque EventSource no soporta headers personalizados.

router.get("/stream", asyncHandler(async (req, res) => {
  // Autenticación via query param (EventSource no soporta Authorization header)
  const queryToken = req.query.token as string | undefined;
  const authHeader = req.headers.authorization;

  // Verificar token desde query param o header
  const token = queryToken
    ? `Bearer ${queryToken}`
    : authHeader;

  if (!token || !token.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  // Reconstruir request con el token en el header para requireAuth
  req.headers.authorization = token;

  let authed = false;
  await new Promise<void>((resolve) => {
    requireAuth(req, res, (err) => {
      if (err) {
        // Si requireAuth ya respondió (401), no continuar
        resolve();
      } else {
        authed = true;
        resolve();
      }
    });
  });

  if (!authed) return; // requireAuth ya respondió 401

  const authedReq = req as AuthenticatedRequest;
  const isAdmin = authedReq.userRole === "admin";

  // Headers SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Enviar heartbeat cada 30s para mantener conexión viva
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  // Suscribirse a eventos de notificaciones
  const unsubscribe = onNotification((event) => {
    // Si la notificación es para todos (userId null) o para este usuario, o el usuario es admin
    if (!event.notification.userId || event.notification.userId === authedReq.userId || isAdmin) {
      res.write(`event: notification\ndata: ${JSON.stringify(event.notification)}\n\n`);
    }
  });

  // Limpieza al desconectarse
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}));

/**
 * @route POST /api/notifications/mark-all-read
 * @description Marca todas las notificaciones como leidas para el usuario actual.
 */
router.post("/mark-all-read", requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const isAdmin = authedReq.userRole === "admin";

  const conditions: ReturnType<typeof eq>[] = [eq(notificationsTable.isRead, false)];
  // Admin marks all notifications as read; non-admin marks only their own
  if (!isAdmin) conditions.push(eq(notificationsTable.userId, authedReq.userId));

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(...conditions));

  res.json({ message: "Notificaciones marcadas como leídas" });
}));

export default router;
