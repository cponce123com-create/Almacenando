import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, balanceConnectorStateTable, balanceRecordsTable, balanceSyncRunsTable } from "@workspace/db";
import { and, asc, desc, eq, inArray, lte, notLike } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { generateId } from "../lib/id.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();
const activeStatuses = ["requested", "extracting", "preview", "confirming"] as const;

const itemSchema = z.object({
  warehouse: z.enum(["QA", "Q1", "QP", "QL", "QC"]),
  type: z.literal("Q"),
  code: z.string().trim().min(1).max(120),
  productDescription: z.string().trim().min(1).max(500),
  shortDescription: z.string().trim().max(500).optional().default(""),
  shortDescription: z.string().trim().max(500).optional().default(""),
  unit: z.string().trim().min(1).max(40),
  quantity: z.string().trim().max(40).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, "Cantidad decimal inválida"),
  locationSummary: z.string().max(1000).optional().default(""),
  zoneSummary: z.string().max(1000).optional().default(""),
});
const previewSchema = z.object({
  extractedAt: z.string().datetime({ offset: true }),
  balanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(itemSchema).min(1).max(5000),
});

function requireConnector(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.DATATEX_CONNECTOR_TOKEN;
  const supplied = req.header("x-datatex-token") ?? "";
  if (!expected) {
    res.status(503).json({ error: "El conector Datatex aún no está configurado en el servidor." });
    return;
  }
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    res.status(401).json({ error: "Credencial del conector inválida." });
    return;
  }
  next();
}

async function touchConnector() {
  const now = new Date();
  await db.insert(balanceConnectorStateTable)
    .values({ id: "datatex-now", lastSeenAt: now, lastError: null, updatedAt: now })
    .onConflictDoUpdate({
      target: balanceConnectorStateTable.id,
      set: { lastSeenAt: now, lastError: null, updatedAt: now },
    });
}

router.get("/status", requireAuth, asyncHandler(async (_req, res) => {
  const [connector] = await db.select().from(balanceConnectorStateTable)
    .where(eq(balanceConnectorStateTable.id, "datatex-now")).limit(1);
  const [latest] = await db.select({
    id: balanceSyncRunsTable.id,
    status: balanceSyncRunsTable.status,
    requestedAt: balanceSyncRunsTable.requestedAt,
    extractedAt: balanceSyncRunsTable.extractedAt,
    completedAt: balanceSyncRunsTable.completedAt,
    recordCount: balanceSyncRunsTable.recordCount,
    errorMessage: balanceSyncRunsTable.errorMessage,
    summary: balanceSyncRunsTable.summary,
  }).from(balanceSyncRunsTable)
    .where(notLike(balanceSyncRunsTable.id, "product-%"))
    .orderBy(desc(balanceSyncRunsTable.requestedAt)).limit(1);


  res.json({
    connectorConfigured: Boolean(process.env.DATATEX_CONNECTOR_TOKEN),
    connectorOnline: Boolean(process.env.DATATEX_CONNECTOR_TOKEN && connector?.lastSeenAt && Date.now() - connector.lastSeenAt.getTime() < 90_000),
    connectorLastSeenAt: connector?.lastSeenAt ?? null,
    latest: latest ? {
      id: latest.id,
      status: latest.status,
      requestedAt: latest.requestedAt,
      extractedAt: latest.extractedAt,
      completedAt: latest.completedAt,
      recordCount: latest.recordCount,
      errorMessage: latest.errorMessage,
      summary: latest?.summary ?? null,
    } : null,
  });
}));

router.get("/history", requireAuth, asyncHandler(async (_req, res) => {
  const runs = await db.select({
    id: balanceSyncRunsTable.id,
    status: balanceSyncRunsTable.status,
    requestedAt: balanceSyncRunsTable.requestedAt,
    extractedAt: balanceSyncRunsTable.extractedAt,
    completedAt: balanceSyncRunsTable.completedAt,
    recordCount: balanceSyncRunsTable.recordCount,
    errorMessage: balanceSyncRunsTable.errorMessage,
  }).from(balanceSyncRunsTable)
    .where(notLike(balanceSyncRunsTable.id, "product-%"))
    .orderBy(desc(balanceSyncRunsTable.requestedAt)).limit(30);
  res.json(runs);
}));

