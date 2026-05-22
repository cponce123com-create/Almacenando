/**
 * personal.ts
 *
 * Plantillas de email para notificaciones personales vía Resend.
 * Incluye: reporte de fallecimiento, enlace de acceso, clave de encriptación,
 * invitación de contacto de confianza y cápsula del tiempo.
 */

import { logger } from "../logger.js";
import { getResend } from "./provider.js";

export async function sendDeathReportEmail({
  toEmail,
  toName,
  deceasedName,
  relationship,
  memory,
}: {
  toEmail: string;
  toName: string;
  deceasedName: string;
  relationship: string;
  memory: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn("[email] RESEND_API_KEY no configurado — email no enviado");
    return;
  }

  const subject = `Reporte de Fallecimiento - ${deceasedName}`;
  const text = `Hola ${toName},

Lamento informarte que ${deceasedName} (${relationship}) ha fallecido.

${memory}

Si necesitas ayuda o información adicional, no dudes en contactarnos.`;
  const html = `<h2>Reporte de Fallecimiento</h2><p><strong>${deceasedName}</strong> (${relationship})</p><p>${memory}</p>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: toEmail,
    subject,
    text,
    html,
  });
}

export async function sendAccessLinkEmail({
  toEmail,
  toName,
  accessLink,
  senderName,
}: {
  toEmail: string;
  toName: string;
  accessLink: string;
  senderName: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn("[email] RESEND_API_KEY no configurado — email no enviado");
    return;
  }

  const subject = `${senderName} te ha compartido un acceso`;
  const text = `Hola ${toName},

${senderName} te ha compartido un enlace de acceso:

${accessLink}

Saludos.`;
  const html = `<p>${senderName} te ha compartido un <a href="${accessLink}">enlace de acceso</a>.</p>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: toEmail,
    subject,
    text,
    html,
  });
}

export async function sendEncryptionKeyEmail({
  toEmail,
  toName,
  encryptedData,
  encryptionKey,
}: {
  toEmail: string;
  toName: string;
  encryptedData: string;
  encryptionKey: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn("[email] RESEND_API_KEY no configurado — email no enviado");
    return;
  }

  const subject = "Tu clave de encriptación";
  const text = `Hola ${toName},

Tu clave de encriptación es:

${encryptionKey}

Guárdala en un lugar seguro.`;
  const html = `<p>Tu clave de encriptación:</p><pre style="background:#f1f5f9;padding:12px;border-radius:6px">${encryptionKey}</pre>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: toEmail,
    subject,
    text,
    html,
  });
}

export async function sendTrustedContactInviteEmail({
  toEmail,
  toName,
  inviterName,
  inviteLink,
}: {
  toEmail: string;
  toName: string;
  inviterName: string;
  inviteLink: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn("[email] RESEND_API_KEY no configurado — email no enviado");
    return;
  }

  const subject = `${inviterName} te ha invitado como contacto de confianza`;
  const text = `Hola ${toName},

${inviterName} te ha invitado a ser su contacto de confianza.

Para aceptar la invitación, haz clic en el siguiente enlace:
${inviteLink}

Saludos.`;
  const html = `<p>${inviterName} te ha invitado a ser su <strong>contacto de confianza</strong>.</p><p><a href="${inviteLink}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Aceptar invitación</a></p>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: toEmail,
    subject,
    text,
    html,
  });
}

export async function sendTimeCapsuleEmail({
  toEmail,
  toName,
  capsuleTitle,
  capsuleContent,
  senderName,
  unlockDate,
  viewLink,
}: {
  toEmail: string;
  toName: string;
  capsuleTitle: string;
  capsuleContent: string;
  senderName: string;
  unlockDate: Date;
  viewLink: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn("[email] RESEND_API_KEY no configurado — email no enviado");
    return;
  }

  const subject = `📦 Cápsula del Tiempo: ${capsuleTitle}`;
  const text = `Hola ${toName},

${senderName} te ha enviado una Cápsula del Tiempo:

"${capsuleTitle}"

${capsuleContent}

Se abrirá el ${unlockDate.toLocaleDateString()}.

Ver más: ${viewLink}`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: toEmail,
    subject,
    text,
  });
}
