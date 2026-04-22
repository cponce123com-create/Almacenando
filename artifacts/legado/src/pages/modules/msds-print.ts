// ── Album MSDS HTML builder ───────────────────────────────────────────────────
// Diseño profesional tipo etiqueta industrial con código de barras, QR,
// secciones de PELIGRO y PRIMEROS AUXILIOS con iconos SVG.

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

// ── Iconos de primeros auxilios (SVG inline) ──────────────────────────────────
const ICON_EYES = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_SKIN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0m0 0V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M6 14v0a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/></svg>`;
const ICON_LUNG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.081 20C4.378 20 3 18.593 3 16.857v-3.714c0-1.03.502-2 1.33-2.571L12 5l7.67 5.572c.828.571 1.33 1.54 1.33 2.571v3.714C21 18.593 19.622 20 17.919 20c-.87 0-1.719-.37-2.34-1.025L12 15l-3.579 3.975A3.216 3.216 0 0 1 6.081 20z"/><line x1="12" y1="5" x2="12" y2="15"/></svg>`;
const ICON_STOMACH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12s1-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;

// ── Mapeo de instrucciones de primeros auxilios por palabras clave ─────────────
interface FirstAidParsed {
  ojos: string;
  piel: string;
  inhalacion: string;
  ingestion: string;
}

function parseFirstAid(text: string | null | undefined): FirstAidParsed {
  const defaults = {
    ojos:      "Enjuagar con agua abundante 10 min. Consultar médico.",
    piel:      "Lavar con agua y jabón abundantemente.",
    inhalacion:"Trasladar a lugar fresco y ventilado.",
    ingestion: "No inducir el vómito. Beber agua y consultar médico.",
  };
  if (!text?.trim()) return defaults;

  const lines = text.split(/[·\n\r;]/).map((s) => s.trim()).filter(Boolean);
  const result = { ...defaults };

  for (const line of lines) {
    const l = line.toLowerCase();
    if (l.includes("ojo") || l.includes("ocular") || l.includes("vista")) {
      result.ojos = line.replace(/^(ojos?:?\s*)/i, "").trim() || result.ojos;
    } else if (l.includes("piel") || l.includes("contacto") || l.includes("dérmico")) {
      result.piel = line.replace(/^(piel:?\s*)/i, "").trim() || result.piel;
    } else if (l.includes("inhalaci") || l.includes("vapor") || l.includes("gas") || l.includes("respir")) {
      result.inhalacion = line.replace(/^(inhalaci[oó]n:?\s*)/i, "").trim() || result.inhalacion;
    } else if (l.includes("ingesti") || l.includes("ingerir") || l.includes("tragar") || l.includes("boca")) {
      result.ingestion = line.replace(/^(ingesti[oó]n:?\s*)/i, "").trim() || result.ingestion;
    }
  }
  return result;
}

// ── Hazard bullets según nivel ────────────────────────────────────────────────
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

