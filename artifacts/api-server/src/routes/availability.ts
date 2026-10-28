import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod/v4";
import { db, balanceConnectorStateTable, balanceSyncRunsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { generateId } from "../lib/id.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();
const activeStatuses = ["requested", "extracting"] as const;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const requestSchema = z.object({
  warehouse: z.enum(["Q1"]),
  consumptionStart: dateSchema,
  consumptionEnd: dateSchema,
  q1MovementsStart: dateSchema,
  q1MovementsEnd: dateSchema,
  qpMovementsStart: dateSchema,
  qpMovementsEnd: dateSchema,
}).refine(data => data.consumptionStart <= data.consumptionEnd
  && data.q1MovementsStart <= data.q1MovementsEnd
  && data.qpMovementsStart <= data.qpMovementsEnd, "La fecha inicial debe ser anterior a la fecha final.");

const rowSchema = z.object({
  code: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  lineStatus: z.enum(["Linea", "No Linea"]),
  unit: z.string().trim().min(1).max(40),
  productionReservations: z.string().max(40),
  internalOrders: z.string().max(40),
  internalDocuments: z.string().max(40),
  consumptionTwoDays: z.string().max(40),
  qpMovements: z.string().max(40),
  q1Movements: z.string().max(40),
  q1Balance: z.string().max(40),
  availability: z.string().max(40),
  qaLot: z.string().max(120),
  qaQuantity: z.string().max(40),
  qaZone: z.string().max(120),
  qaLocation: z.string().max(120),
  qdBalance: z.string().max(40),
  qdPreparation: z.string().max(40),
});

const resultSchema = z.object({
  extractedAt: z.string().datetime({ offset: true }),
  config: requestSchema,
  rows: z.array(rowSchema).max(5000),
}).refine(data => data.rows.length > 0, "La consulta no devolvió productos químicos.");

router.get("/status", requireAuth, requireRole("admin", "supervisor", "operator"), asyncHandler(async (_req, res) => {
  const [latest] = await db.select({
    id: balanceSyncRunsTable.id,
    status: balanceSyncRunsTable.status,
    requestedAt: balanceSyncRunsTable.requestedAt,
    extractedAt: balanceSyncRunsTable.extractedAt,
    completedAt: balanceSyncRunsTable.completedAt,
    recordCount: balanceSyncRunsTable.recordCount,
    errorMessage: balanceSyncRunsTable.errorMessage,
  }).from(balanceSyncRunsTable)
    .where(like(balanceSyncRunsTable.id, "availability-%"))
    .orderBy(desc(balanceSyncRunsTable.requestedAt)).limit(1);
  const [connector] = await db.select({ lastSeenAt: balanceConnectorStateTable.lastSeenAt })
    .from(balanceConnectorStateTable).where(eq(balanceConnectorStateTable.id, "datatex-now")).limit(1);
  res.json({
    latest: latest ?? null,
    connectorOnline: Boolean(connector?.lastSeenAt && Date.now() - connector.lastSeenAt.getTime() < 90_000),
    connectorLastSeenAt: connector?.lastSeenAt ?? null,
  });
}));

router.get("/latest", requireAuth, requireRole("admin", "supervisor", "operator"), asyncHandler(async (_req, res) => {
  const [run] = await db.select({
    id: balanceSyncRunsTable.id,
    extractedAt: balanceSyncRunsTable.extractedAt,
    payload: balanceSyncRunsTable.payload,
  }).from(balanceSyncRunsTable).where(and(
    like(balanceSyncRunsTable.id, "availability-%"),
    eq(balanceSyncRunsTable.status, "completed"),
  )).orderBy(desc(balanceSyncRunsTable.requestedAt)).limit(1);
  const payload = run?.payload as { rows?: unknown[]; config?: unknown } | null;
  res.json({ id: run?.id ?? null, extractedAt: run?.extractedAt ?? null, config: payload?.config ?? null, rows: payload?.rows ?? [] });
}));

router.post("/request", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Configuración de fechas inválida." });
    return;
  }
  const [active] = await db.select({ id: balanceSyncRunsTable.id }).from(balanceSyncRunsTable)
    .where(and(like(balanceSyncRunsTable.id, "availability-%"), inArray(balanceSyncRunsTable.status, [...activeStatuses])))
    .orderBy(asc(balanceSyncRunsTable.requestedAt)).limit(1);
  if (active) {
    res.status(409).json({ error: "Ya hay una consulta de disponibilidad en curso.", requestId: active.id });
    return;
  }
  const id = `availability-${generateId()}`;
  await db.insert(balanceSyncRunsTable).values({
    id,
    status: "requested",
    requestedBy: req.userId,
    requestedAt: new Date(),
    payload: parsed.data,
  });
  void writeAuditLog({ userId: req.userId, action: "create", resource: "availability_request", resourceId: id, ipAddress: req.ip as string });
  res.status(202).json({ id, status: "requested" });
}));

router.post("/connector/:id/result", (req, res, next) => {
  // Reuse the configured NOW connector credential without exposing it to the browser.
  const expected = process.env.DATATEX_CONNECTOR_TOKEN;
  const supplied = req.header("x-datatex-token") ?? "";
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    res.status(expected ? 401 : 503).json({ error: "Credencial del conector inválida o no configurada." });
    return;
  }
  next();
}, asyncHandler(async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Resultado de disponibilidad inválido." });
    return;
  }
  const [updated] = await db.update(balanceSyncRunsTable).set({
    status: "completed",
    extractedAt: new Date(parsed.data.extractedAt),
    completedAt: new Date(),
    recordCount: parsed.data.rows.length,
    payload: { rows: parsed.data.rows, config: parsed.data.config },
    errorMessage: null,
  }).where(and(
    eq(balanceSyncRunsTable.id, req.params.id as string),
    like(balanceSyncRunsTable.id, "availability-%"),
    eq(balanceSyncRunsTable.status, "extracting"),
  )).returning({ id: balanceSyncRunsTable.id });
  if (!updated) {
    res.status(409).json({ error: "La solicitud de disponibilidad ya no está activa." });
    return;
  }
  res.json({ status: "completed", recordCount: parsed.data.rows.length });
}));

export default router;
