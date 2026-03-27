import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { balanceRecordsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TEMPLATE_HEADERS = ["almacen", "tipo", "codigo", "descripcion_producto", "um", "cantidad", "fecha"];

const balanceSchema = z.object({
  warehouse: z.string().min(1),
  type: z.string().optional(),
  code: z.string().min(1),
  productDescription: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.string().default("0"),
  balanceDate: z.string().min(1),
  notes: z.string().optional(),
});

router.get("/template", requireAuth, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const today = new Date().toISOString().slice(0, 10);
  const exampleRow = {
    almacen: "QA", tipo: "Reactivo", codigo: "PROD-001",
    descripcion_producto: "Ácido Sulfúrico 98%", um: "L", cantidad: "100", fecha: today,
  };
  const ws = XLSX.utils.json_to_sheet([exampleRow], { header: TEMPLATE_HEADERS });
  ws["!cols"] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length + 6, 22) }));
  XLSX.utils.book_append_sheet(wb, ws, "Saldo Actualizado");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_saldo.xlsx"');
  res.send(buf);
});

router.post(
  "/import",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.single("file"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
    let workbook: XLSX.WorkBook;
    try { workbook = XLSX.read(req.file.buffer, { type: "buffer" }); }
    catch { res.status(400).json({ error: "El archivo no es un Excel válido" }); return; }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) { res.status(400).json({ error: "El archivo no contiene hojas" }); return; }
    const ws = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (rawRows.length === 0) { res.status(400).json({ error: "El archivo está vacío" }); return; }

    const normalizedRows = rawRows.map(row => {
      const n: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) n[k.toLowerCase().trim().replace(/\s+/g, "_")] = v;
      return n;
    });

    const batchId = generateId();
    const userId = req.user!.id;
    let inserted = 0;
    const errors: Array<{ row: number; code: string; error: string }> = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i]; const rowNum = i + 2;
      try {
        const code = String(row.codigo ?? "").trim();
        const productDescription = String(row.descripcion_producto ?? "").trim();
        const unit = String(row.um ?? "").trim();
        const warehouse = String(row.almacen ?? "General").trim();
        const balanceDate = String(row.fecha ?? "").trim();
        const quantity = String(row.cantidad ?? "0").trim() || "0";
        const type = String(row.tipo ?? "").trim() || undefined;

        if (!code) { errors.push({ row: rowNum, code: "(vacío)", error: "El campo 'codigo' es obligatorio" }); continue; }
        if (!productDescription) { errors.push({ row: rowNum, code, error: "El campo 'descripcion_producto' es obligatorio" }); continue; }
        if (!unit) { errors.push({ row: rowNum, code, error: "El campo 'um' es obligatorio" }); continue; }
        if (!balanceDate) { errors.push({ row: rowNum, code, error: "El campo 'fecha' es obligatorio" }); continue; }

        const id = generateId();
        await db.insert(balanceRecordsTable).values({
          id, warehouse, type, code, productDescription, unit, quantity,
          balanceDate, batchId, registeredBy: userId,
        });
        inserted++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        const code = String(row.codigo ?? "").trim() || `fila ${rowNum}`;
        errors.push({ row: rowNum, code, error: msg });
      }
    }
    res.json({ inserted, errors, total: normalizedRows.length, batchId });
  })
);

router.get("/latest", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const whereClause = warehouse && warehouse !== "all"
    ? eq(balanceRecordsTable.warehouse, warehouse)
    : undefined;

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (warehouse, code)
      id, warehouse, type, code, product_description, unit, quantity, balance_date, batch_id, notes, registered_by, created_at, updated_at
    FROM balance_records
    ${whereClause ? sql`WHERE warehouse = ${warehouse}` : sql``}
    ORDER BY warehouse, code, balance_date DESC, created_at DESC
  `);
  res.json(rows.rows);
}));

router.get("/dates", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  let query = db.selectDistinct({ balanceDate: balanceRecordsTable.balanceDate, batchId: balanceRecordsTable.batchId, warehouse: balanceRecordsTable.warehouse })
    .from(balanceRecordsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(balanceRecordsTable.warehouse, warehouse));
  }
  const dates = await query.orderBy(desc(balanceRecordsTable.balanceDate));
  res.json(dates);
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  const balanceDate = req.query.date as string | undefined;
  const batchId = req.query.batchId as string | undefined;

  const conditions = [];
  if (warehouse && warehouse !== "all") conditions.push(eq(balanceRecordsTable.warehouse, warehouse));
  if (balanceDate) conditions.push(eq(balanceRecordsTable.balanceDate, balanceDate));
  if (batchId) conditions.push(eq(balanceRecordsTable.batchId, batchId));

  let query = db.select().from(balanceRecordsTable).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  const records = await query.orderBy(desc(balanceRecordsTable.balanceDate), balanceRecordsTable.code);
  res.json(records);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const records = await db.select().from(balanceRecordsTable).where(eq(balanceRecordsTable.id, id as string)).limit(1);
  if (records.length === 0) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json(records[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = balanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const id = generateId();
  const [created] = await db.insert(balanceRecordsTable).values({
    id,
    ...parsed.data,
    registeredBy: req.user!.id,
  }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = balanceSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const [updated] = await db.update(balanceRecordsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(balanceRecordsTable.id, id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.delete(balanceRecordsTable).where(eq(balanceRecordsTable.id, id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Registro no encontrado" }); return; }
  res.json({ message: "Registro eliminado" });
}));

export default router;
