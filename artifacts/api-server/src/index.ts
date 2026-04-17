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

  // Validar la contraseña contra la política antes de crear el admin.
  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    logger.error(
      { issue: passwordCheck.error.issues[0]?.message },
      "ADMIN_PASSWORD no cumple la política de seguridad. El admin NO será creado automáticamente. Usa una contraseña con al menos 8 caracteres, 1 mayúscula y 1 número.",
    );
    return;
  }

  // Validar que el email sea válido.
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

app.listen(port, async () => {
  logger.info({ port }, "API Server running");

  await bootstrapAdminIfNeeded();

  void cleanupExpiredTokens();

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
