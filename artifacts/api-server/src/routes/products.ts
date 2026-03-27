import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { productsTable, inventoryRecordsTable, immobilizedProductsTable, samplesTable, dyeLotsTable, finalDispositionTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const productSchema = z.object({
  warehouse: z.string().min(1).default("General"),
  type: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  casNumber: z.string().optional(),
  category: z.string().min(1),
  unit: z.string().min(1),
  minimumStock: z.string().default("0"),
  maximumStock: z.string().optional(),
  msds: z.boolean().default(false),
  controlled: z.boolean().default(false),
  location: z.string().optional(),
  supplier: z.string().optional(),
  hazardClass: z.string().optional(),
  storageConditions: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const TEMPLATE_HEADERS = [
  "almacen", "tipo", "codigo", "descripcion", "um", "cantidad", "zona", "ubicacion",
  "familia", "lote", "tipo_producto", "estado", "msds", "controlado", "observacion",
];

const REQUIRED_COLUMNS = ["codigo", "descripcion", "um"];

function normalizeStatus(val: string): "active" | "inactive" {
  const v = String(val ?? "").toLowerCase().trim();
  if (["activo", "active", "1", "si", "sí", "yes"].includes(v)) return "active";
  return "inactive";
}

function normalizeBool(val: unknown): boolean {
  const v = String(val ?? "").toLowerCase().trim();
  return ["si", "sí", "yes", "1", "true"].includes(v);
}

function rowToProduct(row: Record<string, unknown>, defaultWarehouse = "General") {
  const zona = String(row.zona ?? "").trim();
  const ubicacion = String(row.ubicacion ?? "").trim();
  const locationParts = [zona, ubicacion].filter(Boolean);
  const location = locationParts.join(" / ") || undefined;
  const lote = String(row.lote ?? "").trim();
  const observacion = String(row.observacion ?? "").trim();
  const notesParts = [
    lote ? `Lote: ${lote}` : "",
    observacion,
  ].filter(Boolean);
  const notes = notesParts.join(" | ") || undefined;
  return {
    warehouse: String(row.almacen ?? defaultWarehouse).trim() || defaultWarehouse,
    type: String(row.tipo ?? "").trim() || undefined,
    code: String(row.codigo ?? "").trim(),
    name: String(row.descripcion ?? "").trim(),
    unit: String(row.um ?? "").trim(),
    minimumStock: String(row.cantidad ?? "0").trim() || "0",
    category: String(row.familia ?? "General").trim() || "General",
    location,
    hazardClass: String(row.tipo_producto ?? "").trim() || undefined,
    msds: normalizeBool(row.msds),
    controlled: normalizeBool(row.controlado),
    status: normalizeStatus(String(row.estado ?? "activo")),
    notes,
  };
}

router.get("/template", requireAuth, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const exampleRow = {
    almacen: "QA", tipo: "Reactivo", codigo: "PROD-001", descripcion: "Ácido Sulfúrico 98%",
    um: "L", cantidad: "100", zona: "A", ubicacion: "A-01", familia: "Ácido",
    lote: "LOT-2024-001", tipo_producto: "Corrosivo", estado: "activo",
    msds: "si", controlado: "no", observacion: "Almacenar en área ventilada",
  };
  const ws = XLSX.utils.json_to_sheet([exampleRow], { header: TEMPLATE_HEADERS });
  ws["!cols"] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length + 4, 20) }));
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_productos.xlsx"');
  res.send(buf);
});

router.get("/export", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  let query = db.select().from(productsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(productsTable.warehouse, warehouse));
  }
  const products = await query.orderBy(productsTable.code);
  const rows = products.map(p => {
    const locationParts = (p.location ?? "").split(" / ");
    return {
      almacen: p.warehouse, tipo: p.type ?? "", codigo: p.code, descripcion: p.name,
      um: p.unit, cantidad: p.minimumStock, zona: locationParts[0] ?? "",
      ubicacion: locationParts[1] ?? (p.location ?? ""), familia: p.category,
      lote: "", tipo_producto: p.hazardClass ?? "", estado: p.status === "active" ? "activo" : "inactivo",
      msds: p.msds ? "si" : "no", controlado: p.controlled ? "si" : "no",
      observacion: p.notes ?? "",
    };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0 ? rows : [Object.fromEntries(TEMPLATE_HEADERS.map(h => [h, ""]))],
    { header: TEMPLATE_HEADERS }
  );
  ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="maestro_productos.xlsx"');
  res.send(buf);
}));

