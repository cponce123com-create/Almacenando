// ── Extracted sub-components, types, and helpers for the Inventory page ──────
// Keeping this file separate reduces inventory.tsx from ~906 to ~600 lines
// and makes each sub-component independently testable.

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getAuthHeaders } from "@/hooks/use-auth";
import { Search, X, ChevronsUpDown, ImageOff, Box, PackageX, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, TrendingDown, ClipboardList, Loader2, Camera } from "lucide-react";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface Product { id: string; code: string; name: string; unit: string; warehouse: string; }
export interface InventoryBox {
  id: string; inventoryRecordId: string; boxNumber: number;
  weight: string | null; lot: string | null; photoUrl: string | null; createdAt: string;
}
export interface InventoryRecord {
  id: string; warehouse: string; productId: string; recordDate: string;
  previousBalance: string; inputs: string; outputs: string; finalBalance: string;
  physicalCount?: string | null; photoUrl?: string | null;
  location?: string | null; notes?: string | null;
  registeredBy: string; createdAt: string; boxes?: InventoryBox[];
  lastConsumptionDate?: string | null;
}
export interface InventoryStats {
  totalProducts: number; withoutRecords: number; exact: number;
  withDifference: number; surplus: number; shortage: number;
}
export interface BalanceRecord {
  id: string; code: string; quantity: string; productDescription: string; unit: string; balanceDate: string;
  ultimoConsumo?: string | null;
}
export interface BoxEntry {
  weight: string;   // peso bruto (lo que ingresa el usuario)
  tare: string;     // tara seleccionada (ej: "1.8", "2")
  netWeight: string; // calculado: weight - tare
  lot: string;
}

// ── Shared constants ──────────────────────────────────────────────────────────

export const WAREHOUSES = ["QA", "Q1", "QP", "QL", "QD"] as const;
export const NUM_BOXES = 2;

/** Taras predefinidas para el dropdown */
export const TARE_PRESETS = [
  { label: "1.5 kg", value: "1.5" },
  { label: "1.8 kg (Colorantes)", value: "1.8" },
  { label: "2 kg", value: "2" },
  { label: "4 kg", value: "4" },
  { label: "6 kg", value: "6" },
  { label: "10 kg", value: "10" },
  { label: "Otro…", value: "otro" },
] as const;

/**
 * Determina si un código de producto está en el rango de colorantes
 * (0200-0000 a 0299-9999) y devuelve la tara automática de 1.8 kg.
 */
export function getAutoTare(code: string): number | null {
  // Extraer los primeros 4 dígitos del código (ej: "0200-0000" → "0200")
  const prefix = code.replace(/[^0-9]/g, "").slice(0, 4);
  if (!prefix || prefix.length < 4) return null;
  const num = Number(prefix);
  if (num >= 200 && num <= 299) return 1.8;
  return null;
}

/** Calcula el peso neto = bruto - tara */
export function calcNetWeight(gross: string, tare: string): string {
  const g = parseFloat(gross) || 0;
  const t = parseFloat(tare) || 0;
  return Math.max(0, g - t).toFixed(3);
}

// Stable empty arrays — avoids recreating references on every render
export const EMPTY_PRODUCTS: Product[] = [];
export const EMPTY_BALANCES: BalanceRecord[] = [];

export const today = () => new Date().toISOString().slice(0, 10);
export const emptyBoxes = (): BoxEntry[] =>
  Array.from({ length: NUM_BOXES }, () => ({ weight: "", tare: "", netWeight: "0.000", lot: "" }));

// ── Helpers ───────────────────────────────────────────────────────────────────

export function sinMovimiento(dateStr: string | null | undefined): { label: string; color: string; bg: string; pill: string } {
  if (!dateStr) return { label: "—", color: "text-slate-300", bg: "bg-slate-50", pill: "bg-slate-100 text-slate-400" };
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return { label: "—", color: "text-slate-300", bg: "bg-slate-50", pill: "bg-slate-100 text-slate-400" };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return { label: "—", color: "text-slate-300", bg: "bg-slate-50", pill: "bg-slate-100 text-slate-400" };
  const months = days / 30.44;
  if (months < 6) return { label: `${Math.round(months)}m`, color: "text-emerald-600", bg: "bg-emerald-50", pill: "bg-emerald-100 text-emerald-700" };
  if (months < 12) return { label: `${Math.round(months)}m`, color: "text-amber-500", bg: "bg-amber-50", pill: "bg-amber-100 text-amber-700" };
  const years = Math.floor(months / 12);
  const rem = Math.floor(months % 12);
  const label = rem > 0 ? `${years}a ${rem}m` : `${years}a`;
  return { label, color: "text-red-500", bg: "bg-red-50", pill: "bg-red-100 text-red-700" };
}

