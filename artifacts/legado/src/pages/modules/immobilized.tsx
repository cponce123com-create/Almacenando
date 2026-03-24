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
import { Lock, Plus, Loader2, AlertCircle, Unlock, Trash2 } from "lucide-react";

interface Product { id: string; code: string; name: string; unit: string; }
interface ImmobilizedRecord {
  id: string; productId: string; quantity: string; reason: string;
  immobilizedDate: string; status: string; notes?: string | null;
  releasedAt?: string | null; registeredBy: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  immobilized: { label: "Inmovilizado", className: "bg-red-100 text-red-700 border-red-200" },
  released: { label: "Liberado", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  disposed: { label: "Dispuesto", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const REASONS = [
  "Calidad no conforme", "Vencimiento próximo", "Contaminación sospechada",
  "Investigación en curso", "Daño en envase", "Cuarentena preventiva", "Otro",
];

export default function ProductosInmovilizadosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canManage = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<ImmobilizedRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImmobilizedRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const [form, setForm] = useState({
    productId: "", quantity: "", reason: "", immobilizedDate: today(), status: "immobilized", notes: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], queryFn: () => api("/api/products"),
  });
  const { data: records = [], isLoading, isError } = useQuery<ImmobilizedRecord[]>({
    queryKey: ["/api/immobilized"], queryFn: () => api("/api/immobilized"),
  });

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const filtered = useMemo(() =>
    filterStatus === "all" ? records : records.filter(r => r.status === filterStatus), [records, filterStatus]);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api("/api/immobilized", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/immobilized"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Producto inmovilizado", description: "El registro fue guardado exitosamente." });
      setShowForm(false);
      setForm({ productId: "", quantity: "", reason: "", immobilizedDate: today(), status: "immobilized", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const releaseMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/immobilized/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/immobilized"] });
      toast({ title: "Estado actualizado", description: "El producto fue liberado." });
      setReleaseTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setReleaseTarget(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/immobilized/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/immobilized"] });
      toast({ title: "Registro eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const countByStatus = (s: string) => records.filter(r => r.status === s).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
              <Lock className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Productos Inmovilizados</h1>
              <p className="text-slate-500 text-sm">Control de productos bloqueados para uso normal</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-orange-600 hover:bg-orange-700">
              <Plus className="w-4 h-4" /> Inmovilizar Producto
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Registros", val: records.length, color: "text-slate-900" },
            { label: "Inmovilizados", val: countByStatus("immobilized"), color: "text-red-600" },
            { label: "Liberados", val: countByStatus("released"), color: "text-emerald-600" },
            { label: "Dispuestos", val: countByStatus("disposed"), color: "text-slate-500" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="immobilized">Inmovilizados</SelectItem>
              <SelectItem value="released">Liberados</SelectItem>
              <SelectItem value="disposed">Dispuestos</SelectItem>
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
              <Lock className="w-10 h-10" />
              <p className="text-sm font-medium">No hay productos inmovilizados</p>
              {canWrite && filterStatus === "all" && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Registrar inmovilización
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right w-28">Cantidad</TableHead>
                    <TableHead className="font-semibold text-slate-600">Motivo</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-32">Estado</TableHead>
                    <TableHead className="font-semibold text-slate-600">Notas</TableHead>
                    {canManage && <TableHead className="font-semibold text-slate-600 text-right w-24">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const product = productMap[r.productId];
                    const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.immobilized;
                    return (
                      <TableRow key={r.id} className={`hover:bg-slate-50/70 ${r.status === "immobilized" ? "bg-red-50/30" : ""}`}>
                        <TableCell>
                          <p className="font-medium text-slate-900 text-sm">{product?.name ?? r.productId}</p>
                          <p className="text-xs text-slate-400">{product?.code}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-slate-700">
                          {r.quantity} <span className="text-slate-400 font-normal text-xs">{product?.unit}</span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-48">{r.reason}</TableCell>
                        <TableCell className="text-sm text-slate-600">{r.immobilizedDate}</TableCell>
                        <TableCell>
                          <Badge className={`${cfg.className} hover:${cfg.className} text-xs`}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-40 truncate">{r.notes ?? "—"}</TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.status === "immobilized" && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                  onClick={() => setReleaseTarget(r)} title="Liberar">
                                  <Unlock className="w-3.5 h-3.5" />
                                </Button>
                              )}
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-orange-600" /> Registrar Inmovilización
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Producto *</Label>
                <Select value={form.productId} onValueChange={v => set("productId", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cantidad *</Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="0.00"
                    value={form.quantity} onChange={e => set("quantity", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha *</Label>
                  <Input type="date" value={form.immobilizedDate}
                    onChange={e => set("immobilizedDate", e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Motivo *</Label>
                <Select value={form.reason} onValueChange={v => set("reason", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notas adicionales</Label>
                <Input placeholder="Descripción detallada del problema"
                  value={form.notes} onChange={e => set("notes", e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit"
                  disabled={createMutation.isPending || !form.productId || !form.reason || !form.quantity}
                  className="bg-orange-600 hover:bg-orange-700">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Registrar Inmovilización
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!releaseTarget} onOpenChange={o => { if (!o) setReleaseTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Liberar producto?</AlertDialogTitle>
              <AlertDialogDescription>
                Se liberará <strong>{productMap[releaseTarget?.productId ?? ""]?.name}</strong> para uso normal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => releaseTarget && releaseMutation.mutate({ id: releaseTarget.id, status: "released" })}>
                {releaseMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Liberar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
              <AlertDialogDescription>Se eliminará este registro de inmovilización. No se puede deshacer.</AlertDialogDescription>
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
