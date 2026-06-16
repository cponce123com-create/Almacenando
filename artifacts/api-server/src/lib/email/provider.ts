/**
 * provider.ts
 *
 * Configuración de proveedores de email: Resend (transaccional) y SMTP Gmail (notificaciones internas).
 */

import { Resend } from "resend";
import nodemailer from "nodemailer";
import dns from "dns";
import { logger } from "../logger.js";
import { getSmtpUserEmail } from "../email-recipients.js";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export function getEmailProviderStatus(): "resend" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}

export function buildTransporter() {
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  if (!smtpPass) {
    logger.warn("[email-smtp] SMTP_APP_PASSWORD no configurado — notificación de cambio de lote no enviada");
    throw new Error("SMTP_APP_PASSWORD no configurado");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: getSmtpUserEmail(), pass: smtpPass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    lookup: (host: any, options: any, cb: any) => {
      dns.lookup(host, { ...options, family: 4 }, cb);
    },
  } as any);
}

export { getResend, type Resend };
