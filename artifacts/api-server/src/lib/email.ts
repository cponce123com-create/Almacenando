import { Resend } from "resend";
import nodemailer from "nodemailer";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export function getEmailProviderStatus(): "resend" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}

async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const resend = getResend();
  if (resend) {
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Legado <noreply@legadoapp.com>";
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
    });
    return;
  }

  console.warn("[email] RESEND_API_KEY no configurado — email no enviado");
}

export async function sendDeathReportEmail({
  toEmail,
  toName,
  reporterName,
  deceasedName,
  reporterDni,
  confirmUrl,
}: {
  toEmail: string;
  toName: string;
  reporterName: string;
  deceasedName: string;
  reporterDni: string;
  confirmUrl: string;
}): Promise<void> {
  const maskedDni = reporterDni.slice(0, 4) + "****" + reporterDni.slice(-1);

  const text = `
Hola ${toName},

Te informamos que ${reporterName} ha reportado el fallecimiento de ${deceasedName} en la plataforma Legado.

Como también eres contacto de confianza de ${deceasedName}, necesitamos que confirmes este reporte con tu propio DNI para que el administrador pueda revisar y, si corresponde, liberar el legado.

Puedes confirmar el reporte desde este enlace:
${confirmUrl}

⚠️ ADVERTENCIA IMPORTANTE:
El reporte ha sido enviado usando el DNI ${maskedDni}. Si este reporte es falso o fraudulento, el DNI completo del responsable quedará registrado y será BLOQUEADO PERMANENTEMENTE del sistema. Nunca más podrá utilizar el servicio de Legado.

Legado toma muy en serio la integridad de estos procesos. Actuar de mala fe tiene consecuencias legales y el bloqueo permanente del acceso al servicio.

Si tú no eres ${toName} o recibes este correo por error, por favor ignóralo o contáctanos.

— Equipo de Legado
`.trim();

  const html = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; color: #9d174d; margin: 0;">✦ Legado</h1>
  </div>

  <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${toName}</strong>,</p>

  <p style="font-size: 15px; line-height: 1.6;">
    Te informamos que <strong>${reporterName}</strong> ha reportado el fallecimiento de <strong>${deceasedName}</strong> en la plataforma Legado.
  </p>

  <p style="font-size: 15px; line-height: 1.6;">
    Como también eres contacto de confianza de ${deceasedName}, necesitamos que confirmes este reporte con tu propio DNI para que el administrador pueda revisar y, si corresponde, liberar el legado.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${confirmUrl}"
       style="background: #9d174d; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; display: inline-block;">
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

  await sendEmail({
    to: toEmail,
    subject: `Confirmación requerida: Reporte de fallecimiento de ${deceasedName}`,
    html,
    text,
  });
}

