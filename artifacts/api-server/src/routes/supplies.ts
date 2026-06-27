import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { suppliesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * Suministros / Insumos
 * CRUD de suministros / insumos
 */

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TEMPLATE_HEADERS = ["codigo", "descripcion", "um"];

const supplySchema = z.object({
  code: z.string().min(1, "El código es requerido"),
  description: z.string().min(1, "La descripción es requerida"),
  unit: z.string().min(1, "La unidad de medida es requerida"),
  status: z.enum(["active", "inactive"]).default("active"),
});

// GET /api/supplies — list all
router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  const items = await db.select().from(suppliesTable).orderBy(asc(suppliesTable.code));
  res.json(items);
}));

// POST /api/supplies — create
router.post("/", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const parsed = supplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const data = parsed.data;
  const existing = await db.select({ id: suppliesTable.id })
    .from(suppliesTable)
    .where(eq(suppliesTable.code, data.code.toUpperCase()))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Ya existe un suministro con ese código" });
    return;
  }
  const [created] = await db.insert(suppliesTable).values({
    id: generateId(),
    ...data,
    code: data.code.toUpperCase(),
  }).returning();
  res.status(201).json(created);
}));

// PUT /api/supplies/:id — update
router.put("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const parsed = supplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const data = parsed.data;
  const [updated] = await db.update(suppliesTable)
    .set({ ...data, code: data.code.toUpperCase(), updatedAt: new Date() })
    .where(eq(suppliesTable.id, req.params.id as string))
    .returning();
  if (!updated) { res.status(404).json({ error: "Suministro no encontrado" }); return; }
  res.json(updated);
}));

// DELETE /api/supplies/:id
router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const [deleted] = await db.delete(suppliesTable).where(eq(suppliesTable.id, req.params.id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Suministro no encontrado" }); return; }
  res.json({ ok: true });
}));

// GET /api/supplies/template — download Excel template
router.get("/template", requireAuth, asyncHandler(async (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Suministros");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_suministros.xlsx"');
  res.send(buf);
}));

// POST /api/supplies/import — upsert from Excel
router.post("/import", requireAuth, requireRole("supervisor", "admin"), upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No se envió ningún archivo" }); return; }
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) { res.status(400).json({ error: "Archivo Excel vacío" }); return; }
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

  let inserted = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    const code = (row["codigo"] ?? row["CODIGO"] ?? "").toString().trim().toUpperCase();
    const description = (row["descripcion"] ?? row["DESCRIPCION"] ?? "").toString().trim();
    const unit = (row["um"] ?? row["UM"] ?? "").toString().trim();

    if (!code || !description || !unit) {
      errors.push(`Fila ${i + 2}: código, descripción y UM son requeridos`);
      skipped++;
      continue;
    }

    const existing = await db.select({ id: suppliesTable.id })
      .from(suppliesTable)
      .where(eq(suppliesTable.code, code))
      .limit(1);

    if (existing.length > 0) {
      await db.update(suppliesTable)
        .set({ description, unit, updatedAt: new Date() })
        .where(eq(suppliesTable.code, code));
      updated++;
    } else {
      await db.insert(suppliesTable).values({ id: generateId(), code, description, unit });
      inserted++;
    }
  }

  res.json({ inserted, updated, skipped, errors: errors.slice(0, 10) });
}));

export default router;
