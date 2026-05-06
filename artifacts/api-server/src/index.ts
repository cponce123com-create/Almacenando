import app from "./app";
import { logger } from "./lib/logger";
import { seedWarehouseData, purgeDemoData } from "./lib/seed.js";
import { cleanupExpiredTokens, hashPassword } from "./lib/auth.js";
import { passwordSchema } from "./lib/password-schema.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { randomBytes } from "crypto";

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

async function bootstrapAdminIfNeeded() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  // Validar que la contraseña cumpla la política (8+ chars, 1 mayúscula, 1 número).
  // Si no cumple, NO creamos el admin — es más seguro abortar que tener un admin
  // con contraseña débil. El mensaje en el log explica qué pasó.
  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    logger.error(
      { issue: passwordCheck.error.issues[0]?.message },
      "ADMIN_PASSWORD no cumple la política de seguridad. El admin NO será creado automáticamente. Usa una contraseña con al menos 8 caracteres, 1 mayúscula y 1 número.",
    );
    return;
  }

  // Validar que el email tenga un formato válido antes de guardarlo en la DB.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logger.error({ email }, "ADMIN_EMAIL no tiene un formato válido. El admin NO será creado.");
    return;
  }

  try {
    const [{ total }] = await db.select({ total: count() }).from(usersTable);
    if (Number(total) > 0) return;

    const id = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password);
    await db.insert(usersTable).values({
      id,
      email,
      name: process.env.ADMIN_NAME ?? "Administrador",
      passwordHash,
      role: "admin",
      status: "active",
    });
    logger.info({ email }, "Bootstrap admin created (empty database detected)");
  } catch (err) {
    logger.warn({ err }, "Bootstrap admin check failed — server will continue");
  }
}

const server = app.listen(port, async () => {
  logger.info({ port }, "API Server running");

  // Auto-create first admin when the database is empty (production bootstrap)
  await bootstrapAdminIfNeeded();

  // Clean up any expired revoked tokens left over from a previous run.
  void cleanupExpiredTokens();

  // -------------------------------------------------------------------
  // Seed demo data SOLO si RUN_SEED=true está definido explícitamente.
  // Esto evita que cada deploy en Render sobreescriba datos reales.
  //
  // Para correr el seed manualmente:
  //   - En Render: ve a Environment → agrega RUN_SEED=true → redeploy
  //   - Después del primer deploy exitoso: elimina esa variable
  // -------------------------------------------------------------------
  if (process.env.RUN_SEED === "true") {
    logger.info("RUN_SEED=true — ejecutando seed de datos iniciales...");
    try {
      await seedWarehouseData();
      logger.info("Seed completado correctamente.");
    } catch (err) {
      logger.warn(
        { err },
        "Seed data could not be applied — server will continue running",
      );
    }
  } else {
    logger.info("Seed omitido (RUN_SEED != true). Los datos existentes no serán modificados.");
  }

  if (process.env.CLEANUP_DEMO_DATA === "true") {
    logger.info("CLEANUP_DEMO_DATA=true — eliminando datos demo (PROD-*)...");
    try {
      await purgeDemoData();
      logger.info("Datos demo eliminados correctamente.");
    } catch (err) {
      logger.warn({ err }, "Error eliminando datos demo — el servidor continuará.");
    }
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown — handles SIGTERM/SIGINT to close connections cleanly.
// Render sends SIGTERM with a 30s grace period before SIGKILL.
// ---------------------------------------------------------------------------
function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received — closing server...");
  server.close(() => {
    logger.info("Server closed. Exiting.");
    process.exit(0);
  });
  // Force exit after 10s if graceful close hangs
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
