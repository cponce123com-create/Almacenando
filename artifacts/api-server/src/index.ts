import app from "./app";
import { logger } from "./lib/logger";
import { seedWarehouseData } from "./lib/seed.js";

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

  // Seed demo data only after the server is up.
  // Migrations must have already been applied before this process starts
  // (see start.sh — migrations run first, then this server is launched).
  try {
    await seedWarehouseData();
  } catch (err) {
    logger.warn(
      { err },
      "Seed data could not be applied — server will continue running",
    );
  }
});
