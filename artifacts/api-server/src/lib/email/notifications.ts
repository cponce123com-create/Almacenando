/**
 * notifications.ts
 *
 * Plantillas de email para notificaciones internas vía SMTP Gmail.
 * Incluye: cambio de lote, fin de producto, stock colorante/auxiliar,
 * aprobación de orden, y solicitud de bolsas plásticas.
 */

import nodemailer from "nodemailer";
import { logger } from "../logger.js";
import { buildTransporter, getResend } from "./provider.js";
import { smtpHeader, smtpFooter, smtpWrap, infoTable } from "./helpers.js";
import { getSmtpUserEmail } from "../email-recipients.js";

const smtpUser = getSmtpUserEmail();

// ── Lot Change ────────────────────────────────────────────────────────────────

export async function sendLotChangeNotificationEmail({
  productName,
  oldLot,
  newLot,
  productionOrder,
  senderName,
  to: explicitTo,
  cc: explicitCc,
}: {
  productName: string;
  oldLot: string;
  newLot: string;
  productionOrder: string;
  senderName: string;
  to?: string[];
  cc?: string[];
}): Promise<void> {
  const subject = `Notificación de Cambio de Lote - ${productName}`;

  const text = `Estimada Judith,

Le informo que se ha realizado un cambio de lote para el siguiente producto:

  Producto:      ${productName}
  Lote Anterior: ${oldLot}
  Nuevo Lote:    ${newLot}
  O.P.:          ${productionOrder}
  Enviado por:   ${senderName}

Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;

  const tableRows: Array<[string, string]> = [
    ["Producto", productName],
    ["Lote Anterior", oldLot],
    ["Nuevo Lote", newLot],
    ["O.P.", productionOrder],
    ["Enviado por", senderName],
  ];

  // ── Prioridad 1: SMTP Gmail (nodemailer) ────────────────────────────────────
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  const smtpUser = getSmtpUserEmail();
  logger.info({ hasPass: !!smtpPass, user: smtpUser?.slice(0,5) }, "[email] check SMTP config");
  if (smtpPass && smtpUser) {
    let to: string[];
    if (explicitTo && explicitTo.length > 0) {
      to = explicitTo;
    } else {
      const { getLotChangeRecipients } = await import("../email-recipients.js");
      to = getLotChangeRecipients();
    }
    const cc = explicitCc && explicitCc.length > 0 ? explicitCc : undefined;
    if (to.length === 0) {
      logger.warn("[email] Sin destinatarios");
      return;
    }

    logger.info({ to, cc }, "[email] Intentando enviar por SMTP...");
    try {
      const dns = await import("dns");
      const transportConfig = {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        lookup: (host: any, options: any, cb: any) => {
          dns.lookup(host, { ...options, family: 4 }, cb);
        },
      } as any;
      const transporter = nodemailer.createTransport(transportConfig);
      const info = await transporter.sendMail({
        from: `"Almacén Químico" <${smtpUser}>`,
        to: to.join(", "),
        cc: cc ? cc.join(", ") : undefined,
        subject,
        text,
      });
      logger.info({ messageId: info.messageId }, "[email] ✅ CORREO ENVIADO EXITOSAMENTE");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && 'code' in err ? (err as any).code : null;
      logger.error({ err: msg, code }, "[email] ❌ FALLO AL ENVIAR CORREO");
    }
    return;
  }

  // ── Prioridad 2: Resend (proveedor transactional) ─────────────────────────
  const resend = getResend();
  if (resend) {
    let to: string[];
    if (explicitTo && explicitTo.length > 0) {
      to = explicitTo;
    } else {
      const { getLotChangeRecipients } = await import("../email-recipients.js");
      to = getLotChangeRecipients();
    }
    const cc = explicitCc && explicitCc.length > 0 ? explicitCc : undefined;
    if (to.length > 0) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        cc,
        subject,
        text,
      });
    }
    return;
  }

  logger.warn("[email] Sin proveedor de email configurado — email no enviado. Configurá SMTP_APP_PASSWORD + SMTP_EMAIL o RESEND_API_KEY");
}

// ── Dye Lot Notification ──────────────────────────────────────────────────────

export async function sendDyeLotNotificationEmail({
  productName,
  lotNumber,
  quantity,
  expirationDate,
  supplier,
  certificateNumber,
  qualityStatus,
  senderName,
  recipients,
}: {
  productName: string;
  lotNumber: string;
  quantity: string;
  expirationDate: string;
  supplier?: string;
  certificateNumber?: string;
  qualityStatus: string;
  senderName: string;
  recipients: string[];
}): Promise<void> {
  const subject = `Nuevo Lote Registrado - ${productName} (${lotNumber})`;

  const text = `Se ha registrado un nuevo lote:

Producto: ${productName}
Lote: ${lotNumber}
Cantidad: ${quantity}
Vencimiento: ${expirationDate}
Proveedor: ${supplier ?? "—"}
Certificado: ${certificateNumber ?? "—"}
Estado: ${qualityStatus}
Registrado por: ${senderName}`;

  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
      to: recipients,
      subject,
      text,
    });
    return;
  }

  logger.warn("[email] RESEND_API_KEY no configurado — email no enviado");
}

// ── Product Out ───────────────────────────────────────────────────────────────

export async function sendProductOutEmail({
  productCode,
  productName,
}: {
  productCode: string;
  productName: string;
}): Promise<void> {
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  if (!smtpPass) {
    logger.warn("[email-smtp] SMTP_APP_PASSWORD no configurado — notificación de fin de producto no enviada");
    return;
  }

  const smtpUserFromEnv = getSmtpUserEmail();
  const codeLabel = productCode.trim() ? ` (${productCode.trim()})` : "";
  const subject = `⚠️ Término de Producto${codeLabel} — ${productName}`;

  const text = `Estimada Judith,

Le informo que el siguiente producto ha llegado a su término total en nuestro almacén:

  Código:   ${productCode.trim() || "—"}
  Producto: ${productName}

Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;

  const { getProductOutRecipients } = await import("../email-recipients.js");
  const { to, cc } = getProductOutRecipients();

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: smtpUserFromEnv, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Carlos Ponce — Almacén Químico" <${smtpUserFromEnv}>`,
    to,
    cc,
    subject,
    text,
  });
}