router.post("/request", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const active = await db.select({ id: balanceSyncRunsTable.id, status: balanceSyncRunsTable.status })
    .from(balanceSyncRunsTable)
    .where(inArray(balanceSyncRunsTable.status, [...activeStatuses]))
    .orderBy(asc(balanceSyncRunsTable.requestedAt))
    .limit(1);
  if (active[0]) {
    res.status(409).json({ error: "Ya existe una solicitud de sincronización en curso.", requestId: active[0].id });
    return;
  }
  const id = generateId();
  await db.insert(balanceSyncRunsTable).values({
    id,
    status: "requested",
    requestedBy: req.userId,
    requestedAt: new Date(),
  });
  void writeAuditLog({ userId: req.userId, action: "create", resource: "datatex_balance_sync_request", resourceId: id, ipAddress: req.ip as string });
  res.status(202).json({ id, status: "requested" });
}));

router.get("/connector/next", requireConnector, asyncHandler(async (_req, res) => {
  await touchConnector();
  await db.update(balanceSyncRunsTable).set({ status: "requested", claimedAt: null })
    .where(and(
      eq(balanceSyncRunsTable.status, "extracting"),
      lte(balanceSyncRunsTable.claimedAt, new Date(Date.now() - 10 * 60_000)),
    ));
  const [run] = await db.select({ id: balanceSyncRunsTable.id })
    .from(balanceSyncRunsTable)
    .where(eq(balanceSyncRunsTable.status, "requested"))
    .orderBy(asc(balanceSyncRunsTable.requestedAt))
    .limit(1);
  if (!run) {
    res.json({ request: null });
    return;
  }
  await db.update(balanceSyncRunsTable)
    .set({ status: "extracting", claimedAt: new Date(), errorMessage: null })
    .where(and(eq(balanceSyncRunsTable.id, run.id), eq(balanceSyncRunsTable.status, "requested")));
  const productMatch = run.id.match(/^product-(QA|Q1|QP|QL|QC)-/);
  res.json({ request: { id: run.id, kind: productMatch ? "products" : "balances", warehouse: productMatch?.[1] ?? null } });
}));

router.post("/connector/:id/preview", requireConnector, asyncHandler(async (req, res) => {
  await touchConnector();
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Extracción inválida.", details: parsed.error.issues.slice(0, 10) });
    return;
  }
  const keySet = new Set<string>();
  const unitSet = new Map<string, Set<string>>();
  for (const row of parsed.data.rows) {
    const key = [row.warehouse, row.code, row.unit, row.locationSummary, row.zoneSummary].join("\u0000");
    if (keySet.has(key)) {
      res.status(400).json({ error: "La extracción contiene filas duplicadas para el mismo almacén, producto, unidad, ubicación y zona." });
      return;
    }
    keySet.add(key);
    const productKey = [row.warehouse, row.code].join("\u0000");
    const units = unitSet.get(productKey) ?? new Set<string>();
    units.add(row.unit);
    unitSet.set(productKey, units);
  }
  const incompatibleUnits = [...unitSet.values()].filter(set => set.size > 1).length;
  const summary = {
    total: parsed.data.rows.length,
    QA: parsed.data.rows.filter(row => row.warehouse === "QA").length,
    Q1: parsed.data.rows.filter(row => row.warehouse === "Q1").length,
    QP: parsed.data.rows.filter(row => row.warehouse === "QP").length,
    QL: parsed.data.rows.filter(row => row.warehouse === "QL").length,
    QC: parsed.data.rows.filter(row => row.warehouse === "QC").length,
    productsWithMultipleUnits: incompatibleUnits,
  };
  const [updated] = await db.update(balanceSyncRunsTable).set({
    status: "preview",
    claimedAt: null,
    extractedAt: new Date(parsed.data.extractedAt),
    recordCount: parsed.data.rows.length,
    payload: { balanceDate: parsed.data.balanceDate, rows: parsed.data.rows },
    summary,
    errorMessage: null,
  }).where(and(
    eq(balanceSyncRunsTable.id, req.params.id as string),
    eq(balanceSyncRunsTable.status, "extracting"),
  )).returning({ id: balanceSyncRunsTable.id });
  if (!updated) {
    res.status(409).json({ error: "La solicitud ya no está activa o no existe." });
    return;
  }
  res.json({ status: "preview", summary });
}));