// ── Configuración visual por nivel de riesgo ──────────────────────────────────
function levelConfig(level: string | null | undefined) {
  if (level === "alto_riesgo") return { headerBg: "#1a1a1a", headerLabel: "ALTO RIESGO" };
  if (level === "controlado")  return { headerBg: "#2c3e50", headerLabel: "USO CONTROLADO" };
  return { headerBg: "#2c2c2c", headerLabel: "PRECAUCIÓN" };
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
    const cards = chunk.map((p) => {
      const { headerBg, headerLabel } = levelConfig(p.hazardLevel);
      const fa = parseFirstAid(p.firstAid);
      const bullets = hazardBullets(p.hazardLevel);
      const typeLabel = p.category ?? "";

      return `
      <div class="card">

        <!-- ── CABECERA: Ícono + MSDS + nombre ── -->
        <div class="card-header" style="background:${headerBg};">
          <div class="header-left">
            <svg width="22" height="22" viewBox="0 0 100 100">
              <polygon points="50,4 96,96 4,96" fill="none" stroke="white" stroke-width="8" stroke-linejoin="round"/>
              <text x="50" y="82" text-anchor="middle" font-size="52" font-weight="bold" fill="white" font-family="Arial">!</text>
            </svg>
            <div class="header-title">${p.name}</div>
          </div>
          <div class="header-badge">
            <div class="msds-box">MSDS</div>
            <div class="msds-sub">FICHA DE SEGURIDAD</div>
          </div>
        </div>

        <!-- ── SUBTÍTULO tipo ── -->
        <div class="card-type">Tipo: ${typeLabel ? typeLabel.toUpperCase() : "PRODUCTO QUÍMICO"}</div>

        <!-- ── CÓDIGO + ÁREA ── -->
        <div class="card-meta">
          <div class="meta-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            <span class="meta-label">CÓDIGO</span>
            <span class="meta-value">${p.code}</span>
          </div>
          <div class="meta-sep"></div>
          <div class="meta-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            <span class="meta-label">ÁREA</span>
            <span class="meta-value">${p.warehouse}</span>
          </div>
        </div>

        <!-- ── SECCIÓN PELIGRO ── -->
        <div class="section-title danger-title">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          PELIGRO
        </div>
        <div class="section-body danger-body">
          ${bullets.map((b) => `<div class="bullet">• ${b}</div>`).join("")}
        </div>

        <!-- ── SECCIÓN PRIMEROS AUXILIOS ── -->
        <div class="section-title aid-title">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          PRIMEROS AUXILIOS
        </div>
        <div class="section-body aid-body">
          <div class="aid-row">
            <span class="aid-icon">${ICON_EYES}</span>
            <span><strong>Ojos:</strong> ${fa.ojos}</span>
          </div>
          <div class="aid-row">
            <span class="aid-icon">${ICON_SKIN}</span>
            <span><strong>Piel:</strong> ${fa.piel}</span>
          </div>
          <div class="aid-row">
            <span class="aid-icon">${ICON_LUNG}</span>
            <span><strong>Inhalación:</strong> ${fa.inhalacion}</span>
          </div>
          <div class="aid-row">
            <span class="aid-icon">${ICON_STOMACH}</span>
            <span><strong>Ingestión:</strong> ${fa.ingestion}</span>
          </div>
        </div>

        <!-- ── FOOTER: QR + Código de barras ── -->
        <div class="card-footer">
          <div class="footer-qr">
            ${qrDataUrls[p.id]
              ? `<img src="${qrDataUrls[p.id]}" width="52" height="52" alt="QR"/>`
              : `<div class="qr-placeholder">Sin QR</div>`}
            <div class="footer-qr-label">ESCANEA PARA VER<br>MSDS COMPLETA</div>
          </div>
          <div class="footer-barcode">
            <div class="barcode-label">CÓDIGO DE BARRAS</div>
            <svg class="barcode-svg" data-code="${p.code}" style="width:110px;height:38px;display:block;"></svg>
            <div class="barcode-num">${p.code}</div>
          </div>
        </div>

      </div>`;
    }).join("");

    return `
      <div class="page-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        PRODUCTOS QUÍMICOS – FICHAS DE SEGURIDAD MSDS
      </div>
      <div class="page">${cards}</div>
      <div class="page-footer">Documento de uso interno — En caso de emergencia contactar al responsable del almacén</div>
      <div class="page-break"></div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Álbum MSDS — ${warehouseLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 0.7cm; }
    @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

    body {
      margin: 0; padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: white;
      font-size: 7.5px;
      color: #111;
    }

    /* ── Encabezado de página ── */
    .page-header {
      background: #c0392b;
      color: white;
      text-align: center;
      padding: 5px 8px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.8px;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .page-footer {
      text-align: center;
      font-size: 7px;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 3px;
      margin-top: 4px;
    }

    /* ── Grid de tarjetas ── */
    .page {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      grid-auto-rows: auto;
      gap: 5px;
      width: 100%;
      box-sizing: border-box;
    }
    .page-break { break-after: page; page-break-after: always; }

    /* ── Tarjeta ── */
    .card {
      border: 1.5px solid #222;
      border-radius: 5px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      break-inside: avoid;
      page-break-inside: avoid;
      background: white;
    }

    /* ── Cabecera de tarjeta ── */
    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 5px 7px;
      gap: 5px;
    }
    .header-left {
      display: flex;
      align-items: flex-start;
      gap: 5px;
      flex: 1;
      min-width: 0;
    }
    .header-title {
      font-size: 9.5px;
      font-weight: 900;
      color: white;
      text-transform: uppercase;
      line-height: 1.25;
      letter-spacing: 0.3px;
    }
    .header-badge {
      flex-shrink: 0;
      text-align: center;
    }
    .msds-box {
      background: white;
      color: #111;
      font-size: 9px;
      font-weight: 900;
      padding: 1px 5px;
      border-radius: 2px;
      letter-spacing: 1px;
    }
    .msds-sub {
      font-size: 5.5px;
      color: #ddd;
      margin-top: 1px;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    /* ── Tipo ── */
    .card-type {
      font-size: 7px;
      color: #555;
      padding: 2px 7px;
      border-bottom: 1px solid #e0e0e0;
      letter-spacing: 0.2px;
    }

    /* ── Meta (código + área) ── */
    .card-meta {
      display: flex;
      align-items: center;
      padding: 4px 7px;
      gap: 6px;
      border-bottom: 1px solid #e0e0e0;
      background: #f9f9f9;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .meta-label {
      font-size: 6px;
      color: #888;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .meta-value {
      font-size: 8.5px;
      font-weight: 900;
      color: #111;
      letter-spacing: 0.5px;
    }
    .meta-sep {
      width: 1px;
      height: 16px;
      background: #ddd;
      margin: 0 4px;
    }

    /* ── Secciones ── */
    .section-title {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 7px;
      font-size: 7.5px;
      font-weight: 900;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: white;
    }
    .danger-title { background: #2c2c2c; }
    .aid-title    { background: #1a3a2a; }

    .section-body {
      padding: 4px 7px;
      border-bottom: 1px solid #e8e8e8;
    }
    .danger-body { background: #fafafa; }
    .aid-body    { background: #f5fbf7; }

    .bullet {
      font-size: 7px;
      color: #222;
      line-height: 1.55;
    }

    .aid-row {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      font-size: 7px;
      color: #222;
      line-height: 1.5;
      margin-bottom: 2px;
    }
    .aid-row:last-child { margin-bottom: 0; }
    .aid-icon {
      flex-shrink: 0;
      color: #2c7a4b;
      margin-top: 1px;
    }

    /* ── Footer QR + barcode ── */
    .card-footer {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 7px;
      background: #f0f0f0;
      border-top: 1px solid #ddd;
    }
    .footer-qr {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .footer-qr-label {
      font-size: 5.5px;
      color: #555;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      line-height: 1.3;
    }
    .qr-placeholder {
      width: 52px; height: 52px;
      border: 1px dashed #ccc;
      display: flex; align-items: center; justify-content: center;
      font-size: 6px; color: #aaa;
    }
    .footer-barcode {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
    }
    .barcode-label {
      font-size: 6px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      align-self: flex-start;
    }
    .barcode-num {
      font-size: 8px;
      font-weight: bold;
      letter-spacing: 1.5px;
      color: #111;
      align-self: flex-start;
    }
  </style>
</head>
<body>
  ${pagesHtml}
  <script>
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    script.onload = function() {
      document.querySelectorAll('.barcode-svg').forEach(function(el) {
        JsBarcode(el, el.dataset.code, {
          format: 'CODE128',
          displayValue: false,
          height: 36,
          margin: 2,
          width: 1.5,
          background: 'transparent'
        });
      });
      window.print();
    };
    document.head.appendChild(script);
  <\/script>
</body>
</html>`;
}
