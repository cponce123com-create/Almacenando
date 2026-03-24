import { Router } from "express";
import { db } from "@workspace/db";
import { lotEvaluationsTable, interpretLotStatus } from "@workspace/db";
import { eq, desc, or, ilike, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";

const router = Router();

const evaluationSchema = z.object({
  colorantName: z.string().min(1, "El nombre del colorante es requerido"),
  usageLot: z.string().min(1, "El lote de uso es requerido"),
  newLot: z.string().min(1, "El lote nuevo es requerido"),
  approvalDate: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
  interpretedStatus: z.string().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const { search, colorant, status, dateFrom, dateTo } = req.query as Record<string, string>;

  let query = db.select().from(lotEvaluationsTable).$dynamic();

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(lotEvaluationsTable.colorantName, `%${search}%`),
        ilike(lotEvaluationsTable.usageLot, `%${search}%`),
        ilike(lotEvaluationsTable.newLot, `%${search}%`),
        ilike(lotEvaluationsTable.comments, `%${search}%`)
      )
    );
  }

  if (colorant) {
    conditions.push(ilike(lotEvaluationsTable.colorantName, `%${colorant}%`));
  }

  if (status) {
    conditions.push(eq(lotEvaluationsTable.interpretedStatus, status));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const records = await query.orderBy(desc(lotEvaluationsTable.createdAt));
  res.json(records);
});

router.get("/colorants", requireAuth, async (_req, res) => {
  const records = await db
    .selectDistinct({ colorantName: lotEvaluationsTable.colorantName })
    .from(lotEvaluationsTable)
    .orderBy(lotEvaluationsTable.colorantName);
  res.json(records.map((r) => r.colorantName));
});

router.get("/history/:colorantName", requireAuth, async (req, res) => {
  const { colorantName } = req.params;
  const records = await db
    .select()
    .from(lotEvaluationsTable)
    .where(ilike(lotEvaluationsTable.colorantName, `%${colorantName as string}%`))
    .orderBy(desc(lotEvaluationsTable.approvalDate), desc(lotEvaluationsTable.createdAt));
  res.json(records);
});

router.get("/compatibility", requireAuth, async (req, res) => {
  const { colorant, usageLot, newLot } = req.query as Record<string, string>;

  if (!colorant || !newLot) {
    res.status(400).json({ error: "Se requiere colorante y lote nuevo" });
    return;
  }

  const conditions = [
    ilike(lotEvaluationsTable.colorantName, `%${colorant}%`),
    ilike(lotEvaluationsTable.newLot, `%${newLot}%`),
  ];

  if (usageLot) {
    conditions.push(ilike(lotEvaluationsTable.usageLot, `%${usageLot}%`));
  }

  const records = await db
    .select()
    .from(lotEvaluationsTable)
    .where(and(...conditions))
    .orderBy(desc(lotEvaluationsTable.approvalDate), desc(lotEvaluationsTable.createdAt));

  if (records.length === 0) {
    res.json({ found: false, result: "NO_REGISTRO", message: "No existe evaluación registrada para este lote" });
    return;
  }

  const latest = records[0];
  const status = latest.interpretedStatus;

  const resultMap: Record<string, { result: string; message: string }> = {
    CONFORME: { result: "CONFORME", message: "El lote nuevo es compatible. Puede utilizarse." },
    "CONFORME NO MEZCLAR": {
      result: "CONFORME_NO_MEZCLAR",
      message: "Conforme, pero no debe mezclarse con el lote anterior.",
    },
    "NO CONFORME": { result: "NO_CONFORME", message: "Lote no conforme. No debe utilizarse." },
    "FALTA ETIQUETAR": {
      result: "FALTA_ETIQUETAR",
      message: "Falta etiquetado. Verificar antes de usar.",
    },
    OBSERVACION: { result: "OBSERVACION", message: "Tiene observaciones. Consultar con laboratorio." },
    REVISAR: { result: "REVISAR", message: "Estado indefinido. Revisar con laboratorio." },
  };

  const mapped = resultMap[status] ?? { result: "REVISAR", message: "Revisar con laboratorio." };

  res.json({
    found: true,
    record: latest,
    ...mapped,
  });
});

router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const records = await db
    .select()
    .from(lotEvaluationsTable)
    .where(eq(lotEvaluationsTable.id, id as string))
    .limit(1);
  if (records.length === 0) {
    res.status(404).json({ error: "Evaluación no encontrada" });
    return;
  }
  res.json(records[0]);
});

router.post("/", requireAuth, requireRole("supervisor", "admin", "quality", "operator"), async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = evaluationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { interpretedStatus, comments, ...rest } = parsed.data;
  const autoStatus = interpretLotStatus(comments ?? null);
  const finalStatus = interpretedStatus && interpretedStatus !== "auto" ? interpretedStatus : autoStatus;

  const id = generateId();
  const [created] = await db
    .insert(lotEvaluationsTable)
    .values({
      id,
      ...rest,
      comments: comments ?? null,
      approvalDate: rest.approvalDate ?? null,
      interpretedStatus: finalStatus,
      registeredBy: authedReq.userId,
    })
    .returning();
  res.status(201).json(created);
});

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "quality"), async (req, res) => {
  const { id } = req.params;
  const parsed = evaluationSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { interpretedStatus, comments, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };

  if (comments !== undefined) {
    updates.comments = comments;
    if (!interpretedStatus || interpretedStatus === "auto") {
      updates.interpretedStatus = interpretLotStatus(comments ?? null);
    }
  }
  if (interpretedStatus && interpretedStatus !== "auto") {
    updates.interpretedStatus = interpretedStatus;
  }

  const [updated] = await db
    .update(lotEvaluationsTable)
    .set(updates)
    .where(eq(lotEvaluationsTable.id, id as string))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Evaluación no encontrada" });
    return;
  }
  res.json(updated);
});

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const { id } = req.params;
  const [deactivated] = await db
    .update(lotEvaluationsTable)
    .set({ active: "false", updatedAt: new Date() })
    .where(eq(lotEvaluationsTable.id, id as string))
    .returning();
  if (!deactivated) {
    res.status(404).json({ error: "Evaluación no encontrada" });
    return;
  }
  res.json({ message: "Evaluación desactivada", record: deactivated });
});

export default router;