router.get("/:id/preview", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const [run] = await db.select({
    id: balanceSyncRunsTable.id,
    status: balanceSyncRunsTable.status,
    recordCount: balanceSyncRunsTable.recordCount,
    payload: balanceSyncRunsTable.payload,
    summary: balanceSyncRunsTable.summary,
  }).from(balanceSyncRunsTable)
    .where(and(eq(balanceSyncRunsTable.id, req.params.id as string), eq(balanceSyncRunsTable.status, "preview")))
    .limit(1);
  if (!run) {
    res.status(404).json({ error: "No existe una vista previa pendiente." });
    return;
  }
  const payload = run.payload as { rows?: unknown[] } | null;
  res.json({ id: run.id, recordCount: run.recordCount, summary: run.summary ?? null, rows: payload?.rows ?? [] });
}));

router.post("/:id/confirm", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const [run] = await db.select().from(balanceSyncRunsTable)
    .where(and(eq(balanceSyncRunsTable.id, req.params.id as string), eq(balanceSyncRunsTable.status, "preview")))
    .limit(1);
  if (!run) {
    res.status(404).json({ error: "No existe una extracción pendiente de confirmación." });
    return;
  }
  const payload = run.payload as { balanceDate: string; rows: z.infer<typeof itemSchema>[] };
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length !== run.recordCount) {
    res.status(409).json({ error: "La vista previa no supera la validación de integridad." });
    return;
  }

  if (payload.rows.some(row => !Number.isFinite(Number(row.quantity)))) {
    res.status(400).json({ error: "La extracción contiene cantidades fuera del rango numérico permitido." });
    return;
  }

  let conflict = false;
  await db.transaction(async (tx) => {
    const [claimed] = await tx.update(balanceSyncRunsTable).set({ status: "confirming" })
      .where(and(eq(balanceSyncRunsTable.id, run.id), eq(balanceSyncRunsTable.status, "preview")))
      .returning({ id: balanceSyncRunsTable.id });
    if (!claimed) {
      conflict = true;
      return;
    }
    await tx.insert(balanceRecordsTable).values(payload.rows.map(row => ({
      id: generateId(),
      warehouse: row.warehouse,
      type: row.type,
      code: row.code,
      productDescription: row.productDescription,
      shortDescription: row.shortDescription,
      unit: row.unit,
      quantity: Number(row.quantity),
      balanceDate: payload.balanceDate,
      batchId: run.id,
      source: "NOW",
      sourceRunId: run.id,
      locationSummary: row.locationSummary,
      zoneSummary: row.zoneSummary,
      registeredBy: req.userId,
    })));
    await tx.update(balanceSyncRunsTable).set({
      status: "completed",
      completedAt: new Date(),
    }).where(and(eq(balanceSyncRunsTable.id, run.id), eq(balanceSyncRunsTable.status, "confirming")));
  });
  if (conflict) {
    res.status(409).json({ error: "La extracción ya fue confirmada o cambió de estado." });
    return;
  }
  void writeAuditLog({ userId: req.userId, action: "create", resource: "datatex_balance_sync_confirm", resourceId: run.id, ipAddress: req.ip as string });
  res.json({ id: run.id, imported: run.recordCount, status: "completed" });
}));

router.post("/:id/reject", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const [updated] = await db.update(balanceSyncRunsTable).set({
    status: "rejected",
    completedAt: new Date(),
    payload: null,
    summary: null,
  }).where(and(eq(balanceSyncRunsTable.id, req.params.id as string), eq(balanceSyncRunsTable.status, "preview")))
    .returning({ id: balanceSyncRunsTable.id });
  if (!updated) {
    res.status(404).json({ error: "No existe una vista previa pendiente de rechazo." });
    return;
  }
  res.json({ id: updated.id, status: "rejected" });
}));

router.post("/connector/:id/fail", requireConnector, asyncHandler(async (req, res) => {
  await touchConnector();
  const message = z.string().max(500).safeParse(req.body?.error);
  const errorMessage = message.success ? message.data : "Error de extracción no especificado.";
  await db.update(balanceSyncRunsTable).set({
    status: "failed",
    claimedAt: null,
    completedAt: new Date(),
    errorMessage,
  }).where(and(eq(balanceSyncRunsTable.id, req.params.id as string), inArray(balanceSyncRunsTable.status, ["requested", "extracting"])));
  await db.update(balanceConnectorStateTable).set({ lastError: errorMessage, updatedAt: new Date() })
    .where(eq(balanceConnectorStateTable.id, "datatex-now"));
  res.json({ status: "failed" });
}));

export default router;
