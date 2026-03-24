import { Router } from "express";
import { db } from "@workspace/db";
import { eppMasterTable, eppDeliveriesTable, eppChecklistsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";

const router = Router();

const eppMasterSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  standardReference: z.string().optional(),
  replacementPeriodDays: z.number().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const eppDeliverySchema = z.object({
  eppId: z.string().min(1),
  personnelId: z.string().min(1),
  deliveryDate: z.string().min(1),
  quantity: z.number().default(1),
  condition: z.string().default("new"),
  returnDate: z.string().optional(),
  returnCondition: z.string().optional(),
  notes: z.string().optional(),
});

const eppChecklistSchema = z.object({
  personnelId: z.string().min(1),
  checkDate: z.string().min(1),
  items: z.string().min(1),
  overallStatus: z.enum(["compliant", "non_compliant", "partial"]).default("compliant"),
  notes: z.string().optional(),
});

router.get("/", requireAuth, async (_req, res) => {
  const items = await db.select().from(eppMasterTable).orderBy(eppMasterTable.code);
  res.json(items);
});

router.post("/", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const parsed = eppMasterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [created] = await db.insert(eppMasterTable).values({ id: generateId(), ...parsed.data }).returning();
  res.status(201).json(created);
});

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  const { id } = req.params;
  const parsed = eppMasterSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(eppMasterTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(eppMasterTable.id, id as string)).returning();
  if (!updated) {
    res.status(404).json({ error: "EPP no encontrado" });
    return;
  }
  res.json(updated);
});

router.get("/deliveries", requireAuth, async (_req, res) => {
  const deliveries = await db.select().from(eppDeliveriesTable).orderBy(desc(eppDeliveriesTable.deliveryDate));
  res.json(deliveries);
});

router.post("/deliveries", requireAuth, requireRole("supervisor", "admin", "operator"), async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = eppDeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [created] = await db.insert(eppDeliveriesTable).values({
    id: generateId(),
    ...parsed.data,
    deliveredBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
});

router.get("/checklists", requireAuth, async (_req, res) => {
  const checklists = await db.select().from(eppChecklistsTable).orderBy(desc(eppChecklistsTable.checkDate));
  res.json(checklists);
});

router.post("/checklists", requireAuth, requireRole("supervisor", "admin", "quality"), async (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const parsed = eppChecklistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [created] = await db.insert(eppChecklistsTable).values({
    id: generateId(),
    ...parsed.data,
    reviewedBy: authedReq.userId,
  }).returning();
  res.status(201).json(created);
});

export default router;
