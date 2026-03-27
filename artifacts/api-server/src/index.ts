import app from "./app";
import { logger } from "./lib/logger";
import { seedWarehouseData, purgeDemoData } from "./lib/seed.js";

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
  logger.info({ port }, "Almacén Químico API - Server listening");
  console.log(`✓ API Server running on port ${port}`);

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
