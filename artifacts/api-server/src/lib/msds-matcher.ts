/**
 * msds-matcher.ts
 *
 * Motor inteligente de cruce de MSDS.
 * Compara productos de la base de datos con archivos PDF en Google Drive
 * usando lógica flexible y robusta, sin depender de nombres estructurados.
 *
 * Clasificación de resultados:
 *   EXACT         — código o fórmula exacta, o score muy alto (≥ 120)
 *   PROBABLE      — buena coincidencia (≥ 60)
 *   MANUAL_REVIEW — similitud leve (≥ 25)
 *   NONE          — sin coincidencia válida
 */

import type { MsdsDriveFile } from "./google-drive.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MsdsMatchStatus = "EXACT" | "PROBABLE" | "MANUAL_REVIEW" | "NONE";

export interface MatchCandidate {
  fileId: string;
  fileName: string;
  link: string;
  folderName: string;
  score: number;
  reason: string;
}

export interface MatchResult {
  status: MsdsMatchStatus;
  score: number;
  best: MatchCandidate | null;
  candidates: MatchCandidate[];
  reason: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Score thresholds for classification */
const THRESHOLD_EXACT = 120;
const THRESHOLD_PROBABLE = 60;
const THRESHOLD_MANUAL = 25;

/** Score bonuses */
const SCORE_CODE_EXACT = 100;
const SCORE_FORMULA_EXACT = 80;
const SCORE_NAME_STRONG = 70;
const SCORE_NAME_PARTIAL = 50;
const SCORE_TOKEN_MATCH = 15;
const SCORE_SUPPLIER = 20;
const SCORE_SYNONYM = 30;
const SCORE_CAS = 50;

/** Folder priority bonuses */
const FOLDER_BONUS: Record<string, number> = {
  aprobados: 15,
  approved: 15,
  aprobado: 15,
  validados: 10,
  validado: 10,
  por_validar: 5,
  por_validar_: 5,
  validacion: 5,
  obsoletos: -20,
  obsoleto: -20,
  old: -10,
  archivos: -5,
};

/** Words to strip from file names during tokenization */
const NOISE_TOKENS = new Set([
  "msds", "fds", "ficha", "seguridad", "safety", "sheet", "data",
  "material", "sds", "hoja", "pdf", "file", "documento", "doc",
  "revision", "rev", "ver", "version", "v1", "v2", "v3", "final",
  "copia", "draft", "borrador", "pa",
]);

/** Bilingual synonym dictionary (ES ↔ EN and common chemical equivalences) */
const SYNONYMS: Array<[string, string]> = [
  ["acido", "acid"],
  ["sulfurico", "sulfuric"],
  ["sulfurico", "sulphuric"],
  ["clorhidrico", "hydrochloric"],
  ["nitrico", "nitric"],
  ["fosforico", "phosphoric"],
  ["acetico", "acetic"],
  ["formico", "formic"],
  ["oxalico", "oxalic"],
  ["citrico", "citric"],
  ["sodio", "sodium"],
  ["potasio", "potassium"],
  ["calcio", "calcium"],
  ["magnesio", "magnesium"],
  ["aluminio", "aluminum"],
  ["aluminio", "aluminium"],
  ["hierro", "iron"],
  ["cobre", "copper"],
  ["zinc", "zinc"],
  ["cloro", "chlorine"],
  ["cloruro", "chloride"],
  ["turqueza", "turquesa"],
  ["sulfato", "sulfate"],
  ["sulfato", "sulphate"],
  ["nitrato", "nitrate"],
  ["fosfato", "phosphate"],
  ["carbonato", "carbonate"],
  ["hidrogeno", "hydrogen"],
  ["oxigeno", "oxygen"],
  ["nitrogeno", "nitrogen"],
  ["fluor", "fluorine"],
  ["fluor", "fluoride"],
  ["bromo", "bromine"],
  ["bromo", "bromide"],
  ["amonio", "ammonium"],
  ["amonaco", "ammonia"],
  ["hidroxido", "hydroxide"],
  ["hipoclorito", "hypochlorite"],
  ["permanganato", "permanganate"],
  ["dicromato", "dichromate"],
  ["bicarbonato", "bicarbonate"],
  ["peroxido", "peroxide"],
  ["etanol", "ethanol"],
  ["metanol", "methanol"],
  ["isopropanol", "isopropanol"],
  ["acetona", "acetone"],
  ["tolueno", "toluene"],
  ["xileno", "xylene"],
  ["benceno", "benzene"],
  ["hexano", "hexane"],
  ["heptano", "heptane"],
  ["cloruro de metileno", "dichloromethane"],
  ["diclorometano", "dichloromethane"],
  ["tricloroetileno", "trichloroethylene"],
  ["glicerol", "glycerol"],
  ["glicerina", "glycerin"],
  ["etilenglicol", "ethylene glycol"],
  ["formalina", "formaldehyde"],
  ["formaldehido", "formaldehyde"],
  ["fenol", "phenol"],
  ["sosa", "sodium hydroxide"],
  ["sosa caustica", "sodium hydroxide"],
  ["potasa", "potassium hydroxide"],
  ["cal", "calcium oxide"],
  ["cal apagada", "calcium hydroxide"],
];

/** Common chemical formulas — normalized form → tokens to add */
const FORMULA_PATTERNS: Array<[RegExp, string[]]> = [
  [/\bh2so4\b/i, ["acido", "sulfurico", "h2so4"]],
  [/\bhcl\b/i, ["acido", "clorhidrico", "hcl"]],
  [/\bhno3\b/i, ["acido", "nitrico", "hno3"]],
  [/\bh3po4\b/i, ["acido", "fosforico", "h3po4"]],
  [/\bnaoh\b/i, ["sodio", "hidroxido", "naoh"]],
  [/\bkoh\b/i, ["potasio", "hidroxido", "koh"]],
  [/\bca\(oh\)2\b/i, ["calcio", "hidroxido", "caoH2"]],
  [/\bnacl\b/i, ["sodio", "cloruro", "nacl"]],
  [/\bnh3\b/i, ["amoniaco", "nh3"]],
  [/\bnh4oh\b/i, ["amonio", "hidroxido", "nh4oh"]],
  [/\bh2o2\b/i, ["peroxido", "hidrogeno", "h2o2"]],
  [/\bch3oh\b/i, ["metanol", "ch3oh"]],
  [/\bc2h5oh\b/i, ["etanol", "c2h5oh"]],
  [/\bch3coch3\b/i, ["acetona", "ch3coch3"]],
  [/\bkmno4\b/i, ["permanganato", "potasio", "kmno4"]],
  [/\bfecl3\b/i, ["cloruro", "ferrico", "fecl3"]],
  [/\bcuso4\b/i, ["sulfato", "cobre", "cuso4"]],
  [/\bznso4\b/i, ["sulfato", "zinc", "znso4"]],
  [/\bnah2po4\b/i, ["fosfato", "sodio", "nah2po4"]],
  [/\bna2co3\b/i, ["carbonato", "sodio", "na2co3"]],
  [/\bnahco3\b/i, ["bicarbonato", "sodio", "nahco3"]],
  [/\bcacl2\b/i, ["cloruro", "calcio", "cacl2"]],
  [/\bcocl2\b/i, ["cloruro", "cobalto", "cocl2"]],
  [/\bnaclo\b/i, ["hipoclorito", "sodio", "naclo"]],
  [/\bca\(clo\)2\b/i, ["hipoclorito", "calcio"]],
];

// ── Text Normalization ────────────────────────────────────────────────────────

/**
 * Removes accents/diacritics from a string.
 */
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalizes text for comparison:
 * - Removes accents
 * - Converts to lowercase
 * - Removes file extension
 * - Replaces underscores, hyphens, dots, and slashes with spaces
 * - Removes symbols like %, (, ), [, ], etc.
 * - Collapses multiple spaces
 */
export function normalizeText(text: string): string {
  let s = removeAccents(text);
  // Remove file extension
  s = s.replace(/\.[a-zA-Z0-9]{2,5}$/, "");
  // Lowercase
  s = s.toLowerCase();
  // Replace structural separators with space
  s = s.replace(/[_\-./\\]/g, " ");
  // Remove non-alphanumeric except spaces
  s = s.replace(/[^a-z0-9 ]/g, " ");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Splits normalized text into meaningful tokens, stripping noise words.
 */
export function tokenize(normalizedText: string): string[] {
  return normalizedText
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t));
}

