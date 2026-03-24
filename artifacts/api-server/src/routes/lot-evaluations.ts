import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { lotEvaluationsTable, interpretLotStatus } from "@workspace/db";
import { eq, desc, or, ilike, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const COL_ALIASES: Record<string, string[]> = {
  colorantName:  ["nombre_colorante", "colorante", "tintura", "nombre colorante", "nombre de colorante", "nombre del colorante"],
  usageLot:      ["lote_uso", "lote uso", "lote de uso", "lote_en_uso", "lote en uso", "lote anterior"],
  newLot:        ["lote_nuevo", "lote nuevo", "nuevo lote", "lote_n", "lote n"],
  approvalDate:  ["fecha_visto_bueno", "fecha v°b°", "fecha vb", "fecha_vb", "fecha v b", "fecha de aprobacion", "fecha aprobacion", "fecha visto bueno", "fecha v.b."],
  comments:      ["comentarios", "comentario", "observacion", "observaciones", "resultado", "estado"],
};

function findCol(headers: string[], field: string): string | null {
  const aliases = COL_ALIASES[field] ?? [];
  for (const alias of aliases) {
    const found = headers.find(h => h === alias);
    if (found) return found;
  }
  return null;
}

function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "number") {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } catch { /* fall through */ }
  }
  const str = String(raw).trim();
  if (!str) return null;
  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (c && c > 1900) return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (a && a > 1900) return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
  }
  return str;
}

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

// NOTE: /template MUST be declared before /:id.
// Express matches routes in registration order, so if /:id appears first,
// GET /template would be captured with id="template" and return 404.
router.get("/template", requireAuth, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nombre Colorante", "Lote Uso", "Lote Nuevo", "Fecha V°B°", "Comentarios"],
    ["Azul Naval", "L-2023-001", "L-2024-010", "15/01/2024", "CONFORME"],
    ["Rojo Brillante", "L-2023-045", "L-2024-022", "20/01/2024", "CONFORME NO MEZCLAR"],
    ["Negro Carbon", "L-2022-099", "L-2024-033", "25/01/2024", "NO CONFORME"],
  ]);
  ws["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, ws, "Control de Lotes");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_control_lotes.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Length", buf.length);
  res.send(buf);
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

router.post(
  "/import",
  requireAuth,
  requireRole("supervisor", "admin", "operator"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
    let workbook: XLSX.WorkBook;
    try { workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false }); }
    catch { res.status(400).json({ error: "El archivo no es un Excel válido (.xlsx o .xls)" }); return; }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) { res.status(400).json({ error: "El archivo no contiene hojas de cálculo" }); return; }
    const ws = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (rawRows.length === 0) { res.status(400).json({ error: "El archivo está vacío" }); return; }

    const headers = Object.keys(rawRows[0]).map(h => String(h).toLowerCase().trim().replace(/\s+/g, " "));
    const colMap: Record<string, string | null> = {};
    for (const field of Object.keys(COL_ALIASES)) colMap[field] = findCol(headers, field);

    const missingRequired = (["colorantName", "usageLot", "newLot"] as const).filter(f => !colMap[f]);
    if (missingRequired.length > 0) {
      res.status(400).json({
        error: `No se encontraron columnas requeridas: ${missingRequired.map(f => COL_ALIASES[f]?.[0] ?? f).join(", ")}. Descarga la plantilla para ver el formato correcto.`,
      });
      return;
    }

    const normalizedRows = rawRows.map(row => {
      const n: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) n[String(k).toLowerCase().trim().replace(/\s+/g, " ")] = v;
      return n;
    });

    const existing = await db.select({
      colorantName: lotEvaluationsTable.colorantName,
      usageLot: lotEvaluationsTable.usageLot,
      newLot: lotEvaluationsTable.newLot,
      approvalDate: lotEvaluationsTable.approvalDate,
    }).from(lotEvaluationsTable);

    const dupKey = (cn: string, ul: string, nl: string, ad: string | null) =>
      `${cn.toLowerCase().trim()}|${ul.toLowerCase().trim()}|${nl.toLowerCase().trim()}|${ad ?? ""}`;
    const existingKeys = new Set(existing.map(e => dupKey(e.colorantName, e.usageLot, e.newLot, e.approvalDate)));

    const authedReq = req as AuthenticatedRequest;
    let inserted = 0;
    let duplicates = 0;
    const errors: Array<{ row: number; value: string; error: string }> = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i]; const rowNum = i + 2;
      try {
        const colorantName = String(row[colMap.colorantName!] ?? "").trim();
        const usageLot = String(row[colMap.usageLot!] ?? "").trim();
        const newLot = String(row[colMap.newLot!] ?? "").trim();
        const approvalDateRaw = colMap.approvalDate ? row[colMap.approvalDate] : null;
        const comments = colMap.comments ? String(row[colMap.comments] ?? "").trim() : "";

        if (!colorantName) { errors.push({ row: rowNum, value: `fila ${rowNum}`, error: "El nombre del colorante es obligatorio" }); continue; }
        if (!usageLot)     { errors.push({ row: rowNum, value: colorantName, error: "El lote en uso es obligatorio" }); continue; }
        if (!newLot)       { errors.push({ row: rowNum, value: colorantName, error: "El lote nuevo es obligatorio" }); continue; }

        const approvalDate = parseDate(approvalDateRaw);
        const key = dupKey(colorantName, usageLot, newLot, approvalDate);
        if (existingKeys.has(key)) { duplicates++; continue; }

        const interpretedStatus = interpretLotStatus(comments || null);
        await db.insert(lotEvaluationsTable).values({
          id: generateId(),
          colorantName,
          usageLot,
          newLot,
          approvalDate,
          comments: comments || null,
          interpretedStatus,
          active: "true",
          registeredBy: authedReq.userId ?? null,
        });
        existingKeys.add(key);
        inserted++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        errors.push({ row: rowNum, value: String(row[colMap.colorantName!] ?? `fila ${rowNum}`).trim() || `fila ${rowNum}`, error: msg });
      }
    }

    res.json({
      total: normalizedRows.length,
      inserted,
      duplicates,
      errors,
      message: `Importación completada: ${inserted} insertados, ${duplicates} duplicados omitidos, ${errors.length} errores.`,
    });
  }
);

export default router;