export async function sendAccessLinkEmail({
  toEmail,
  toName,
  deceasedName,
  relationship,
  accessUrl,
}: {
  toEmail: string;
  toName: string;
  deceasedName: string;
  relationship: string;
  accessUrl: string;
}): Promise<void> {
  const text = `
Hola ${toName},

${deceasedName} dejó un legado especial para ti.

Sus contactos de confianza han confirmado su partida, y el mensaje que preparó para ti ya está disponible.

Accede a tu legado personal aquí:
${accessUrl}

Este enlace es único y personal — fue creado especialmente para ti como ${relationship} de ${deceasedName}.

Con cariño,
— Equipo de Legado
`.trim();

  const html = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; color: #9d174d; margin: 0;">✦ Legado</h1>
  </div>

  <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${toName}</strong>,</p>

  <div style="background: linear-gradient(135deg, #fdf2f8, #fce7f3); border-radius: 16px; padding: 24px; margin: 24px 0; text-align: center;">
    <p style="font-size: 18px; font-weight: 600; color: #9d174d; margin: 0 0 8px;">
      ${deceasedName} dejó un legado para ti
    </p>
    <p style="font-size: 14px; color: #be185d; margin: 0;">
      Un mensaje preparado con amor, esperando por ti
    </p>
  </div>

  <p style="font-size: 15px; line-height: 1.6; color: #374151;">
    Sus contactos de confianza han confirmado su partida. El mensaje que preparó especialmente para ti, como <strong>${relationship}</strong>, ya está disponible.
  </p>

  <div style="text-align: center; margin: 36px 0;">
    <a href="${accessUrl}"
       style="background: #9d174d; color: white; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
      Ver mi legado
    </a>
  </div>

  <p style="font-size: 13px; color: #6B7280; line-height: 1.6;">
    Este enlace es único y personal — fue creado exclusivamente para ti. Por favor no lo compartas con nadie.
  </p>

  <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
  <p style="font-size: 12px; color: #9CA3AF; text-align: center;">Con cariño, el Equipo de Legado</p>
</div>
`.trim();

  await sendEmail({
    to: toEmail,
    subject: `${deceasedName} dejó un legado para ti`,
    html,
    text,
  });
}

export async function sendEncryptionKeyEmail({
  toEmail,
  toName,
  ownerName,
  encryptionKey,
}: {
  toEmail: string;
  toName: string;
  ownerName: string;
  encryptionKey: string;
}): Promise<void> {
  const text = `
Hola ${toName},

${ownerName} confía en ti y ha compartido contigo la clave de acceso a su legado digital.

Esta clave será necesaria para descifrar los archivos que ${ownerName} ha dejado para sus seres queridos una vez que el legado sea liberado.

CLAVE DE DESCIFRADO:
${encryptionKey}

Guarda esta clave en un lugar seguro. Sin ella no podrás acceder al contenido del legado.

Con cariño,
El equipo de Legado
`;

  const html = `
  <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #fdf2f8; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 28px;">
      <p style="font-size: 32px; margin: 0;">🔑</p>
      <h2 style="color: #9d174d; font-size: 22px; margin: 8px 0 0;">Clave de acceso al legado</h2>
    </div>
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">Hola <strong>${toName}</strong>,</p>
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">
      <strong>${ownerName}</strong> confía en ti y ha compartido contigo la clave de acceso a su legado digital.
      Esta clave será necesaria para descifrar los archivos que dejó para sus seres queridos.
    </p>
    <div style="background: #1e1b4b; border-radius: 12px; padding: 20px 24px; margin: 24px 0; text-align: center;">
      <p style="color: #a5b4fc; font-size: 12px; margin: 0 0 8px; letter-spacing: 1px; text-transform: uppercase;">Clave de descifrado</p>
      <p style="color: #ffffff; font-family: monospace; font-size: 13px; word-break: break-all; margin: 0; letter-spacing: 1px;">${encryptionKey}</p>
    </div>
    <p style="font-size: 14px; color: #6B7280; line-height: 1.6;">
      Guarda esta clave en un lugar muy seguro. Sin ella no podrás acceder al contenido del legado cuando llegue el momento.
    </p>
    <p style="font-size: 13px; color: #9CA3AF; margin-top: 32px;">Con cariño, el equipo de Legado</p>
  </div>
  `;

  await sendEmail({
    to: toEmail,
    subject: `${ownerName} compartió contigo su clave de legado`,
    html,
    text,
  });
}

export async function sendTrustedContactInviteEmail({
  toEmail,
  toName,
  ownerName,
  relationship,
}: {
  toEmail: string;
  toName: string;
  ownerName: string;
  relationship: string;
}): Promise<void> {
  const text = `
Hola ${toName},

${ownerName} te ha designado como contacto de confianza en Legado, la plataforma de legado digital.

Como contacto de confianza (${relationship}), tendrás un papel importante: si ocurre algo con ${ownerName}, se te solicitará que confirmes el acontecimiento para que su legado digital pueda ser entregado a sus seres queridos.

No necesitas hacer nada por ahora. Cuando llegue el momento, recibirás un correo con un enlace personal para confirmar.

Con cariño,
— Equipo de Legado
`.trim();

  const html = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; color: #9d174d; margin: 0;">✦ Legado</h1>
  </div>

  <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${toName}</strong>,</p>

  <div style="background: linear-gradient(135deg, #fdf2f8, #fce7f3); border-radius: 16px; padding: 24px; margin: 24px 0;">
    <p style="font-size: 16px; font-weight: 600; color: #9d174d; margin: 0 0 8px;">
      ${ownerName} confía en ti
    </p>
    <p style="font-size: 14px; color: #be185d; margin: 0;">
      Has sido designado/a como su contacto de confianza en Legado
    </p>
  </div>

  <p style="font-size: 15px; line-height: 1.6; color: #374151;">
    Como <strong>${relationship}</strong> de ${ownerName}, tendrás un papel especial: si ocurre algo,
    se te pedirá que confirmes el acontecimiento para que su legado digital pueda ser
    entregado a sus seres queridos según sus deseos.
  </p>

  <div style="background: #F9FAFB; border-radius: 12px; padding: 16px; margin: 24px 0; border-left: 4px solid #9d174d;">
    <p style="margin: 0; font-size: 14px; color: #6B7280; line-height: 1.6;">
      <strong>No necesitas hacer nada por ahora.</strong> Cuando llegue el momento, recibirás
      un correo con un enlace personal y seguro para confirmar.
    </p>
  </div>

  <p style="font-size: 13px; color: #6B7280; margin-top: 32px;">
    Si no conoces a ${ownerName} o recibes este correo por error, puedes ignorarlo.
  </p>
  <p style="font-size: 13px; color: #6B7280;">— Equipo de Legado</p>
</div>
`.trim();

  await sendEmail({
    to: toEmail,
    subject: `${ownerName} te ha designado como contacto de confianza en Legado`,
    html,
    text,
  });
}

