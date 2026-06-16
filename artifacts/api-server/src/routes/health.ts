import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getAllJobStatuses } from "../lib/background-jobs.js";

const router: IRouter = Router();

const START_TIME = Date.now();
let requestCount = 0;

// Simple in-process request counter
router.use((_req, _res, next) => {
  requestCount++;
  next();
});

/**
 * GET /healthz
 *
 * Render's health-check endpoint — called every 30s.
 * Returns 200 only when the database is reachable.
 * Returns 503 if the DB is down so Render can restart the service automatically.
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

/**
 * GET /metrics
 *
 * Endpoint de métricas ligeras (sin Prometheus).
 * Expone métricas básicas de proceso para monitoreo manual o tools como Render Metrics.
 */
router.get("/metrics", async (_req, res) => {
  const mem = process.memoryUsage();
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  const cpus = (await import("os")).cpus().length;

  // Event loop lag aproximado (diferencia entre setImmediate real y esperado)
  const lagStart = Date.now();
  await new Promise<void>((resolve) => setImmediate(() => resolve()));
  const eventLoopLag = Date.now() - lagStart;

  const metrics = [
    `# HELP process_uptime_seconds Time since process started`,
    `# TYPE process_uptime_seconds gauge`,
    `process_uptime_seconds ${uptime}`,
    ``,
    `# HELP process_memory_rss_bytes Resident Set Size`,
    `# TYPE process_memory_rss_bytes gauge`,
    `process_memory_rss_bytes ${mem.rss}`,
    ``,
    `# HELP process_memory_heap_used_bytes V8 heap used`,
    `# TYPE process_memory_heap_used_bytes gauge`,
    `process_memory_heap_used_bytes ${mem.heapUsed}`,
    ``,
    `# HELP process_memory_heap_total_bytes V8 heap total`,
    `# TYPE process_memory_heap_total_bytes gauge`,
    `process_memory_heap_total_bytes ${mem.heapTotal}`,
    ``,
    `# HELP process_cpus_available Number of CPU cores`,
    `# TYPE process_cpus_available gauge`,
    `process_cpus_available ${cpus}`,
    ``,
    `# HELP process_event_loop_lag_ms Approximate event loop lag`,
    `# TYPE process_event_loop_lag_ms gauge`,
    `process_event_loop_lag_ms ${eventLoopLag}`,
    ``,
    `# HELP http_requests_total Total HTTP requests processed`,
    `# TYPE http_requests_total counter`,
    `http_requests_total ${requestCount}`,
    ``,
    `# HELP node_version_info Node.js version`,
    `# TYPE node_version_info gauge`,
    `node_version_info{version="${process.version}"} 1`,
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200).end(metrics);
});

/**
 * GET /jobs
 *
 * Monitoreo de background jobs: estado actual, última ejecución,
 * total de ejecuciones, historial reciente.
 */
router.get("/jobs", (_req, res) => {
  const jobs = getAllJobStatuses();
  res.json({
    count: jobs.length,
    jobs,
  });
});

export default router;