// ── Synonym expansion ─────────────────────────────────────────────────────────

/**
 * Expands a token set with synonym equivalents.
 * E.g. "sulfurico" also adds "sulfuric".
 */
function expandWithSynonyms(tokens: string[]): Set<string> {
  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    for (const [a, b] of SYNONYMS) {
      if (token === a) expanded.add(b);
      else if (token === b) expanded.add(a);
    }
  }
  return expanded;
}

// ── Chemical formula detection ────────────────────────────────────────────────

/**
 * Detects chemical formulas in text and returns extra tokens to add.
 */
function formulaTokens(normalizedText: string): string[] {
  const extra: string[] = [];
  for (const [pattern, tokens] of FORMULA_PATTERNS) {
    if (pattern.test(normalizedText)) {
      extra.push(...tokens);
    }
  }
  return extra;
}

// ── Score calculation ─────────────────────────────────────────────────────────

interface ScoreInput {
  productCode: string;
  productName: string;
  productSupplier?: string | null;
  productCas?: string | null;
  fileName: string;
  folderName: string;
}

interface ScoreDetail {
  score: number;
  reasons: string[];
}

/**
 * Calculates a numeric similarity score between a product and a Drive file.
 */
export function calculateScore(input: ScoreInput): ScoreDetail {
  const { productCode, productName, productSupplier, productCas, fileName, folderName } = input;
  let score = 0;
  const reasons: string[] = [];

  const normFile = normalizeText(fileName);
  const normName = normalizeText(productName);
  const normCode = normalizeText(productCode);
  const normSupplier = productSupplier ? normalizeText(productSupplier) : null;
  const normCas = productCas ? productCas.replace(/\s+/g, "").toLowerCase() : null;

  // ── 1. Code match (highest weight) ────────────────────────────────────────
  // Code must be at least 3 chars to avoid false positives with short codes
  if (normCode.length >= 3 && normFile.includes(normCode)) {
    score += SCORE_CODE_EXACT;
    reasons.push(`código "${productCode}" encontrado en nombre de archivo`);
  }

  // ── 2. CAS number match ────────────────────────────────────────────────────
  if (normCas && normCas.length >= 5) {
    const normFileCas = normFile.replace(/\s+/g, "").replace(/-/g, "");
    if (normFileCas.includes(normCas.replace(/-/g, ""))) {
      score += SCORE_CAS;
      reasons.push(`número CAS "${productCas}" encontrado`);
    }
  }

  // ── 3. Chemical formula match ──────────────────────────────────────────────
  const fileFormulaTokens = formulaTokens(normFile);
  const prodFormulaTokens = formulaTokens(normName);
  if (fileFormulaTokens.length > 0 && prodFormulaTokens.length > 0) {
    const sharedFormulas = prodFormulaTokens.filter((t) => fileFormulaTokens.includes(t));
    if (sharedFormulas.length > 0) {
      score += SCORE_FORMULA_EXACT;
      reasons.push(`fórmula química coincide: ${[...new Set(sharedFormulas)].join(", ")}`);
    }
  }

  // ── 4. Product name similarity ─────────────────────────────────────────────
  const prodTokens = tokenize(normName);
  const fileTokens = tokenize(normFile);

  const prodExpanded = expandWithSynonyms(prodTokens);
  const fileExpanded = expandWithSynonyms(fileTokens);

  // Tokens in product that appear in file (or synonyms)
  const matchingTokens = prodTokens.filter((t) => fileExpanded.has(t));
  // Tokens in file that appear in product (or synonyms)
  const reverseMatchingTokens = fileTokens.filter((t) => prodExpanded.has(t));

  const totalProductTokens = prodTokens.length;
  const totalFileTokens = fileTokens.length;

  if (totalProductTokens > 0 && matchingTokens.length > 0) {
    // FIX 3: Multiplicador de peso para tokens numéricos (ej. "199")
    const weightedMatchingCount = matchingTokens.reduce((acc, t) => acc + (/[0-9]/.test(t) ? 2 : 1), 0);
    const weightedTotalCount = prodTokens.reduce((acc, t) => acc + (/[0-9]/.test(t) ? 2 : 1), 0);
    
    const forwardRatio = weightedMatchingCount / weightedTotalCount;
    
    // FIX 2: backwardRatio solo contribuye si el archivo tiene al menos 3 tokens significativos
    const backwardRatio = totalFileTokens >= 3 ? reverseMatchingTokens.length / totalFileTokens : 0;
    
    // Penalización por longitud dispar
    const lengthDiff = Math.abs(totalProductTokens - totalFileTokens);
    const lengthPenalty = Math.min(lengthDiff * 5, 20);

    if (forwardRatio >= 0.9 && (totalFileTokens < 3 || backwardRatio >= 0.9)) {
      score += SCORE_NAME_STRONG + 20; // Bonus por coincidencia casi exacta de tokens
      reasons.push(`nombre casi idéntico: "${productName}"`);
    } else if (forwardRatio >= 0.7 || backwardRatio >= 0.7) {
      score += SCORE_NAME_STRONG - lengthPenalty;
      reasons.push(`nombre muy similar (${Math.round(Math.max(forwardRatio, backwardRatio) * 100)}%)`);
    } else if (forwardRatio >= 0.4 || backwardRatio >= 0.4) {
      score += SCORE_NAME_PARTIAL - lengthPenalty;
      reasons.push(`coincidencia parcial de nombre (${Math.round(Math.max(forwardRatio, backwardRatio) * 100)}%)`);
    } else if (matchingTokens.length >= 2) {
      score += (SCORE_TOKEN_MATCH * matchingTokens.length) - lengthPenalty;
      reasons.push(`palabras clave coinciden: ${matchingTokens.join(", ")}`);
    } else if (matchingTokens.length === 1 && matchingTokens[0]!.length >= 5) {
      score += SCORE_TOKEN_MATCH - lengthPenalty;
      reasons.push(`palabra clave encontrada: ${matchingTokens[0]}`);
    }
  }

  // ── 5. Synonym match bonus ─────────────────────────────────────────────────
  // FIX 1: Solo aplicar si no hubo coincidencias directas de nombre
  if (matchingTokens.length === 0 && reverseMatchingTokens.length === 0) {
    const synonymMatches = prodTokens.filter((t) => {
      for (const [a, b] of SYNONYMS) {
        if ((t === a && fileExpanded.has(b)) || (t === b && fileExpanded.has(a))) return true;
      }
      return false;
    });
    if (synonymMatches.length > 0) {
      score += SCORE_SYNONYM;
      reasons.push(`sinónimos: ${synonymMatches.join(", ")}`);
    }
  }

  // ── 6. Supplier match ──────────────────────────────────────────────────────
  if (normSupplier && normSupplier.length >= 3) {
    const supplierTokens = tokenize(normSupplier);
    const supplierMatches = supplierTokens.filter((t) => t.length >= 4 && normFile.includes(t));
    if (supplierMatches.length > 0) {
      score += SCORE_SUPPLIER;
      reasons.push(`proveedor coincide: ${supplierMatches.join(", ")}`);
    }
  }

  // ── 7. Folder priority bonus ───────────────────────────────────────────────
  const normFolder = normalizeText(folderName).replace(/\s+/g, "_");
  for (const [keyword, bonus] of Object.entries(FOLDER_BONUS)) {
    if (normFolder.includes(keyword)) {
      score += bonus;
      if (bonus > 0) reasons.push(`carpeta prioritaria: ${folderName} (+${bonus})`);
      break;
    }
  }

  // ── 8. Penalty: score can't exceed 200 ────────────────────────────────────
  score = Math.min(score, 200);

  return { score, reasons };
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Classifies a score into a match status.
 */
export function classifyMatch(score: number): MsdsMatchStatus {
  if (score >= THRESHOLD_EXACT) return "EXACT";
  if (score >= THRESHOLD_PROBABLE) return "PROBABLE";
  if (score >= THRESHOLD_MANUAL) return "MANUAL_REVIEW";
  return "NONE";
}

// ── Main matching function ────────────────────────────────────────────────────

export interface ProductInput {
  code: string;
  name: string;
  supplier?: string | null;
  casNumber?: string | null;
}

/**
 * Matches a single product against all available Drive MSDS files.
 * Returns the best match and all candidates with scores.
 */
export function matchProductWithFiles(
  product: ProductInput,
  files: MsdsDriveFile[]
): MatchResult {
  if (files.length === 0) {
    return { status: "NONE", score: 0, best: null, candidates: [], reason: "No hay archivos MSDS disponibles" };
  }

  const candidates: MatchCandidate[] = [];

  for (const file of files) {
    const { score, reasons } = calculateScore({
      productCode: product.code,
      productName: product.name,
      productSupplier: product.supplier,
      productCas: product.casNumber,
      fileName: file.name,
      folderName: file.folderName,
    });

    if (score >= THRESHOLD_MANUAL) {
      candidates.push({
        fileId: file.fileId,
        fileName: file.name,
        link: file.link,
        folderName: file.folderName,
        score,
        reason: reasons.join("; "),
      });
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  const status = best ? classifyMatch(best.score) : "NONE";
  const reason = best?.reason ?? "Sin coincidencia encontrada";

  return {
    status,
    score: best?.score ?? 0,
    best,
    candidates: candidates.slice(0, 5), // return top 5
    reason,
  };
}
