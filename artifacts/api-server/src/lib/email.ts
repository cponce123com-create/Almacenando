import nodemailer from "nodemailer";

function createTransport() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendDeathReportEmail({
  toEmail,
  toName,
  reporterName,
  deceasedName,
  reporterDni,
}: {
  toEmail: string;
  toName: string;
  reporterName: string;
  deceasedName: string;
  reporterDni: string;
}): Promise<void> {
  const transporter = createTransport();
  if (!transporter) {
    console.warn("[email] EMAIL_USER / EMAIL_PASS not set — skipping email send");
    return;
  }

  const from = `"Legado" <${process.env.EMAIL_USER}>`;

  const maskedDni = reporterDni.slice(0, 4) + "****" + reporterDni.slice(-1);

  const text = `
Hola ${toName},

Te informamos que ${reporterName} ha reportado el fallecimiento de ${deceasedName} en la plataforma Legado.

Como también eres contacto de confianza de ${deceasedName}, necesitamos que ingreses a legado.app y confirmes este reporte con tu propio DNI para que el administrador pueda revisar y, si corresponde, liberar el legado.

⚠️ ADVERTENCIA IMPORTANTE:
El reporte ha sido enviado usando el DNI ${maskedDni}. Si este reporte es falso o fraudulento, el DNI completo del responsable quedará registrado y será BLOQUEADO PERMANENTEMENTE del sistema. Nunca más podrá utilizar el servicio de Legado.

Legado toma muy en serio la integridad de estos procesos. Actuar de mala fe tiene consecuencias legales y el bloqueo permanente del acceso al servicio.

Si tú no eres ${toName} o recibes este correo por error, por favor ignóralo o contáctanos.

— Equipo de Legado
`.trim();

  const html = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; color: #7C3AED; margin: 0;">✦ Legado</h1>
  </div>

  <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${toName}</strong>,</p>

  <p style="font-size: 15px; line-height: 1.6;">
    Te informamos que <strong>${reporterName}</strong> ha reportado el fallecimiento de <strong>${deceasedName}</strong> en la plataforma Legado.
  </p>

  <p style="font-size: 15px; line-height: 1.6;">
    Como también eres contacto de confianza de ${deceasedName}, necesitamos que confirmes este reporte con tu propio DNI para que el administrador pueda revisar y, si corresponde, liberar el legado.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${process.env.APP_URL || "https://legado.app"}/report-death"
       style="background: #7C3AED; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; display: inline-block;">
      Confirmar reporte
    </a>
  </div>

  <div style="background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 12px; padding: 20px; margin: 24px 0;">
    <p style="margin: 0 0 8px; font-weight: 700; color: #C2410C; font-size: 14px;">⚠️ ADVERTENCIA IMPORTANTE</p>
    <p style="margin: 0; font-size: 14px; color: #9A3412; line-height: 1.6;">
      Este reporte ha sido enviado con el DNI <strong>${maskedDni}</strong>. Si el reporte es <strong>falso o fraudulento</strong>, el DNI completo del responsable quedará registrado y será <strong>BLOQUEADO PERMANENTEMENTE</strong> del sistema. Nunca más podrá utilizar el servicio de Legado.
    </p>
    <p style="margin: 12px 0 0; font-size: 13px; color: #9A3412;">
      Legado toma muy en serio la integridad de estos procesos. Actuar de mala fe tiene consecuencias legales y el bloqueo permanente del acceso al servicio.
    </p>
  </div>

  <p style="font-size: 13px; color: #6B7280; margin-top: 32px;">Si tú no eres ${toName} o recibes este correo por error, por favor ignóralo o contáctanos.</p>
  <p style="font-size: 13px; color: #6B7280;">— Equipo de Legado</p>
</div>
`.trim();

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Confirmación requerida: Reporte de fallecimiento de ${deceasedName}`,
    text,
    html,
  });
}
