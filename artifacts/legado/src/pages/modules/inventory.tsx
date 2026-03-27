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
  Camera, ImageOff, Eye, PackageX, CheckCircle2, AlertTriangle,
} from "lucide-react";

interface Product { id: string; code: string; name: string; unit: string; }
interface InventoryRecord {
  id: string; productId: string; recordDate: string;
  previousBalance: string; inputs: string; outputs: string; finalBalance: string;
  physicalCount?: string | null;
  photoUrl?: string | null;
  notes?: string | null; registeredBy: string; createdAt: string;
}
interface InventoryStats {
  totalProducts: number;
  withoutRecords: number;
  exact: number;
  withDifference: number;
  surplus: number;
  shortage: number;
}

// ── API helper ───────────────────────────────────────────────────────────────
const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

// Para subir con foto (multipart/form-data) — NO ponemos Content-Type, el browser lo pone solo
const apiForm = async (path: string, formData: FormData, method = "POST") => {
  const res = await fetch(path, { method, headers: getAuthHeaders(), body: formData });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

// ── ProductCombobox ──────────────────────────────────────────────────────────
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

// ── PhotoViewer modal ────────────────────────────────────────────────────────
function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg text-slate-700 hover:text-red-600">
          <X className="w-5 h-5" />
        </button>
        <img src={url} alt="Foto de etiqueta" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
        <p className="text-center text-white text-xs mt-2 opacity-70">Foto de etiqueta / último lote</p>
      </div>
    </div>
  );
}