// ── Token refresh helper (shared between apiJson / apiForm) ──────────────────
let _refreshing: Promise<boolean> | null = null;

async function tryRefreshTokenOnce(): Promise<boolean> {
  if (_refreshing) return _refreshing;

  const rt = (() => {
    try { return localStorage.getItem("auth_refresh_token"); } catch { return null; }
  })();

  if (!rt) return false;

  _refreshing = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_refresh_token");
        return false;
      }
      const data = await res.json();
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_refresh_token", data.refreshToken);
      window.dispatchEvent(new CustomEvent("app:token-refreshed"));
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await _refreshing;
  } finally {
    _refreshing = null;
  }
}

export const apiJson = async (path: string, opts?: RequestInit) => {
  const doFetch = (headers: Record<string, string>) =>
    fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers ?? {}) } });

  let res = await doFetch(getAuthHeaders());

  if (res.status === 401) {
    const refreshed = await tryRefreshTokenOnce();
    if (refreshed) res = await doFetch(getAuthHeaders());
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.");
    }
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

export const apiForm = async (path: string, formData: FormData, method = "POST") => {
  const doFetch = (headers: Record<string, string>) =>
    fetch(path, { method, headers, body: formData });

  let res = await doFetch(getAuthHeaders());

  if (res.status === 401) {
    const refreshed = await tryRefreshTokenOnce();
    if (refreshed) res = await doFetch(getAuthHeaders());
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.");
    }
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

// ── BarcodeScanner ─────────────────────────────────────────────────────────────
// Uses html5-qrcode to scan barcodes from the camera in real-time.
// When a barcode is detected, matches it against the products list by code.

export function BarcodeScanner({ products, onProductFound, onClose }: {
  products: Product[];
  onProductFound: (productId: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const [status, setStatus] = useState<"initializing" | "scanning" | "found" | "error">("initializing");
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mounted || !containerRef.current) return;

        const scanner = new Html5Qrcode("barcode-scanner-view");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 120 },
          },
          (decodedText: string) => {
            // Barcode found — try to match by product code
            const cleanCode = decodedText.trim();
            const match = products.find(p =>
              p.code === cleanCode ||
              p.code.replace(/[^0-9]/g, "") === cleanCode.replace(/[^0-9]/g, "")
            );

            if (match && mounted) {
              scanner.stop().catch(() => {});
              setFoundProduct(match);
              setStatus("found");
              onProductFound(match.id);
            }
          },
          () => { /* scan failure — ignore, keep trying */ }
        );

        if (mounted) setStatus("scanning");
      } catch (err) {
        if (mounted) setStatus("error");
      }
    })();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual barcode input fallback
  const handleManualBarcode = (code: string) => {
    const cleanCode = code.trim();
    const match = products.find(p =>
      p.code === cleanCode ||
      p.code.replace(/[^0-9]/g, "") === cleanCode.replace(/[^0-9]/g, "")
    );
    if (match) {
      setFoundProduct(match);
      setStatus("found");
      onProductFound(match.id);
      if (scannerRef.current) scannerRef.current.stop().catch(() => {});
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Scanner viewport */}
      <div className="relative bg-black">
        <div
          id="barcode-scanner-view"
          ref={containerRef}
          className="w-full"
          style={{ minHeight: "180px", maxHeight: "220px" }}
        />
        {status === "initializing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Iniciando cámara…</span>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-2 text-white text-center px-4">
              <Camera className="w-6 h-6 text-slate-400" />
              <span className="text-xs">No se pudo abrir la cámara</span>
              <span className="text-[10px] text-slate-400">Puedes buscar manualmente el código abajo</span>
            </div>
          </div>
        )}
        {status === "found" && foundProduct && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/80">
            <div className="flex flex-col items-center gap-1 text-white text-center px-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span className="text-sm font-bold">{foundProduct.code}</span>
              <span className="text-xs text-emerald-200 truncate max-w-full">{foundProduct.name}</span>
            </div>
          </div>
        )}
        {/* Scanning overlay border */}
        {status === "scanning" && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-3/4 h-0.5 bg-emerald-500/70 animate-pulse rounded-full shadow-lg shadow-emerald-400/50" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-50 px-4 py-3 space-y-2">
        {/* Manual barcode input */}
        <div className="relative">
          <Input
            type="text"
            placeholder="O ingresa el código de barras manualmente…"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleManualBarcode(barcodeInput); }}
            className="h-9 text-sm pr-20"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
            onClick={() => handleManualBarcode(barcodeInput)}
          >
            Buscar
          </Button>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center justify-between">
          {foundProduct ? (
            <p className="text-xs text-emerald-700 font-medium truncate flex-1">
              ✓ {foundProduct.code} — {foundProduct.name}
            </p>
          ) : status === "scanning" ? (
            <p className="text-xs text-slate-400">Apunta la cámara al código de barras</p>
          ) : (
            <p className="text-xs text-slate-400">Busca el producto manualmente</p>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-slate-500 hover:text-red-600"
            onClick={onClose}>
            <X className="w-3 h-3 mr-1" /> Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── ProductCombobox ───────────────────────────────────────────────────────────

export function ProductCombobox({ products, value, onChange }: {
  products: Product[]; value: string; onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = products.find(p => p.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return products;
    return products.filter(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-9 pr-9 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 placeholder:text-muted-foreground"
          placeholder={selected ? "" : "Buscar por código o nombre..."}
          value={open ? query : (selected ? "" : query)}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
        {selected && !open && (
          <div className="absolute inset-0 flex items-center pl-9 pr-9 pointer-events-none">
            <span className="text-sm text-slate-900 truncate">
              <span className="font-mono text-slate-500 text-xs mr-1">{selected.code}</span>
              {selected.name}
            </span>
          </div>
        )}
        {selected ? (
          <button type="button" onClick={() => { onChange(""); setQuery(""); setOpen(false); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">No se encontraron productos</div>
          ) : (
            filtered.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onChange(p.id); setQuery(""); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-baseline gap-2 border-b border-slate-50 last:border-0">
                <span className="font-mono text-xs text-slate-400 shrink-0">{p.code}</span>
                <span className="text-slate-800 truncate">{p.name}</span>
                <span className="ml-auto text-xs text-slate-400 shrink-0">{p.unit}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── PhotoViewer ───────────────────────────────────────────────────────────────

export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg text-slate-700 hover:text-red-600">
          <X className="w-5 h-5" />
        </button>
        <img src={url} alt="Foto de etiqueta" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
      </div>
    </div>
  );
}

// ── CoverageStats ─────────────────────────────────────────────────────────────

export function CoverageStats({ stats, isLoading, warehouse }: {
  stats: InventoryStats | undefined; isLoading: boolean; warehouse: string;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
            <div className="h-3 bg-slate-100 rounded w-2/3 mb-3" />
            <div className="h-8 bg-slate-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const pctCovered = stats.totalProducts > 0
    ? Math.round(((stats.totalProducts - stats.withoutRecords) / stats.totalProducts) * 100)
    : 0;

  const cards = [
    {
      label: "Sin inventario registrado",
      sublabel: `${stats.totalProducts} productos en ${warehouse} · ${pctCovered}% cubiertos`,
      value: stats.withoutRecords,
      icon: <PackageX className="w-5 h-5 text-slate-400" />,
      bg: stats.withoutRecords === 0 ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100",
      valueColor: stats.withoutRecords === 0 ? "text-emerald-700" : "text-amber-600",
      badge: stats.withoutRecords === 0
        ? <span className="text-xs font-medium text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">✓ Todos cubiertos</span>
        : <span className="text-xs font-medium text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">Pendientes</span>,
    },
    {
      label: "Conteo exacto",
      sublabel: "Físico coincide con sistema",
      value: stats.exact,
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
      bg: "bg-white border-slate-100",
      valueColor: "text-emerald-600",
      badge: null,
    },
    {
      label: "Con diferencia",
      sublabel: stats.withDifference > 0
        ? `${stats.surplus} sobrante${stats.surplus !== 1 ? "s" : ""} · ${stats.shortage} faltante${stats.shortage !== 1 ? "s" : ""}`
        : "Sin diferencias detectadas",
      value: stats.withDifference,
      icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
      bg: stats.withDifference > 0 ? "bg-red-50 border-red-100" : "bg-white border-slate-100",
      valueColor: stats.withDifference > 0 ? "text-red-600" : "text-slate-400",
      badge: stats.withDifference > 0 ? (
        <span className="flex gap-2 text-xs">
          {stats.surplus > 0 && (
            <span className="font-medium text-blue-600 bg-blue-100 rounded-full px-2 py-0.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +{stats.surplus}
            </span>
          )}
          {stats.shortage > 0 && (
            <span className="font-medium text-red-600 bg-red-100 rounded-full px-2 py-0.5 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> -{stats.shortage}
            </span>
          )}
        </span>
      ) : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {card.icon}
              <p className="text-xs font-semibold text-slate-600">{card.label}</p>
            </div>
            {card.badge}
          </div>
          <p className={`text-3xl font-bold ${card.valueColor}`}>{card.value}</p>
          <p className="text-xs text-slate-400 mt-1">{card.sublabel}</p>
        </div>
      ))}
    </div>
  );
}

// ── BoxesDialog ───────────────────────────────────────────────────────────────

export function BoxesDialog({ record, productName, unit, onClose, onViewPhoto }: {
  record: InventoryRecord | null; productName: string; unit: string;
  onClose: () => void; onViewPhoto: (url: string) => void;
}) {
  if (!record) return null;
  const boxes = record.boxes ?? [];
  const activeBoxes = boxes.filter(b => b.weight || b.lot || b.photoUrl);
  return (
    <Dialog open={!!record} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="w-5 h-5 text-emerald-600" />
            Detalle de cajas
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">{productName} · {record.recordDate}</p>
        </DialogHeader>
        {activeBoxes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No hay datos de cajas registrados</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {activeBoxes.map(box => (
              <div key={box.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
                <span className="text-xs font-bold text-slate-400 w-14">Caja {box.boxNumber}</span>
                <div className="flex-1 min-w-0">
                  {box.weight && (
                    <p className="text-sm font-semibold text-slate-800">
                      {parseFloat(box.weight).toFixed(2)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                    </p>
                  )}
                  {box.lot && <p className="text-xs text-slate-500 truncate">{box.lot}</p>}
                </div>
                {box.photoUrl ? (
                  <button onClick={() => onViewPhoto(box.photoUrl!)}
                    className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity">
                    <img src={box.photoUrl} alt="Foto caja" className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                    <ImageOff className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── InventarioPrevioBanner ─────────────────────────────────────────────────────

export function InventarioPrevioBanner({
  productId,
  warehouse,
  previousBalance,
  unit,
}: {
  productId: string;
  warehouse: string;
  previousBalance: string;
  unit: string;
}) {
  const [prevRecords, setPrevRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) { setPrevRecords([]); return; }
    setLoading(true);
    apiJson(`/api/inventory?productId=${productId}&warehouse=${warehouse}&limit=50`)
      .then((r: any) => {
        const records = (r.data ?? r ?? []) as InventoryRecord[];
        const withCount = records.filter(rec => rec.physicalCount != null && parseFloat(rec.physicalCount) > 0);
        setPrevRecords(withCount);
      })
      .catch(() => setPrevRecords([]))
      .finally(() => setLoading(false));
  }, [productId, warehouse]);

  if (loading) {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-slate-200 rounded w-1/2" />
      </div>
    );
  }

  if (prevRecords.length === 0) return null;

  const totalYaInventariado = prevRecords.reduce(
    (sum, r) => sum + (r.physicalCount ? parseFloat(r.physicalCount) : 0), 0
  );
  const saldoSistema = parseFloat(previousBalance) || 0;
  const saldoPendiente = Math.max(0, saldoSistema - totalYaInventariado);
  const latestDate = prevRecords.reduce(
    (latest, r) => r.recordDate > latest ? r.recordDate : latest,
    prevRecords[0]?.recordDate ?? ""
  );

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            Ya inventariado anteriormente
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-amber-600 font-semibold uppercase">Registros</p>
            <p className="text-lg font-bold text-slate-800">{prevRecords.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-amber-600 font-semibold uppercase">Total ya contado</p>
            <p className="text-lg font-bold text-emerald-700">
              {totalYaInventariado.toFixed(3)} <span className="text-xs font-normal text-slate-500">{unit}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-amber-600 font-semibold uppercase">Saldo pendiente</p>
            <p className={`text-lg font-bold ${saldoPendiente > 0.001 ? "text-blue-700" : "text-slate-400"}`}>
              {saldoPendiente.toFixed(3)} <span className="text-xs font-normal text-slate-500">{unit}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-amber-600 font-semibold uppercase">Últ. conteo</p>
            <p className="text-sm font-semibold text-slate-700">{latestDate}</p>
          </div>
        </div>
        {saldoPendiente < 0.001 && saldoSistema > 0.001 && (
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg px-3 py-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Ya has inventariado todo el saldo del sistema para este producto.
          </div>
        )}
        {saldoPendiente > 0.001 && (
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg px-3 py-1.5">
            <AlertTriangle className="w-4 h-4" />
            Aún faltan {saldoPendiente.toFixed(3)} {unit} por inventariar de este producto.
          </div>
        )}
      </div>
    </div>
  );
}
