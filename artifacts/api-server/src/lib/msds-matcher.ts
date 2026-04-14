/**
 * msds-matcher.ts
 *
 * Motor inteligente de cruce de MSDS.
 * Compara productos de la base de datos con archivos PDF en Google Drive
 * usando lógica flexible y robusta, sin depender de nombres estructurados.
 *
 * Mejoras v2:
 *   - Stem matching (primeros 4-5 chars): detecta "ALGINAT" ↔ "ALGINATO"
 *   - Normalización de códigos alfanuméricos: "NV 10" → "NV10", "C-5G" → "C5G"
 *   - Filtrado de colores (ES/EN): ignora "amarillo"/"yellow" como ruido textil
 *   - Filtrado de prefijos de marca cortos: ignora "CHT", "SPN", "BTE" en archivos
 *   - Coincidencia de substrings para variantes tipográficas
 *   - Búsqueda inversa: tokens del archivo que existen en el producto
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

// NEW bonuses for fuzzy/stem matching
const SCORE_STEM5_MATCH = 12;   // 5-char stem match (e.g. "algin" in "alginato"↔"alginat")
const SCORE_STEM4_MATCH = 8;    // 4-char stem match (shorter fallback)
const SCORE_SUBSTR_MATCH = 6;   // substring inclusion
const SCORE_REVERSE_TOKEN = 10; // file token found in product (brand names, etc.)

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
  "copia", "draft", "borrador",
  // Common language/region suffixes in MSDS file names
  "spn", "esp", "spa", "eng", "enu", "deu", "fra", "por",
]);

/**
 * Color words in Spanish and English — very common in textile/dye product names
 * but rarely appear literally in MSDS file names (files use brand names instead).
 * These are treated as soft noise: stripped from the "core" token set for
 * name-similarity scoring, but kept for token counting.
 */
const COLOR_TOKENS_ES = new Set([
  "amarillo", "azul", "rojo", "verde", "naranja", "negro", "blanco",
  "gris", "violeta", "turqueza", "turquesa", "cafe", "marron", "morado",
  "celeste", "rosa", "beige", "dorado", "plateado", "oro", "plata",
  "brillante",
]);

const COLOR_TOKENS_EN = new Set([
  "yellow", "blue", "red", "green", "orange", "black", "white",
  "grey", "gray", "violet", "purple", "brown", "gold", "silver",
  "brilliant", "bright",
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
  // textile / auxiliary chemicals
  ["reductor", "reducing"],
  ["agente", "agent"],
  ["fijador", "fixative"],
  ["suavizante", "softener"],
  ["blanqueador", "bleacher"],
  ["humectante", "wetting"],
  ["dispersante", "dispersant"],
  ["emulsificante", "emulsifier"],
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
 * NEW: Merges split alphanumeric codes.
 *
 * Many MSDS file names separate the numeric part of a product code with a space:
 *   "NV 10"  → "NV10"
 *   "C 5G"   → "C5G"
 *   "P 2RN"  → "P2RN"
 *
 * Rule: if a purely-numeric token immediately follows a token that ends with
 * a letter (and the preceding token is short ≤ 4 chars), merge them.
 */
function mergeAlphaNumCodes(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = result[result.length - 1];
    if (
      prev !== undefined &&
      /^\d+$/.test(t) &&
      /[a-z]$/.test(prev) &&
      prev.length <= 4
    ) {
      result[result.length - 1] = prev + t;
    } else {
      result.push(t);
    }
  }
  return result;
}

/**
 * Splits normalized text into meaningful tokens, stripping noise words.
 * Also applies alphanumeric code merging.
 */
export function tokenize(normalizedText: string): string[] {
  const raw = normalizedText
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t));
  return mergeAlphaNumCodes(raw);
}

/**
 * NEW: Returns "core" tokens — meaningful tokens with color words removed.
 *
 * In the textile dye industry, product names include color descriptors
 * (AMARILLO, AZUL, YELLOW, BLUE…) that rarely appear in MSDS file names.
 * Stripping them from the comparison set avoids false negatives and false
 * positives caused by matching the wrong color.
 */
function coreTokens(tokens: string[]): string[] {
  return tokens.filter(
    (t) => !COLOR_TOKENS_ES.has(t) && !COLOR_TOKENS_EN.has(t),
  );
}

/**
 * NEW: Returns true if a token looks like a short brand/origin prefix that
 * appears in MSDS file names but not in product names.
 *
 * Examples: "CHT", "SPN", "BTE", "ENG", "ESP"
 * Rule: 2–4 letters, all alpha, not a meaningful word.
 */
