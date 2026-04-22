// ── Album MSDS HTML builder ───────────────────────────────────────────────────
// 6 etiquetas por hoja A4 (3 col × 2 fil), llenado completo de página.
// Código de barras CODE128 generado con el código real del producto.

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

// ── Iconos primeros auxilios ──────────────────────────────────────────────────
const ICON_EYES     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_SKIN     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v1M10 9V5a2 2 0 0 0-4 0v9"/><path d="M6 14v0a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/></svg>`;
const ICON_LUNG     = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6V3m0 0C9 3 6 5 6 8v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8c0-3-3-5-6-5z"/></svg>`;
const ICON_STOMACH  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0"/></svg>`;

// ── Parseo de primeros auxilios ───────────────────────────────────────────────
interface FirstAidParsed { ojos: string; piel: string; inhalacion: string; ingestion: string; }

function parseFirstAid(text: string | null | undefined): FirstAidParsed {
  const D = {
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
    if      (l.includes("ojo") || l.includes("ocular"))    r.ojos      = line.replace(/^ojos?:?\s*/i,"").trim() || r.ojos;
    else if (l.includes("piel") || l.includes("contacto")) r.piel      = line.replace(/^piel:?\s*/i,"").trim()  || r.piel;
    else if (l.includes("inhalaci") || l.includes("respir")) r.inhalacion = line.replace(/^inhalaci[oó]n:?\s*/i,"").trim() || r.inhalacion;
    else if (l.includes("ingesti") || l.includes("boca"))  r.ingestion = line.replace(/^ingesti[oó]n:?\s*/i,"").trim() || r.ingestion;
  }
  return r;
}

// ── Bullets de peligro según nivel ───────────────────────────────────────────
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

function levelConfig(level: string | null | undefined) {
  if (level === "alto_riesgo") return { bg: "#1a1a1a" };
  if (level === "controlado")  return { bg: "#2c3e50" };
  return { bg: "#2c2c2c" };
}

