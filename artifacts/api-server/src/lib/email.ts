import nodemailer from "nodemailer";
import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function getGmailTransport(): nodemailer.Transporter | null {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
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
    await resend.emails.send({
      from: "Legado <noreply@legadoapp.com>",
      to,
      subject,
      html,
      text,
    });
    return;
  }

  const transport = getGmailTransport();
  if (transport) {
    await transport.sendMail({
      from: `"Legado" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });
    return;
  }

  console.warn("[email] No email provider configured — skipping send");
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
