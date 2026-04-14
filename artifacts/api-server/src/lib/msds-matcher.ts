/**
 * msds-matcher.ts
 *
 * Motor inteligente de cruce de MSDS.
 * Compara productos de la base de datos con archivos PDF en Google Drive
 * usando lógica flexible y robusta, sin depender de nombres estructurados.
 *
 * Mejoras v3 (corrección de falsos positivos):
 *   - Color conflict penalty (-80): colores distintos = producto diferente.
 *     "AMARILLO EVERZOL GR" nunca puede ser "AZUL MARINO EVERZOL ED".
 *     Se soportan sinónimos ES↔EN (amarillo=yellow, azul=blue, etc.).
 *   - Variant mismatch penalty (-60): mismo brand pero variante distinta.
 *     "SILTEX HH" vs "SILTEX XS": brand coincide pero HH≠XS → rechazado.
 *   - Sufijos de idioma/región en archivos (SPN, ESP, ENG…) filtrados solo
 *     para archivos, NO para nombres de producto — evita eliminar variantes
 *     reales como HH, XS, GR, ED del análisis.
 *   - Stem matching 5-4 chars: detecta "ALGINAT"↔"ALGINATO".
 *   - Normalización de códigos alfanuméricos: "NV 10"→"NV10".
 *
 * Clasificación de resultados:
 *   EXACT         — código/fórmula exacta, o score ≥ 120
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

const THRESHOLD_EXACT = 120;
const THRESHOLD_PROBABLE = 60;
const THRESHOLD_MANUAL = 25;

const SCORE_CODE_EXACT = 100;
const SCORE_FORMULA_EXACT = 80;
const SCORE_NAME_STRONG = 70;
const SCORE_NAME_PARTIAL = 50;
const SCORE_TOKEN_MATCH = 15;
const SCORE_SUPPLIER = 20;
const SCORE_SYNONYM = 30;
const SCORE_CAS = 50;
const SCORE_STEM5 = 12;
const SCORE_STEM4 = 8;
const SCORE_SUBSTR = 6;
const SCORE_REVERSE_TOKEN = 10;

/** Different color dye → NEVER the same product */
const PENALTY_COLOR_CONFLICT = -80;
/** Same brand but different product variant (HH≠XS, GR≠ED) */
const PENALTY_VARIANT_MISMATCH = -60;

const FOLDER_BONUS: Record<string, number> = {
  aprobados: 15,
  approved: 15,
  aprobado: 15,
  validados: 10,
  validado: 10,
  por_validar: 5,
  validacion: 5,
  obsoletos: -20,
  obsoleto: -20,
  old: -10,
  archivos: -5,
};

/** General noise words removed from BOTH product and file names */
const NOISE_TOKENS = new Set([
  "msds", "fds", "ficha", "seguridad", "safety", "sheet", "data",
  "material", "sds", "hoja", "pdf", "file", "documento", "doc",
  "revision", "rev", "ver", "version", "v1", "v2", "v3", "final",
  "copia", "draft", "borrador",
]);

/**
 * Language / region suffixes that appear in MSDS FILE names only.
 * Applied exclusively to file tokenization — never to product names —
 * so that real product variant codes like "HH", "XS", "GR" are preserved.
 */
const FILE_LANG_SUFFIXES = new Set([
  "spn", "esp", "spa", "eng", "enu", "deu", "fra", "por",
  "chn", "jpn", "kor", "ita", "nld",
  "de", "en", "es", "fr", "pt", "it", "nl",
]);

/**
 * Color token synonyms ES ↔ EN.
 *
 * In textile / chemical industries product names contain color words
 * (AMARILLO EVERZOL) while the MSDS file may use the English form
 * (EVERZOL YELLOW) or no color at all.
 *
 * Critical rule: if BOTH sides specify a color and the colors are
 * DIFFERENT → hard penalty. "AMARILLO EVERZOL GR" ≠ "AZUL EVERZOL GR".
 */
const COLOR_SYNONYMS: Record<string, string> = {
  amarillo: "yellow", yellow: "amarillo",
  azul:     "blue",   blue:  "azul",
  rojo:     "red",    red:   "rojo",
  verde:    "green",  green: "verde",
  naranja:  "orange", orange:"naranja",
  negro:    "black",  black: "negro",
  blanco:   "white",  white: "blanco",
  gris:     "gray",   gray:  "gris",   grey: "gris",
  violeta:  "violet", violet:"violeta",purple:"violeta",
  marron:   "brown",  brown: "marron",
  marino:   "navy",   navy:  "marino",
  turqueza: "turquoise", turquesa: "turquoise", turquoise: "turqueza",
  dorado:   "gold",   gold:  "dorado", oro: "gold",
  brillante:"brilliant", brilliant:"brillante", bright:"brillante",
};