// ── Builder ───────────────────────────────────────────────────────────────────
export function buildMsdsAlbumHtml(
  products: MsdsProduct[],
  qrDataUrls: Record<string, string>,
  warehouseLabel: string,
): string {
  const chunks: MsdsProduct[][] = [];
  for (let i = 0; i < products.length; i += 6) chunks.push(products.slice(i, i + 6));

  const pagesHtml = chunks.map((chunk) => {
    // Rellenar hasta 6 para que la última página también ocupe toda la hoja
    const padded = [...chunk];
    while (padded.length < 6) padded.push(null as unknown as MsdsProduct);

    const cards = padded.map((p) => {
      if (!p) return `<div class="card card-empty"></div>`;

      const { bg } = levelConfig(p.hazardLevel);
      const fa = parseFirstAid(p.firstAid);
      const bullets = hazardBullets(p.hazardLevel);
      const typeLabel = p.category ? p.category.toUpperCase() : "PRODUCTO QUÍMICO";

      return `
<div class="card">
  <!-- CABECERA -->
  <div class="card-header" style="background:${bg};">
    <div class="hd-left">
      <svg class="hd-warn" viewBox="0 0 100 100">
        <polygon points="50,5 95,93 5,93" fill="none" stroke="white" stroke-width="9" stroke-linejoin="round"/>
        <text x="50" y="85" text-anchor="middle" font-size="55" font-weight="bold" fill="white" font-family="Arial">!</text>
      </svg>
      <div class="hd-name">${p.name}</div>
    </div>
    <div class="hd-badge">
      <div class="hd-msds">MSDS</div>
      <div class="hd-sub">FICHA DE SEGURIDAD</div>
    </div>
  </div>

  <!-- TIPO -->
  <div class="card-type">Tipo: ${typeLabel}</div>

  <!-- CÓDIGO + ÁREA -->
  <div class="card-meta">
    <div class="meta-item">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      <span class="meta-lbl">CÓDIGO</span>
      <span class="meta-val">${p.code}</span>
    </div>
    <div class="meta-sep"></div>
    <div class="meta-item">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      <span class="meta-lbl">ÁREA</span>
      <span class="meta-val">${p.warehouse}</span>
    </div>
  </div>

  <!-- PELIGRO -->
  <div class="sec-title sec-danger">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    PELIGRO
  </div>
  <div class="sec-body body-danger">
    ${bullets.map(b => `<div class="bullet">• ${b}</div>`).join("")}
  </div>

  <!-- PRIMEROS AUXILIOS -->
  <div class="sec-title sec-aid">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><rect x="3" y="11" width="18" height="2"/><rect x="11" y="3" width="2" height="18"/></svg>
    PRIMEROS AUXILIOS
  </div>
  <div class="sec-body body-aid">
    <div class="aid-row"><span class="aid-ico">${ICON_EYES}</span><span><b>Ojos:</b> ${fa.ojos}</span></div>
    <div class="aid-row"><span class="aid-ico">${ICON_SKIN}</span><span><b>Piel:</b> ${fa.piel}</span></div>
    <div class="aid-row"><span class="aid-ico">${ICON_LUNG}</span><span><b>Inhalación:</b> ${fa.inhalacion}</span></div>
    <div class="aid-row"><span class="aid-ico">${ICON_STOMACH}</span><span><b>Ingestión:</b> ${fa.ingestion}</span></div>
  </div>

  <!-- FOOTER: QR + CÓDIGO DE BARRAS -->
  <div class="card-footer">
    <div class="ft-qr">
      ${qrDataUrls[p.id]
        ? `<img src="${qrDataUrls[p.id]}" width="48" height="48" alt="QR"/>`
        : `<div class="qr-empty">Sin QR</div>`}
      <div class="ft-qr-lbl">ESCANEA PARA VER<br>MSDS COMPLETA</div>
    </div>
    <div class="ft-bar">
      <div class="bar-lbl">CÓDIGO DE BARRAS</div>
      <svg class="barcode-svg" data-code="${p.code}"></svg>
      <div class="bar-num">${p.code}</div>
    </div>
  </div>
</div>`;
    }).join("");

    return `
<div class="page-wrap">
  <div class="page-header">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
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
  @page { size: A4 portrait; margin: 0.5cm; }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: white; color: #111; font-size: 0; }

  /* Página: A4 = 297mm - 1cm márgenes = 28.7cm */
  .page-wrap {
    width: 100%;
    height: 28.7cm;
    display: flex;
    flex-direction: column;
  }
  .page-break { break-after: page; page-break-after: always; }

  /* Encabezado rojo */
  .page-header {
    background: #c0392b; color: white;
    text-align: center; padding: 4px 8px;
    font-size: 9.5px; font-weight: bold; letter-spacing: 0.8px;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    flex-shrink: 0;
  }
  .page-footer {
    text-align: center; font-size: 6.5px; color: #999;
    border-top: 1px solid #ddd; padding: 2px 0; flex-shrink: 0;
  }

  /* Grid 3×2 que ocupa todo el espacio restante */
  .page {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 4px;
    padding: 3px 0;
    min-height: 0;
  }

  /* Tarjeta */
  .card {
    border: 1.5px solid #222; border-radius: 4px;
    overflow: hidden; display: flex; flex-direction: column;
    break-inside: avoid; page-break-inside: avoid;
    background: white; min-height: 0;
  }
  .card-empty { border: 1.5px dashed #ddd; background: #fafafa; }

  /* Cabecera */
  .card-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 5px 6px 4px; gap: 4px; flex-shrink: 0; }
  .hd-left     { display: flex; align-items: flex-start; gap: 4px; flex: 1; min-width: 0; }
  .hd-warn     { width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px; }
  .hd-name     { font-size: 9px; font-weight: 900; color: white; text-transform: uppercase; line-height: 1.2; letter-spacing: 0.2px; word-break: break-word; }
  .hd-badge    { flex-shrink: 0; text-align: center; }
  .hd-msds     { background: white; color: #111; font-size: 8.5px; font-weight: 900; padding: 1px 5px; border-radius: 2px; letter-spacing: 1px; }
  .hd-sub      { font-size: 5px; color: #ccc; margin-top: 1px; letter-spacing: 0.3px; white-space: nowrap; }

  /* Tipo */
  .card-type { font-size: 6.5px; color: #555; padding: 2px 6px; border-bottom: 1px solid #e0e0e0; flex-shrink: 0; }

  /* Meta */
  .card-meta  { display: flex; align-items: center; padding: 3px 6px; gap: 5px; border-bottom: 1px solid #e0e0e0; background: #f8f8f8; flex-shrink: 0; }
  .meta-item  { display: flex; align-items: center; gap: 3px; }
  .meta-lbl   { font-size: 5.5px; color: #888; letter-spacing: 0.5px; text-transform: uppercase; }
  .meta-val   { font-size: 8px; font-weight: 900; color: #111; letter-spacing: 0.5px; }
  .meta-sep   { width: 1px; height: 14px; background: #ddd; margin: 0 3px; }

  /* Secciones */
  .sec-title  { display: flex; align-items: center; gap: 4px; padding: 2px 6px; font-size: 7px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; color: white; flex-shrink: 0; }
  .sec-danger { background: #2c2c2c; }
  .sec-aid    { background: #1a3a2a; }
  .sec-body   { padding: 3px 6px; border-bottom: 1px solid #e8e8e8; flex: 1; min-height: 0; overflow: hidden; }
  .body-danger { background: #fafafa; }
  .body-aid   { background: #f4fbf6; }
  .bullet     { font-size: 6.5px; color: #222; line-height: 1.6; }
  .aid-row    { display: flex; align-items: flex-start; gap: 3px; font-size: 6.5px; color: #222; line-height: 1.5; margin-bottom: 1.5px; }
  .aid-row:last-child { margin-bottom: 0; }
  .aid-ico    { flex-shrink: 0; color: #2c7a4b; margin-top: 0.5px; }

  /* Footer */
  .card-footer { display: flex; align-items: center; gap: 5px; padding: 4px 6px; background: #efefef; border-top: 1px solid #ddd; flex-shrink: 0; }
  .ft-qr       { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
  .ft-qr-lbl   { font-size: 5px; color: #555; text-align: center; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.3; }
  .qr-empty    { width: 48px; height: 48px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; font-size: 6px; color: #aaa; }
  .ft-bar      { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
  .bar-lbl     { font-size: 5.5px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
  .barcode-svg { width: 100%; height: 34px; display: block; }
  .bar-num     { font-size: 7.5px; font-weight: bold; letter-spacing: 1.5px; color: #111; }
</style>
</head>
<body>
${pagesHtml}
<script>
(function(){
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
  s.onload = function() {
    document.querySelectorAll('.barcode-svg').forEach(function(el) {
      var code = el.getAttribute('data-code');
      if (!code) return;
      try {
        JsBarcode(el, code, {
          format: 'CODE128',
          displayValue: false,
          height: 30,
          margin: 1,
          width: 1.4,
          background: 'transparent'
        });
      } catch(e) { console.warn('Barcode error for', code, e); }
    });
    setTimeout(function(){ window.print(); }, 300);
  };
  document.head.appendChild(s);
})();
<\/script>
</body>
</html>`;
}
