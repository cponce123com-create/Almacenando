/**
 * email-recipients.ts
 *
 * Centraliza la lectura de destinatarios de correo desde variables de entorno.
 * Reemplaza los emails hardcodeados que estaban en email.ts.
 *
 * Cada función parsea una variable de entorno con formato de valores separados
 * por coma y devuelve un array de strings. Variables opcionales retornan array
 * vacío si no están configuradas.
 *
 * Variables de entorno esperadas (ejemplos en .env.example):
 *   NOTIFY_LOT_CHANGE=user1@dominio.com,user2@dominio.com
 *   NOTIFY_PRODUCT_OUT=user@dominio.com
 *   NOTIFY_PRODUCT_OUT_CC=user1@dominio.com,user2@dominio.com
 *   NOTIFY_STOCK_COLOR=user@dominio.com
 *   NOTIFY_STOCK_COLOR_CC=user1@dominio.com,user2@dominio.com
 *   NOTIFY_STOCK_AUX=user@dominio.com
 *   NOTIFY_STOCK_AUX_CC=user1@dominio.com,user2@dominio.com
 *   NOTIFY_ORDER_APPROVAL=user@dominio.com
 *   NOTIFY_PLASTIC_BAG=user1@dominio.com,user2@dominio.com
 *   NOTIFY_PLASTIC_BAG_CC=user@dominio.com
 *   SMTP_EMAIL=tu-email@dominio.com
 */

function parseRecipients(envVar: string | undefined): string[] {
  if (!envVar) return [];
  return envVar.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Destinatarios de la notificación de cambio de lote (pesador de turno) */
export function getLotChangeRecipients(): string[] {
  return parseRecipients(process.env.NOTIFY_LOT_CHANGE);
}

/** Destinatario principal y CC de notificación de fin de producto */
export function getProductOutRecipients(): { to: string; cc: string[] } {
  return {
    to: process.env.NOTIFY_PRODUCT_OUT ?? "",
    cc: parseRecipients(process.env.NOTIFY_PRODUCT_OUT_CC),
  };
}

/** Destinatario principal y CC de notificación de stock de colorantes */
export function getStockColorRecipients(): { to: string; cc: string[] } {
  return {
    to: process.env.NOTIFY_STOCK_COLOR ?? "",
    cc: parseRecipients(process.env.NOTIFY_STOCK_COLOR_CC),
  };
}

/** Destinatario principal y CC de notificación de stock de auxiliares */
export function getStockAuxRecipients(): { to: string; cc: string[] } {
  return {
    to: process.env.NOTIFY_STOCK_AUX ?? "",
    cc: parseRecipients(process.env.NOTIFY_STOCK_AUX_CC),
  };
}

/** Destinatario de la solicitud de aprobación de orden interna */
export function getOrderApprovalRecipient(): string {
  return process.env.NOTIFY_ORDER_APPROVAL ?? "";
}

/** Destinatarios TO y CC de la solicitud de peso de bolsas plásticas */
export function getPlasticBagRecipients(): { to: string[]; cc: string[] } {
  return {
    to: parseRecipients(process.env.NOTIFY_PLASTIC_BAG),
    cc: parseRecipients(process.env.NOTIFY_PLASTIC_BAG_CC),
  };
}

/** Email del remitente SMTP (usuario Gmail corporativo) */
export function getSmtpUserEmail(): string {
  return process.env.SMTP_EMAIL ?? "";
}