const ALL_COLORS = new Set(Object.keys(COLOR_SYNONYMS));

/** Bilingual synonym dictionary for chemical names */
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
  ["reductor", "reducing"],
  ["agente", "agent"],
  ["fijador", "fixative"],
  ["suavizante", "softener"],
  ["blanqueador", "bleacher"],
  ["humectante", "wetting"],
  ["dispersante", "dispersant"],
  ["emulsificante", "emulsifier"],
];

const FORMULA_PATTERNS: Array<[RegExp, string[]]> = [
  [/\bh2so4\b/i, ["acido", "sulfurico", "h2so4"]],
  [/\bhcl\b/i,   ["acido", "clorhidrico", "hcl"]],
  [/\bhno3\b/i,  ["acido", "nitrico", "hno3"]],
  [/\bh3po4\b/i, ["acido", "fosforico", "h3po4"]],
  [/\bnaoh\b/i,  ["sodio", "hidroxido", "naoh"]],
  [/\bkoh\b/i,   ["potasio", "hidroxido", "koh"]],
  [/\bca\(oh\)2\b/i, ["calcio", "hidroxido"]],
  [/\bnacl\b/i,  ["sodio", "cloruro", "nacl"]],
  [/\bnh3\b/i,   ["amoniaco", "nh3"]],
  [/\bnh4oh\b/i, ["amonio", "hidroxido", "nh4oh"]],
  [/\bh2o2\b/i,  ["peroxido", "hidrogeno", "h2o2"]],
  [/\bch3oh\b/i, ["metanol", "ch3oh"]],
  [/\bc2h5oh\b/i,["etanol", "c2h5oh"]],
  [/\bch3coch3\b/i, ["acetona", "ch3coch3"]],
  [/\bkmno4\b/i, ["permanganato", "potasio", "kmno4"]],
  [/\bfecl3\b/i, ["cloruro", "ferrico", "fecl3"]],
  [/\bcuso4\b/i, ["sulfato", "cobre", "cuso4"]],
  [/\bznso4\b/i, ["sulfato", "zinc", "znso4"]],
  [/\bna2co3\b/i,["carbonato", "sodio", "na2co3"]],
  [/\bnahco3\b/i,["bicarbonato", "sodio", "nahco3"]],
  [/\bcacl2\b/i, ["cloruro", "calcio", "cacl2"]],
  [/\bnaclo\b/i, ["hipoclorito", "sodio", "naclo"]],
];

// ── Text Normalization ────────────────────────────────────────────────────────

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeText(text: string): string {
  let s = removeAccents(text);
  s = s.replace(/\.[a-zA-Z0-9]{2,5}$/, "");
  s = s.toLowerCase();
  s = s.replace(/[_\-./\\]/g, " ");
  s = s.replace(/[^a-z0-9 ]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Merges split alphanumeric product codes.
 * "NV 10" → "NV10",  "C 5G" → "C5G",  "P 2RN" → "P2RN"
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

/** Tokenize a product name. */
export function tokenize(normalizedText: string): string[] {
  const raw = normalizedText
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t));
  return mergeAlphaNumCodes(raw);
}

/**
 * Tokenize a FILE name.
 * Removes language/region suffixes (SPN, ENG…) on top of normal noise,
 * but does NOT remove product variant codes (HH, XS, GR, ED…).
 */
function tokenizeFile(normalizedText: string): string[] {
  const raw = normalizedText
    .split(" ")
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length >= 2 &&
        !NOISE_TOKENS.has(t) &&
        !FILE_LANG_SUFFIXES.has(t),
    );
  return mergeAlphaNumCodes(raw);
}

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

function formulaTokens(normalizedText: string): string[] {
  const extra: string[] = [];
  for (const [pattern, tokens] of FORMULA_PATTERNS) {
    if (pattern.test(normalizedText)) extra.push(...tokens);
  }
  return extra;
}

function stemMatch(a: string, b: string, n: number): boolean {
  return a.length >= n && b.length >= n && a.slice(0, n) === b.slice(0, n);
}

function substrMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  return a.includes(b) || b.includes(a);
}

// ── Color compatibility ───────────────────────────────────────────────────────

/**
 * Returns:
 *   null  → one side has no color tokens (can't judge, no penalty)
 *   true  → both sides have colors and they are compatible (same color ES/EN)
 *   false → both sides have colors and they are DIFFERENT → PENALTY
 */
