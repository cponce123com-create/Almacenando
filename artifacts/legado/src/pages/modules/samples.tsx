import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TestTube, Plus, Loader2, AlertCircle, Pencil, Trash2, Search } from "lucide-react";

interface Product { id: string; code: string; name: string; unit: string; }
interface Sample {
  id: string; productId: string; sampleCode: string; quantity: string; unit: string;
  sampleDate: string; purpose: string; destination?: string | null;
  labReference?: string | null; status: string; result?: string | null;
  notes?: string | null; takenBy: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const SAMPLE_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-amber-100 text-amber-700 border-amber-200" },
  in_lab: { label: "En Laboratorio", className: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completada", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rechazada", className: "bg-red-100 text-red-700 border-red-200" },
};

const PURPOSES = ["Análisis de calidad", "Control de proceso", "Certificación", "Investigación", "Auditoría", "Otro"];
const UNITS = ["L", "mL", "kg", "g", "mg", "unidad"];

const emptyForm = () => ({
  productId: "", sampleCode: "", quantity: "", unit: "mL",
  sampleDate: today(), purpose: "", destination: "", labReference: "",
  status: "pending", result: "", notes: "",
});

export default function MuestrasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "quality", "operator"].includes(user.role);
  const canUpdate = user?.role && ["admin", "supervisor", "quality"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [editSample, setEditSample] = useState<Sample | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sample | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [form, setForm] = useState(emptyForm());
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], queryFn: () => api("/api/products"),
  });
  const { data: samples = [], isLoading, isError } = useQuery<Sample[]>({
    queryKey: ["/api/samples"], queryFn: () => api("/api/samples"),
  });

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return samples.filter(s => {
      const matchSearch = !term || [s.sampleCode, s.purpose, productMap[s.productId]?.name, s.destination]
        .some(v => v?.toLowerCase().includes(term));
      const matchStatus = filterStatus === "all" || s.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [samples, search, filterStatus, productMap]);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api("/api/samples", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/samples"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Muestra registrada", description: "La muestra fue guardada exitosamente." });
      setShowForm(false); setForm(emptyForm());
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> }) =>
      api(`/api/samples/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/samples"] });
      toast({ title: "Muestra actualizada" });
      setEditSample(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/samples/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/samples"] });
      toast({ title: "Muestra eliminada" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const SampleForm = ({ initial, onSubmit, onCancel, pending, isEdit }: {
    initial: typeof form; onSubmit: (d: typeof form) => void;
    onCancel: () => void; pending: boolean; isEdit: boolean;
  }) => {
    const [f, setF] = useState(initial);
    const s = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
    return (
      <form onSubmit={e => { e.preventDefault(); onSubmit(f); }} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Producto *</Label>
          <Select value={f.productId} onValueChange={v => s("productId", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
            <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Código de Muestra *</Label>
            <Input placeholder="MUEST-001" value={f.sampleCode} onChange={e => s("sampleCode", e.target.value)} required disabled={isEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha *</Label>
            <Input type="date" value={f.sampleDate} onChange={e => s("sampleDate", e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Cantidad *</Label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={f.quantity} onChange={e => s("quantity", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Unidad *</Label>
            <Select value={f.unit} onValueChange={v => s("unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Propósito *</Label>
          <Select value={f.purpose} onValueChange={v => s("purpose", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar propósito" /></SelectTrigger>
            <SelectContent>{PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Destino / Laboratorio</Label>
            <Input placeholder="Lab. Certificado INDECOPI" value={f.destination} onChange={e => s("destination", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Referencia Lab.</Label>
            <Input placeholder="REF-001" value={f.labReference} onChange={e => s("labReference", e.target.value)} />
          </div>
        </div>
        {isEdit && (
          <>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={f.status} onValueChange={v => s("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SAMPLE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Input placeholder="Resultado del análisis" value={f.result} onChange={e => s("result", e.target.value)} />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Input placeholder="Observaciones" value={f.notes} onChange={e => s("notes", e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={pending || !f.productId || !f.sampleCode || !f.quantity || !f.purpose}
            className="bg-purple-600 hover:bg-purple-700">
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Guardar Cambios" : "Registrar Muestra"}
          </Button>
        </DialogFooter>
      </form>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <TestTube className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Muestras</h1>
              <p className="text-slate-500 text-sm">Registro y seguimiento de muestras de productos</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4" /> Nueva Muestra
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(SAMPLE_STATUS).map(([k, v]) => (
            <div key={k} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{v.label}</p>
              <p className="text-2xl font-bold text-slate-900">{samples.filter(s => s.status === k).length}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por código, producto, propósito..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(SAMPLE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando muestras...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-slate-500">No se pudo cargar la lista</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <TestTube className="w-10 h-10" />
              <p className="text-sm font-medium">No hay muestras registradas</p>
              {canWrite && !search && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Registrar primera muestra
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600 w-28">Código</TableHead>
                    <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right w-24">Cantidad</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-600">Propósito</TableHead>
                    <TableHead className="font-semibold text-slate-600">Laboratorio</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-36">Estado</TableHead>
                    {(canUpdate || canDelete) && <TableHead className="font-semibold text-slate-600 text-right w-20"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => {
                    const product = productMap[s.productId];
                    const cfg = SAMPLE_STATUS[s.status] ?? SAMPLE_STATUS.pending;
                    return (
                      <TableRow key={s.id} className="hover:bg-slate-50/70">
                        <TableCell>
                          <span className="font-mono text-xs font-semibold bg-purple-50 text-purple-700 px-2 py-1 rounded">
                            {s.sampleCode}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900 text-sm">{product?.name ?? s.productId}</p>
                          <p className="text-xs text-slate-400">{product?.code}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-700">{s.quantity} {s.unit}</TableCell>
                        <TableCell className="text-sm text-slate-600">{s.sampleDate}</TableCell>
                        <TableCell className="text-sm text-slate-600">{s.purpose}</TableCell>
                        <TableCell className="text-sm text-slate-500">{s.destination ?? "—"}</TableCell>
                        <TableCell>
                          <div>
                            <Badge className={`${cfg.className} hover:${cfg.className} text-xs`}>{cfg.label}</Badge>
                            {s.result && <p className="text-xs text-slate-400 mt-1">{s.result}</p>}
                          </div>
                        </TableCell>
                        {(canUpdate || canDelete) && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canUpdate && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => {
                                    setEditSample(s);
                                    setForm({
                                      productId: s.productId, sampleCode: s.sampleCode,
                                      quantity: s.quantity, unit: s.unit, sampleDate: s.sampleDate,
                                      purpose: s.purpose, destination: s.destination ?? "",
                                      labReference: s.labReference ?? "", status: s.status,
                                      result: s.result ?? "", notes: s.notes ?? "",
                                    });
                                  }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => setDeleteTarget(s)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
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

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5 text-purple-600" /> Nueva Muestra
              </DialogTitle>
            </DialogHeader>
            <SampleForm initial={emptyForm()} onSubmit={d => createMutation.mutate(d)}
              onCancel={() => setShowForm(false)} pending={createMutation.isPending} isEdit={false} />
          </DialogContent>
        </Dialog>

        <Dialog open={!!editSample} onOpenChange={o => { if (!o) setEditSample(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-purple-600" /> Editar Muestra — {editSample?.sampleCode}
              </DialogTitle>
            </DialogHeader>
            {editSample && (
              <SampleForm initial={form}
                onSubmit={d => updateMutation.mutate({ id: editSample.id, data: d })}
                onCancel={() => setEditSample(null)} pending={updateMutation.isPending} isEdit={true} />
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar muestra?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará la muestra <strong>{deleteTarget?.sampleCode}</strong>. No se puede deshacer.
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
