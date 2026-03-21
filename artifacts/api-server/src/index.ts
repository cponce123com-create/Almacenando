import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminIfNeeded, backfillContactTokens } from "./lib/seed.js";
import { deliverPendingCapsules } from "./routes/time-capsules.js";
import { getEmailProviderStatus } from "./lib/email.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  logger.info({ port }, "Server listening");
  await seedAdminIfNeeded();
  await backfillContactTokens();
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
    console.log("✓ IA integración Replit activa (Anthropic)");
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log("✓ ANTHROPIC_API_KEY configurada");
  } else {
    console.warn("⚠️  Sin configuración de IA — el generador de testamentos no funcionará");
  }
  if (!process.env.RENIEC_API_TOKEN) {
    console.warn("⚠️  RENIEC_API_TOKEN no configurado — verificación de DNI deshabilitada");
  } else {
    console.log("✓ RENIEC_API_TOKEN configurado");
  }
  const emailProvider = getEmailProviderStatus();
  if (emailProvider === "resend") {
    console.log("✓ Email: Resend configurado");
  } else {
    console.warn("⚠️  Email: RESEND_API_KEY no configurado — los emails NO se enviarán");
  }
  scheduleCapsuleDelivery();
});

function scheduleCapsuleDelivery() {
  const runAt8amLima = () => {
    const now = new Date();
    const lima8am = new Date();
    lima8am.setUTCHours(13, 0, 0, 0);
    if (lima8am <= now) lima8am.setDate(lima8am.getDate() + 1);
    const msUntil = lima8am.getTime() - now.getTime();
    setTimeout(async () => {
      await deliverPendingCapsules();
      setInterval(deliverPendingCapsules, 24 * 60 * 60 * 1000);
    }, msUntil);
  };
  runAt8amLima();
  console.log("✓ Cron job de cápsulas del tiempo programado");
}
