// ── Album MSDS HTML builder ───────────────────────────────────────────────────
// Clon de la referencia: tipografía grande, ícono diamante con "!",
// secciones PELIGRO / PRIMEROS AUXILIOS, QR + código de barras inline SVG.

export interface MsdsProduct {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  category?: string | null;
  hazardLevel?: string | null;
  hazardPictograms?: string | null;
  firstAid?: string | null;
  msdsUrl?: string | null;
}

// ── Iconos primeros auxilios (SVG inline, tamaño visible) ────────────────────
const ICON_EYES = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_SKIN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v1M10 9V5a2 2 0 0 0-4 0v9"/><path d="M6 14v0a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/></svg>`;
const ICON_LUNG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6V2M8 6C5 6 3 8 3 11v5a3 3 0 0 0 3 3h2V6zM16 6c3 0 5 2 5 5v5a3 3 0 0 1-3 3h-2V6z"/></svg>`;
const ICON_STOM = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0"/></svg>`;

// ── Parseo de primeros auxilios ───────────────────────────────────────────────
interface FA { ojos: string; piel: string; inhalacion: string; ingestion: string; }

function parseFirstAid(text: string | null | undefined): FA {
  const D: FA = {
    ojos:      "Enjuagar con agua abundante durante 10 min.",
    piel:      "Lavar con agua y jabón.",
    inhalacion:"Trasladar a un lugar fresco y ventilado.",
    ingestion: "No inducir el vómito. Beber agua y consultar médico si hay malestar.",
  };
  if (!text?.trim()) return D;
  const lines = text.split(/[·\n\r;]/).map(s => s.trim()).filter(Boolean);
  const r = { ...D };
  for (const line of lines) {
    const l = line.toLowerCase();
    if      (l.includes("ojo") || l.includes("ocular"))     r.ojos      = line.replace(/^ojos?:?\s*/i,"").trim() || r.ojos;
    else if (l.includes("piel") || l.includes("contacto"))  r.piel      = line.replace(/^piel:?\s*/i,"").trim()  || r.piel;
    else if (l.includes("inhalaci") || l.includes("respir")) r.inhalacion = line.replace(/^inhalaci[oó]n:?\s*/i,"").trim() || r.inhalacion;
    else if (l.includes("ingesti") || l.includes("boca"))   r.ingestion = line.replace(/^ingesti[oó]n:?\s*/i,"").trim() || r.ingestion;
  }
  return r;
}

function hazardBullets(level: string | null | undefined): string[] {
  if (level === "alto_riesgo") return [
    "Producto de alto riesgo — manipular con EPP completo.",
    "Puede causar daño grave por exposición mínima.",
    "Mantener en área restringida y ventilada.",
    "Prohibido almacenar con materiales incompatibles.",
  ];
  if (level === "controlado") return [
    "Uso controlado — requiere autorización previa.",
    "Evitar contacto prolongado con piel y mucosas.",
    "No mezclar con ácidos ni oxidantes.",
    "Mantener fuera del alcance de personas no autorizadas.",
  ];
  return [
    "Puede irritar los ojos y la piel.",
    "Evitar la inhalación de polvos o vapores.",
    "Puede causar malestar gastrointestinal si se ingiere.",
    "Mantener fuera del alcance de los niños.",
  ];
}

