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
import { Recycle, Plus, Loader2, AlertCircle, Pencil, Trash2, CheckCircle2 } from "lucide-react";

interface Product { id: string; code: string; name: string; unit: string; }
interface Disposition {
  id: string; productId: string; quantity: string; unit: string;
  dispositionType: string; dispositionDate: string; contractor?: string | null;
  manifestNumber?: string | null; certificateNumber?: string | null; cost?: string | null;
  status: string; notes?: string | null; approvedBy?: string | null; registeredBy: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const DISP_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-amber-100 text-amber-700 border-amber-200" },
  in_progress: { label: "En Proceso", className: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completado", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelado", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const DISPOSITION_TYPES = [
  "Incineración", "Reciclaje", "Tratamiento fisicoquímico", "Neutralización",
  "Disposición en relleno de seguridad", "Devolución al proveedor", "Otro",
];
const UNITS = ["L", "mL", "kg", "g", "m³", "unidad"];

const emptyForm = () => ({
  productId: "", quantity: "", unit: "kg", dispositionType: "",
  dispositionDate: today(), contractor: "", manifestNumber: "",
  certificateNumber: "", cost: "", status: "pending", notes: "",
});

export default function DisposicionFinalPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canManage = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Disposition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Disposition | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Disposition | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], queryFn: () => api("/api/products"),
  });
  const { data: records = [], isLoading, isError } = useQuery<Disposition[]>({
    queryKey: ["/api/disposition"], queryFn: () => api("/api/disposition"),
  });

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const filtered = useMemo(() =>
    filterStatus === "all" ? records : records.filter(r => r.status === filterStatus), [records, filterStatus]);

  const createMutation = useMutation({
    mutationFn: (data: ReturnType<typeof emptyForm>) => api("/api/disposition", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/disposition"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Disposición registrada", description: "El proceso fue registrado exitosamente." });
      setShowForm(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api(`/api/disposition/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/disposition"] });
      toast({ title: "Registro actualizado" });
      setEditItem(null); setCompleteTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/disposition/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/disposition"] });
      toast({ title: "Registro eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const DispositionForm = ({ initial, onSubmit, onCancel, pending, isEdit }: {
    initial: ReturnType<typeof emptyForm>; onSubmit: (d: ReturnType<typeof emptyForm>) => void;
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
        <div className="grid grid-cols-3 gap-3">
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
          <div className="space-y-1.5">
            <Label>Fecha *</Label>
            <Input type="date" value={f.dispositionDate} onChange={e => s("dispositionDate", e.target.value)} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de Disposición *</Label>
          <Select value={f.dispositionType} onValueChange={v => s("dispositionType", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
            <SelectContent>{DISPOSITION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Empresa Gestora</Label>
            <Input placeholder="EcoTreat SAC" value={f.contractor} onChange={e => s("contractor", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>N° de Manifiesto</Label>
            <Input placeholder="MAN-2024-001" value={f.manifestNumber} onChange={e => s("manifestNumber", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>N° de Certificado</Label>
            <Input placeholder="CERT-001" value={f.certificateNumber} onChange={e => s("certificateNumber", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Costo (S/.)</Label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={f.cost} onChange={e => s("cost", e.target.value)} />
          </div>
        </div>
        {isEdit && (
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={f.status} onValueChange={v => s("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DISP_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Input placeholder="Observaciones del proceso" value={f.notes} onChange={e => s("notes", e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={pending || !f.productId || !f.quantity || !f.dispositionType}
            className="bg-teal-600 hover:bg-teal-700">
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Guardar Cambios" : "Registrar Disposición"}
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
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
              <Recycle className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Disposición Final</h1>
              <p className="text-slate-500 text-sm">Gestión de residuos y disposición final de productos</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4" /> Nueva Disposición
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(DISP_STATUS).map(([k, v]) => (
            <div key={k} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{v.label}</p>
              <p className="text-2xl font-bold text-slate-900">{records.filter(r => r.status === k).length}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-60"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(DISP_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando registros...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-slate-500">No se pudo cargar la lista</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Recycle className="w-10 h-10" />
              <p className="text-sm font-medium">No hay registros de disposición final</p>
              {canWrite && filterStatus === "all" && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Registrar disposición
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right w-24">Cantidad</TableHead>
                    <TableHead className="font-semibold text-slate-600">Tipo</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-600">Empresa Gestora</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20 text-right">Costo</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-32">Estado</TableHead>
                    {canManage && <TableHead className="font-semibold text-slate-600 text-right w-24"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const product = productMap[r.productId];
                    const cfg = DISP_STATUS[r.status] ?? DISP_STATUS.pending;
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell>
                          <p className="font-medium text-slate-900 text-sm">{product?.name ?? r.productId}</p>
                          <p className="text-xs text-slate-400">{product?.code}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-700">{r.quantity} {r.unit}</TableCell>
                        <TableCell className="text-sm text-slate-600">{r.dispositionType}</TableCell>
                        <TableCell className="text-sm text-slate-600">{r.dispositionDate}</TableCell>
                        <TableCell className="text-sm text-slate-500">{r.contractor ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-600">
                          {r.cost ? `S/. ${parseFloat(r.cost).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${cfg.className} hover:${cfg.className} text-xs`}>{cfg.label}</Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.status !== "completed" && r.status !== "cancelled" && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                  onClick={() => setCompleteTarget(r)} title="Marcar como completado">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => {
                                  setEditItem(r);
                                }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(r)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
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
                <Recycle className="w-5 h-5 text-teal-600" /> Nueva Disposición Final
              </DialogTitle>
            </DialogHeader>
            <DispositionForm initial={emptyForm()} onSubmit={d => createMutation.mutate(d)}
              onCancel={() => setShowForm(false)} pending={createMutation.isPending} isEdit={false} />
          </DialogContent>
        </Dialog>

        <Dialog open={!!editItem} onOpenChange={o => { if (!o) setEditItem(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-teal-600" /> Editar Disposición
              </DialogTitle>
            </DialogHeader>
            {editItem && (
              <DispositionForm
                initial={{
                  productId: editItem.productId, quantity: editItem.quantity, unit: editItem.unit,
                  dispositionType: editItem.dispositionType, dispositionDate: editItem.dispositionDate,
                  contractor: editItem.contractor ?? "", manifestNumber: editItem.manifestNumber ?? "",
                  certificateNumber: editItem.certificateNumber ?? "", cost: editItem.cost ?? "",
                  status: editItem.status, notes: editItem.notes ?? "",
                }}
                onSubmit={d => updateMutation.mutate({ id: editItem.id, data: d as Record<string, string> })}
                onCancel={() => setEditItem(null)} pending={updateMutation.isPending} isEdit={true} />
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!completeTarget} onOpenChange={o => { if (!o) setCompleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Marcar como completado?</AlertDialogTitle>
              <AlertDialogDescription>
                Se confirmará que la disposición de <strong>{productMap[completeTarget?.productId ?? ""]?.name}</strong> fue completada exitosamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => completeTarget && updateMutation.mutate({ id: completeTarget.id, data: { status: "completed" } })}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
              <AlertDialogDescription>Se eliminará este registro de disposición final. No se puede deshacer.</AlertDialogDescription>
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
