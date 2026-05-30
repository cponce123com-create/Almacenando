import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/**
 * GET /healthz
 *
 * Render's health-check endpoint — called every 30s.
 * Returns 200 only when the database is reachable.
 * Returns 503 if the DB is down so Render can restart the service automatically.
 *
 * BEFORE: only checked that the Node.js process was alive (no DB test).
 * AFTER:  runs a lightweight "SELECT 1" to verify the DB connection.
 */
router.get("/healthz", async (_req, res) => {
  try {
    // Lightweight DB ping — fails fast if PostgreSQL is unreachable
    await db.execute(sql`SELECT 1`);

    res.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "[healthz] Database health check failed");

    // 503 tells Render the service is unhealthy → triggers automatic restart
    res.status(503).json({
      status: "error",
      db: "unreachable",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
