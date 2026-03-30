import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { eppMasterTable, eppDeliveriesTable, eppChecklistsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EPP_TEMPLATE_HEADERS = ["codigo", "nombre", "categoria", "presentacion", "reemplazo_dias", "estado"];
const EPP_REQUIRED_COLUMNS = ["codigo", "nombre", "categoria"];

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

// ── EPP Master catalog ────────────────────────────────────────────────────────

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const items = await db.select().from(eppMasterTable).orderBy(eppMasterTable.code);
  res.json(items);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const parsed = eppMasterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [created] = await db.insert(eppMasterTable).values({ id: generateId(), ...parsed.data }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
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
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(eppMasterTable).where(eq(eppMasterTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "EPP no encontrado" }); return; }
  res.json({ message: "EPP eliminado", id });
}));

// ── Excel template download ───────────────────────────────────────────────────

router.get("/template", requireAuth, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const exampleRow = {
    codigo: "EPP-001",
    nombre: "Respirador media cara 3M 6200",
    categoria: "Protección respiratoria",
    presentacion: "Incluye filtros 60923 para vapores orgánicos",
    reemplazo_dias: 365,
    estado: "activo",
  };
  const ws = XLSX.utils.json_to_sheet([exampleRow], { header: EPP_TEMPLATE_HEADERS });
  ws["!cols"] = EPP_TEMPLATE_HEADERS.map(() => ({ wch: 28 }));
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla EPP");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_epp.xlsx"');
  res.send(buf);
});

// ── Excel import ──────────────────────────────────────────────────────────────

router.post(
  "/import",
  requireAuth,
  requireRole("supervisor", "admin"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
    let workbook: XLSX.WorkBook;
    try { workbook = XLSX.read(req.file.buffer, { type: "buffer" }); }
    catch { res.status(400).json({ error: "El archivo no es un Excel válido (.xlsx o .xls)" }); return; }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) { res.status(400).json({ error: "El archivo no contiene hojas de cálculo" }); return; }
    const ws = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (rawRows.length === 0) { res.status(400).json({ error: "El archivo está vacío" }); return; }

    const normalize = (row: Record<string, unknown>) => {
      const n: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) n[k.toLowerCase().trim().replace(/\s+/g, "_")] = v;
      return n;
    };
    const normalizedRows = rawRows.map(normalize);
    const headers = Object.keys(normalizedRows[0] ?? {});
    const missingCols = EPP_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
    if (missingCols.length > 0) {
      res.status(400).json({ error: `Columnas requeridas faltantes: ${missingCols.join(", ")}`, missing: missingCols });
      return;
    }

    const existing = await db.select({ id: eppMasterTable.id, code: eppMasterTable.code }).from(eppMasterTable);
    const existingMap = new Map(existing.map((e: { id: string; code: string }) => [e.code.toUpperCase(), e.id]));

    let inserted = 0, updated = 0;
    const errors: Array<{ row: number; code: string; error: string }> = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      const rowNum = i + 2;
      try {
        const code = String(row.codigo ?? "").trim();
        const name = String(row.nombre ?? "").trim();
        const category = String(row.categoria ?? "").trim();
        const description = String(row.presentacion ?? "").trim() || undefined;
        const rawDays = row.reemplazo_dias;
        const replacementPeriodDays = rawDays ? parseInt(String(rawDays)) || undefined : undefined;
        const statusRaw = String(row.estado ?? "activo").trim().toLowerCase();
        const status: "active" | "inactive" = statusRaw === "inactivo" ? "inactive" : "active";

        if (!code) { errors.push({ row: rowNum, code: "(vacío)", error: "El campo 'codigo' es obligatorio" }); continue; }
        if (!name) { errors.push({ row: rowNum, code, error: "El campo 'nombre' es obligatorio" }); continue; }
        if (!category) { errors.push({ row: rowNum, code, error: "El campo 'categoria' es obligatorio" }); continue; }

        const data = { code, name, category, description, replacementPeriodDays, status };
        const existingId = existingMap.get(code.toUpperCase());
        if (existingId) {
          await db.update(eppMasterTable).set({ ...data, updatedAt: new Date() }).where(eq(eppMasterTable.id, existingId));
          updated++;
        } else {
          const id = generateId();
          await db.insert(eppMasterTable).values({ id, ...data });
          existingMap.set(code.toUpperCase(), id);
          inserted++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        const code = String(row.codigo ?? `fila ${rowNum}`).trim();
        errors.push({ row: rowNum, code, error: msg });
      }
    }
    res.json({ inserted, updated, errors, total: normalizedRows.length });
  })
);

// ── EPP Deliveries ────────────────────────────────────────────────────────────

router.get("/deliveries", requireAuth, asyncHandler(async (_req, res) => {
  const deliveries = await db.select().from(eppDeliveriesTable).orderBy(desc(eppDeliveriesTable.deliveryDate));
  res.json(deliveries);
}));

router.post("/deliveries", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
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
}));

router.put("/deliveries/:id", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = eppDeliverySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const [updated] = await db.update(eppDeliveriesTable)
    .set(parsed.data)
    .where(eq(eppDeliveriesTable.id, id as string))
    .returning();
  if (!updated) { res.status(404).json({ error: "Entrega no encontrada" }); return; }
  res.json(updated);
}));

router.delete("/deliveries/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(eppDeliveriesTable).where(eq(eppDeliveriesTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Entrega no encontrada" }); return; }
  res.json({ message: "Entrega eliminada", id });
}));

// ── EPP Checklists ────────────────────────────────────────────────────────────

router.get("/checklists", requireAuth, asyncHandler(async (_req, res) => {
  const checklists = await db.select().from(eppChecklistsTable).orderBy(desc(eppChecklistsTable.checkDate));
  res.json(checklists);
}));

router.post("/checklists", requireAuth, requireRole("supervisor", "admin", "quality"), asyncHandler(async (req, res) => {
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
}));

export default router;
