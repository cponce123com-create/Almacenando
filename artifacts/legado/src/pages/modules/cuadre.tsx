import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Warehouse, Plus, Trash2, Loader2, AlertCircle, Search, X, ChevronsUpDown,
  TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, ClipboardCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Product { id: string; code: string; name: string; unit: string; warehouse: string; }
interface BalanceRecord { code: string; quantity: string; }
interface InventoryRecord { productId: string; physicalCount?: string | null; recordDate: string; }
interface CuadreItem {
  id: string; cuadreId: string; code: string; productDescription: string; unit: string;
  systemBalance: string; physicalCount: string; difference: string; notes?: string | null;
}
interface CuadreRecord {
  id: string; warehouse: string; cuadreDate: string; responsible: string;
  notes?: string | null; status: string; registeredBy: string; createdAt: string;
  items?: CuadreItem[];
}

// ── API helper ─────────────────────────────────────────────────────────────────
const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

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
          className="w-full pl-9 pr-9 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
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
          <button type="button" onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
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
          ) : filtered.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onChange(p.id); setQuery(""); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-baseline gap-2 border-b border-slate-50 last:border-0">
              <span className="font-mono text-xs text-slate-400 shrink-0">{p.code}</span>
              <span className="text-slate-800 truncate">{p.name}</span>
              <span className="ml-auto text-xs text-slate-400 shrink-0">{p.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Difference badge ──────────────────────────────────────────────────────────
function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 0.01) return (
    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold bg-emerald-50 rounded-full px-2 py-0.5">
      <Minus className="w-3 h-3" /> Exacto
    </span>
  );
  if (diff > 0) return (
    <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold bg-blue-50 rounded-full px-2 py-0.5">
      <TrendingUp className="w-3 h-3" /> +{diff.toFixed(2)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold bg-red-50 rounded-full px-2 py-0.5">
      <TrendingDown className="w-3 h-3" /> {diff.toFixed(2)}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CuadrePage() {
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canWrite = user?.role && ["admin", "supervisor"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CuadreRecord | null>(null);

  // Form state
  const [selectedProduct, setSelectedProduct] = useState("");
  const [cuadreDate, setCuadreDate] = useState(today());
  const [observations, setObservations] = useState("");

  const resetForm = () => {
    setSelectedProduct("");
    setCuadreDate(today());
    setObservations("");
  };

  const warehouseParam = warehouse === "all" ? "" : `?warehouse=${warehouse}`;

  // Queries
  const { data: records = [], isLoading, isError } = useQuery<CuadreRecord[]>({
    queryKey: ["cuadre", warehouse],
    queryFn: () => apiJson(`${BASE}/api/cuadre${warehouseParam}`),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", warehouse],
    queryFn: () => apiJson(`/api/products${warehouseParam}`),
  });

  const { data: latestBalances = [] } = useQuery<BalanceRecord[]>({
    queryKey: ["balances-latest", warehouse],
    queryFn: () => apiJson(`${BASE}/api/balances/latest${warehouseParam}`),
  });

  const { data: inventoryRecords = [] } = useQuery<InventoryRecord[]>({
    queryKey: ["/api/inventory", warehouse],
    queryFn: () => apiJson(`/api/inventory${warehouseParam}`),
  });

  // Build lookup maps
  const balanceByCode = useMemo(
    () => Object.fromEntries(latestBalances.map(b => [b.code, b.quantity])),
    [latestBalances]
  );

  // Latest physical count per product (records come sorted desc by date)
  const latestPhysicalByProduct = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of inventoryRecords) {
      if (!(r.productId in map) && r.physicalCount != null) {
        map[r.productId] = r.physicalCount;
      }
    }
    return map;
  }, [inventoryRecords]);

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products]
  );

  const product = productMap[selectedProduct];
  const saBalance = product ? (balanceByCode[product.code] ?? null) : null;
  const lastPhysical = product ? (latestPhysicalByProduct[product.id] ?? null) : null;
  const difference = saBalance !== null && lastPhysical !== null
    ? parseFloat(lastPhysical) - parseFloat(saBalance)
    : null;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: () => {
      if (!product) throw new Error("Selecciona un producto");
      return apiJson(`${BASE}/api/cuadre`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: warehouse === "all" ? product.warehouse : warehouse,
          cuadreDate,
          responsible: user?.name ?? user?.email ?? "—",
          notes: observations,
          status: "pending",
          items: [{
            code: product.code,
            productDescription: product.name,
            unit: product.unit,
            systemBalance: saBalance ?? "0",
            physicalCount: lastPhysical ?? "0",
            notes: "",
          }],
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cuadre"] });
      toast({ title: "Cuadre registrado", description: "El registro de cuadre fue guardado correctamente." });
      setShowForm(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Mark as completed mutation
  const markCuadradoMutation = useMutation({
    mutationFn: (id: string) => apiJson(`${BASE}/api/cuadre/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", responsible: user?.name ?? user?.email ?? "—" }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cuadre"] });
      toast({ title: "Marcado como Cuadrado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`${BASE}/api/cuadre/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cuadre"] });
      toast({ title: "Registro eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  // Stats
  const pending = records.filter(r => r.status === "pending").length;
  const completed = records.filter(r => r.status === "completed" || r.status === "approved").length;
  const withDiff = records.filter(r => {
    const item = r.items?.[0];
    if (!item) return false;
    return Math.abs(parseFloat(item.difference) || 0) >= 0.01;
  }).length;

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Control de Cuadres
                {warehouse !== "all" && (
                  <span className="ml-2 text-base font-medium text-violet-600">· {warehouse}</span>
                )}
              </h1>
              <p className="text-slate-500 text-sm">Hoja de control de diferencias de inventario por producto</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-violet-600 hover:bg-violet-700">
              <Plus className="w-4 h-4" /> Nuevo Cuadre
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Registros", val: records.length, color: "text-slate-900" },
            { label: "Pendientes", val: pending, color: pending > 0 ? "text-amber-600" : "text-slate-400" },
            { label: "Cuadrados", val: completed, color: "text-emerald-600" },
            { label: "Con Diferencia", val: withDiff, color: withDiff > 0 ? "text-red-600" : "text-slate-400" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando registros...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-500">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">No se pudo cargar los cuadres</p>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Warehouse className="w-10 h-10" />
              <p className="text-sm font-medium">No hay cuadres registrados</p>
              {canWrite && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Crear primer cuadre
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600 whitespace-nowrap">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Saldo SA</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Último Físico</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Diferencia</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Estado</TableHead>
                    <TableHead className="font-semibold text-slate-600">Observaciones</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center w-36">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(r => {
                    const item = r.items?.[0];
                    const diff = item ? parseFloat(item.difference) || 0 : 0;
                    const isPending = r.status === "pending";
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell className="text-sm text-slate-600 font-medium whitespace-nowrap">
                          {r.cuadreDate}
                        </TableCell>
                        <TableCell>
                          {item ? (
                            <div>
                              <p className="text-sm font-medium text-slate-900">{item.productDescription}</p>
                              <p className="text-xs text-slate-400 font-mono">{item.code} · {item.unit}</p>
                            </div>
                          ) : <span className="text-slate-300 text-sm">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-500">
                          {item ? parseFloat(item.systemBalance).toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-slate-800">
                          {item ? parseFloat(item.physicalCount).toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {item ? <DiffBadge diff={diff} /> : <span className="text-slate-300 text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold bg-amber-100 rounded-full px-2.5 py-0.5">
                              <Clock className="w-3 h-3" /> Pendiente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold bg-emerald-100 rounded-full px-2.5 py-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Cuadrado
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">
                          {r.notes || <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {canWrite && isPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1"
                                disabled={markCuadradoMutation.isPending}
                                onClick={() => markCuadradoMutation.mutate(r.id)}
                              >
                                {markCuadradoMutation.isPending
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <CheckCircle2 className="w-3 h-3" />}
                                Cuadrar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(r)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Nuevo Cuadre dialog ── */}
        <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-violet-600" /> Nuevo Cuadre de Producto
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">

              {/* Producto */}
              <div className="space-y-1.5">
                <Label>Producto <span className="text-red-500">*</span></Label>
                <ProductCombobox
                  products={products}
                  value={selectedProduct}
                  onChange={setSelectedProduct}
                />
              </div>

              {/* Fecha */}
              <div className="space-y-1.5">
                <Label>Fecha del Cuadre</Label>
                <Input type="date" value={cuadreDate} onChange={e => setCuadreDate(e.target.value)} />
              </div>

              {/* Auto-fill display */}
              {selectedProduct && (
                <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                  <div className="grid grid-cols-3 divide-x divide-slate-200">
                    <div className="px-4 py-3">
                      <p className="text-xs text-slate-400 font-semibold mb-1">Saldo SA</p>
                      <p className="text-lg font-bold font-mono text-slate-800">
                        {saBalance !== null ? parseFloat(saBalance).toFixed(2) : <span className="text-slate-300">—</span>}
                      </p>
                      <p className="text-xs text-slate-400">{product?.unit}</p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs text-slate-400 font-semibold mb-1">Último Físico</p>
                      <p className="text-lg font-bold font-mono text-slate-800">
                        {lastPhysical !== null ? parseFloat(lastPhysical).toFixed(2) : <span className="text-slate-300">—</span>}
                      </p>
                      <p className="text-xs text-slate-400">{product?.unit}</p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs text-slate-400 font-semibold mb-1">Diferencia</p>
                      <p className={`text-lg font-bold font-mono ${
                        difference === null ? "text-slate-300"
                        : Math.abs(difference) < 0.01 ? "text-emerald-600"
                        : difference > 0 ? "text-blue-600"
                        : "text-red-600"
                      }`}>
                        {difference === null ? "—"
                          : `${difference > 0 ? "+" : ""}${difference.toFixed(2)}`}
                      </p>
                      <p className="text-xs text-slate-400">{product?.unit}</p>
                    </div>
                  </div>
                  {(saBalance === null || lastPhysical === null) && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                      <p className="text-xs text-amber-600">
                        {saBalance === null && "Sin saldo actualizado registrado. "}
                        {lastPhysical === null && "Sin conteo físico previo registrado."}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Observaciones */}
              <div className="space-y-1.5">
                <Label>Observaciones</Label>
                <Textarea
                  placeholder="Detalle del cuadre: motivo de diferencia, acciones tomadas, lote revisado, etc."
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !selectedProduct}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar (Pendiente)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Eliminar ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el cuadre del <strong>{deleteTarget?.cuadreDate}</strong>.
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </AppLayout>
  );
}