// ── CoverageStats ─────────────────────────────────────────────────────────────
function CoverageStats({ stats, isLoading }: { stats: InventoryStats | undefined; isLoading: boolean }) {
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
      label: "Sin cuadre registrado",
      sublabel: `${stats.totalProducts} productos en total · ${pctCovered}% cubiertos`,
      value: stats.withoutRecords,
      icon: <PackageX className="w-5 h-5 text-slate-400" />,
      bg: stats.withoutRecords === 0 ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100",
      valueColor: stats.withoutRecords === 0 ? "text-emerald-700" : "text-amber-600",
      badge: stats.withoutRecords === 0
        ? <span className="text-xs font-medium text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">✓ Todos cubiertos</span>
        : <span className="text-xs font-medium text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">Pendientes</span>,
    },
    {
      label: "Exacto en último cuadre",
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CuadredeInventarioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryRecord | null>(null);
  const [filterProduct, setFilterProduct] = useState("all");
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  // Estado del formulario
  const [form, setForm] = useState({
    productId: "",
    recordDate: today(),
    previousBalance: "",   // Saldo actual en sistema
    physicalCount: "",     // Cantidad en físico
    notes: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Diferencia calculada automáticamente
  const difference = useMemo(() => {
    const sys = parseFloat(form.previousBalance) || 0;
    const phys = parseFloat(form.physicalCount) || 0;
    if (!form.previousBalance || !form.physicalCount) return null;
    return phys - sys;
  }, [form.previousBalance, form.physicalCount]);

  const setField = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setForm({ productId: "", recordDate: today(), previousBalance: "", physicalCount: "", notes: "" });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  // Queries
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], queryFn: () => apiJson("/api/products"),
  });
  const { data: records = [], isLoading, isError } = useQuery<InventoryRecord[]>({
    queryKey: ["/api/inventory"], queryFn: () => apiJson("/api/inventory"),
  });
  const { data: stats, isLoading: statsLoading } = useQuery<InventoryStats>({
    queryKey: ["/api/inventory/stats"], queryFn: () => apiJson("/api/inventory/stats"),
  });

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const filtered = useMemo(() =>
    filterProduct === "all" ? records : records.filter(r => r.productId === filterProduct),
    [records, filterProduct]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("productId", form.productId);
      fd.append("recordDate", form.recordDate);
      fd.append("previousBalance", form.previousBalance || "0");
      fd.append("inputs", "0");
      fd.append("outputs", "0");
      // finalBalance = physicalCount (lo que hay en físico ES el saldo final real)
      const physVal = form.physicalCount || form.previousBalance || "0";
      fd.append("finalBalance", physVal);
      fd.append("physicalCount", form.physicalCount || "");
      fd.append("notes", form.notes);
      if (photoFile) fd.append("photo", photoFile);
      return apiForm("/api/inventory", fd, "POST");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Cuadre guardado", description: "El cuadre de inventario fue registrado correctamente." });
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

  // Stats de la tabla (registros totales, con foto, etc.)
  const withDiff = records.filter(r => {
    const sys = parseFloat(r.previousBalance) || 0;
    const phys = r.physicalCount != null ? parseFloat(r.physicalCount) : null;
    return phys !== null && Math.abs(phys - sys) >= 0.01;
  }).length;

  const getDiff = (r: InventoryRecord) => {
    const sys = parseFloat(r.previousBalance) || 0;
    const phys = r.physicalCount != null ? parseFloat(r.physicalCount) : null;
    return phys !== null ? phys - sys : null;
  };

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Cuadre de Inventario</h1>
              <p className="text-slate-500 text-sm">Registro diario · Saldo en sistema vs. conteo físico</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Nuevo Cuadre
            </Button>
          )}
        </div>

        {/* ── Cobertura por producto (nuevo) ── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
            Estado actual por producto
          </p>
          <CoverageStats stats={stats} isLoading={statsLoading} />
        </div>

        {/* ── Stats de registros ── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
            Registros de cuadres
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Registros", val: records.length, color: "text-slate-900" },
              { label: "Con Diferencias", val: withDiff, color: "text-amber-600" },
              { label: "Sin Diferencias", val: records.length - withDiff, color: "text-emerald-600" },
              { label: "Con Foto", val: records.filter(r => r.photoUrl).length, color: "text-violet-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filtro */}
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
              <p className="text-sm font-medium">No hay registros de inventario aún</p>
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
                    <TableHead className="font-semibold text-slate-600 text-right">Físico</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Diferencia</TableHead>
                    <TableHead className="font-semibold text-slate-600">Observaciones</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Foto</TableHead>
                    {canDelete && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const d = getDiff(r);
                    const product = productMap[r.productId];
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell className="text-sm text-slate-700 font-medium whitespace-nowrap">{r.recordDate}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{product?.name ?? r.productId}</p>
                            <p className="text-xs text-slate-400">{product?.code} · {product?.unit}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-600">
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
                        <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">
                          {r.notes || <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.photoUrl ? (
                            <button onClick={() => setViewPhoto(r.photoUrl!)}
                              className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 text-xs font-medium bg-violet-50 hover:bg-violet-100 rounded-full px-2 py-0.5 transition-colors">
                              <Eye className="w-3 h-3" /> Ver
                            </button>
                          ) : (
                            <ImageOff className="w-4 h-4 text-slate-200 mx-auto" />
                          )}
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

        {/* ── Dialog Nuevo Cuadre ── */}
        <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" /> Nuevo Cuadre de Inventario
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">

              {/* 1. Producto */}
              <div className="space-y-1.5">
                <Label>Producto <span className="text-red-500">*</span></Label>
                <ProductCombobox products={products} value={form.productId} onChange={v => setField("productId", v)} />
                {form.productId && (
                  <p className="text-xs text-slate-400 mt-1">
                    Unidad: <span className="font-medium text-slate-600">{productMap[form.productId]?.unit}</span>
                  </p>
                )}
              </div>

              {/* 2. Fecha */}
              <div className="space-y-1.5">
                <Label>Fecha del Cuadre <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.recordDate} onChange={e => setField("recordDate", e.target.value)} />
              </div>

              {/* 3. Saldo actual en sistema + Físico */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Saldo en Sistema <span className="text-red-500">*</span></Label>
                  <p className="text-xs text-slate-400">Lo que dice el sistema</p>
                  <Input type="number" step="0.01" min="0" placeholder="0.00"
                    value={form.previousBalance}
                    onChange={e => setField("previousBalance", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cantidad en Físico <span className="text-red-500">*</span></Label>
                  <p className="text-xs text-slate-400">Lo que encontraste en almacén</p>
                  <Input type="number" step="0.01" min="0" placeholder="0.00"
                    value={form.physicalCount}
                    onChange={e => setField("physicalCount", e.target.value)} />
                </div>
              </div>

              {/* 4. Diferencia calculada */}
              {difference !== null && (
                <div className={`rounded-lg p-3 flex items-center justify-between border ${
                  Math.abs(difference) < 0.01
                    ? "bg-emerald-50 border-emerald-100"
                    : difference > 0
                    ? "bg-blue-50 border-blue-100"
                    : "bg-red-50 border-red-100"
                }`}>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Diferencia encontrada</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {Math.abs(difference) < 0.01
                        ? "El físico coincide con el sistema ✓"
                        : difference > 0
                        ? "Hay más producto del que indica el sistema"
                        : "Falta producto respecto al sistema"}
                    </p>
                  </div>
                  <span className={`text-xl font-bold ${
                    Math.abs(difference) < 0.01 ? "text-emerald-700"
                    : difference > 0 ? "text-blue-700"
                    : "text-red-600"
                  }`}>
                    {difference > 0 ? "+" : ""}{difference.toFixed(2)}
                    {form.productId && ` ${productMap[form.productId]?.unit ?? ""}`}
                  </span>
                </div>
              )}

              {/* 5. Observaciones */}
              <div className="space-y-1.5">
                <Label>Observaciones</Label>
                <Textarea
                  placeholder="Anota cualquier detalle: lote que estás usando, condiciones del almacén, motivo de diferencia, etc."
                  value={form.notes}
                  onChange={e => setField("notes", e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* 6. Foto de etiqueta */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-violet-500" />
                  Foto de Etiqueta
                  <span className="text-xs text-slate-400 font-normal">(opcional — muestra el lote que estás usando)</span>
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Vista previa" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-md text-slate-600 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur rounded-full px-2 py-0.5 text-xs text-slate-600">
                      {photoFile?.name}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors">
                    <Camera className="w-6 h-6" />
                    <span className="text-xs">Toca para tomar foto o elegir imagen</span>
                  </button>
                )}
              </div>

            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.productId || !form.previousBalance || !form.physicalCount}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Cuadre
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── AlertDialog Eliminar ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el cuadre del {deleteTarget?.recordDate}. Esta acción no se puede deshacer.
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