router.post(
  "/import",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.single("file"), asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
    const defaultWarehouse = (req.query.warehouse as string) || "General";
    let workbook: XLSX.WorkBook;
    try { workbook = XLSX.read(req.file.buffer, { type: "buffer" }); }
    catch { res.status(400).json({ error: "El archivo no es un Excel válido (.xlsx o .xls)" }); return; }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) { res.status(400).json({ error: "El archivo no contiene hojas de cálculo" }); return; }
    const ws = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (rawRows.length === 0) { res.status(400).json({ error: "El archivo está vacío" }); return; }
    const headers = Object.keys(rawRows[0]).map(h => h.toLowerCase().trim().replace(/\s+/g, "_"));
    const missingCols = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
    if (missingCols.length > 0) {
      res.status(400).json({ error: `Columnas requeridas faltantes: ${missingCols.join(", ")}`, missing: missingCols });
      return;
    }
    const normalizedRows = rawRows.map(row => {
      const n: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) n[k.toLowerCase().trim().replace(/\s+/g, "_")] = v;
      return n;
    });
    const existing = await db.select({ id: productsTable.id, code: productsTable.code, warehouse: productsTable.warehouse }).from(productsTable);
    const existingMap = new Map(existing.map(p => [`${p.warehouse}::${p.code}`, p.id]));
    let inserted = 0, updated = 0;
    const errors: Array<{ row: number; code: string; error: string }> = [];
    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i]; const rowNum = i + 2;
      try {
        const mapped = rowToProduct(row, defaultWarehouse);
        if (!mapped.code) { errors.push({ row: rowNum, code: "(vacío)", error: "El campo 'codigo' es obligatorio" }); continue; }
        if (!mapped.name) { errors.push({ row: rowNum, code: mapped.code, error: "El campo 'descripcion' es obligatorio" }); continue; }
        if (!mapped.unit) { errors.push({ row: rowNum, code: mapped.code, error: "El campo 'um' es obligatorio" }); continue; }
        const key = `${mapped.warehouse}::${mapped.code}`;
        const existingId = existingMap.get(key);
        if (existingId) {
          await db.update(productsTable).set({ ...mapped, updatedAt: new Date() }).where(eq(productsTable.id, existingId));
          updated++;
        } else {
          const id = generateId();
          await db.insert(productsTable).values({ id, ...mapped });
          existingMap.set(key, id); inserted++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        const code = String(row.codigo ?? "").trim() || `fila ${rowNum}`;
        errors.push({ row: rowNum, code, error: msg });
      }
    }
    res.json({ inserted, updated, errors, total: normalizedRows.length });
  })
);

async function checkProductDependencies(id: string) {
  const deps: string[] = [];
  const [inv] = await db.select({ n: count() }).from(inventoryRecordsTable).where(eq(inventoryRecordsTable.productId, id));
  if ((inv?.n ?? 0) > 0) deps.push(`Inventario (${inv?.n} registros)`);
  const [imm] = await db.select({ n: count() }).from(immobilizedProductsTable).where(eq(immobilizedProductsTable.productId, id));
  if ((imm?.n ?? 0) > 0) deps.push(`Productos Inmovilizados (${imm?.n} registros)`);
  const [sam] = await db.select({ n: count() }).from(samplesTable).where(eq(samplesTable.productId, id));
  if ((sam?.n ?? 0) > 0) deps.push(`Muestras (${sam?.n} registros)`);
  const [dye] = await db.select({ n: count() }).from(dyeLotsTable).where(eq(dyeLotsTable.productId, id));
  if ((dye?.n ?? 0) > 0) deps.push(`Lotes de Tinte (${dye?.n} registros)`);
  const [dis] = await db.select({ n: count() }).from(finalDispositionTable).where(eq(finalDispositionTable.productId, id));
  if ((dis?.n ?? 0) > 0) deps.push(`Disposición Final (${dis?.n} registros)`);
  return deps;
}

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const warehouse = req.query.warehouse as string | undefined;
  let query = db.select().from(productsTable).$dynamic();
  if (warehouse && warehouse !== "all") {
    query = query.where(eq(productsTable.warehouse, warehouse));
  }
  const products = await query.orderBy(productsTable.warehouse, productsTable.code);
  res.json(products);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const products = await db.select().from(productsTable).where(eq(productsTable.id, id as string)).limit(1);
  if (products.length === 0) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.json(products[0]);
}));

router.post("/", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const id = generateId();
  const [created] = await db.insert(productsTable).values({ id, ...parsed.data }).returning();
  res.status(201).json(created);
}));

router.put("/:id", requireAuth, requireRole("supervisor", "admin", "operator"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const [updated] = await db.update(productsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(productsTable.id, id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const products = await db.select().from(productsTable).where(eq(productsTable.id, id as string)).limit(1);
  if (products.length === 0) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const deps = await checkProductDependencies(id);
  if (deps.length > 0) {
    const [deactivated] = await db.update(productsTable)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(productsTable.id, id as string)).returning();
    res.json({
      message: "El producto fue marcado como inactivo",
      soft: true,
      reason: `Tiene registros relacionados en: ${deps.join(", ")}`,
      product: deactivated,
    });
    return;
  }

  await db.delete(productsTable).where(eq(productsTable.id, id as string));
  res.json({ message: "Producto eliminado permanentemente", soft: false });
}));

export default router;
