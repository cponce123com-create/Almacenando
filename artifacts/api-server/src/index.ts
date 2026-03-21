import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminIfNeeded, backfillContactTokens } from "./lib/seed.js";

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
});
