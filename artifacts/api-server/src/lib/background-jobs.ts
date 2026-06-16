/**
 * Background Jobs — Sistema ligero de trabajos programados
 *
 * Wrapper sobre node-cron que agrega:
 * - Seguimiento de estado en memoria
 * - Reintentos automáticos con backoff exponencial
 * - Última ejecución / próxima ejecución
 * - Endpoint de monitoreo
 *
 * NOTA: Los jobs corren en el mismo proceso. Si el servidor se reinicia,
 * los jobs se re-registran al arrancar (no hay persistencia de cola).
 * Para persistencia verdadera, migrar a BullMQ + Redis.
 */

import cron from "node-cron";
import { logger } from "./logger.js";

export type JobStatus = "running" | "completed" | "failed" | "skipped";
export type JobSchedule = "daily_7am" | "startup";

interface JobRun {
  startedAt: Date;
  finishedAt?: Date;
  status: JobStatus;
  durationMs?: number;
  error?: string;
  retries: number;
}

interface JobDefinition {
  name: string;
  schedule: JobSchedule;
  cronExpression?: string;
  fn: () => Promise<unknown>;
  maxRetries: number;
  retryDelayMs: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000; // 5 seconds between retries

// ── Registry ──────────────────────────────────────────────────────────────────

const jobs = new Map<string, JobDefinition>();
const runHistory = new Map<string, JobRun[]>();
const cronTasks = new Map<string, cron.ScheduledTask>();

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Registra un background job.
 *
 * @param name - Nombre único del job (ej: "check-low-stock")
 * @param schedule - Schedule: "daily_7am" | "startup"
 * @param fn - Función asíncrona a ejecutar
 * @param maxRetries - Reintentos máximos (default: 3)
 * @param retryDelayMs - Espera entre reintentos en ms (default: 5000)
 */
export function registerJob(
  name: string,
  schedule: JobSchedule,
  fn: () => Promise<unknown>,
  maxRetries = MAX_RETRIES,
  retryDelayMs = RETRY_DELAY_MS,
): void {
  if (jobs.has(name)) {
    logger.warn({ jobName: name }, "Job already registered, skipping");
    return;
  }

  const cronMap: Record<JobSchedule, string | undefined> = {
    daily_7am: "0 7 * * *",
    startup: undefined, // Runs once on startup, not on cron
  };

  jobs.set(name, {
    name,
    schedule,
    cronExpression: cronMap[schedule],
    fn,
    maxRetries,
    retryDelayMs,
  });

  runHistory.set(name, []);

  if (cronMap[schedule]) {
    const task = cron.schedule(cronMap[schedule]!, () => {
      void executeJob(name);
    });
    cronTasks.set(name, task);
    logger.info({ jobName: name, schedule, cron: cronMap[schedule] }, "Background job registered");
  } else if (schedule === "startup") {
    logger.info({ jobName: name, schedule: "startup" }, "Startup job registered");
  }
}

// ── Execution ─────────────────────────────────────────────────────────────────

async function executeJob(name: string): Promise<void> {
  const def = jobs.get(name);
  if (!def) {
    logger.error({ jobName: name }, "Cannot execute unknown job");
    return;
  }

  const run: JobRun = {
    startedAt: new Date(),
    status: "running",
    retries: 0,
  };

  const history = runHistory.get(name)!;
  history.push(run);

  try {
    await runWithRetry(def, run);
    run.status = "completed";
    run.finishedAt = new Date();
    run.durationMs = run.finishedAt.getTime() - run.startedAt.getTime();
    logger.info({ jobName: name, durationMs: run.durationMs }, "Background job completed");
  } catch (err) {
    run.status = "failed";
    run.finishedAt = new Date();
    run.durationMs = run.finishedAt.getTime() - run.startedAt.getTime();
    run.error = err instanceof Error ? err.message : String(err);
    logger.error({ jobName: name, error: run.error, retries: run.retries }, "Background job failed");
  }
}

async function runWithRetry(def: JobDefinition, run: JobRun): Promise<void> {
  for (let attempt = 0; attempt <= def.maxRetries; attempt++) {
    try {
      await def.fn();
      return; // Success
    } catch (err) {
      run.retries = attempt + 1;
      if (attempt < def.maxRetries) {
        logger.warn(
          { jobName: def.name, attempt: attempt + 1, maxRetries: def.maxRetries },
          `Background job failed, retrying in ${def.retryDelayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, def.retryDelayMs));
      } else {
        throw err; // Re-throw after exhausting retries
      }
    }
  }
}

// ── Startup jobs ──────────────────────────────────────────────────────────────

/**
 * Ejecuta todos los jobs registrados como "startup" (con un pequeño retraso).
 */
export function runStartupJobs(delayMs = 10_000): void {
  const startupJobs = Array.from(jobs.values()).filter((j) => j.schedule === "startup");

  if (startupJobs.length === 0) return;

  setTimeout(async () => {
    logger.info({ jobs: startupJobs.map((j) => j.name) }, "Running startup background jobs");
    for (const job of startupJobs) {
      await executeJob(job.name);
    }
  }, delayMs);
}

// ── Getters para monitoreo ────────────────────────────────────────────────────

export interface JobStatusReport {
  name: string;
  schedule: JobSchedule;
  cronExpression?: string;
  maxRetries: number;
  lastRun: JobRun | null;
  totalRuns: number;
  last5Runs: JobRun[];
}

export function getJobStatus(name: string): JobStatusReport | null {
  const def = jobs.get(name);
  if (!def) return null;

  const history = runHistory.get(name) ?? [];
  return {
    name: def.name,
    schedule: def.schedule,
    cronExpression: def.cronExpression,
    maxRetries: def.maxRetries,
    lastRun: history[history.length - 1] ?? null,
    totalRuns: history.length,
    last5Runs: history.slice(-5),
  };
}

export function getAllJobStatuses(): JobStatusReport[] {
  return Array.from(jobs.keys()).map((name) => getJobStatus(name)!);
}

/**
 * Detiene todos los jobs (para graceful shutdown).
 */
export function stopAllJobs(): void {
  for (const [name, task] of cronTasks) {
    task.stop();
    logger.info({ jobName: name }, "Background job stopped");
  }
  cronTasks.clear();
}
