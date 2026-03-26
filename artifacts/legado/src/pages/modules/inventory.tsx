import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Plus, Trash2, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Search, X, ChevronsUpDown } from "lucide-react";

interface Product { id: string; code: string; name: string; unit: string; }
interface InventoryRecord {
  id: string; productId: string; recordDate: string;
  previousBalance: string; inputs: string; outputs: string; finalBalance: string;
  notes?: string | null; registeredBy: string; createdAt: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// ProductCombobox — campo de búsqueda con dropdown filtrado
// ---------------------------------------------------------------------------
function ProductCombobox({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = products.find(p => p.id === value);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Si no hay selección, limpiar el query
        if (!value) setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      p =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
    );
  }, [products, query]);

  const handleSelect = (p: Product) => {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setQuery("");
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Input de búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-9 pr-9 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 placeholder:text-muted-foreground"
          placeholder={selected ? "" : "Buscar por código o nombre..."}
          value={open ? query : (selected ? "" : query)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        {/* Muestra el producto seleccionado cuando no está en foco */}
        {selected && !open && (
          <div className="absolute inset-0 flex items-center pl-9 pr-9 pointer-events-none">
            <span className="text-sm text-slate-900 truncate">
              <span className="font-mono text-slate-500 text-xs mr-1">{selected.code}</span>
              {selected.name}
            </span>
          </div>
        )}
        {/* Botón limpiar o chevron */}
        {selected ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              No se encontraron productos
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-baseline gap-2 border-b border-slate-50 last:border-0"
              >
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CuadredeInventarioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryRecord | null>(null);
  const [filterProduct, setFilterProduct] = useState("all");

  const [form, setForm] = useState({
    productId: "", recordDate: today(),
    previousBalance: "0", inputs: "0", outputs: "0", finalBalance: "0", notes: "",
  });

  const set = (k: keyof typeof form, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      const prev = parseFloat(next.previousBalance) || 0;
      const inp = parseFloat(next.inputs) || 0;
      const out = parseFloat(next.outputs) || 0;
      next.finalBalance = (prev + inp - out).toFixed(2);
      return next;
    });
  };

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], queryFn: () => api("/api/products"),
  });

  const { data: records = [], isLoading, isError } = useQuery<InventoryRecord[]>({
    queryKey: ["/api/inventory"], queryFn: () => api("/api/inventory"),
  });

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  const filtered = useMemo(() =>
    filterProduct === "all" ? records : records.filter(r => r.productId === filterProduct),
    [records, filterProduct]);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api("/api/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Registro guardado", description: "El cuadre de inventario fue registrado." });
      setShowForm(false);
      setForm({ productId: "", recordDate: today(), previousBalance: "0", inputs: "0", outputs: "0", finalBalance: "0", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/inventory/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Registro eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const diff = (r: InventoryRecord) => parseFloat(r.finalBalance) - parseFloat(r.previousBalance);

  const pendingDiffs = records.filter(r => Math.abs(diff(r)) > 0).length;
  const totalInputs = records.reduce((a, r) => a + (parseFloat(r.inputs) || 0), 0);
  const totalOutputs = records.reduce((a, r) => a + (parseFloat(r.outputs) || 0), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Cuadre de Inventario</h1>
              <p className="text-slate-500 text-sm">Registro diario de entradas, salidas y balances</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Nuevo Registro
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Registros", val: records.length, color: "text-slate-900" },
            { label: "Con Diferencias", val: pendingDiffs, color: "text-amber-600" },
            { label: "Total Entradas", val: totalInputs.toFixed(0), color: "text-emerald-600" },
            { label: "Total Salidas", val: totalOutputs.toFixed(0), color: "text-red-500" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

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
                    <TableHead className="font-semibold text-slate-600 text-right">Saldo Ant.</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Entradas</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Salidas</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Saldo Final</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-center">Diferencia</TableHead>
                    {canDelete && <TableHead className="font-semibold text-slate-600 text-right w-16"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const d = diff(r);
                    const product = productMap[r.productId];
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell className="text-sm text-slate-700 font-medium">{r.recordDate}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{product?.name ?? r.productId}</p>
                            <p className="text-xs text-slate-400">{product?.code} · {product?.unit}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-600">{r.previousBalance}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">+{r.inputs}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-500 font-semibold">-{r.outputs}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-slate-900">{r.finalBalance}</TableCell>
                        <TableCell className="text-center">
                          {Math.abs(d) < 0.01 ? (
                            <span className="flex items-center justify-center gap-1 text-slate-400 text-xs"><Minus className="w-3 h-3" /> Sin dif.</span>
                          ) : d > 0 ? (
                            <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs font-semibold"><TrendingUp className="w-3 h-3" />+{d.toFixed(2)}</span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-red-500 text-xs font-semibold"><TrendingDown className="w-3 h-3" />{d.toFixed(2)}</span>
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

        {/* ── Dialog Nuevo Registro ── */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" /> Nuevo Cuadre de Inventario
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Combobox de búsqueda de productos */}
              <div className="space-y-1.5">
                <Label>Producto *</Label>
                <ProductCombobox
                  products={products}
                  value={form.productId}
                  onChange={v => set("productId", v)}
                />
                {form.productId && (
                  <p className="text-xs text-slate-400 mt-1">
                    Unidad: <span className="font-medium text-slate-600">{productMap[form.productId]?.unit}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Fecha del Registro *</Label>
                <Input type="date" value={form.recordDate} onChange={e => set("recordDate", e.target.value)} required />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Saldo Anterior *</Label>
                  <Input type="number" step="0.01" min="0" value={form.previousBalance}
                    onChange={e => set("previousBalance", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Entradas *</Label>
                  <Input type="number" step="0.01" min="0" value={form.inputs}
                    onChange={e => set("inputs", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Salidas *</Label>
                  <Input type="number" step="0.01" min="0" value={form.outputs}
                    onChange={e => set("outputs", e.target.value)} required />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-700">Saldo Final (calculado)</span>
                <span className="text-xl font-bold text-emerald-700">{form.finalBalance}</span>
              </div>

              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Input placeholder="Observaciones del cuadre" value={form.notes}
                  onChange={e => set("notes", e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.productId}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Registro
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el cuadre de inventario del {deleteTarget?.recordDate}. Esta acción no se puede deshacer.
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
      </div>
    </AppLayout>
  );
}