// ── Stock Colorante ───────────────────────────────────────────────────────────

export async function sendStockColoranteEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>) {
  const transporter = buildTransporter();
  const rows = items.map(i =>
    `  ${i.code.padEnd(12)} ${i.name.padEnd(30)} ${i.quantity} ${i.unit}`
  ).join("\n");
  const text = `Buenas días,

Se informa el siguiente stock físico de colorantes:

${rows}

Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;

  const tableRows: Array<[string, string]> = items.map(i => [`${i.code} — ${i.name}`, `${i.quantity} ${i.unit}`]);
  const html = smtpWrap(
    smtpHeader("Stock de Colorantes", "🧪", "#2563eb"),
    infoTable(tableRows),
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  const { getStockColorRecipients } = await import("../email-recipients.js");
  const { to, cc } = getStockColorRecipients();

  await transporter.sendMail({
    from: `"Carlos Ponce — Almacén Químico" <${smtpUser}>`,
    to,
    cc,
    subject: "Reporte de Stock de Colorantes",
    text,
    html,
  });
}

// ── Stock Auxiliar ────────────────────────────────────────────────────────────

export async function sendStockAuxiliarEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>) {
  const transporter = buildTransporter();
  const rows = items.map(i =>
    `  ${i.code.padEnd(12)} ${i.name.padEnd(30)} ${i.quantity} ${i.unit}`
  ).join("\n");
  const text = `Buenas días,

Se informa el siguiente stock físico de auxiliares:

${rows}

Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;

  const tableRows: Array<[string, string]> = items.map(i => [`${i.code} — ${i.name}`, `${i.quantity} ${i.unit}`]);
  const html = smtpWrap(
    smtpHeader("Stock de Auxiliares", "🧪", "#7c3aed"),
    infoTable(tableRows),
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  const { getStockAuxRecipients } = await import("../email-recipients.js");
  const { to, cc } = getStockAuxRecipients();

  await transporter.sendMail({
    from: `"Carlos Ponce — Almacén Químico" <${smtpUser}>`,
    to,
    cc,
    subject: "Reporte de Stock de Auxiliares",
    text,
    html,
  });
}

// ── Order Approval ────────────────────────────────────────────────────────────

export async function sendOrderApprovalEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>, notes?: string) {
  const transporter = buildTransporter();
  const rows = items.map(i =>
    `  ${i.code.padEnd(12)} ${i.name.padEnd(30)} ${i.quantity} ${i.unit}`
  ).join("\n");
  const notesLine = notes ? `
Observaciones: ${notes}
` : "";
  const text = `Buenas días,

Se solicita la aprobación de la siguiente orden:

${rows}${notesLine}

Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;

  const tableRows: Array<[string, string]> = items.map(i => [`${i.code} — ${i.name}`, `${i.quantity} ${i.unit}`]);
  const body = infoTable(tableRows) + (notes ? `<p><strong>Observaciones:</strong> ${notes}</p>` : "");
  const html = smtpWrap(
    smtpHeader("Aprobación de Orden Interna", "📋", "#d97706"),
    body,
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  const { getOrderApprovalRecipient } = await import("../email-recipients.js");

  await transporter.sendMail({
    from: `"Carlos Ponce — Almacén Químico" <${smtpUser}>`,
    to: getOrderApprovalRecipient(),
    subject: "Solicitud de Aprobación de Orden Interna",
    text,
    html,
  });
}

// ── Plastic Bag ───────────────────────────────────────────────────────────────

export async function sendPlasticBagEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>, notes?: string) {
  const transporter = buildTransporter();
  const rows = items.map(i =>
    `  ${i.code.padEnd(12)} ${i.name.padEnd(30)} ${i.quantity} ${i.unit}`
  ).join("\n");
  const notesLine = notes ? `
Observaciones: ${notes}
` : "";
  const text = `Buenas días,

Se solicita el peso de las siguientes bolsas plásticas:

${rows}${notesLine}

Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;

  const tableRows: Array<[string, string]> = items.map(i => [`${i.code} — ${i.name}`, `${i.quantity} ${i.unit}`]);
  const body = infoTable(tableRows) + (notes ? `<p><strong>Observaciones:</strong> ${notes}</p>` : "");
  const html = smtpWrap(
    smtpHeader("Solicitud de Peso — Bolsas Plásticas", "🛍️", "#059669"),
    body,
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  const { getPlasticBagRecipients } = await import("../email-recipients.js");
  const { to, cc } = getPlasticBagRecipients();

  await transporter.sendMail({
    from: `"Carlos Ponce — Almacén Químico" <${smtpUser}>`,
    to,
    cc,
    subject: "Solicitud de Peso de Bolsas Plásticas",
    text,
    html,
  });
}
