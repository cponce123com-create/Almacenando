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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Recycle, Plus, Loader2, AlertCircle, Pencil, Trash2, CheckCircle2, ChevronsUpDown, Check, Camera } from "lucide-react";
import { SamplePhotoPanel } from "@/components/ui/SamplePhotoPanel";
import { PhotoPickerInline, type PendingPhoto } from "@/components/ui/PhotoPickerInline";

interface Product { id: string; code: string; name: string; unit: string; }
interface Disposition {
  id: string; productId?: string | null; productNameManual?: string | null;
  quantity: string; unit: string; dispositionType: string; dispositionDate: string;
  contractor?: string | null; manifestNumber?: string | null; certificateNumber?: string | null;
  cost?: string | null; status: string; notes?: string | null; photos?: string[] | null;
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
  productId: "", productNameManual: "", quantity: "", unit: "kg", dispositionType: "",
  dispositionDate: today(), contractor: "", manifestNumber: "",
  certificateNumber: "", cost: "", status: "pending", notes: "",
});

function ProductCombobox({
  products, productId, productNameManual, onProductId, onManual,
}: {
  products: Product[]; productId: string; productNameManual: string;
  onProductId: (v: string) => void; onManual: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return products.slice(0, 40);
    return products.filter(p =>
      p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [products, query]);

  const selected = products.find(p => p.id === productId);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open}
            className="w-full justify-between font-normal h-9 text-sm">
            {selected ? (
              <span className="truncate">{selected.code} — {selected.name}</span>
            ) : (
              <span className="text-slate-400">Buscar en catálogo de productos...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por código o nombre..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No se encontraron productos</CommandEmpty>
              <CommandGroup>
                {filtered.map(p => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => {
                    onProductId(p.id); onManual(""); setOpen(false); setQuery("");
                  }}>
                    <Check className={`mr-2 h-4 w-4 ${productId === p.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="font-mono text-xs text-slate-500 mr-2">{p.code}</span>
                    <span className="truncate">{p.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">o ingrese manualmente</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <Input
        placeholder="Nombre manual del producto (si no está en catálogo)"
        value={productNameManual}
        onChange={e => { onManual(e.target.value); if (e.target.value) onProductId(""); }}
      />
      {!productId && !productNameManual && (
        <p className="text-xs text-red-500">Seleccione un producto del catálogo o ingrese uno manualmente</p>
      )}
    </div>
  );
}

function DispositionForm({
  initial, products, onSubmit, onCancel, pending, isEdit,
  pendingPhotos, onPhotosChange,
}: {
  initial: ReturnType<typeof emptyForm>;
  products: Product[];
  onSubmit: (d: ReturnType<typeof emptyForm>) => void;
  onCancel: () => void;
  pending: boolean;
  isEdit: boolean;
  pendingPhotos?: PendingPhoto[];
  onPhotosChange?: (photos: PendingPhoto[]) => void;
}) {
  const [f, setF] = useState(initial);
  const s = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
  const hasProduct = !!f.productId || !!f.productNameManual;

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(f); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Producto *</Label>
        <ProductCombobox
          products={products}
          productId={f.productId}
          productNameManual={f.productNameManual}
          onProductId={v => s("productId", v)}
          onManual={v => s("productNameManual", v)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad *</Label>
          <Input type="number" step="0.01" min="0.01" placeholder="0.00"
            value={f.quantity} onChange={e => s("quantity", e.target.value)} required />
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

      {!isEdit && pendingPhotos !== undefined && onPhotosChange && (
        <PhotoPickerInline
          pendingPhotos={pendingPhotos}
          onChange={onPhotosChange}
          label="Fotos de la disposición"
        />
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit"
          disabled={pending || !hasProduct || !f.quantity || !f.dispositionType}
          className="bg-teal-600 hover:bg-teal-700">
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : "Registrar Disposición"}
        </Button>
      </DialogFooter>
    </form>
  );
}

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
  const [photoTarget, setPhotoTarget] = useState<Disposition | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"], queryFn: () => api("/api/products?limit=500").then((r: any) => r.data ?? r),
  });
  const { data: records = [], isLoading, isError } = useQuery<Disposition[]>({
    queryKey: ["/api/disposition"], queryFn: () => api("/api/disposition"),
  });

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const filtered = useMemo(() =>
    filterStatus === "all" ? records : records.filter(r => r.status === filterStatus), [records, filterStatus]);

  const displayName = (r: Disposition) =>
    r.productId ? (productMap[r.productId]?.name ?? r.productId) : (r.productNameManual ?? "—");

  const createMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof emptyForm>) => {
      const created = await api("/api/disposition", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (pendingPhotos.length > 0) {
        const fd = new FormData();
        pendingPhotos.forEach(p => fd.append("photos", p.file));
        await fetch(`/api/disposition/${created.id}/photos`, {
          method: "POST",
          headers: getAuthHeaders() as Record<string, string>,
          body: fd,
        }).catch(() => {});
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/disposition"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Disposición registrada", description: "El proceso fue registrado exitosamente." });
      setShowForm(false);
      setPendingPhotos([]);
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
                    <TableHead className="w-28 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const cfg = DISP_STATUS[r.status] ?? DISP_STATUS.pending;
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell>
                          <p className="font-medium text-slate-900 text-sm">{displayName(r)}</p>
                          {r.productId && productMap[r.productId] && (
                            <p className="text-xs text-slate-400">{productMap[r.productId]?.code}</p>
                          )}
                          {!r.productId && r.productNameManual && (
                            <p className="text-xs text-amber-500">Ingreso manual</p>
                          )}
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
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-teal-600 hover:bg-teal-50 relative"
                              onClick={() => setPhotoTarget(r)} title="Ver / agregar fotos">
                              <Camera className="w-3.5 h-3.5" />
                              {r.photos && r.photos.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-teal-600 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                                  {r.photos.length}
                                </span>
                              )}
                            </Button>
                            {canManage && (
                              <>
                                {r.status !== "completed" && r.status !== "cancelled" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => setCompleteTarget(r)} title="Marcar como completado">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => setEditItem(r)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => setDeleteTarget(r)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
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

        <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setPendingPhotos([]); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Recycle className="w-5 h-5 text-teal-600" /> Nueva Disposición Final
              </DialogTitle>
            </DialogHeader>
            <DispositionForm initial={emptyForm()} products={products}
              onSubmit={d => createMutation.mutate(d)}
              onCancel={() => { setShowForm(false); setPendingPhotos([]); }}
              pending={createMutation.isPending} isEdit={false}
              pendingPhotos={pendingPhotos}
              onPhotosChange={setPendingPhotos}
            />
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
                products={products}
                initial={{
                  productId: editItem.productId ?? "",
                  productNameManual: editItem.productNameManual ?? "",
                  quantity: editItem.quantity, unit: editItem.unit,
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
                Se confirmará que la disposición fue completada exitosamente.
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

        <Dialog open={!!photoTarget} onOpenChange={o => { if (!o) setPhotoTarget(null); }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-teal-600" />
                Fotos — {photoTarget ? displayName(photoTarget) : ""}
              </DialogTitle>
              <p className="text-xs text-slate-500 pt-1">
                Las fotos se suben automáticamente a Google Drive y los enlaces quedan registrados en el sistema.
              </p>
            </DialogHeader>
            {photoTarget && (
              <SamplePhotoPanel
                sampleId={photoTarget.id}
                sampleCode={displayName(photoTarget)}
                photos={photoTarget.photos ?? []}
                canUpload={!!canWrite}
                canDelete={!!canManage}
                queryKey={["/api/disposition"]}
                uploadUrl={`/api/disposition/${photoTarget.id}/photos`}
                deleteUrl={(idx) => `/api/disposition/${photoTarget.id}/photos/${idx}`}
                onUpdate={newPhotos => setPhotoTarget(prev => prev ? { ...prev, photos: newPhotos } : null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
