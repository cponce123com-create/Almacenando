import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ClipboardList, Plus, Trash2, Loader2, AlertCircle,
  TrendingUp, TrendingDown, Minus, Search, X, ChevronsUpDown,
  Camera, ImageOff, Eye, PackageX, CheckCircle2, AlertTriangle, Box,
} from "lucide-react";

const WAREHOUSES = ["QA", "Q1", "QP", "QL", "QD"] as const;
const NUM_BOXES = 5;

interface Product { id: string; code: string; name: string; unit: string; warehouse: string; }
interface InventoryBox {
  id: string; inventoryRecordId: string; boxNumber: number;
  weight: string | null; lot: string | null; photoUrl: string | null; createdAt: string;
}
interface InventoryRecord {
  id: string; warehouse: string; productId: string; recordDate: string;
  previousBalance: string; inputs: string; outputs: string; finalBalance: string;
  physicalCount?: string | null; photoUrl?: string | null; notes?: string | null;
  registeredBy: string; createdAt: string; boxes?: InventoryBox[];
  lastConsumptionDate?: string | null;
}
interface InventoryStats {
  totalProducts: number; withoutRecords: number; exact: number;
  withDifference: number; surplus: number; shortage: number;
}
interface BalanceRecord {
  id: string; code: string; quantity: string; productDescription: string; unit: string; balanceDate: string;
  ultimoConsumo?: string | null;
}

function sinMovimiento(dateStr: string | null | undefined): { label: string; color: string } {
  if (!dateStr) return { label: "—", color: "text-slate-300" };
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return { label: "—", color: "text-slate-300" };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return { label: "—", color: "text-slate-300" };
  const months = days / 30.44;
  if (months < 6) return { label: `${Math.round(months)}m`, color: "text-emerald-600" };
  if (months < 12) return { label: `${Math.round(months)}m`, color: "text-amber-500" };
  const years = Math.floor(months / 12);
  const rem = Math.floor(months % 12);
  const label = rem > 0 ? `${years}a ${rem}m` : `${years}a`;
  return { label, color: "text-red-500" };
}
interface BoxEntry { weight: string; lot: string; }

// Stable empty arrays to avoid recreating references on every render (prevents infinite loops in useEffect)
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_BALANCES: BalanceRecord[] = [];

