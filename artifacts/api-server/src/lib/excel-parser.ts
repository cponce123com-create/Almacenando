/**
 * excel-parser.ts
 *
 * Helper compartido para parsear archivos Excel subidos via multer.
 * Reemplaza el código duplicado en products.ts, balances.ts, lot-evaluations.ts, epp.ts.
 */

import XLSX from "xlsx";

export interface ParsedExcel {
  sheetName: string;
  ws: XLSX.WorkSheet;
  rawRows: Record<string, unknown>[];
}

/**
 * Lee un buffer de archivo Excel y devuelve el nombre de la hoja,
 * el worksheet y los rows parseados.
 *
 * Lanza un Error con mensaje descriptivo si algo falla.
 */
export function parseExcelBuffer(
  buffer: Buffer,
  options?: { cellDates?: boolean },
): ParsedExcel {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: options?.cellDates ?? false,
    });
  } catch {
    throw new Error("El archivo no es un Excel válido (.xlsx o .xls)");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo no contiene hojas de cálculo");
  }

  const ws = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  if (rawRows.length === 0) {
    throw new Error("El archivo está vacío");
  }

  return { sheetName, ws, rawRows };
}

/**
 * Normaliza los headers de un Excel (minúsculas, trim, reemplazo de espacios).
 */
export function normalizeHeaders(
  rows: Record<string, unknown>[],
  spaceReplacement: string = "_",
): string[] {
  return Object.keys(rows[0]).map((h) =>
    String(h).toLowerCase().trim().replace(/\s+/g, spaceReplacement),
  );
}

/**
 * Envía un buffer Excel como respuesta HTTP con headers correctos.
 * Reemplaza el patrón duplicado de setHeader + send en plantillas/export.
 */
export function sendExcelResponse(
  res: import("express").Response,
  buf: Buffer,
  filename: string,
): void {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  res.send(buf);
}
