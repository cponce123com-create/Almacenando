/** Remitente SMTP privado; las direcciones destino se reciben en cada envío. */
export function getSmtpUserEmail(): string {
  return process.env.SMTP_EMAIL ?? "";
}
