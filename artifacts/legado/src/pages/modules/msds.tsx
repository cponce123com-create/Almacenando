import { useState, useMemo } from "react";
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

  function handlePrintAlbum() {
    const withMsds = products.filter((p) => p.msds && p.msdsUrl);
    if (withMsds.length === 0) return;

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    const warehouseLabel = warehouse === "all" || !warehouse ? "Todos los almacenes" : warehouse;
    const dateStr = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });

    const chunks: Product[][] = [];
    for (let i = 0; i < withMsds.length; i += 6) chunks.push(withMsds.slice(i, i + 6));

    const pagesHtml = chunks.map((chunk) => {
      const cards = chunk.map((p) => `
        <div class="card">
          <div class="prod-name">${p.name}</div>
          <div class="prod-code">${p.code}</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(p.msdsUrl!)}" width="90" height="90" alt="QR">
          <svg class="barcode" data-code="${p.code}"></svg>
        </div>`).join("");

      return `
        <div class="header">
          <span class="header-left">Álbum MSDS — ${warehouseLabel}</span>
          <span class="header-right">${dateStr}</span>
        </div>
        <div class="grid">${cards}</div>
        <div class="footer">Documento generado el ${dateStr} — Solo para uso interno de emergencia</div>
        <div class="page-break"></div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Álbum MSDS — ${warehouseLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 1cm; }
    @media print {
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
    body { margin: 0; font-family: Arial, sans-serif; font-size: 12px; }
    .no-print {
      background: #fffbea; border-bottom: 1px solid #e5c700;
      padding: 10px 16px; font-size: 12px; color: #555; text-align: center;
    }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 6px;
    }
    .header-left { font-size: 13px; font-weight: bold; color: #111; }
    .header-right { font-size: 11px; color: #888; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .card {
      border: 1px solid #ccc; border-radius: 6px; padding: 10px;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .prod-name { font-size: 11px; font-weight: bold; text-align: center; max-height: 2.4em; overflow: hidden; }
    .prod-code { font-size: 10px; color: #555; }
    .barcode { display: block; }
    .footer { font-size: 9px; color: #aaa; text-align: center; margin-top: 8px; }
    .page-break { break-after: page; page-break-after: always; }
  </style>
</head>
<body>
  <div class="no-print">
    ⚠️ Verifica que el diálogo de impresión tenga: <strong>Tamaño A4 · Orientación Vertical · Márgenes: 1 cm</strong>
  </div>
  ${pagesHtml}
  <script>
    function tryPrint(jsBarcodeReady, imgsReady) {
      if (jsBarcodeReady && imgsReady) window.print();
    }

    var barcodeReady = false;
    var imgsDone = false;

    // Load JsBarcode, then render all barcodes
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    script.onload = function() {
      document.querySelectorAll('.barcode').forEach(function(el) {
        JsBarcode(el, el.dataset.code, {
          format: 'CODE128',
          displayValue: false,
          height: 30,
          margin: 0,
          width: 1.2
        });
      });
      barcodeReady = true;
      tryPrint(barcodeReady, imgsDone);
    };
    document.head.appendChild(script);

    // Wait for all QR images to finish loading
    var imgs = Array.from(document.querySelectorAll('img'));
    if (imgs.length === 0) {
      imgsDone = true;
    } else {
      var loaded = 0;
      imgs.forEach(function(img) {
        function onDone() { loaded++; if (loaded === imgs.length) { imgsDone = true; tryPrint(barcodeReady, imgsDone); } }
        if (img.complete && img.naturalWidth > 0) { onDone(); }
        else { img.onload = onDone; img.onerror = onDone; }
      });
    }
  <\/script>
</body>
</html>`);
    win.document.close();
  }

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
