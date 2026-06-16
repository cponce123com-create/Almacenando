import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const START_TIME = Date.now();

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
  const checks: Record<string, string> = {};

  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "connected";
  } catch (err) {
    logger.error({ err }, "[healthz] Database health check failed");
    checks.db = "unreachable";
  }

  const isHealthy = checks.db === "connected";

  const mem = process.memoryUsage();
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "error",
    ...checks,
    uptime,
    uptimeHuman: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + "MB",
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB",
    },
    node: process.version,
    timestamp: new Date().toISOString(),
  });
});

export default router;
