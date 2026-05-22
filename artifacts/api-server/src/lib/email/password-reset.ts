/**
 * password-reset.ts
 *
 * Email de restablecimiento de contraseña vía SMTP Gmail.
 */

import nodemailer from "nodemailer";
import { logger } from "../logger.js";
import { getSmtpUserEmail } from "../email-recipients.js";

export async function sendPasswordResetEmail({
  toEmail,
  toName,
  resetToken,
  frontendUrl,
}: {
  toEmail: string;
  toName: string;
  resetToken: string;
  frontendUrl: string;
}): Promise<void> {
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  if (!smtpPass) {
    logger.warn({ toEmail }, "[email-smtp] SMTP_APP_PASSWORD no configurado — email de reset no enviado");
    return;
  }

  const smtpUser = getSmtpUserEmail();
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  const subject = "Restablecimiento de contraseña — Almacén Químico";
  const text = `Hola ${toName},

Has solicitado restablecer tu contraseña.

Haz clic en el siguiente enlace para crear una nueva contraseña:
${resetLink}

Este enlace expira en 24 horas.

Si no solicitaste este cambio, ignora este mensaje.

Saludos,
Equipo Almacén Químico`;
  const html = `<p>Hola <strong>${toName}</strong>,</p><p>Has solicitado restablecer tu contraseña.</p><p><a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Restablecer contraseña</a></p><p>O copia este enlace:<br/><code>${resetLink}</code></p><p>Este enlace expira en 24 horas.</p><p>Si no solicitaste este cambio, ignora este mensaje.</p>`;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Almacén Químico" <${smtpUser}>`,
    to: toEmail,
    subject,
    text,
    html,
  });
}
