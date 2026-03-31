import { useState, useMemo, useRef, useCallback } from "react";
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
import { SamplePhotoPanel } from "@/components/ui/SamplePhotoPanel";
import { TestTube, Plus, Loader2, AlertCircle, Pencil, Trash2, Search, Camera, X, Image as ImageIcon, RefreshCw } from "lucide-react";

interface Sample {
  id: string; productId?: string | null; productName?: string | null;
  supplier?: string | null; sampleCode: string; quantity: string; unit: string;
  sampleDate: string; purpose: string; destination?: string | null;
  labReference?: string | null; status: string; result?: string | null;
  notes?: string | null; takenBy: string; photos?: string[] | null;
}

interface PendingPhoto {
  id: string;
  file: File;
  preview: string;
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
const DESTINATIONS = ["LABORATORIO", "ESTAMPADO", "TINTORERIA"];

const emptyForm = () => ({
  productName: "", supplier: "", sampleCode: "", quantity: "", unit: "mL",
  sampleDate: today(), purpose: "", destination: "", labReference: "",
  status: "pending", result: "", notes: "",
});

function PhotoPickerInline({
  pendingPhotos,
  onChange,
}: {
  pendingPhotos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const slots = 5 - pendingPhotos.length;
    if (slots <= 0) return;
    const toAdd = arr.slice(0, slots).map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
    }));
    onChange([...pendingPhotos, ...toAdd]);
  }, [pendingPhotos, onChange]);

  const remove = (id: string) => {
    const removed = pendingPhotos.find(p => p.id === id);
    if (removed) URL.revokeObjectURL(removed.preview);
    onChange(pendingPhotos.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700">
          Fotos de la muestra
          <span className="text-slate-400 font-normal ml-1">(opcional · máx. 5)</span>
        </Label>
        {pendingPhotos.length > 0 && (
          <span className="text-xs text-purple-600 font-medium">
            {pendingPhotos.length} foto{pendingPhotos.length !== 1 ? "s" : ""} lista{pendingPhotos.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {pendingPhotos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {pendingPhotos.map(p => (
            <div key={p.id} className="relative group aspect-square">
              <img src={p.preview} alt="preview" className="w-full h-full object-cover rounded-lg border border-slate-200" />
              <button
                type="button"
                className="absolute top-0.5 right-0.5 bg-white/90 rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                onClick={() => remove(p.id)}
              >
                <X className="w-3 h-3 text-slate-500 hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingPhotos.length < 5 && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 gap-2 border-dashed border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400 flex-col py-2"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="w-4 h-4" />
            <span className="text-xs">Tomar foto</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 gap-2 border-dashed border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-400 flex-col py-2"
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon className="w-4 h-4" />
            <span className="text-xs">Galería</span>
          </Button>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

function generateCode(name: string): string {
  const clean = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const prefix = words.length === 0
    ? "MU"
    : words.length === 1
      ? words[0].slice(0, 4).padEnd(2, "X")
      : words.slice(0, 3).map(w => w[0]).join("").padEnd(2, words[0][1] ?? "X");
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${prefix.slice(0, 4)}-${digits}`;
}

function SampleForm({
  initial, onSubmit, onCancel, pending, isEdit,
  pendingPhotos, onPhotosChange,
}: {
  initial: ReturnType<typeof emptyForm>;
  onSubmit: (d: ReturnType<typeof emptyForm>) => void;
  onCancel: () => void;
  pending: boolean;
  isEdit: boolean;
  pendingPhotos?: PendingPhoto[];
  onPhotosChange?: (photos: PendingPhoto[]) => void;
}) {
  const [f, setF] = useState(initial);
  const [codeAutoGen, setCodeAutoGen] = useState(!isEdit);
  const s = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const handleNameChange = (name: string) => {
    setF(p => ({
      ...p,
      productName: name,
      sampleCode: codeAutoGen && name.trim().length > 0 ? generateCode(name) : p.sampleCode,
    }));
  };

  const handleCodeChange = (code: string) => {
    setCodeAutoGen(false);
    s("sampleCode", code);
  };

  const regenerateCode = () => {
    if (!f.productName.trim()) return;
    setCodeAutoGen(true);
    s("sampleCode", generateCode(f.productName));
  };

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(f); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Nombre del Producto / Muestra *</Label>
          <Input
            placeholder="Ej: Ácido Cítrico — ingrese el nombre libremente"
            value={f.productName}
            onChange={e => handleNameChange(e.target.value)}
            required
          />
          <p className="text-xs text-slate-400">Puede ser un producto nuevo que aún no está en el inventario</p>
        </div>
        <div className="space-y-1.5">
          <Label>Proveedor</Label>
          <Input
            placeholder="Ej: QuimPeru SAC"
            value={f.supplier}
            onChange={e => s("supplier", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Código de Muestra</Label>
            {!isEdit && (
              <button
                type="button"
                onClick={regenerateCode}
                className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 transition-colors"
                title="Generar nuevo código"
              >
                <RefreshCw className="w-3 h-3" /> Regenerar
              </button>
            )}
          </div>
          <Input
            placeholder="Auto-generado al escribir el nombre"
            value={f.sampleCode}
            onChange={e => handleCodeChange(e.target.value)}
            required
            disabled={isEdit}
            className={codeAutoGen && !isEdit ? "bg-purple-50 border-purple-200 text-purple-800 font-mono" : "font-mono"}
          />
          {!isEdit && codeAutoGen && (
            <p className="text-xs text-purple-500">Generado automáticamente · puedes editarlo si quieres</p>
          )}
        </div>
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
          <Input type="date" value={f.sampleDate} onChange={e => s("sampleDate", e.target.value)} required />
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
          <Label>Destino</Label>
          <Select value={f.destination || "__none__"} onValueChange={v => s("destination", v === "__none__" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sin destino —</SelectItem>
              {DESTINATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
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

      {!isEdit && pendingPhotos !== undefined && onPhotosChange && (
        <div className="border-t border-slate-100 pt-4">
          <PhotoPickerInline pendingPhotos={pendingPhotos} onChange={onPhotosChange} />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit"
          disabled={pending || !f.productName || !f.sampleCode || !f.quantity || !f.purpose}
          className="bg-purple-600 hover:bg-purple-700">
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : pendingPhotos && pendingPhotos.length > 0 ? `Registrar y subir ${pendingPhotos.length} foto${pendingPhotos.length !== 1 ? "s" : ""}` : "Registrar Muestra"}
        </Button>
      </DialogFooter>
    </form>
  );
}

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
  const [photoTarget, setPhotoTarget] = useState<Sample | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const { data: samples = [], isLoading, isError } = useQuery<Sample[]>({
    queryKey: ["/api/samples"], queryFn: () => api("/api/samples?limit=500").then((r: any) => r.data ?? r),
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return samples.filter(s => {
      const matchSearch = !term || [s.sampleCode, s.purpose, s.productName, s.supplier, s.destination]
        .some(v => v?.toLowerCase().includes(term));
      const matchStatus = filterStatus === "all" || s.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [samples, search, filterStatus]);

  const uploadPhotos = async (sampleId: string, files: PendingPhoto[]) => {
    if (files.length === 0) return;
    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      files.forEach(p => formData.append("photos", p.file));
      const res = await fetch(`/api/samples/${sampleId}/photos`, {
        method: "POST",
        headers: getAuthHeaders() as Record<string, string>,
        body: formData,
      });
      const body = await res.json();
      const uploaded = body.uploaded ?? 0;
      const errCount = (body.errors ?? []).length;
      if (errCount > 0) {
        toast({ title: `${uploaded} foto(s) subida(s), ${errCount} con error`, variant: "destructive" });
      } else {
        toast({ title: `Muestra registrada con ${uploaded} foto${uploaded !== 1 ? "s" : ""} guardada${uploaded !== 1 ? "s" : ""} en Drive` });
      }
      files.forEach(p => URL.revokeObjectURL(p.preview));
      qc.invalidateQueries({ queryKey: ["/api/samples"] });
    } catch {
      toast({ title: "Muestra guardada, pero hubo un error al subir las fotos", variant: "destructive" });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, photos }: { data: ReturnType<typeof emptyForm>; photos: PendingPhoto[] }) => {
      const record = await api("/api/samples", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (photos.length > 0) {
        await uploadPhotos(record.id ?? record.sample?.id ?? record.data?.id, photos);
      } else {
        toast({ title: "Muestra registrada", description: "La muestra fue guardada exitosamente." });
        qc.invalidateQueries({ queryKey: ["/api/samples"] });
        qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      }
      return record;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/samples"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      setPendingPhotos([]);
      setShowForm(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ReturnType<typeof emptyForm>> }) =>
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

  const isSaving = createMutation.isPending || uploadingPhotos;

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
            <Button onClick={() => { setPendingPhotos([]); setShowForm(true); }} className="gap-2 bg-purple-600 hover:bg-purple-700">
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
            <Input placeholder="Buscar por código, producto, proveedor..." value={search}
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
                <Button variant="outline" size="sm" onClick={() => { setPendingPhotos([]); setShowForm(true); }} className="gap-2 mt-1">
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
                    <TableHead className="font-semibold text-slate-600">Producto / Muestra</TableHead>
                    <TableHead className="font-semibold text-slate-600">Proveedor</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right w-24">Cantidad</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-600">Propósito</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Destino</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-36">Estado</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => {
                    const cfg = SAMPLE_STATUS[s.status] ?? SAMPLE_STATUS.pending;
                    return (
                      <TableRow key={s.id} className="hover:bg-slate-50/70">
                        <TableCell>
                          <span className="font-mono text-xs font-semibold bg-purple-50 text-purple-700 px-2 py-1 rounded">
                            {s.sampleCode}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900 text-sm">{s.productName ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{s.supplier ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-700">{s.quantity} {s.unit}</TableCell>
                        <TableCell className="text-sm text-slate-600">{s.sampleDate}</TableCell>
                        <TableCell className="text-sm text-slate-600">{s.purpose}</TableCell>
                        <TableCell>
                          {s.destination ? (
                            <Badge className="text-[10px] bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50">
                              {s.destination}
                            </Badge>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <div>
                            <Badge className={`${cfg.className} hover:${cfg.className} text-xs`}>{cfg.label}</Badge>
                            {s.result && <p className="text-xs text-slate-400 mt-1">{s.result}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-purple-600 hover:bg-purple-50 relative"
                              onClick={() => setPhotoTarget(s)} title="Ver / agregar fotos">
                              <Camera className="w-3.5 h-3.5" />
                              {s.photos && s.photos.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-600 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                                  {s.photos.length}
                                </span>
                              )}
                            </Button>
                            {canUpdate && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => setEditSample(s)}>
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Nueva Muestra (con foto integrada) ──────────────────────── */}
        <Dialog open={showForm} onOpenChange={o => { if (!o && !isSaving) { setPendingPhotos([]); setShowForm(false); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5 text-purple-600" /> Nueva Muestra
              </DialogTitle>
            </DialogHeader>
            <SampleForm
              initial={emptyForm()}
              onSubmit={d => createMutation.mutate({ data: d, photos: pendingPhotos })}
              onCancel={() => { if (!isSaving) { setPendingPhotos([]); setShowForm(false); } }}
              pending={isSaving}
              isEdit={false}
              pendingPhotos={pendingPhotos}
              onPhotosChange={setPendingPhotos}
            />
          </DialogContent>
        </Dialog>

        {/* ── Editar muestra ──────────────────────────────────────────── */}
        <Dialog open={!!editSample} onOpenChange={o => { if (!o) setEditSample(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-purple-600" /> Editar Muestra — {editSample?.sampleCode}
              </DialogTitle>
            </DialogHeader>
            {editSample && (
              <SampleForm
                initial={{
                  productName: editSample.productName ?? "", supplier: editSample.supplier ?? "",
                  sampleCode: editSample.sampleCode, quantity: editSample.quantity, unit: editSample.unit,
                  sampleDate: editSample.sampleDate, purpose: editSample.purpose,
                  destination: editSample.destination ?? "", labReference: editSample.labReference ?? "",
                  status: editSample.status, result: editSample.result ?? "", notes: editSample.notes ?? "",
                }}
                onSubmit={d => updateMutation.mutate({ id: editSample.id, data: d })}
                onCancel={() => setEditSample(null)}
                pending={updateMutation.isPending}
                isEdit={true}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* ── Eliminar ────────────────────────────────────────────────── */}
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

        {/* ── Panel de fotos (para muestras ya existentes) ────────────── */}
        <Dialog open={!!photoTarget} onOpenChange={o => { if (!o) setPhotoTarget(null); }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-purple-600" />
                Fotos — {photoTarget?.sampleCode}
              </DialogTitle>
              <p className="text-xs text-slate-500 pt-1">
                Las fotos se suben automáticamente a Google Drive y los enlaces quedan registrados en el sistema.
              </p>
            </DialogHeader>
            {photoTarget && (
              <SamplePhotoPanel
                sampleId={photoTarget.id}
                sampleCode={photoTarget.sampleCode}
                photos={photoTarget.photos ?? []}
                canUpload={!!canWrite}
                canDelete={!!canUpdate}
                queryKey={["/api/samples"]}
                onUpdate={newPhotos => setPhotoTarget(prev => prev ? { ...prev, photos: newPhotos } : null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
