/**
 * email/index.ts
 *
 * Re-exporta todas las funciones públicas del módulo email para mantener
 * compatibilidad con los módulos que importan desde "../lib/email.js".
 */

// Provider
export { getEmailProviderStatus } from "./provider.js";

// Helpers (no se exportaban públicamente antes — se agregan para testabilidad)
export { smtpHeader, smtpFooter, smtpWrap, infoTable } from "./helpers.js";

// Notification templates (SMTP)
export {
  sendLotChangeNotificationEmail,
  sendDyeLotNotificationEmail,
  sendProductOutEmail,
  sendStockColoranteEmail,
  sendStockAuxiliarEmail,
  sendOrderApprovalEmail,
  sendPlasticBagEmail,
} from "./notifications.js";

// Password reset (SMTP)
export { sendPasswordResetEmail } from "./password-reset.js";
