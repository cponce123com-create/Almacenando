import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES, type Warehouse as WarehouseType } from "@/contexts/WarehouseContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, ShieldOff, Download, Printer, AlertCircle, Loader2 } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

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

  function handlePrintQr() {
    if (!selected || !selected.msdsUrl) return;
    const win = window.open("", "_blank", "width=400,height=500");
    if (!win) return;
    const svg = document.getElementById("msds-qr-svg")?.outerHTML ?? "";
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta QR - ${selected.code}</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
          .qr-wrap { border: 2px solid #0d9488; border-radius: 12px; padding: 24px 32px; text-align: center; }
          h2 { margin: 0 0 4px 0; font-size: 18px; color: #0c1a2e; }
          p { margin: 0 0 16px 0; font-size: 13px; color: #64748b; }
          svg { display: block; margin: 0 auto 12px auto; }
          small { display: block; font-size: 11px; color: #94a3b8; margin-top: 8px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="qr-wrap">
          <h2>${selected.code}</h2>
          <p>${selected.name}</p>
          ${svg}
          <small>${selected.msdsUrl}</small>
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
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
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f1f5f9" }}>
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
                      onClick={() => setSelected(p)}
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
                {selected.msds && selected.msdsUrl ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
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
                    <div style={{ display: "flex", gap: 10 }}>
                      <Button
                        onClick={() => window.open(selected.msdsUrl!, "_blank")}
                        style={{ background: "#0d9488", color: "#fff", border: "none", gap: 6 }}
                      >
                        <Download style={{ width: 15, height: 15 }} />
                        Descargar MSDS
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handlePrintQr}
                        style={{ gap: 6 }}
                      >
                        <Printer style={{ width: 15, height: 15 }} />
                        Imprimir etiqueta QR
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "32px 20px",
                    background: "#fff7f7",
                    borderRadius: 10,
                    border: "1.5px dashed #fca5a5",
                    textAlign: "center",
                  }}>
                    <ShieldOff style={{ width: 36, height: 36, color: "#dc2626", marginBottom: 12, opacity: 0.7 }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#dc2626", margin: "0 0 6px 0" }}>
                      Ficha de Seguridad no disponible
                    </p>
                    <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
                      Este producto no tiene MSDS registrada. Actualice el registro del producto para agregar la URL de la ficha de seguridad.
                    </p>
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
