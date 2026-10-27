import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, balanceSyncRunsTable, productsTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { generateId } from "../lib/id.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();
const activeStatuses = ["requested", "extracting", "preview", "confirming"] as const;
const warehouses = ["QA", "Q1", "QP", "QL", "QC"] as const;
const rowSchema = z.object({
  warehouse: z.enum(warehouses),
  type: z.literal("Q"),
  code: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(40),
  location: z.string().max(1000).optional().default(""),
});
const previewSchema = z.object({
  extractedAt: z.string().datetime({ offset: true }),
  rows: z.array(rowSchema).min(1).max(5000),
});

function requireConnector(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.DATATEX_CONNECTOR_TOKEN ?? "";
  const supplied = req.header("x-datatex-token") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Credencial del conector inválida o no configurada." });
    return;
  }
  next();
}

router.post("/request", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ warehouse: z.enum(["QA", "Q1", "QP", "QL", "QC", "all"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Selecciona un almacén válido." }); return; }
  const [active] = await db.select({ id: balanceSyncRunsTable.id }).from(balanceSyncRunsTable)
    .where(inArray(balanceSyncRunsTable.status, [...activeStatuses])).limit(1);
  if (active) { res.status(409).json({ error: "Ya existe una sincronización en curso." }); return; }
  const id = "product-" + parsed.data.warehouse + "-" + generateId();
  await db.insert(balanceSyncRunsTable).values({ id, status: "requested", requestedBy: req.userId, requestedAt: new Date() });
  void writeAuditLog({ userId: req.userId, action: "create", resource: "now_product_sync_request", resourceId: id, ipAddress: req.ip as string });
  res.status(202).json({ id, status: "requested", warehouse: parsed.data.warehouse });
}));

router.get("/status/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!id.startsWith("product-")) { res.status(404).json({ error: "Solicitud de productos no encontrada." }); return; }
  const [run] = await db.select({
    id: balanceSyncRunsTable.id, status: balanceSyncRunsTable.status,
    recordCount: balanceSyncRunsTable.recordCount, errorMessage: balanceSyncRunsTable.errorMessage,
  }).from(balanceSyncRunsTable).where(eq(balanceSyncRunsTable.id, id)).limit(1);
  if (!run) { res.status(404).json({ error: "Solicitud no encontrada." }); return; }
  res.json(run);
}));

router.post("/:id/preview", requireConnector, asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const parsed = previewSchema.safeParse(req.body);
  if (!id.startsWith("product-") || !parsed.success) {
    res.status(400).json({ error: "Vista previa de productos inválida.", details: parsed.success ? undefined : parsed.error.issues.slice(0, 10) });
    return;
  }
  const keys = new Set<string>();
  for (const row of parsed.data.rows) {
    const key = row.warehouse + "::" + row.code;
    if (keys.has(key)) { res.status(400).json({ error: "El código Q está repetido para el almacén." }); return; }
    keys.add(key);
  }
  const [updated] = await db.update(balanceSyncRunsTable).set({
    status: "preview", claimedAt: null, extractedAt: new Date(parsed.data.extractedAt),
    recordCount: parsed.data.rows.length, payload: { rows: parsed.data.rows },
    summary: { total: parsed.data.rows.length }, errorMessage: null,
  }).where(and(eq(balanceSyncRunsTable.id, id), eq(balanceSyncRunsTable.status, "extracting")))
    .returning({ id: balanceSyncRunsTable.id });
  if (!updated) { res.status(409).json({ error: "La solicitud ya no está activa." }); return; }
  res.json({ status: "preview", recordCount: parsed.data.rows.length });
}));

router.get("/:id/preview", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [run] = await db.select({
    id: balanceSyncRunsTable.id, recordCount: balanceSyncRunsTable.recordCount, payload: balanceSyncRunsTable.payload,
  }).from(balanceSyncRunsTable)
    .where(and(eq(balanceSyncRunsTable.id, id), eq(balanceSyncRunsTable.status, "preview"))).limit(1);
  if (!run || !id.startsWith("product-")) { res.status(404).json({ error: "No hay vista previa pendiente." }); return; }
  const payload = run.payload as { rows?: unknown[] } | null;
  res.json({ id: run.id, recordCount: run.recordCount, rows: payload?.rows ?? [] });
}));

router.post("/:id/confirm", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const id = req.params.id as string;
  const [run] = await db.select().from(balanceSyncRunsTable)
    .where(and(eq(balanceSyncRunsTable.id, id), eq(balanceSyncRunsTable.status, "preview"))).limit(1);
  if (!run || !id.startsWith("product-")) { res.status(404).json({ error: "No hay vista previa pendiente." }); return; }
  const payload = run.payload as { rows: z.infer<typeof rowSchema>[] } | null;
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length !== run.recordCount) {
    res.status(409).json({ error: "La vista previa no supera la validación." }); return;
  }
  let conflict = false;
  await db.transaction(async tx => {
    const [claimed] = await tx.update(balanceSyncRunsTable).set({ status: "confirming" })
      .where(and(eq(balanceSyncRunsTable.id, id), eq(balanceSyncRunsTable.status, "preview")))
      .returning({ id: balanceSyncRunsTable.id });
    if (!claimed) { conflict = true; return; }
    await tx.insert(productsTable).values(payload.rows.map(row => ({
      id: generateId(), warehouse: row.warehouse, type: "Q", code: row.code, name: row.name,
      category: "Químicos", unit: row.unit, location: row.location, minimumStock: 0,
    }))).onConflictDoUpdate({
      target: [productsTable.warehouse, productsTable.code],
      set: {
        type: sql.raw("excluded.type"), name: sql.raw("excluded.name"),
        unit: sql.raw("excluded.unit"), location: sql.raw("excluded.location"), updatedAt: new Date(),
      },
    });
    await tx.update(balanceSyncRunsTable).set({ status: "completed", completedAt: new Date() })
      .where(and(eq(balanceSyncRunsTable.id, id), eq(balanceSyncRunsTable.status, "confirming")));
  });
  if (conflict) { res.status(409).json({ error: "La importación ya fue confirmada." }); return; }
  void writeAuditLog({ userId: req.userId, action: "create", resource: "now_product_sync_confirm", resourceId: id, details: { count: run.recordCount }, ipAddress: req.ip as string });
  res.json({ id, imported: run.recordCount, status: "completed" });
}));

router.post("/:id/reject", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [updated] = await db.update(balanceSyncRunsTable).set({
    status: "rejected", completedAt: new Date(), payload: null, summary: null,
  }).where(and(eq(balanceSyncRunsTable.id, id), eq(balanceSyncRunsTable.status, "preview")))
    .returning({ id: balanceSyncRunsTable.id });
  if (!updated || !id.startsWith("product-")) { res.status(404).json({ error: "No hay vista previa pendiente." }); return; }
  res.json({ id, status: "rejected" });
}));

export default router;