export async function sendTimeCapsuleEmail({
  toEmail,
  toName,
  fromName,
  capsuleTitle,
  accessUrl,
  createdAt,
}: {
  toEmail: string;
  toName: string;
  fromName: string;
  capsuleTitle: string;
  accessUrl: string;
  createdAt: Date;
}): Promise<void> {
  const createdYear = createdAt.getFullYear();
  const now = new Date();
  const yearsAgo = now.getFullYear() - createdYear;
  const timeAgoText =
    yearsAgo === 0
      ? "hace unos meses"
      : yearsAgo === 1
      ? "hace 1 año"
      : `hace ${yearsAgo} años`;

  const html = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fafaf8;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 28px; color: #7C3AED; margin: 0; letter-spacing: 1px;">✦ Legado</h1>
    <p style="color: #9CA3AF; font-size: 13px; margin-top: 4px;">Cápsula del Tiempo</p>
  </div>

  <div style="background: linear-gradient(135deg, #1e1b4b, #4C1D95); border-radius: 20px; padding: 32px; text-align: center; margin-bottom: 32px; color: white;">
    <div style="font-size: 48px; margin-bottom: 12px;">🕰️</div>
    <p style="font-size: 14px; color: #C4B5FD; margin: 0 0 8px; letter-spacing: 2px; text-transform: uppercase;">Una cápsula del tiempo</p>
    <h2 style="font-size: 24px; margin: 0 0 8px; color: white;">${capsuleTitle}</h2>
    <p style="font-size: 15px; color: #DDD6FE; margin: 0;">
      <strong>${fromName}</strong> la creó ${timeAgoText} especialmente para ti
    </p>
  </div>

  <p style="font-size: 16px; line-height: 1.7; color: #374151;">
    Hola <strong>${toName}</strong>,
  </p>
  <p style="font-size: 15px; line-height: 1.7; color: #374151;">
    Ha llegado el momento. <strong>${fromName}</strong> guardó un mensaje especial para ti
    — un video y una carta escritos con tiempo y cariño, esperando este día exacto para ser abiertos.
  </p>

  <div style="text-align: center; margin: 36px 0;">
    <a href="${accessUrl}"
       style="background: #7C3AED; color: white; text-decoration: none; padding: 18px 48px;
              border-radius: 14px; font-size: 17px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
      Abrir mi cápsula 🕰️
    </a>
  </div>

  <p style="font-size: 13px; color: #9CA3AF; text-align: center; line-height: 1.6;">
    Este enlace es único y fue creado exclusivamente para ti.<br/>
    No lo compartas con nadie más.
  </p>
  <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
  <p style="font-size: 12px; color: #9CA3AF; text-align: center;">
    Con cariño, el Equipo de Legado
  </p>
</div>`.trim();

  await sendEmail({
    to: toEmail,
    subject: `🕰️ ${fromName} te dejó una cápsula del tiempo: "${capsuleTitle}"`,
    html,
    text: `Hola ${toName}, ${fromName} te dejó una cápsula del tiempo. Ábrela aquí: ${accessUrl}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Notificación de cambio de lote (pesador de turno) — Almacén Químico
// ─────────────────────────────────────────────────────────────────────────────

export const LOT_CHANGE_RECIPIENTS = [
  "judith.yachachin@sanjacinto.com.pe",
  "laboratorio.quimico@sanjacinto.com.pe",
  "laboratorista.tintoreria@sanjacinto.com.pe",
  "controlistas.tintoreria@sanjacinto.com.pe",
  "ruben.roldan@sanjacinto.com.pe",
  "supervisor.tintoreria@sanjacinto.com.pe",
] as const;

export async function sendLotChangeNotificationEmail({
  productName,
  oldLot,
  newLot,
  productionOrder,
  senderName,
}: {
  productName: string;
  oldLot: string;
  newLot: string;
  productionOrder: string;
  senderName: string;
}): Promise<void> {
  const subject = `Notificación de Cambio de Lote - ${productName}`;

  const text = `Estimada Judith,

Espero que este mensaje le encuentre bien. Me complace informarle sobre
un cambio de lote en nuestro proceso de producción:

- Colorante: ${productName}
- Lote Antiguo: ${oldLot}
- Nuevo Lote: ${newLot}
- Orden de Producción: ${productionOrder}

Este cambio ha sido realizado de manera cuidadosa y siguiendo nuestros
procedimientos internos de calidad. Quedamos a su disposición para
cualquier pregunta o aclaración adicional.

Saludos Cordiales.

Atentamente,
${senderName} - Pesador de Turno`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#f8fafc;padding:0;">

  <div style="background:#1e3a5f;padding:24px 28px;border-radius:12px 12px 0 0;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:38px;height:38px;background:#3b82f6;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;">🧪</div>
      <div>
        <p style="margin:0;color:#93c5fd;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Almacén Químico</p>
        <p style="margin:2px 0 0;color:#ffffff;font-size:16px;font-weight:700;">Notificación de Cambio de Lote</p>
      </div>
    </div>
  </div>

  <div style="background:#ffffff;padding:28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">Estimada Judith,</p>
    <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">
      Espero que este mensaje le encuentre bien. Me complace informarle sobre
      un cambio de lote en nuestro proceso de producción:
    </p>

    <div style="background:#f1f5f9;border-radius:10px;padding:20px 24px;margin-bottom:20px;border-left:4px solid #3b82f6;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;width:45%;font-weight:500;">Colorante</td>
          <td style="padding:7px 0;font-size:14px;color:#1e293b;font-weight:700;">${productName}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;font-weight:500;">Lote Antiguo</td>
          <td style="padding:7px 0;font-size:14px;color:#1e293b;font-family:monospace;">${oldLot}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;font-weight:500;">Nuevo Lote</td>
          <td style="padding:7px 0;font-size:14px;color:#1e293b;font-family:monospace;font-weight:600;">${newLot}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;font-weight:500;">Orden de Producción</td>
          <td style="padding:7px 0;font-size:14px;color:#1e293b;">${productionOrder}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
      Este cambio ha sido realizado de manera cuidadosa y siguiendo nuestros
      procedimientos internos de calidad. Quedamos a su disposición para
      cualquier pregunta o aclaración adicional.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;">Saludos Cordiales.</p>
  </div>

  <div style="background:#f1f5f9;padding:16px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="margin:0;font-size:13px;color:#1e293b;font-weight:600;">Atentamente,</p>
    <p style="margin:4px 0 0;font-size:13px;color:#475569;">${senderName} — Pesador de Turno</p>
    <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">Notificación automática · Sistema de Gestión de Almacén Químico</p>
  </div>
</div>`.trim();

  const smtpPass = process.env.SMTP_APP_PASSWORD;
  if (!smtpPass) {
    console.warn("[email-smtp] SMTP_APP_PASSWORD no configurado — notificación de cambio de lote no enviada");
    return;
  }

  const SMTP_USER = "carlos.ponce@sanjacinto.com.pe";

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Almacén Químico" <${SMTP_USER}>`,
    to: [...LOT_CHANGE_RECIPIENTS],
    subject,
    text,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Notificación de cambio de lote — Almacén Químico
// ─────────────────────────────────────────────────────────────────────────────

export async function sendDyeLotNotificationEmail({
  toEmail,
  toName,
  lotNumber,
  productName,
  changeType,
  changedByName,
  qualityStatus,
  quantity,
  supplier,
  notes,
  appUrl,
}: {
  toEmail: string;
  toName: string;
  lotNumber: string;
  productName: string;
  changeType: "created" | "updated" | "status_changed";
  changedByName: string;
  qualityStatus: string;
  quantity: string;
  supplier?: string;
  notes?: string;
  appUrl: string;
}): Promise<void> {
  const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    pending:  { label: "Pendiente",  color: "#92400E", bg: "#FEF3C7" },
    approved: { label: "Aprobado",   color: "#065F46", bg: "#D1FAE5" },
    rejected: { label: "Rechazado",  color: "#991B1B", bg: "#FEE2E2" },
  };
  const changeLabels: Record<string, string> = {
    created:        "Nuevo lote registrado",
    updated:        "Lote actualizado",
    status_changed: "Estado de lote modificado",
  };

  const status = statusLabels[qualityStatus] ?? statusLabels["pending"];
  const changeLabel = changeLabels[changeType] ?? "Cambio en lote";

  const text = `
Hola ${toName},

${changeLabel}: Lote ${lotNumber} — ${productName}

Estado de calidad: ${status.label}
Cantidad: ${quantity}
${supplier ? `Proveedor: ${supplier}` : ""}
Registrado/modificado por: ${changedByName}
${notes ? `Notas: ${notes}` : ""}

Accede al sistema para más detalles: ${appUrl}

— Sistema de Gestión de Almacén Químico
  `.trim();

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; background: #f8fafc; padding: 0;">

  <div style="background: #1e3a5f; padding: 28px 32px; border-radius: 12px 12px 0 0;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 40px; height: 40px; background: #3b82f6; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">🧪</div>
      <div>
        <p style="margin: 0; color: #93c5fd; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Almacén Químico</p>
        <p style="margin: 2px 0 0; color: #ffffff; font-size: 17px; font-weight: 700;">${changeLabel}</p>
      </div>
    </div>
  </div>

  <div style="background: #ffffff; padding: 28px 32px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
    <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">
      Hola <strong>${toName}</strong>, se ha registrado un cambio en el siguiente lote:
    </p>

    <div style="background: #f1f5f9; border-radius: 10px; padding: 20px 24px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
      <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #1e293b;">Lote ${lotNumber}</p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #64748b;">${productName}</p>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 45%;">Estado de calidad</td>
          <td style="padding: 6px 0;">
            <span style="background: ${status.bg}; color: ${status.color}; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">${status.label}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Cantidad</td>
          <td style="padding: 6px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${quantity}</td>
        </tr>
        ${supplier ? `
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Proveedor</td>
          <td style="padding: 6px 0; font-size: 13px; color: #1e293b;">${supplier}</td>
        </tr>` : ""}
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Modificado por</td>
          <td style="padding: 6px 0; font-size: 13px; color: #1e293b;">${changedByName}</td>
        </tr>
        ${notes ? `
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b; vertical-align: top;">Notas</td>
          <td style="padding: 6px 0; font-size: 13px; color: #1e293b; line-height: 1.5;">${notes}</td>
        </tr>` : ""}
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0 8px;">
      <a href="${appUrl}" style="background: #3b82f6; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
        Ver en el sistema →
      </a>
    </div>
  </div>

  <div style="background: #f1f5f9; padding: 16px 32px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
      Notificación automática del Sistema de Gestión de Almacén Químico.<br/>
      Recibes este correo porque tienes habilitadas las notificaciones de lotes.
    </p>
  </div>
</div>
  `.trim();

  await sendEmail({
    to: toEmail,
    subject: `[Almacén] ${changeLabel}: Lote ${lotNumber} — ${productName}`,
    html,
    text,
  });
}