// ── API helpers ───────────────────────────────────────────────────────────────
const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};
const apiForm = async (path: string, formData: FormData, method = "POST") => {
  const res = await fetch(path, { method, headers: getAuthHeaders(), body: formData });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyBoxes = (): BoxEntry[] => Array.from({ length: NUM_BOXES }, () => ({ weight: "", lot: "" }));

// ── ProductCombobox ───────────────────────────────────────────────────────────
function ProductCombobox({ products, value, onChange }: {
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
function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
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
function CoverageStats({ stats, isLoading, warehouse }: {
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
function BoxesDialog({ record, productName, unit, onClose, onViewPhoto }: {
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TomaDeInventarioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("Q1");
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryRecord | null>(null);
  const [viewBoxesRecord, setViewBoxesRecord] = useState<InventoryRecord | null>(null);
  const [filterProduct, setFilterProduct] = useState("all");
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    productId: "",
    recordDate: today(),
    previousBalance: "",
    notes: "",
  });
  const [boxes, setBoxes] = useState<BoxEntry[]>(emptyBoxes());
  const [boxPhotos, setBoxPhotos] = useState<(File | null)[]>(Array(NUM_BOXES).fill(null));
  const [boxPreviews, setBoxPreviews] = useState<(string | null)[]>(Array(NUM_BOXES).fill(null));
  const fileRef0 = useRef<HTMLInputElement>(null);
  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);
  const fileRef3 = useRef<HTMLInputElement>(null);
  const fileRef4 = useRef<HTMLInputElement>(null);
  const fileRefs = [fileRef0, fileRef1, fileRef2, fileRef3, fileRef4];

  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const updateBox = (i: number, key: keyof BoxEntry, val: string) => {
    setBoxes(prev => prev.map((b, idx) => idx === i ? { ...b, [key]: val } : b));
  };

  const handleBoxPhoto = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBoxPhotos(prev => prev.map((p, idx) => idx === i ? file : p));
    const reader = new FileReader();
    reader.onload = ev => setBoxPreviews(prev => prev.map((p, idx) => idx === i ? (ev.target?.result as string) : p));
    reader.readAsDataURL(file);
  };

  const clearBoxPhoto = (i: number) => {
    setBoxPhotos(prev => prev.map((p, idx) => idx === i ? null : p));
    setBoxPreviews(prev => prev.map((p, idx) => idx === i ? null : p));
    if (fileRefs[i].current) fileRefs[i].current!.value = "";
  };

  const totalPhysical = useMemo(
    () => boxes.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0),
    [boxes]
  );
  const hasBoxData = boxes.some(b => b.weight || b.lot) || boxPhotos.some(Boolean);
  const difference = hasBoxData && form.previousBalance
    ? totalPhysical - (parseFloat(form.previousBalance) || 0)
    : null;

  const resetForm = () => {
    setForm({ productId: "", recordDate: today(), previousBalance: "", notes: "" });
    setBoxes(emptyBoxes());
    setBoxPhotos(Array(NUM_BOXES).fill(null));
    setBoxPreviews(Array(NUM_BOXES).fill(null));
    fileRefs.forEach(r => { if (r.current) r.current.value = ""; });
  };

  // Queries
  const { data: products = EMPTY_PRODUCTS } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedWarehouse],
    queryFn: () => apiJson(`/api/products?warehouse=${selectedWarehouse}`),
  });

  const { data: records = [], isLoading, isError } = useQuery<InventoryRecord[]>({
    queryKey: ["/api/inventory", selectedWarehouse],
    queryFn: () => apiJson(`/api/inventory?warehouse=${selectedWarehouse}`),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<InventoryStats>({
    queryKey: ["/api/inventory/stats", selectedWarehouse],
    queryFn: () => apiJson(`/api/inventory/stats?warehouse=${selectedWarehouse}`),
  });

  const { data: latestBalances = EMPTY_BALANCES } = useQuery<BalanceRecord[]>({
    queryKey: ["/api/balances/latest", selectedWarehouse],
    queryFn: () => apiJson(`/api/balances/latest?warehouse=${selectedWarehouse}`),
  });

  // Build balance lookup by code
  const balanceByCode = useMemo(() =>
    Object.fromEntries(latestBalances.map(b => [b.code, b])),
    [latestBalances]
  );

  // Auto-fill previous balance when product changes
  useEffect(() => {
    if (!form.productId) {
      if (form.previousBalance !== "") setField("previousBalance", "");
      return;
    }
    const product = products.find(p => p.id === form.productId);
    if (!product) return;
    const balance = balanceByCode[product.code];
    const next = balance ? String(balance.quantity) : "";
    if (next !== form.previousBalance) setField("previousBalance", next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.productId, products, balanceByCode]);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const filtered = useMemo(() =>
    filterProduct === "all" ? records : records.filter(r => r.productId === filterProduct),
    [records, filterProduct]);

  const getDiff = (r: InventoryRecord) => {
    const sys = parseFloat(r.previousBalance) || 0;
    const phys = r.physicalCount != null ? parseFloat(r.physicalCount) : null;
    return phys !== null ? phys - sys : null;
  };

  // Mutation
  const createMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("productId", form.productId);
      fd.append("warehouse", selectedWarehouse);
      fd.append("recordDate", form.recordDate);
      fd.append("previousBalance", form.previousBalance || "0");
      fd.append("inputs", "0");
      fd.append("outputs", "0");
      fd.append("finalBalance", hasBoxData ? String(totalPhysical) : form.previousBalance || "0");
      fd.append("physicalCount", hasBoxData ? String(totalPhysical) : "");
      fd.append("notes", form.notes);
      fd.append("boxesData", JSON.stringify(boxes));
      // Attach photos
      boxPhotos.forEach((photo, i) => {
        if (photo) fd.append(`photo${i}`, photo);
      });
      return apiForm("/api/inventory", fd, "POST");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Inventario guardado", description: "El registro de inventario fue guardado correctamente." });
      setShowForm(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/api/inventory/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
      toast({ title: "Registro eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const canSubmit = form.productId && (hasBoxData || form.previousBalance);

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Toma de Inventario</h1>
              <p className="text-slate-500 text-sm">Registro de existencias por producto y lote</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedWarehouse} onValueChange={v => { setSelectedWarehouse(v); setFilterProduct("all"); }}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button onClick={() => setShowForm(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> Nuevo Registro
              </Button>
            )}
          </div>
        </div>

        {/* Stats por almacén */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
            Estado del almacén {selectedWarehouse}
          </p>
          <CoverageStats stats={stats} isLoading={statsLoading} warehouse={selectedWarehouse} />
        </div>

        {/* Resumen de registros */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
            Registros del almacén {selectedWarehouse}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Registros", val: records.length, color: "text-slate-900" },
              { label: "Con Diferencia", val: records.filter(r => { const d = getDiff(r); return d !== null && Math.abs(d) >= 0.01; }).length, color: "text-amber-600" },
              { label: "Sin Diferencia", val: records.filter(r => { const d = getDiff(r); return d !== null && Math.abs(d) < 0.01; }).length, color: "text-emerald-600" },
              { label: "Con Cajas", val: records.filter(r => (r.boxes?.length ?? 0) > 0).length, color: "text-violet-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filtro por producto */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Filtrar por producto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los productos</SelectItem>
              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando registros...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm">No se pudo cargar el inventario</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <ClipboardList className="w-10 h-10" />
              <p className="text-sm font-medium">No hay registros de inventario en {selectedWarehouse}</p>
              {canWrite && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Crear primer registro
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Saldo Sistema</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Total Físico</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Diferencia</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Cajas</TableHead>
                    <TableHead className="font-semibold text-slate-600 whitespace-nowrap">Últ. Consumo</TableHead>
                    <TableHead className="font-semibold text-slate-600 whitespace-nowrap">Sin movimiento</TableHead>
                    <TableHead className="font-semibold text-slate-600">Observaciones</TableHead>
                    {canDelete && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const d = getDiff(r);
                    const product = productMap[r.productId];
                    const boxCount = (r.boxes ?? []).filter(b => b.weight || b.lot || b.photoUrl).length;
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell className="text-sm text-slate-700 font-medium whitespace-nowrap">{r.recordDate}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{product?.name ?? r.productId}</p>
                            <p className="text-xs text-slate-400">{product?.code} · {product?.unit}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-500">
                          {parseFloat(r.previousBalance).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-slate-900">
                          {r.physicalCount != null
                            ? parseFloat(r.physicalCount).toFixed(2)
                            : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {d === null ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : Math.abs(d) < 0.01 ? (
                            <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs font-semibold bg-emerald-50 rounded-full px-2 py-0.5">
                              <Minus className="w-3 h-3" /> Exacto
                            </span>
                          ) : d > 0 ? (
                            <span className="flex items-center justify-center gap-1 text-blue-600 text-xs font-semibold bg-blue-50 rounded-full px-2 py-0.5">
                              <TrendingUp className="w-3 h-3" />+{d.toFixed(2)}
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-red-500 text-xs font-semibold bg-red-50 rounded-full px-2 py-0.5">
                              <TrendingDown className="w-3 h-3" />{d.toFixed(2)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {boxCount > 0 ? (
                            <button
                              onClick={() => setViewBoxesRecord(r)}
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 rounded-full px-2 py-0.5 transition-colors">
                              <Box className="w-3 h-3" /> {boxCount}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {(() => {
                            const uc = balanceByCode[product?.code ?? ""]?.ultimoConsumo;
                            return uc
                              ? <span className="text-slate-700 font-medium">{uc}</span>
                              : <span className="text-slate-300">—</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {(() => {
                            const uc = balanceByCode[product?.code ?? ""]?.ultimoConsumo;
                            const sm = sinMovimiento(uc);
                            return <span className={`text-xs font-semibold ${sm.color}`}>{sm.label}</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 max-w-[180px] truncate">
                          {r.notes || <span className="text-slate-300">—</span>}
                        </TableCell>
                        {canDelete && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setDeleteTarget(r)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Formulario nuevo registro ── */}
        <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) resetForm(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" /> Nuevo Registro de Inventario
                <span className="ml-auto text-xs font-normal text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{selectedWarehouse}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">

              {/* Producto + fecha */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                <div className="space-y-1.5">
                  <Label>Producto <span className="text-red-500">*</span></Label>
                  <ProductCombobox products={products} value={form.productId} onChange={v => setField("productId", v)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha</Label>
                  <Input type="date" value={form.recordDate} onChange={e => setField("recordDate", e.target.value)} className="w-40" />
                </div>
              </div>

              {/* Saldo en sistema (auto-cargado) */}
              {form.productId && (
                <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center justify-between border border-slate-100">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Saldo en sistema (último SA)</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {productMap[form.productId]?.unit ?? ""}
                      {form.previousBalance ? "" : " · Sin saldo actualizado registrado"}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-slate-800 font-mono">
                    {form.previousBalance ? parseFloat(form.previousBalance).toFixed(2) : <span className="text-slate-300">—</span>}
                  </span>
                </div>
              )}

              {/* Tabla de cajas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-emerald-600" /> Cajas / Lotes
                  </Label>
                  <span className="text-xs text-slate-400">Peso · Lote o Observación · Foto</span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-0 bg-slate-50 border-b border-slate-200 px-4 py-2">
                    <span className="text-xs font-semibold text-slate-400">#</span>
                    <span className="text-xs font-semibold text-slate-500">Peso / Cantidad</span>
                    <span className="text-xs font-semibold text-slate-500">Lote / Observación</span>
                    <span className="text-xs font-semibold text-slate-500 text-center">Foto</span>
                  </div>
                  {boxes.map((box, i) => (
                    <div key={i} className="grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-2 items-center px-4 py-2.5 border-b border-slate-100 last:border-0">
                      <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.00"
                        value={box.weight}
                        onChange={e => updateBox(i, "weight", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="text"
                        placeholder="Lote, fecha venc., observación..."
                        value={box.lot}
                        onChange={e => updateBox(i, "lot", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <div className="flex items-center justify-center">
                        <input
                          ref={fileRefs[i]}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={e => handleBoxPhoto(i, e)}
                        />
                        {boxPreviews[i] ? (
                          <div className="relative group">
                            <button
                              type="button"
                              onClick={() => setViewPhoto(boxPreviews[i]!)}
                              className="w-9 h-9 rounded-lg overflow-hidden border border-slate-200">
                              <img src={boxPreviews[i]!} alt="preview" className="w-full h-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => clearBoxPhoto(i)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileRefs[i].current?.click()}
                            className="w-9 h-9 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300 hover:border-emerald-400 hover:text-emerald-500 transition-colors">
                            <Camera className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total y diferencia */}
              {hasBoxData && (
                <div className={`rounded-lg p-3 flex items-center justify-between border ${
                  difference === null ? "bg-slate-50 border-slate-100"
                  : Math.abs(difference) < 0.01 ? "bg-emerald-50 border-emerald-100"
                  : difference > 0 ? "bg-blue-50 border-blue-100"
                  : "bg-red-50 border-red-100"
                }`}>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      Total físico: <span className="font-mono text-slate-900">{totalPhysical.toFixed(3)} {productMap[form.productId]?.unit ?? ""}</span>
                    </p>
                    {difference !== null && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {Math.abs(difference) < 0.01
                          ? "El físico coincide con el sistema ✓"
                          : difference > 0
                          ? "Hay más producto del que indica el sistema"
                          : "Falta producto respecto al sistema"}
                      </p>
                    )}
                  </div>
                  {difference !== null && (
                    <span className={`text-xl font-bold font-mono ${
                      Math.abs(difference) < 0.01 ? "text-emerald-700"
                      : difference > 0 ? "text-blue-700"
                      : "text-red-600"
                    }`}>
                      {difference > 0 ? "+" : ""}{difference.toFixed(3)}
                    </span>
                  )}
                </div>
              )}

              {/* Observaciones generales */}
              <div className="space-y-1.5">
                <Label>Observaciones generales</Label>
                <Textarea
                  placeholder="Observaciones adicionales del conteo..."
                  value={form.notes}
                  onChange={e => setField("notes", e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !canSubmit}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Registro
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Detalle de cajas ── */}
        <BoxesDialog
          record={viewBoxesRecord}
          productName={viewBoxesRecord ? (productMap[viewBoxesRecord.productId]?.name ?? "") : ""}
          unit={viewBoxesRecord ? (productMap[viewBoxesRecord.productId]?.unit ?? "") : ""}
          onClose={() => setViewBoxesRecord(null)}
          onViewPhoto={url => setViewPhoto(url)}
        />

        {/* ── Eliminar ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el registro del {deleteTarget?.recordDate}. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Visor de foto ── */}
        {viewPhoto && <PhotoViewer url={viewPhoto} onClose={() => setViewPhoto(null)} />}

      </div>
    </AppLayout>
  );
}
