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

// ── Lot Change ────────────────────────────────────────────────────────────────

export async function sendLotChangeNotificationEmail({
  productName,
  oldLot,
  newLot,
  productionOrder,
  senderName,
  to,
  cc,
}: {
  productName: string;
  oldLot: string;
  newLot: string;
  productionOrder: string;
  senderName: string;
  to: string[];
  cc?: string[];
}): Promise<void> {
  const smtpUser = process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_APP_PASSWORD;

  if (!smtpUser || !smtpPass) {
    logger.warn("[email] SMTP_EMAIL o SMTP_APP_PASSWORD no configurados");
    throw new Error("El servicio de correo no está configurado");
  }

  const ccList = cc && cc.length > 0 ? cc : undefined;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPass },
  });

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

  await transporter.sendMail({
    from: smtpUser,
    to: to.join(", "),
    cc: ccList ? ccList.join(", ") : undefined,
    subject,
    text,
  });

  logger.info({ recipientCount: to.length, ccCount: ccList?.length ?? 0 }, "[email] Notificación de cambio de lote enviada");
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
  logger.warn("[email-dye] RESEND_API_KEY no configurado");
}

// ── Product Out ───────────────────────────────────────────────────────────────

export async function sendProductOutEmail({
  productCode,
  productName,
  to,
  cc,
}: {
  productCode: string;
  productName: string;
  to: string[];
  cc?: string[];
}): Promise<void> {
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  const smtpUser = process.env.SMTP_EMAIL;
  if (!smtpPass || !smtpUser) {
    logger.warn("[email] SMTP no configurado — fin de producto no enviado");
    throw new Error("El servicio de correo no está configurado");
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPass },
  });

  const subject = `Notificación de Fin de Producto - ${productName}`;
  const text = `Se ha terminado el producto:

Código: ${productCode}
Nombre: ${productName}`;

  try {
    await transporter.sendMail({
      from: smtpUser,
      to: to.join(", "),
      cc: cc?.length ? cc.join(", ") : undefined,
      subject,
      text,
    });
    logger.info("[email] Notificación de fin de producto enviada");
  } catch (err) {
    logger.error({ err }, "[email] Error enviando fin de producto");
    throw err;
  }
}

// ── Stock Colorante ───────────────────────────────────────────────────────────

export async function sendStockColoranteEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>, recipients: { to: string[]; cc?: string[] }) {
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
  const html = smtpWrap(
    smtpHeader("Reporte de Stock de Colorantes", "📊", "#3b82f6"),
    `<p>Se informa el siguiente stock físico de colorantes:</p>${infoTable(["Código", "Producto", "Cantidad", "UM"], items.map(i => [i.code, `${i.name} / ${i.quantity} ${i.unit}`] as [string, string]))}`,
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  await transporter.sendMail({ from: smtpUser(), to: recipients.to.join(","), cc: recipients.cc?.join(","), subject: "Reporte de Stock de Colorantes", text, html });
}

// ── Stock Auxiliar ────────────────────────────────────────────────────────────

export async function sendStockAuxiliarEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>, recipients: { to: string[]; cc?: string[] }) {
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
  const html = smtpWrap(
    smtpHeader("Reporte de Stock de Auxiliares", "📊", "#3b82f6"),
    `<p>Se informa el siguiente stock físico de auxiliares:</p>${infoTable(["Código", "Producto", "Cantidad", "UM"], items.map(i => [i.code, `${i.name} / ${i.quantity} ${i.unit}`] as [string, string]))}`,
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  await transporter.sendMail({ from: smtpUser(), to: recipients.to.join(","), cc: recipients.cc?.join(","), subject: "Reporte de Stock de Auxiliares", text, html });
}

// ── Order Approval ────────────────────────────────────────────────────────────

export async function sendOrderApprovalEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>, notes: string | undefined, recipients: { to: string[]; cc?: string[] }) {
  const transporter = buildTransporter();
  const rows = items.map(i =>
    `  ${i.code.padEnd(12)} ${i.name.padEnd(30)} ${i.quantity} ${i.unit}`
  ).join("\n")
  const notesLine = notes ? `
Observaciones: ${notes}
` : "";
  const text = `Buenas días,

Se solicita la aprobación de la siguiente orden:

${rows}${notesLine}
Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;
  const html = smtpWrap(
    smtpHeader("Solicitud de Aprobación de Orden Interna", "📋", "#f59e0b"),
    `<p>Se solicita la aprobación de la siguiente orden:</p>${infoTable(["Código", "Producto", "Cantidad", "UM"], items.map(i => [i.code, `${i.name} / ${i.quantity} ${i.unit}`] as [string, string]))}${notes ? `<p><strong>Observaciones:</strong> ${notes}</p>` : ""}`,
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  await transporter.sendMail({ from: smtpUser(), to: recipients.to.join(","), cc: recipients.cc?.join(","), subject: "Solicitud de Aprobación de Orden Interna", text, html });
}

// ── Plastic Bag ───────────────────────────────────────────────────────────────

export async function sendPlasticBagEmail(items: Array<{ code: string; name: string; quantity: string; unit: string }>, notes: string | undefined, recipients: { to: string[]; cc?: string[] }) {
  const transporter = buildTransporter();
  const rows = items.map(i =>
    `  ${i.code.padEnd(12)} ${i.name.padEnd(30)} ${i.quantity} ${i.unit}`
  ).join("\n")
  const notesLine = notes ? `
Observaciones: ${notes}
` : "";
  const text = `Buenas días,

Se solicita el peso de las siguientes bolsas plásticas:

${rows}${notesLine}
Saludos Cordiales.

Carlos Ponce
Supervisor de Cocina Colores`;
  const html = smtpWrap(
    smtpHeader("Solicitud de Bolsas Plásticas", "🛍️", "#10b981"),
    `<p>Se solicita el peso de las siguientes bolsas plásticas:</p>${infoTable(["Código", "Producto", "Cantidad", "UM"], items.map(i => [i.code, `${i.name} / ${i.quantity} ${i.unit}`] as [string, string]))}${notes ? `<p><strong>Observaciones:</strong> ${notes}</p>` : ""}`,
    smtpFooter("Carlos Ponce", "Supervisor de Cocina Colores"),
  );

  await transporter.sendMail({ from: smtpUser(), to: recipients.to.join(","), cc: recipients.cc?.join(","), subject: "Solicitud de Bolsas Plásticas", text, html });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function smtpUser() {
  return process.env.SMTP_EMAIL ?? "";
}
