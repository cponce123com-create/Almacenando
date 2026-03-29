import { useState, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES, type Warehouse as WarehouseType } from "@/contexts/WarehouseContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, ShieldOff, Download, Printer, AlertCircle, Loader2, Save, BookOpen } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Product {
  id: string;
  warehouse: string;
  code: string;
  name: string;
  msds: boolean;
  msdsUrl?: string | null;
  hazardLevel?: string | null;
  hazardPictograms?: string | null;
  firstAid?: string | null;
  category?: string | null;
  type?: string | null;
}

interface MsdsStats {
  sinMsds: number;
  conMsds: number;
  total: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const apiJson = (path: string) =>
  fetch(`${BASE}${path}`, { headers: getAuthHeaders() }).then(async (r) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
    return r.json();
  });

export default function MsdsPage() {
  const { warehouse, setWarehouse } = useWarehouse();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [msdsInput, setMsdsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);

  const warehouseQ = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const warehouseStats = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";

  const { data: products = [], isLoading, isError } = useQuery<Product[]>({
    queryKey: ["/api/products", warehouse],
    queryFn: () => apiJson(`/api/products${warehouseQ ? warehouseQ + "&limit=500" : "?limit=500"}`).then((r: any) => r.data ?? r),
  });

  const { data: stats } = useQuery<MsdsStats>({
    queryKey: ["/api/products/msds-stats", warehouse],
    queryFn: () => apiJson(`/api/products/msds-stats${warehouseStats}`),
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((p) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.code.toLowerCase().includes(term)
    );
  }, [products, search]);

  const pct = stats && stats.total > 0
    ? Math.round((stats.conMsds / stats.total) * 100)
    : 0;

  async function handleSaveMsds() {
    if (!selected || !msdsInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${BASE}/api/products/${selected.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ msdsUrl: msdsInput.trim(), msds: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Error al guardar");
      }
      const updated: Product = await res.json();
      setSelected(updated);
      setMsdsInput("");
      setEditingUrl(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function handlePrintQr() {
    if (!selected || !selected.msdsUrl) return;
    const win = window.open("", "_blank", "width=420,height=320");
    if (!win) return;
    const svg = document.getElementById("msds-qr-svg")?.outerHTML ?? "";
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=378, height=276">
  <title>Etiqueta QR - ${selected.code}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
  <style>
    @page { size: 10cm 7.3cm landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 0; width: 10cm; height: 7.3cm; overflow: hidden; font-family: Arial, sans-serif; }
    @media print { .instruccion { display: none; } }
    .instruccion {
      font-family: sans-serif; font-size: 12px; color: #666;
      text-align: center; padding: 8px;
      background: #fffbea; border-bottom: 1px solid #e5c700;
    }
    .label {
      position: absolute; top: 0; left: 0;
      width: 10cm; height: 7.3cm;
      display: flex; flex-direction: row;
      padding: 6mm; gap: 4mm;
    }
    .col-qr {
      width: 45%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .col-qr svg { display: block; }
    .col-info {
      width: 55%;
      display: flex; flex-direction: column; justify-content: center;
      gap: 3px;
    }
    .msds-title { font-size: 22px; font-weight: 900; color: #0c1a2e; line-height: 1; margin: 0 0 4px 0; letter-spacing: -0.5px; }
    .prod-name { font-size: 13px; font-weight: 700; color: #1e293b; word-break: break-word; line-height: 1.3; margin: 0 0 3px 0; }
    .prod-code { font-size: 11px; color: #64748b; margin: 0 0 4px 0; }
    .hint { font-size: 9px; color: #94a3b8; margin: 3px 0 0 0; line-height: 1.3; }
    #barcode { display: block; width: 100%; max-width: 120px; }
  </style>
</head>
<body>
  <div class="instruccion">
    ⚠️ En el diálogo de impresión selecciona: <strong>Orientación Horizontal / Landscape</strong>
  </div>
  <div class="label">
    <div class="col-qr">${svg}</div>
    <div class="col-info">
      <p class="msds-title">MSDS</p>
      <p class="prod-name">${selected.name}</p>
      <p class="prod-code">${selected.code}</p>
      <svg id="barcode"></svg>
      <p class="hint">Escanea el QR para ver la ficha de seguridad</p>
    </div>
  </div>
  <script>
    window.onload = function() {
      JsBarcode("#barcode", "${selected.code}", {
        format: "CODE128",
        displayValue: false,
        height: 40,
        margin: 0
      });
      window.print();
    };
  <\/script>
</body>
</html>`);
    win.document.close();
  }

  const handlePrintAlbum = useCallback(async () => {
    const withMsds = products.filter((p) => p.msds && p.msdsUrl);
    if (withMsds.length === 0) return;

    // Generate all QR data URLs locally (no external network call)
    const qrDataUrls: Record<string, string> = {};
    await Promise.all(
      withMsds.map(async (p) => {
        try {
          qrDataUrls[p.id] = await QRCode.toDataURL(p.msdsUrl!, {
            width: 95, margin: 1, color: { dark: "#000000", light: "#ffffff" },
          });
        } catch {
          qrDataUrls[p.id] = "";
        }
      })
    );

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    const warehouseLabel = warehouse === "all" || !warehouse ? "Todos los almacenes" : warehouse;
    const dateStr = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });

    const levelConfig = (level: string | null | undefined): { color: string; label: string } => {
      if (level === "alto_riesgo") return { color: "#c0392b", label: "⚠ PRODUCTO QUÍMICO – ALTO RIESGO" };
      if (level === "controlado")  return { color: "#1a3a5c", label: "⚠ PRODUCTO QUÍMICO – USO CONTROLADO" };
      return { color: "#e67e22", label: "⚠ PRODUCTO QUÍMICO – PRECAUCIÓN" };
    };

    // Official GHS pictograms as inline SVG (red diamond + black symbol, white fill)
    const D = `<polygon points="50,3 97,50 50,97 3,50" fill="white" stroke="#cc0000" stroke-width="7" stroke-linejoin="round"/>`;
    const ghsPictos: Record<string, string> = {
      toxico: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <ellipse cx="50" cy="43" rx="17" ry="15" fill="black"/>
        <ellipse cx="43" cy="41" rx="5" ry="5.5" fill="white"/>
        <ellipse cx="57" cy="41" rx="5" ry="5.5" fill="white"/>
        <ellipse cx="50" cy="48" rx="2.5" ry="2.5" fill="white"/>
        <rect x="37" y="53" width="26" height="8" rx="2" fill="black"/>
        <rect x="41" y="53" width="3" height="8" fill="white"/>
        <rect x="47" y="53" width="3" height="8" fill="white"/>
        <rect x="53" y="53" width="3" height="8" fill="white"/>
        <line x1="28" y1="68" x2="72" y2="76" stroke="black" stroke-width="6" stroke-linecap="round"/>
        <line x1="28" y1="76" x2="72" y2="68" stroke="black" stroke-width="6" stroke-linecap="round"/>
        <circle cx="25" cy="72" r="6" fill="black"/>
        <circle cx="75" cy="72" r="6" fill="black"/>
      </svg>`,

      inflamable: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <path d="M50,78 C33,78 26,63 29,49 C31,38 38,33 40,25 C42,18 40,12 40,12
                 C46,18 48,28 47,36 C49,30 52,20 57,16 C57,24 54,33 56,40
                 C60,33 63,29 67,31 C73,41 72,55 67,65 C63,73 57,78 50,78Z" fill="black"/>
      </svg>`,

      oxidante: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <circle cx="50" cy="68" r="14" fill="none" stroke="black" stroke-width="5"/>
        <path d="M50,56 C40,56 34,45 37,34 C39,26 44,22 44,22
                 C46,29 46,36 45,42 C47,36 51,26 56,22 C56,30 53,38 55,44
                 C59,37 63,33 66,36 C71,44 69,55 63,58 C59,59 55,57 50,56Z" fill="black"/>
      </svg>`,

      gas_presion: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <rect x="38" y="44" width="24" height="30" rx="5" fill="black"/>
        <ellipse cx="50" cy="44" rx="12" ry="7" fill="black"/>
        <rect x="45" y="30" width="10" height="7" rx="2" fill="black"/>
        <rect x="42" y="27" width="16" height="5" rx="2" fill="black"/>
        <line x1="58" y1="30" x2="68" y2="30" stroke="black" stroke-width="4" stroke-linecap="round"/>
        <rect x="34" y="72" width="32" height="5" rx="2" fill="black"/>
      </svg>`,

      corrosivo: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <rect x="25" y="20" width="16" height="20" rx="2" fill="none" stroke="black" stroke-width="4"/>
        <path d="M30,40 Q28,50 27,57" stroke="black" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M20,65 Q24,59 27,65 Q30,71 33,65" stroke="black" stroke-width="3.5" fill="none"/>
        <rect x="59" y="20" width="16" height="20" rx="2" fill="none" stroke="black" stroke-width="4"/>
        <path d="M66,40 Q68,50 70,57" stroke="black" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M56,62 Q60,56 67,58 Q73,60 75,67 Q71,74 62,74 Q56,72 56,62Z" fill="black"/>
        <ellipse cx="63" cy="64" rx="3" ry="2.5" fill="white"/>
        <ellipse cx="69" cy="68" rx="3" ry="2.5" fill="white"/>
      </svg>`,

      nocivo: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <rect x="44" y="26" width="12" height="32" rx="6" fill="black"/>
        <circle cx="50" cy="70" r="7" fill="black"/>
      </svg>`,

      peligro_ambiental: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <rect x="46" y="52" width="8" height="22" fill="black"/>
        <line x1="50" y1="55" x2="33" y2="40" stroke="black" stroke-width="4.5" stroke-linecap="round"/>
        <line x1="50" y1="55" x2="67" y2="40" stroke="black" stroke-width="4.5" stroke-linecap="round"/>
        <line x1="50" y1="47" x2="37" y2="32" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="50" y1="47" x2="63" y2="32" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="50" y1="40" x2="50" y2="25" stroke="black" stroke-width="4" stroke-linecap="round"/>
        <path d="M62,63 Q70,58 76,62 Q70,69 62,63Z" fill="black"/>
        <path d="M56,62 L62,58 L62,67Z" fill="black"/>
        <circle cx="72" cy="61" r="1.8" fill="white"/>
        <line x1="26" y1="74" x2="74" y2="74" stroke="black" stroke-width="3.5"/>
      </svg>`,

      peligro_salud: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <circle cx="50" cy="28" r="9" fill="black"/>
        <path d="M40,40 Q36,57 34,72 L43,72 L48,58 L52,58 L57,72 L66,72 Q64,57 60,40 Z" fill="black"/>
        <line x1="42" y1="50" x2="52" y2="50" stroke="white" stroke-width="3"/>
        <line x1="47" y1="45" x2="47" y2="55" stroke="white" stroke-width="3"/>
        <line x1="43" y1="46" x2="51" y2="54" stroke="white" stroke-width="2.5"/>
        <line x1="51" y1="46" x2="43" y2="54" stroke="white" stroke-width="2.5"/>
      </svg>`,

      explosivo: `<svg width="36" height="36" viewBox="0 0 100 100">${D}
        <path d="M50,72 L38,56 L21,60 L35,47 L26,31 L42,40 L50,22 L58,40 L74,31 L65,47 L79,60 L62,56 Z" fill="black"/>
        <path d="M50,64 L41,53 L30,56 L40,47 L34,36 L46,43 L50,32 L54,43 L66,36 L60,47 L70,56 L59,53 Z" fill="white"/>
        <circle cx="50" cy="50" r="7" fill="black"/>
      </svg>`,
    };

    const renderPictos = (raw: string | null | undefined): string => {
      let keys: string[] = [];
      try { keys = JSON.parse(raw ?? "[]") as string[]; } catch { /* empty */ }
      if (!keys.length) return "";
      const icons = keys.map((k) => ghsPictos[k] ?? "").filter(Boolean).join("");
      return `<div style="display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-end;flex-shrink:0;max-width:80px;">${icons}</div>`;
    };

    const renderFirstAid = (text: string | null | undefined, color: string): string => {
      const items = text?.trim()
        ? text.split(/[·\n]/).map((s) => s.trim()).filter(Boolean)
        : [];
      const bullets = items.length
        ? items.map((i) => `<div style="margin-bottom:2px;">• ${i}</div>`).join("")
        : `<div style="color:#aaa;font-style:italic;">Sin instrucciones registradas</div>`;
      return `<div style="background:#fff8e1;border-top:1px solid #eee;padding:5px 8px;font-size:7.5px;color:#333;line-height:1.5;flex:1;">
        <div style="font-weight:bold;color:${color};margin-bottom:3px;font-size:8px;">ⓘ En caso de contacto:</div>
        ${bullets}
      </div>`;
    };

    const chunks: Product[][] = [];
    for (let i = 0; i < withMsds.length; i += 6) chunks.push(withMsds.slice(i, i + 6));

    const pagesHtml = chunks.map((chunk) => {
      const cards = chunk.map((p) => {
        const { color, label } = levelConfig(p.hazardLevel);
        const pictoHtml = renderPictos(p.hazardPictograms);
        const firstAidHtml = renderFirstAid(p.firstAid, color);
        return `
        <div class="card" style="border:2px solid ${color};display:flex;flex-direction:column;">
          <div style="background:${color};color:white;text-align:center;padding:4px 6px;font-size:9px;font-weight:bold;letter-spacing:0.5px;flex-shrink:0;">${label}</div>
          <div style="display:flex;align-items:flex-start;padding:5px 7px;gap:5px;border-bottom:1px solid #eee;flex-shrink:0;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:bold;color:#111;text-transform:uppercase;line-height:1.2;">${p.name}</div>
              <div style="font-size:8px;color:#555;margin-top:3px;">Código: <strong>${p.code}</strong></div>
              <div style="font-size:8px;color:#555;">Área: <strong>${p.warehouse}</strong></div>
              ${p.category ? `<div style="font-size:8px;color:#555;">Tipo: ${p.category}</div>` : ""}
            </div>
            ${pictoHtml}
          </div>
          <div style="display:flex;align-items:stretch;border-bottom:1px solid #eee;flex-shrink:0;">
            ${qrDataUrls[p.id] ? `<img src="${qrDataUrls[p.id]}" width="95" height="95" alt="QR" style="flex-shrink:0;display:block;border-right:1px solid #eee;">` : `<div style="width:95px;height:95px;flex-shrink:0;border-right:1px solid #eee;display:flex;align-items:center;justify-content:center;font-size:8px;color:#aaa;">Sin QR</div>`}
            <div style="flex:1;min-width:0;padding:6px 8px;background:${color}0d;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:4px;">
              <div style="font-size:7px;font-weight:bold;color:${color};letter-spacing:0.5px;text-transform:uppercase;">Escanea para ver</div>
              <div style="font-size:8px;font-weight:bold;color:${color};letter-spacing:0.5px;text-transform:uppercase;">MSDS Completa</div>
              <div style="font-size:11px;font-weight:bold;color:#1a1a2e;letter-spacing:1px;border-top:1px dashed ${color}80;padding-top:4px;width:100%;">${p.code}</div>
            </div>
          </div>
          ${firstAidHtml}
          <div style="padding:6px 8px;border-top:1px solid #eee;background:#fafafa;text-align:center;flex-shrink:0;">
            <svg class="barcode-lg" data-code="${p.code}" style="width:90%;height:36px;display:inline-block;"></svg>
            <div style="font-size:8px;color:#666;margin-top:2px;letter-spacing:1px;">${p.code}</div>
          </div>
        </div>`;
      }).join("");

      return `
        <div style="background:#c0392b;color:white;text-align:center;padding:6px;font-size:13px;font-weight:bold;letter-spacing:1px;margin-bottom:8px;">
          ⚠ PRODUCTOS QUÍMICOS – FICHAS DE SEGURIDAD MSDS
        </div>
        <div class="page">${cards}</div>
        <div style="text-align:center;font-size:8px;color:#999;border-top:1px solid #ddd;padding-top:4px;margin-top:6px;">
          Documento confidencial de uso interno – en caso de emergencia contactar al responsable del almacén
        </div>
        <div class="page-break"></div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Álbum MSDS — ${warehouseLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 0.8cm; }
    @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: white; }
    .page {
      width: 100%;
      height: 26.7cm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: repeat(3, 1fr);
      gap: 0.5cm;
      box-sizing: border-box;
    }
    .page-break { break-after: page; page-break-after: always; }
    .card {
      border: 2px solid #ccc;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  ${pagesHtml}
  <script>
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    script.onload = function() {
      document.querySelectorAll('.barcode-lg').forEach(function(el) {
        JsBarcode(el, el.dataset.code, { format: 'CODE128', displayValue: false, height: 32, margin: 0, width: 1.4 });
      });
      window.print();
    };
    document.head.appendChild(script);
  <\/script>
</body>
</html>`);
    win.document.close();
  }, [products]);

  const allWarehouses: (WarehouseType | "all")[] = ["all", ...WAREHOUSES];

  return (
    <AppLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0c1a2e", margin: 0 }}>
            Control de MSDS
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "4px 0 0 0" }}>
            Gestión de Fichas de Seguridad de Materiales por almacén
          </p>
        </div>

        {/* Warehouse selector buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {allWarehouses.map((w) => {
            const active = warehouse === w || (w === "all" && (warehouse === "all" || !warehouse));
            return (
              <button
                key={w}
                onClick={() => setWarehouse(w as WarehouseType)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  border: active ? "none" : "1.5px solid #cbd5e1",
                  background: active ? "#0d9488" : "#ffffff",
                  color: active ? "#ffffff" : "#475569",
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {w === "all" ? "Todos" : w}
              </button>
            );
          })}
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px 0" }}>Sin MSDS</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: "#dc2626", margin: 0, lineHeight: 1 }}>{stats?.sinMsds ?? "—"}</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0 0" }}>productos sin ficha</p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px 0" }}>Con MSDS</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: "#16a34a", margin: 0, lineHeight: 1 }}>{stats?.conMsds ?? "—"}</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0 0" }}>productos con ficha</p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px 0" }}>Completado</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: "#0d9488", margin: 0, lineHeight: 1 }}>{stats ? `${pct}%` : "—"}</p>
            <div style={{ marginTop: 8, height: 6, background: "#e2e8f0", borderRadius: 4 }}>
              <div style={{ height: 6, width: `${pct}%`, background: pct === 100 ? "#16a34a" : "#0d9488", borderRadius: 4, transition: "width 0.4s" }} />
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Left: product list */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 10 }}>
              <Button
                onClick={handlePrintAlbum}
                disabled={products.filter(p => p.msds && p.msdsUrl).length === 0}
                style={{
                  background: products.filter(p => p.msds && p.msdsUrl).length === 0 ? "#94a3b8" : "#0c1a2e",
                  color: "#fff",
                  border: "none",
                  gap: 6,
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <BookOpen style={{ width: 15, height: 15 }} />
                Imprimir Álbum MSDS
                {products.filter(p => p.msds && p.msdsUrl).length > 0 && (
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    ({products.filter(p => p.msds && p.msdsUrl).length} productos)
                  </span>
                )}
              </Button>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94a3b8" }} />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código o nombre…"
                  style={{ paddingLeft: 34, fontSize: 13 }}
                />
              </div>
            </div>

            {isLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "#64748b", fontSize: 13 }}>
                <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
                Cargando productos…
              </div>
            )}

            {isError && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "#dc2626", fontSize: 13 }}>
                <AlertCircle style={{ width: 18, height: 18 }} />
                Error al cargar productos
              </div>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No se encontraron productos
              </div>
            )}

            {!isLoading && !isError && filtered.length > 0 && (
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => { setSelected(p); setEditingUrl(false); setMsdsInput(""); setSaveError(null); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f8fafc",
                        background: isSelected ? "rgba(13,148,136,0.08)" : "transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.code}
                        </p>
                        <p style={{ fontSize: 12, color: "#64748b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </p>
                      </div>
                      <Badge
                        style={{
                          marginLeft: 12,
                          flexShrink: 0,
                          fontSize: 11,
                          fontWeight: 600,
                          background: p.msds ? "#dcfce7" : "#fee2e2",
                          color: p.msds ? "#16a34a" : "#dc2626",
                          border: "none",
                        }}
                      >
                        {p.msds ? "Con MSDS" : "Sin MSDS"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {!selected ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 40, color: "#94a3b8", textAlign: "center" }}>
                <ShieldCheck style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
                <p style={{ fontSize: 14, margin: 0 }}>Selecciona un producto de la lista para ver su detalle</p>
              </div>
            ) : (
              <div style={{ padding: 24 }}>

                {/* Product header */}
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {selected.warehouse}
                      </p>
                      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#0c1a2e", margin: "0 0 2px 0", lineHeight: 1.3 }}>
                        {selected.name}
                      </h2>
                      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                        Código: <strong>{selected.code}</strong>
                      </p>
                    </div>
                    <Badge
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        background: selected.msds ? "#dcfce7" : "#fee2e2",
                        color: selected.msds ? "#16a34a" : "#dc2626",
                        border: "none",
                      }}
                    >
                      {selected.msds ? "MSDS Disponible" : "Sin MSDS"}
                    </Badge>
                  </div>
                </div>

                {/* MSDS content */}
                {selected.msds && selected.msdsUrl && !editingUrl ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    <div style={{ padding: 16, border: "2px solid #99f6e4", borderRadius: 12, background: "#f0fdfa" }}>
                      <QRCodeSVG
                        id="msds-qr-svg"
                        value={selected.msdsUrl}
                        size={180}
                        level="H"
                        includeMargin
                      />
                    </div>
                    <p style={{ fontSize: 12, color: "#64748b", margin: 0, textAlign: "center", wordBreak: "break-all", maxWidth: 280 }}>
                      {selected.msdsUrl}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                      <Button
                        onClick={() => window.open(selected.msdsUrl!, "_blank")}
                        style={{ background: "#0d9488", color: "#fff", border: "none", gap: 6 }}
                      >
                        <Download style={{ width: 15, height: 15 }} />
                        Descargar MSDS
                      </Button>
                      <Button variant="outline" onClick={handlePrintQr} style={{ gap: 6 }}>
                        <Printer style={{ width: 15, height: 15 }} />
                        Imprimir etiqueta QR
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setMsdsInput(selected.msdsUrl ?? ""); setSaveError(null); setEditingUrl(true); }}
                        style={{ gap: 6, borderColor: "#cbd5e1", color: "#475569" }}
                      >
                        Editar URL
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {!editingUrl && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "14px 16px",
                        background: "#fff7f7",
                        borderRadius: 8,
                        border: "1.5px dashed #fca5a5",
                      }}>
                        <ShieldOff style={{ width: 20, height: 20, color: "#dc2626", flexShrink: 0 }} />
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", margin: 0 }}>
                          Ficha de Seguridad no disponible
                        </p>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                        {editingUrl ? "Editar URL de MSDS" : "Registrar URL de MSDS"}
                      </label>
                      <input
                        type="url"
                        value={msdsInput}
                        onChange={(e) => { setMsdsInput(e.target.value); setSaveError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleSaveMsds(); }}
                        placeholder="Pega aquí el enlace de Google Drive o ruta local..."
                        disabled={saving}
                        style={{
                          width: "100%",
                          padding: "9px 12px",
                          fontSize: 13,
                          border: saveError ? "1.5px solid #dc2626" : "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          outline: "none",
                          boxSizing: "border-box",
                          background: saving ? "#f8fafc" : "#fff",
                          color: "#1e293b",
                          transition: "border-color 0.12s",
                        }}
                      />
                      {saveError && (
                        <p style={{ fontSize: 12, color: "#dc2626", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                          <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
                          {saveError}
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={() => void handleSaveMsds()}
                        disabled={saving || !msdsInput.trim()}
                        style={{
                          background: saving || !msdsInput.trim() ? "#94a3b8" : "#0d9488",
                          color: "#fff",
                          border: "none",
                          gap: 6,
                        }}
                      >
                        {saving
                          ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />Guardando...</>
                          : <><Save style={{ width: 14, height: 14 }} />Guardar MSDS</>
                        }
                      </Button>
                      {editingUrl && (
                        <Button
                          variant="outline"
                          onClick={() => { setEditingUrl(false); setMsdsInput(""); setSaveError(null); }}
                          disabled={saving}
                          style={{ gap: 6 }}
                        >
                          Cancelar
                        </Button>
                      )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
