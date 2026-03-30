import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList, Plus, Trash2, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Camera, Eye, Box, X, MapPin } from 'lucide-react';

const LOCATION_SUGGESTIONS = [
  "Lata 1", "Lata 2", "Lata 3", "Lata 4", "Lata 5",
  "Rack Colorantes C1", "Rack Colorantes C2", "Rack Colorantes C3", "Rack Colorantes C4",
  "Rack Colorantes 1", "Rack Colorantes 2", "Rack Colorantes 3", "Rack Colorantes 4",
  "Rack Auxiliares",
  "Rack Auxiliares Tercer Nivel",
  "Zona de Abastecimiento",
  "Zona Auxiliares Abiertos 1", "Zona Auxiliares Abiertos 2", "Zona Auxiliares Abiertos 3",
  "Zona Auxiliares Pasadizo Afuera",
  "Zona Inmovilizados",
  "Zona Muestras",
  "Zona Disposición Final",
];
import {
  WAREHOUSES, NUM_BOXES, EMPTY_PRODUCTS, EMPTY_BALANCES, today, emptyBoxes, sinMovimiento, apiJson, apiForm,
  ProductCombobox, PhotoViewer, CoverageStats, BoxesDialog,
  type Product, type InventoryBox, type InventoryRecord, type InventoryStats, type BalanceRecord, type BoxEntry,
} from './inventory-partials';
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
    location: "",
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
    setForm({ productId: "", recordDate: today(), previousBalance: "", location: "", notes: "" });
    setBoxes(emptyBoxes());
    setBoxPhotos(Array(NUM_BOXES).fill(null));
    setBoxPreviews(Array(NUM_BOXES).fill(null));
    fileRefs.forEach(r => { if (r.current) r.current.value = ""; });
  };

  // Queries
  const { data: products = EMPTY_PRODUCTS } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedWarehouse],
    queryFn: () => apiJson(`/api/products?warehouse=${selectedWarehouse}&limit=500`).then((r: any) => r.data ?? r),
  });

  const { data: records = [], isLoading, isError } = useQuery<InventoryRecord[]>({
    queryKey: ["/api/inventory", selectedWarehouse],
    queryFn: () => apiJson(`/api/inventory?warehouse=${selectedWarehouse}&limit=500`).then((r: any) => r.data ?? r),
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
      fd.append("location", form.location);
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
                    <TableHead className="font-semibold text-slate-600">Ubicación</TableHead>
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
                        <TableCell className="text-sm max-w-[150px]">
                          {r.location
                            ? <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                                <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />{r.location}
                              </span>
                            : <span className="text-slate-300 text-xs">—</span>
                          }
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
              {form.productId && (() => {
                const product = productMap[form.productId];
                const balance = balanceByCode[product?.code ?? ""];
                const uc = balance?.ultimoConsumo ?? null;
                const sm = sinMovimiento(uc);
                return (
                  <div className="rounded-lg border border-slate-100 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Saldo en sistema (último SA)</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {product?.unit ?? ""}
                          {form.previousBalance ? "" : " · Sin saldo actualizado registrado"}
                        </p>
                      </div>
                      <span className="text-2xl font-bold text-slate-800 font-mono">
                        {form.previousBalance ? parseFloat(form.previousBalance).toFixed(2) : <span className="text-slate-300">—</span>}
                      </span>
                    </div>
                    <div className={`px-4 py-2.5 flex items-center justify-between border-t border-slate-100 ${sm.bg}`}>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Tiempo sin movimiento</p>
                        {uc && <p className="text-xs text-slate-400 mt-0.5">Último: {uc}</p>}
                      </div>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${sm.pill}`}>
                        {sm.label === "—" ? "Sin datos" : sm.label}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Ubicación */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" /> Ubicación
                </Label>
                <Input
                  list="inventory-locations"
                  placeholder="Ej. Rack Colorantes C1, Lata 2, Zona Abastecimiento…"
                  value={form.location}
                  onChange={e => setField("location", e.target.value)}
                  className="text-sm"
                />
                <datalist id="inventory-locations">
                  {LOCATION_SUGGESTIONS.map(l => <option key={l} value={l} />)}
                </datalist>
              </div>

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