function colorsCompatible(
  pColors: string[],
  fColors: string[],
): boolean | null {
  if (pColors.length === 0 || fColors.length === 0) return null;
  for (const a of pColors) {
    for (const b of fColors) {
      if (a === b || COLOR_SYNONYMS[a] === b || COLOR_SYNONYMS[b] === a) {
        return true;
      }
    }
  }
  return false;
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

export function calculateScore(input: ScoreInput): ScoreDetail {
  const {
    productCode, productName, productSupplier, productCas,
    fileName, folderName,
  } = input;

  let score = 0;
  const reasons: string[] = [];

  const normFile = normalizeText(fileName);
  const normName = normalizeText(productName);
  const normCode = normalizeText(productCode);
  const normSupplier = productSupplier ? normalizeText(productSupplier) : null;
  const normCas = productCas
    ? productCas.replace(/\s+/g, "").toLowerCase()
    : null;

  // ── 1. Exact product code match ───────────────────────────────────────────
  if (normCode.length >= 3 && normFile.includes(normCode)) {
    score += SCORE_CODE_EXACT;
    reasons.push(`código "${productCode}" encontrado en nombre de archivo`);
  }

  // ── 2. CAS number match ───────────────────────────────────────────────────
  if (normCas && normCas.length >= 5) {
    const normFileCas = normFile.replace(/\s+/g, "").replace(/-/g, "");
    if (normFileCas.includes(normCas.replace(/-/g, ""))) {
      score += SCORE_CAS;
      reasons.push(`número CAS "${productCas}" encontrado`);
    }
  }

  // ── 3. Chemical formula match ─────────────────────────────────────────────
  const fileFormToks = formulaTokens(normFile);
  const prodFormToks = formulaTokens(normName);
  if (fileFormToks.length > 0 && prodFormToks.length > 0) {
    const shared = prodFormToks.filter((t) => fileFormToks.includes(t));
    if (shared.length > 0) {
      score += SCORE_FORMULA_EXACT;
      reasons.push(`fórmula química coincide: ${[...new Set(shared)].join(", ")}`);
    }
  }

  // ── 4. Color check (HARD GATE) ────────────────────────────────────────────
  const prodTokens = tokenize(normName);
  const fileTokens = tokenizeFile(normFile);

  const pColors = prodTokens.filter((t) => ALL_COLORS.has(t));
  const fColors = fileTokens.filter((t) => ALL_COLORS.has(t));

  const colorResult = colorsCompatible(pColors, fColors);
  if (colorResult === false) {
    score += PENALTY_COLOR_CONFLICT;
    reasons.push(
      `color diferente: [${pColors.join("+")}] ≠ [${fColors.join("+")}]`,
    );
    // Early exit — different color dyes are never the same MSDS
    return { score: Math.min(score, 200), reasons };
  }
  if (colorResult === true) {
    reasons.push(`color coincide (${pColors.join("+")}=${fColors.join("+")})`);
  }

  // ── 5. Token name similarity ──────────────────────────────────────────────
  const prodCore = prodTokens.filter((t) => !ALL_COLORS.has(t));
  const fileCore = fileTokens.filter((t) => !ALL_COLORS.has(t));

  if (prodCore.length === 0) return { score: Math.min(score, 200), reasons };

  const prodExpanded = expandWithSynonyms(prodCore);
  const fileExpanded = expandWithSynonyms(fileCore);
  const alreadyMatched = new Set<string>();

  // 5a. Exact forward (product tokens found in file)
  const exactFwd = prodCore.filter((t) => fileExpanded.has(t));
  if (exactFwd.length > 0) {
    score += exactFwd.length * SCORE_TOKEN_MATCH;
    exactFwd.forEach((t) => alreadyMatched.add(t));
    reasons.push(`tokens exactos: ${exactFwd.join(", ")}`);
  }

  // 5b. Exact reverse (file tokens found in product) — catches brand names
  const exactRev = fileCore.filter(
    (t) => prodExpanded.has(t) && !alreadyMatched.has(t) && t.length >= 5,
  );
  if (exactRev.length > 0) {
    score += exactRev.length * SCORE_REVERSE_TOKEN;
    exactRev.forEach((t) => alreadyMatched.add(t));
    reasons.push(`tokens inversos: ${exactRev.join(", ")}`);
  }

  // 5c. Stem-5 match (e.g. "alginato" ↔ "alginat")
  const stem5 = prodCore.filter(
    (pt) =>
      !alreadyMatched.has(pt) &&
      pt.length >= 5 &&
      fileCore.some((ft) => ft.length >= 5 && stemMatch(pt, ft, 5)),
  );
  if (stem5.length > 0) {
    score += stem5.length * SCORE_STEM5;
    stem5.forEach((t) => alreadyMatched.add(t));
    reasons.push(`stem5: ${stem5.join(", ")}`);
  }

  // 5d. Stem-4 match
  const stem4 = prodCore.filter(
    (pt) =>
      !alreadyMatched.has(pt) &&
      pt.length >= 4 &&
      fileCore.some((ft) => ft.length >= 4 && stemMatch(pt, ft, 4)),
  );
  if (stem4.length > 0) {
    score += stem4.length * SCORE_STEM4;
    stem4.forEach((t) => alreadyMatched.add(t));
    reasons.push(`stem4: ${stem4.join(", ")}`);
  }

  // 5e. Substring match
  const subStr = prodCore.filter(
    (pt) =>
      !alreadyMatched.has(pt) &&
      fileCore.some((ft) => substrMatch(pt, ft)),
  );
  if (subStr.length > 0) {
    score += subStr.length * SCORE_SUBSTR;
    subStr.forEach((t) => alreadyMatched.add(t));
    reasons.push(`substring: ${subStr.join(", ")}`);
  }

  // 5f. Ratio bonus
  const ratio = alreadyMatched.size / prodCore.length;
  if (ratio >= 0.8 && alreadyMatched.size >= 2) {
    score += SCORE_NAME_STRONG;
    reasons.push(`nombre muy similar (${Math.round(ratio * 100)}%)`);
  } else if (ratio >= 0.5 && alreadyMatched.size >= 2) {
    score += SCORE_NAME_PARTIAL;
    reasons.push(`coincidencia parcial de nombre (${Math.round(ratio * 100)}%)`);
  } else if (ratio >= 0.5 && alreadyMatched.size === 1) {
    const singleToken = [...alreadyMatched][0];
    if (singleToken && singleToken.length >= 6) {
      score += SCORE_TOKEN_MATCH;
      reasons.push(`token dominante: "${singleToken}"`);
    }
  }

  // ── 6. Variant mismatch penalty ───────────────────────────────────────────
  // If a brand name (long token) matches on both sides, but both sides also
  // have short unmatched variant tokens that are DIFFERENT → penalty.
  //
  //   "SILTEX HH" vs "SILTEX XS"  → sharedBrand=siltex, HH≠XS → -60
  //   "SILTEX HH" vs "SILTEX HH SPN" → sharedBrand=siltex, HH=HH → no penalty
  const sharedBrands = prodCore.filter(
    (t) => t.length >= 5 && fileCore.includes(t),
  );
  if (sharedBrands.length > 0) {
    const pVariants = prodCore.filter(
      (t) => t.length >= 2 && t.length <= 4 && !alreadyMatched.has(t),
    );
    const fVariants = fileCore.filter(
      (t) => t.length >= 2 && t.length <= 4 && !alreadyMatched.has(t),
    );
    if (pVariants.length > 0 && fVariants.length > 0) {
      const sharedVariants = pVariants.filter((v) => fVariants.includes(v));
      if (sharedVariants.length === 0) {
        score += PENALTY_VARIANT_MISMATCH;
        reasons.push(
          `variante diferente: prod[${pVariants.join("+")}] ≠ archivo[${fVariants.join("+")}]`,
        );
      }
    }
  }

  // ── 7. Synonym bonus ──────────────────────────────────────────────────────
  const synonymMatches = prodCore.filter((t) => {
    for (const [a, b] of SYNONYMS) {
      if ((t === a && fileExpanded.has(b)) || (t === b && fileExpanded.has(a)))
        return true;
    }
    return false;
  });
  const newSyns = synonymMatches.filter((t) => !alreadyMatched.has(t));
  if (newSyns.length > 0) {
    score += SCORE_SYNONYM;
    reasons.push(`sinónimos: ${newSyns.join(", ")}`);
  }

  // ── 8. Supplier match ─────────────────────────────────────────────────────
  if (normSupplier && normSupplier.length >= 3) {
    const supTokens = tokenize(normSupplier);
    const supMatches = supTokens.filter(
      (t) => t.length >= 4 && normFile.includes(t),
    );
    if (supMatches.length > 0) {
      score += SCORE_SUPPLIER;
      reasons.push(`proveedor coincide: ${supMatches.join(", ")}`);
    }
  }

  // ── 9. Folder priority bonus ──────────────────────────────────────────────
  const normFolder = normalizeText(folderName).replace(/\s+/g, "_");
  for (const [keyword, bonus] of Object.entries(FOLDER_BONUS)) {
    if (normFolder.includes(keyword)) {
      score += bonus;
      if (bonus > 0)
        reasons.push(`carpeta prioritaria: ${folderName} (+${bonus})`);
      break;
    }
  }

  return { score: Math.min(score, 200), reasons };
}

// ── Classification ────────────────────────────────────────────────────────────

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

export function matchProductWithFiles(
  product: ProductInput,
  files: MsdsDriveFile[],
): MatchResult {
  if (files.length === 0) {
    return {
      status: "NONE",
      score: 0,
      best: null,
      candidates: [],
      reason: "No hay archivos MSDS disponibles",
    };
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

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  const status = best ? classifyMatch(best.score) : "NONE";
  const reason = best?.reason ?? "Sin coincidencia encontrada";

  return {
    status,
    score: best?.score ?? 0,
    best,
    candidates: candidates.slice(0, 5),
    reason,
  };
}