function isBrandSuffix(token: string): boolean {
  return token.length <= 3 && /^[a-z]+$/.test(token);
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

// ── Fuzzy helpers ─────────────────────────────────────────────────────────────

/**
 * NEW: Returns true if two tokens share the same first `n` characters.
 * Used to match truncated or abbreviated product names in file names.
 *
 * Example: stemMatch("alginato", "alginat", 5) → true  (both start with "algin")
 */
function stemMatch(a: string, b: string, n: number): boolean {
  return a.length >= n && b.length >= n && a.slice(0, n) === b.slice(0, n);
}

/**
 * NEW: Returns true if one token is a substring of the other (min length 4).
 * Catches cases like "levafix" ⊂ "levafix_yellow" or "reduc" ⊂ "reductor".
 */
function substrMatch(a: string, b: string): boolean {
  const minLen = 4;
  if (a.length < minLen || b.length < minLen) return false;
  return a.includes(b) || b.includes(a);
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

  // ── 4. Token-based name similarity ────────────────────────────────────────
  const prodTokens = tokenize(normName);
  const fileTokens = tokenize(normFile);

  // Core = tokens without color words
  const prodCore = coreTokens(prodTokens);
  // For the file, also strip short brand suffixes
  const fileCoreRaw = coreTokens(fileTokens);
  const fileCore = fileCoreRaw.filter((t) => !isBrandSuffix(t));

  const prodExpanded = expandWithSynonyms(prodCore);
  const fileExpanded = expandWithSynonyms(fileCore);

  // Track already-matched tokens to avoid double-counting
  const alreadyMatched = new Set<string>();

  // 4a. Exact token match (forward: product tokens in file)
  const exactMatches = prodCore.filter((t) => fileExpanded.has(t));
  if (exactMatches.length > 0) {
    const count = exactMatches.length;
    score += count * SCORE_TOKEN_MATCH;
    exactMatches.forEach((t) => alreadyMatched.add(t));
    reasons.push(`tokens exactos: ${exactMatches.join(", ")}`);
  }

  // 4b. Exact token match (reverse: file tokens in product) — catches brand names
  const reverseMatches = fileCore.filter(
    (t) => prodExpanded.has(t) && !alreadyMatched.has(t) && t.length >= 4,
  );
  if (reverseMatches.length > 0) {
    score += reverseMatches.length * SCORE_REVERSE_TOKEN;
    reverseMatches.forEach((t) => alreadyMatched.add(t));
    reasons.push(`tokens inversos: ${reverseMatches.join(", ")}`);
  }

  // 4c. NEW — 5-char stem match: "alginato" ↔ "alginat", "novacron" ↔ "novacro"
  const stem5Matches = prodCore.filter(
    (pt) =>
      !alreadyMatched.has(pt) &&
      pt.length >= 5 &&
      fileCore.some((ft) => ft.length >= 5 && stemMatch(pt, ft, 5)),
  );
  if (stem5Matches.length > 0) {
    score += stem5Matches.length * SCORE_STEM5_MATCH;
    stem5Matches.forEach((t) => alreadyMatched.add(t));
    reasons.push(`stem5: ${stem5Matches.join(", ")}`);
  }

  // 4d. NEW — 4-char stem match fallback: shorter tokens/abbreviations
  const stem4Matches = prodCore.filter(
    (pt) =>
      !alreadyMatched.has(pt) &&
      pt.length >= 4 &&
      fileCore.some((ft) => ft.length >= 4 && stemMatch(pt, ft, 4)),
  );
  if (stem4Matches.length > 0) {
    score += stem4Matches.length * SCORE_STEM4_MATCH;
    stem4Matches.forEach((t) => alreadyMatched.add(t));
    reasons.push(`stem4: ${stem4Matches.join(", ")}`);
  }

  // 4e. NEW — Substring match: one token contains the other
  const substrMatches = prodCore.filter(
    (pt) =>
      !alreadyMatched.has(pt) &&
      fileCore.some((ft) => substrMatch(pt, ft)),
  );
  if (substrMatches.length > 0) {
    score += substrMatches.length * SCORE_SUBSTR_MATCH;
    substrMatches.forEach((t) => alreadyMatched.add(t));
    reasons.push(`substring: ${substrMatches.join(", ")}`);
  }

  // 4f. Overall name ratio bonus (replaces the old ratio block for core tokens)
  const totalProdCore = prodCore.length;
  const totalMatched = alreadyMatched.size;
  if (totalProdCore > 0 && totalMatched > 0) {
    const ratio = totalMatched / totalProdCore;
    if (ratio >= 0.8 && totalMatched >= 2) {
      score += SCORE_NAME_STRONG;
      reasons.push(`nombre muy similar (${Math.round(ratio * 100)}%)`);
    } else if (ratio >= 0.5 && totalMatched >= 2) {
      score += SCORE_NAME_PARTIAL;
      reasons.push(`coincidencia parcial de nombre (${Math.round(ratio * 100)}%)`);
    } else if (ratio >= 0.5 && totalMatched === 1) {
      // Single strong brand-name token covering ≥50% of core (e.g. "AMSABINDER",
      // "ANTHRASOL", "DIANIX") — enough to surface as MANUAL_REVIEW candidate
      const singleToken = [...alreadyMatched][0];
      if (singleToken && singleToken.length >= 6) {
        score += SCORE_TOKEN_MATCH;
        reasons.push(`token dominante: "${singleToken}"`);
      }
    }
  }

  // ── 5. Synonym match bonus ─────────────────────────────────────────────────
  const synonymMatches = prodCore.filter((t) => {
    for (const [a, b] of SYNONYMS) {
      if ((t === a && fileExpanded.has(b)) || (t === b && fileExpanded.has(a))) return true;
    }
    return false;
  });
  const newSynonyms = synonymMatches.filter((t) => !alreadyMatched.has(t));
  if (newSynonyms.length > 0) {
    score += SCORE_SYNONYM;
    reasons.push(`sinónimos: ${newSynonyms.join(", ")}`);
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

  // ── 8. Score cap ───────────────────────────────────────────────────────────
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
  files: MsdsDriveFile[],
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
