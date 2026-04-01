import OpenAI from "openai";
import { downloadDriveFileAsBuffer } from "./google-drive.js";
import { logger } from "./logger.js";

// Lazy loader for pdf-parse (v1.x — Node.js compatible, no browser DOM APIs needed).
// Dynamic import works in both tsx ESM (dev) and esbuild CJS bundles (prod).
type PdfParseFn = (buf: Buffer) => Promise<{ text: string; numpages: number }>;
let _pdfParse: PdfParseFn | null = null;
async function getPdfParse(): Promise<PdfParseFn> {
  if (_pdfParse) return _pdfParse;
  const mod = await import("pdf-parse");
  // pdf-parse v1.x: module.exports is the function itself (no .default in CJS)
  const fn = (mod as any).default ?? mod;
  if (typeof fn !== "function") {
    throw new Error(`pdf-parse no exportó una función válida (tipo: ${typeof fn})`);
  }
  _pdfParse = fn as PdfParseFn;
  return _pdfParse;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MsdsExtractedData {
  cas: string | null;
  familiaQuimica: string | null;
  identificacionPeligro: string | null;
  primerosAuxiliosContacto: string | null;
  controlExposicion: string | null;
  incompatibilidad: string | null;
  riesgosAgudosSalud: string | null;
  extractedAt: string;
  pagesScanned: number;
  charCount: number;
}

// ── OpenAI client (Replit AI Integrations proxy) ──────────────────────────────

function getOpenAIClient(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL y AI_INTEGRATIONS_OPENAI_API_KEY no están configurados");
  }
  return new OpenAI({ baseURL, apiKey });
}

// ── PDF text extraction ───────────────────────────────────────────────────────

async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<{ text: string; pages: number }> {
  if (mimeType === "text/plain") {
    return { text: buffer.toString("utf-8"), pages: 1 };
  }

  if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
    const pdfParse = await getPdfParse();
    const data = await pdfParse(buffer);
    return { text: data.text, pages: data.numpages };
  }

  throw new Error(`Tipo de archivo no soportado para extracción: ${mimeType}`);
}

// ── AI field extraction ───────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Eres un especialista en análisis de Fichas de Datos de Seguridad (MSDS/SDS) de productos químicos.

A continuación se te proporciona el texto extraído de una MSDS. Tu tarea es extraer exactamente los siguientes 7 campos de información de seguridad y devolverlos en formato JSON.

CAMPOS A EXTRAER:
1. cas - Número CAS del producto (formato: XXXXXXX-XX-X). Si hay varios, incluye el principal.
2. familiaQuimica - Familia o clase química del producto (ej: "Ácido inorgánico", "Solvente orgánico", "Oxidante").
3. identificacionPeligro - Identificación del peligro principal: frases H, clasificación GHS, o descripción del riesgo. Sé conciso pero completo.
4. primerosAuxiliosContacto - Instrucciones de primeros auxilios por contacto (dérmico, ocular, inhalación, ingestión). Resume los puntos clave.
5. controlExposicion - Medidas de control de exposición: EPP requerido, límites de exposición (TLV, TWA, STEL), controles de ingeniería.
6. incompatibilidad - Materiales o condiciones con los que es incompatible el producto. Reacciones peligrosas.
7. riesgosAgudosSalud - Efectos agudos para la salud: síntomas de exposición aguda, DL50 si está disponible, órganos diana.

INSTRUCCIONES:
- Extrae EXACTAMENTE lo que dice el documento, no inventes información.
- Si un campo no se encuentra en el documento, devuelve null para ese campo.
- Sé conciso: máximo 200 palabras por campo.
- Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin bloques de código.

Formato de respuesta:
{
  "cas": "string o null",
  "familiaQuimica": "string o null",
  "identificacionPeligro": "string o null",
  "primerosAuxiliosContacto": "string o null",
  "controlExposicion": "string o null",
  "incompatibilidad": "string o null",
  "riesgosAgudosSalud": "string o null"
}`;

async function extractFieldsWithAI(text: string): Promise<Omit<MsdsExtractedData, "extractedAt" | "pagesScanned" | "charCount">> {
  const client = getOpenAIClient();

  // Truncate to ~15000 chars to stay within token limits (most MSDS are < 10k chars)
  const truncated = text.length > 15000
    ? text.slice(0, 15000) + "\n\n[... texto truncado por longitud ...]"
    : text;

  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: `TEXTO DE LA MSDS:\n\n${truncated}` },
    ],
    temperature: 0,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    return {
      cas: parsed.cas ?? null,
      familiaQuimica: parsed.familiaQuimica ?? null,
      identificacionPeligro: parsed.identificacionPeligro ?? null,
      primerosAuxiliosContacto: parsed.primerosAuxiliosContacto ?? null,
      controlExposicion: parsed.controlExposicion ?? null,
      incompatibilidad: parsed.incompatibilidad ?? null,
      riesgosAgudosSalud: parsed.riesgosAgudosSalud ?? null,
    };
  } catch {
    throw new Error(`Respuesta de IA inválida (no es JSON): ${raw.slice(0, 200)}`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Downloads the MSDS file from Google Drive, extracts text, and uses AI to
 * parse the 7 key safety fields. Returns structured MsdsExtractedData.
 */
export async function extractMsdsDataFromDrive(fileId: string): Promise<MsdsExtractedData> {
  logger.info({ fileId }, "Starting MSDS data extraction");

  const { buffer, mimeType } = await downloadDriveFileAsBuffer(fileId);
  logger.info({ fileId, mimeType, bytes: buffer.length }, "File downloaded from Drive");

  const { text, pages } = await extractTextFromBuffer(buffer, mimeType);
  if (!text.trim()) {
    throw new Error("El archivo no contiene texto extraíble. Puede ser una MSDS escaneada como imagen.");
  }
  logger.info({ fileId, pages, chars: text.length }, "Text extracted from file");

  const fields = await extractFieldsWithAI(text);
  logger.info({ fileId }, "AI extraction completed");

  return {
    ...fields,
    extractedAt: new Date().toISOString(),
    pagesScanned: pages,
    charCount: text.length,
  };
}
