import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Warehouse, Plus, Pencil, Trash2, Loader2, AlertCircle, Eye, TrendingUp, TrendingDown, Minus, CheckCircle2, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CuadreRecord {
  id: string;
  warehouse: string;
  cuadreDate: string;
  responsible: string;
  notes?: string | null;
  status: string;
  registeredBy: string;
  createdAt: string;
}

interface CuadreItem {
  id: string;
  cuadreId: string;
  code: string;
  productDescription: string;
  unit: string;
  systemBalance: string;
  physicalCount: string;
  difference: string;
  notes?: string | null;
}

interface BalanceRecord {
  warehouse: string;
  code: string;
  product_description: string;
  unit: string;
  quantity: string;
}

const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.FC<{ className?: string }> }> = {
  pending: { label: "Pendiente", className: "bg-yellow-100 text-yellow-700", icon: Clock },
  completed: { label: "Completado", className: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  approved: { label: "Aprobado", className: "bg-green-100 text-green-700", icon: CheckCircle2 },
};

function DiffIcon({ diff }: { diff: number }) {
  if (Math.abs(diff) < 0.01) return <Minus className="w-3.5 h-3.5 text-green-600" />;
  if (diff > 0) return <TrendingUp className="w-3.5 h-3.5 text-blue-600" />;
  return <TrendingDown className="w-3.5 h-3.5 text-red-600" />;
}

function CuadreForm({ initial, onSubmit, onCancel, isLoading, isEdit, latestBalances }: {
  initial: { warehouse: string; cuadreDate: string; responsible: string; notes: string; status: string };
  onSubmit: (data: {
    warehouse: string; cuadreDate: string; responsible: string; notes: string; status: string;
    items: { code: string; productDescription: string; unit: string; systemBalance: string; physicalCount: string; notes: string }[];
  }) => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
  latestBalances: BalanceRecord[];
}) {
  const [form, setForm] = useState(initial);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const relevantBalances = latestBalances.filter(b =>
    form.warehouse === "all" || b.warehouse === form.warehouse
  );

  const [items, setItems] = useState(relevantBalances.map(b => ({
    code: b.code,
    productDescription: b.product_description,
    unit: b.unit,
    systemBalance: b.quantity,
    physicalCount: b.quantity,
    notes: "",
  })));

  const setItem = (idx: number, k: string, v: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item));
  };

  const handleWarehouseChange = (w: string) => {
    set("warehouse", w);
    const rel = latestBalances.filter(b => w === "all" || b.warehouse === w);
    setItems(rel.map(b => ({
      code: b.code,
      productDescription: b.product_description,
      unit: b.unit,
      systemBalance: b.quantity,
      physicalCount: b.quantity,
      notes: "",
    })));
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Almacén *</Label>
          <Select value={form.warehouse} onValueChange={handleWarehouseChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fecha de Cuadre *</Label>
          <Input type="date" value={form.cuadreDate} onChange={e => set("cuadreDate", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Responsable del Cuadre *</Label>
          <Input value={form.responsible} onChange={e => set("responsible", e.target.value)} placeholder="Nombre del responsable" />
        </div>
        <div>
          <Label>Estado</Label>
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="completed">Completado</SelectItem>
              <SelectItem value="approved">Aprobado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Notas</Label>
        <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Observaciones del cuadre..." rows={2} />
      </div>

      {items.length > 0 && (
        <div>
          <Label className="mb-2 block">Detalle del Cuadre ({items.length} productos)</Label>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 text-xs">
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>UM</TableHead>
                  <TableHead className="text-right">Saldo Sist.</TableHead>
                  <TableHead className="text-right">Conteo Físico</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const diff = (parseFloat(item.physicalCount) || 0) - (parseFloat(item.systemBalance) || 0);
                  return (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="font-mono">{item.code}</TableCell>
                      <TableCell className="max-w-32 truncate">{item.productDescription}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right text-slate-500">{parseFloat(item.systemBalance).toLocaleString("es")}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.001"
                          className="h-7 w-24 text-right text-xs"
                          value={item.physicalCount}
                          onChange={e => setItem(idx, "physicalCount", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-medium ${diff > 0 ? "text-blue-600" : diff < 0 ? "text-red-600" : "text-green-600"}`}>
                          {diff > 0 ? "+" : ""}{diff.toLocaleString("es", { maximumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>Cancelar</Button>
        <Button
          onClick={() => onSubmit({ ...form, items })}
          disabled={isLoading || !form.responsible || !form.cuadreDate || !form.warehouse}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : "Crear Cuadre"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function CuadreDetailModal({ cuadreId, open, onClose }: { cuadreId: string | null; open: boolean; onClose: () => void }) {
  const { data } = useQuery<CuadreRecord & { items: CuadreItem[] }>({
    queryKey: ["cuadre-detail", cuadreId],
    queryFn: () => apiJson(`${BASE}/api/cuadre/${cuadreId}`),
    enabled: !!cuadreId && open,
  });

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalle del Cuadre</DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 bg-slate-50 rounded-lg p-4">
              <div><p className="text-xs text-slate-500">Almacén</p><p className="font-semibold">{data.warehouse}</p></div>
              <div><p className="text-xs text-slate-500">Fecha</p><p className="font-semibold">{data.cuadreDate}</p></div>
              <div><p className="text-xs text-slate-500">Responsable</p><p className="font-semibold">{data.responsible}</p></div>
            </div>
            {data.notes && <p className="text-sm text-slate-600 italic">{data.notes}</p>}
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 text-xs">
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>UM</TableHead>
                    <TableHead className="text-right">Saldo Sist.</TableHead>
                    <TableHead className="text-right">Conteo Físico</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.items ?? []).map(item => {
                    const diff = parseFloat(item.difference) || 0;
                    return (
                      <TableRow key={item.id} className="text-xs">
                        <TableCell className="font-mono">{item.code}</TableCell>
                        <TableCell>{item.productDescription}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className="text-right">{parseFloat(item.systemBalance).toLocaleString("es")}</TableCell>
                        <TableCell className="text-right">{parseFloat(item.physicalCount).toLocaleString("es")}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium flex items-center justify-end gap-1 ${diff > 0 ? "text-blue-600" : diff < 0 ? "text-red-600" : "text-green-600"}`}>
                            <DiffIcon diff={diff} />
                            {diff > 0 ? "+" : ""}{diff.toLocaleString("es", { maximumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(data.items ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4 text-slate-400 text-xs">Sin ítems de detalle</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CuadrePage() {
  const { warehouse } = useWarehouse();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<CuadreRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CuadreRecord | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const warehouseParam = warehouse === "all" ? "" : `?warehouse=${warehouse}`;

  const { data: records = [], isLoading, error } = useQuery<CuadreRecord[]>({
    queryKey: ["cuadre", warehouse],
    queryFn: () => apiJson(`${BASE}/api/cuadre${warehouseParam}`),
  });

  const { data: latestBalances = [] } = useQuery<BalanceRecord[]>({
    queryKey: ["balances-latest", warehouse],
    queryFn: () => apiJson(`${BASE}/api/balances/latest${warehouseParam}`),
  });

  type CuadreFormData = {
    warehouse: string; cuadreDate: string; responsible: string; notes: string; status: string;
    items: { code: string; productDescription: string; unit: string; systemBalance: string; physicalCount: string; notes: string }[];
  };

  const createMutation = useMutation({
    mutationFn: (data: CuadreFormData) => apiJson(`${BASE}/api/cuadre`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuadre"] });
      setShowForm(false);
      toast({ title: "Cuadre creado correctamente" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CuadreFormData> }) =>
      apiJson(`${BASE}/api/cuadre/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuadre"] });
      setEditRecord(null);
      toast({ title: "Cuadre actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`${BASE}/api/cuadre/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuadre"] });
      setDeleteTarget(null);
      toast({ title: "Cuadre eliminado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const defaultWarehouse = warehouse === "all" ? "QA" : warehouse;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Warehouse className="w-6 h-6 text-violet-600" /> Cuadre
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Módulo administrativo — revisión y reconciliación de inventario
              {warehouse !== "all" && <span className="ml-1 font-semibold text-violet-600">· {warehouse}</span>}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Nuevo Cuadre
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span>Error al cargar los cuadres</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Almacén</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="w-28">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                        <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay cuadres registrados</p>
                        <p className="text-xs mt-1">Crea un nuevo cuadre para comenzar</p>
                      </TableCell>
                    </TableRow>
                  ) : records.map(r => {
                    const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
                    const BadgeIcon = badge.icon;
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50">
                        <TableCell>
                          <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">{r.warehouse}</span>
                        </TableCell>
                        <TableCell className="font-medium">{r.cuadreDate}</TableCell>
                        <TableCell>{r.responsible}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                            <BadgeIcon className="w-3 h-3" /> {badge.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm max-w-48 truncate">{r.notes || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => setViewId(r.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditRecord(r)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(r)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={open => !open && setShowForm(false)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Nuevo Cuadre</DialogTitle></DialogHeader>
          <CuadreForm
            initial={{ warehouse: defaultWarehouse, cuadreDate: today(), responsible: "", notes: "", status: "pending" }}
            onSubmit={data => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
            isLoading={createMutation.isPending}
            isEdit={false}
            latestBalances={latestBalances}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRecord} onOpenChange={open => !open && setEditRecord(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Editar Cuadre</DialogTitle></DialogHeader>
          {editRecord && (
            <CuadreForm
              initial={{
                warehouse: editRecord.warehouse,
                cuadreDate: editRecord.cuadreDate,
                responsible: editRecord.responsible,
                notes: editRecord.notes ?? "",
                status: editRecord.status,
              }}
              onSubmit={data => updateMutation.mutate({ id: editRecord.id, data })}
              onCancel={() => setEditRecord(null)}
              isLoading={updateMutation.isPending}
              isEdit={true}
              latestBalances={latestBalances}
            />
          )}
        </DialogContent>
      </Dialog>

      <CuadreDetailModal cuadreId={viewId} open={!!viewId} onClose={() => setViewId(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuadre?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el cuadre del <strong>{deleteTarget?.cuadreDate}</strong> en {deleteTarget?.warehouse}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