// ── Generador de código de barras CODE128B inline SVG ────────────────────────
// Sin dependencias externas. Índices 0-based coincidentes con PATTERNS[].
function generateBarcodeSVG(text: string, width: number, height: number): string {
  // PATTERNS[i] corresponde al símbolo CODE128 con valor i (0..106)
  const PATTERNS: string[] = [
    "11011001100","11001101100","11001100110","10010011000","10010001100",
    "10001001100","10011001000","10011000100","10001100100","11001001000",
    "11001000100","11000100100","10110011100","10011011100","10011001110",
    "10111001100","10011101100","10011100110","11001110010","11001011100",
    "11001001110","11011100100","11001110100","11101101110","11101001100",
    "11100101100","11100100110","11101100100","11100110100","11100110010",
    "11011011000","11011000110","11000110110","10100011000","10001011000",
    "10001000110","10110001000","10001101000","10001100010","11010001000",
    "11000101000","11000100010","10110111000","10110001110","10001101110",
    "10111011000","10111000110","10001110110","11101110110","11010001110",
    "11000101110","11011101000","11011100010","11011101110","11101011000",
    "11101000110","11100010110","11101101000","11101100010","11100011010",
    "11101111010","11001000010","11110001010","10100110000","10100001100",
    "10010110000","10010000110","10000101100","10000100110","10110010000",
    "10110000100","10011010000","10011000010","10000110100","10000110010",
    "11000010010","11001010000","11110111010","11000010100","10001111010",
    "10100111100","10010111100","10010011110","10111100100","10011110100",
    "10011110010","11110100100","11110010100","11110010010","11011011110",
    "11011110110","11110110110","10101111000","10100011110","10001011110",
    "10111101000","10111100010","11110101000","11110100010","10111011110",
    "10111101110","11101011110","11110101110","11010000100","11010010000",
    "11010011100","11000111010",
  ];
  // Stop pattern fijo
  const STOP_PATTERN = "1100011101011";

  // En CODE128B: carácter con código ASCII `a` tiene valor (a - 32)
  // (espacio=0, '!'=1, ..., '0'=16, ..., '-'=13, etc.)
  const charToVal = (c: string): number => {
    const v = c.charCodeAt(0) - 32;
    return (v >= 0 && v <= 95) ? v : 0;
  };

  const START_B = 104; // valor del símbolo START B
  const codes: number[] = [START_B];
  let checksum = START_B;
  for (let i = 0; i < text.length; i++) {
    const v = charToVal(text[i]);
    codes.push(v);
    checksum += v * (i + 1);
  }
  codes.push(checksum % 103);

  // Build bit string
  let bits = "";
  for (const code of codes) bits += PATTERNS[code];
  bits += STOP_PATTERN;

  // Draw SVG bars
  const barW = Math.max(1, Math.floor(width / bits.length));
  const svgW = barW * bits.length;
  let bars = "";
  let x = 0;
  let i = 0;
  while (i < bits.length) {
    const bit = bits[i];
    let run = 0;
    while (i + run < bits.length && bits[i + run] === bit) run++;
    if (bit === "1") {
      bars += `<rect x="${x}" y="0" width="${barW * run}" height="${height}" fill="black"/>`;
    }
    x += barW * run;
    i += run;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${height}" viewBox="0 0 ${svgW} ${height}" style="display:block;">${bars}</svg>`;
}

// ── Builder principal ─────────────────────────────────────────────────────────
export function buildMsdsAlbumHtml(
  products: MsdsProduct[],
  qrDataUrls: Record<string, string>,
  warehouseLabel: string,
): string {
  const chunks: MsdsProduct[][] = [];
  for (let i = 0; i < products.length; i += 6) chunks.push(products.slice(i, i + 6));

  const pagesHtml = chunks.map((chunk) => {
    const padded = [...chunk];
    while (padded.length < 6) padded.push(null as unknown as MsdsProduct);

    const cards = padded.map((p) => {
      if (!p) return `<div class="card card-empty"></div>`;

      const fa = parseFirstAid(p.firstAid);
      const bullets = hazardBullets(p.hazardLevel);
      const typeLabel = p.category ? p.category.toUpperCase() : "PRODUCTO QUÍMICO";
      const barcodeSVG = generateBarcodeSVG(p.code, 160, 36);

      return `
<div class="card">

  <!-- CABECERA -->
  <div class="card-header">
    <div class="hd-left">
      <svg class="hd-diamond" viewBox="0 0 100 100">
        <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="black" stroke-width="8"/>
        <text x="50" y="67" text-anchor="middle" font-size="52" font-weight="bold" fill="black" font-family="Arial">!</text>
      </svg>
      <div class="hd-text">
        <div class="hd-name">${p.name}</div>
        <div class="hd-type">Tipo: ${typeLabel}</div>
      </div>
    </div>
    <div class="hd-badge">
      <div class="hd-msds">MSDS</div>
      <div class="hd-sub">FICHA DE SEGURIDAD</div>
    </div>
  </div>

  <!-- CÓDIGO + ÁREA -->
  <div class="card-meta">
    <div class="meta-item">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      <div><div class="meta-lbl">CÓDIGO</div><div class="meta-val">${p.code}</div></div>
    </div>
    <div class="meta-sep"></div>
    <div class="meta-item">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      <div><div class="meta-lbl">ÁREA</div><div class="meta-val">${p.warehouse}</div></div>
    </div>
  </div>

  <!-- PELIGRO -->
  <div class="sec-hd sec-danger">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    PELIGRO
  </div>
  <div class="sec-body danger-bg">
    ${bullets.map(b => `<div class="bullet">• ${b}</div>`).join("")}
  </div>

  <!-- PRIMEROS AUXILIOS -->
  <div class="sec-hd sec-aid">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><rect x="3" y="11" width="18" height="2"/><rect x="11" y="3" width="2" height="18"/></svg>
    PRIMEROS AUXILIOS
  </div>
  <div class="sec-body aid-bg">
    <div class="aid-row"><span class="aid-ico">${ICON_EYES}</span><span><b>Ojos:</b> ${fa.ojos}</span></div>
    <div class="aid-row"><span class="aid-ico">${ICON_SKIN}</span><span><b>Piel:</b> ${fa.piel}</span></div>
    <div class="aid-row"><span class="aid-ico">${ICON_LUNG}</span><span><b>Inhalación:</b> ${fa.inhalacion}</span></div>
    <div class="aid-row"><span class="aid-ico">${ICON_STOM}</span><span><b>Ingestión:</b> ${fa.ingestion}</span></div>
  </div>

  <!-- FOOTER QR + BARCODE -->
  <div class="card-footer">
    <div class="ft-qr">
      ${qrDataUrls[p.id]
        ? `<img src="${qrDataUrls[p.id]}" width="56" height="56" alt="QR" style="display:block;"/>`
        : `<div class="qr-empty">QR</div>`}
      <div class="ft-qr-lbl">ESCANEA PARA VER<br>MSDS COMPLETA</div>
    </div>
    <div class="ft-bar">
      <div class="bar-lbl">CÓDIGO DE BARRAS</div>
      <div class="bar-img">${barcodeSVG}</div>
      <div class="bar-num">${p.code}</div>
    </div>
  </div>

</div>`;
    }).join("");

    return `
<div class="page-wrap">
  <div class="page-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
    PRODUCTOS QUÍMICOS – FICHAS DE SEGURIDAD MSDS
  </div>
  <div class="page">${cards}</div>
  <div class="page-footer">Documento de uso interno — En caso de emergencia contactar al responsable del almacén</div>
</div>
<div class="page-break"></div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Álbum MSDS — ${warehouseLabel}</title>
<style>
  @page { size: A4 portrait; margin: 0.6cm; }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { width: 100%; height: 100%; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: Arial, Helvetica, sans-serif; background: white; color: #111; }

  /* ── Página: ocupa exactamente A4 menos márgenes ── */
  /* A4 = 297mm, márgenes 0.6cm×2 = 1.2cm → 285.8mm ≈ 28.58cm */
  .page-wrap {
    width: 100%;
    height: 28.58cm;
    display: flex;
    flex-direction: column;
  }
  .page-break { break-after: page; page-break-after: always; }

  /* ── Encabezado rojo ── */
  .page-header {
    background: #c0392b;
    color: white;
    text-align: center;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex-shrink: 0;
  }
  .page-footer {
    text-align: center;
    font-size: 7px;
    color: #aaa;
    border-top: 1px solid #ddd;
    padding: 3px 0;
    flex-shrink: 0;
  }

  /* ── Grid 3×2 que llena todo el espacio ── */
  .page {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 5px;
    padding: 4px 0;
    min-height: 0;
  }

  /* ── Tarjeta ── */
  .card {
    border: 1.5px solid #333;
    border-radius: 5px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    break-inside: avoid;
    page-break-inside: avoid;
    background: white;
    min-height: 0;
  }
  .card-empty { border: 1.5px dashed #ddd; background: #fafafa; }

  /* ── Cabecera blanca con diamante ── */
  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 8px 8px 5px;
    gap: 6px;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0;
    background: white;
  }
  .hd-left {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    flex: 1;
    min-width: 0;
  }
  .hd-diamond {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .hd-text { flex: 1; min-width: 0; }
  .hd-name {
    font-size: 13px;
    font-weight: 900;
    color: #111;
    text-transform: uppercase;
    line-height: 1.2;
    letter-spacing: 0.3px;
    word-break: break-word;
  }
  .hd-type {
    font-size: 8px;
    color: #555;
    margin-top: 3px;
    letter-spacing: 0.2px;
  }
  .hd-badge {
    flex-shrink: 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .hd-msds {
    background: #222;
    color: white;
    font-size: 11px;
    font-weight: 900;
    padding: 2px 7px;
    border-radius: 3px;
    letter-spacing: 1.5px;
  }
  .hd-sub {
    font-size: 6px;
    color: #777;
    margin-top: 2px;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  /* ── Meta: código / área ── */
  .card-meta {
    display: flex;
    align-items: center;
    padding: 5px 8px;
    gap: 8px;
    border-bottom: 1.5px solid #ddd;
    background: white;
    flex-shrink: 0;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .meta-lbl {
    font-size: 7px;
    color: #888;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    line-height: 1;
  }
  .meta-val {
    font-size: 12px;
    font-weight: 900;
    color: #111;
    letter-spacing: 0.5px;
    line-height: 1;
    margin-top: 1px;
  }
  .meta-sep {
    width: 1.5px;
    height: 22px;
    background: #ccc;
    margin: 0 4px;
  }

  /* ── Encabezados de sección ── */
  .sec-hd {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: white;
    flex-shrink: 0;
  }
  .sec-danger { background: #2c2c2c; }
  .sec-aid    { background: #1a3a2a; }

  /* ── Cuerpo de sección ── */
  .sec-body {
    padding: 5px 8px;
    border-bottom: 1px solid #e0e0e0;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .danger-bg { background: white; }
  .aid-bg    { background: #f5faf6; }

  .bullet {
    font-size: 9px;
    color: #222;
    line-height: 1.7;
  }

  .aid-row {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    font-size: 9px;
    color: #222;
    line-height: 1.5;
    margin-bottom: 3px;
  }
  .aid-row:last-child { margin-bottom: 0; }
  .aid-ico {
    flex-shrink: 0;
    color: #1a3a2a;
    margin-top: 1px;
  }

  /* ── Footer QR + barcode ── */
  .card-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: #f5f5f5;
    border-top: 1.5px solid #ccc;
    flex-shrink: 0;
  }
  .ft-qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }
  .ft-qr-lbl {
    font-size: 6px;
    color: #555;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.4;
  }
  .qr-empty {
    width: 56px; height: 56px;
    border: 1px dashed #ccc;
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; color: #aaa;
  }
  .ft-bar {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }
  .bar-lbl {
    font-size: 7px;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .bar-img {
    width: 100%;
    overflow: hidden;
    line-height: 0;
  }
  .bar-img svg {
    width: 100% !important;
    height: 38px !important;
    display: block;
  }
  .bar-num {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 2px;
    color: #111;
  }
</style>
</head>
<body>
${pagesHtml}
<script>
  // Abrir diálogo de impresión automáticamente
  window.onload = function(){ window.print(); };
<\/script>
</body>
</html>`;
}
