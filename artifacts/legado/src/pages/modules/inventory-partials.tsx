// ── Extracted sub-components, types, and helpers for the Inventory page ──────
// Keeping this file separate reduces inventory.tsx from ~906 to ~600 lines
// and makes each sub-component independently testable.

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getAuthHeaders } from "@/hooks/use-auth";
import { Search, X, ChevronsUpDown, ImageOff, Box, PackageX, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

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
export interface BoxEntry { weight: string; lot: string; }

// ── Shared constants ──────────────────────────────────────────────────────────

export const WAREHOUSES = ["QA", "Q1", "QP", "QL", "QD"] as const;
export const NUM_BOXES = 5;

// Stable empty arrays — avoids recreating references on every render
export const EMPTY_PRODUCTS: Product[] = [];
export const EMPTY_BALANCES: BalanceRecord[] = [];

export const today = () => new Date().toISOString().slice(0, 10);
export const emptyBoxes = (): BoxEntry[] => Array.from({ length: NUM_BOXES }, () => ({ weight: "", lot: "" }));

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

export const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

export const apiForm = async (path: string, formData: FormData, method = "POST") => {
  const res = await fetch(path, { method, headers: getAuthHeaders(), body: formData });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

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
