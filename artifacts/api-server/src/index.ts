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
  await seedWarehouseData();
});
