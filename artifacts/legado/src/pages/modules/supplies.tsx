import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PackageSearch, Plus, Pencil, Trash2, Loader2, Download, Upload,
  AlertCircle, CheckCircle2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Supply { id: string; code: string; description: string; unit: string; status: string; }
interface ImportResult { inserted: number; updated: number; skipped: number; errors: string[]; }

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const emptyForm = { code: "", description: "", unit: "", status: "active" as "active" | "inactive" };
type FormState = typeof emptyForm;
type FormErrors = Partial<Record<keyof FormState, string>>;

function SupplyForm({
  initial, onSubmit, isPending,
}: { initial: FormState; onSubmit: (f: FormState) => void; isPending: boolean; }) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FormErrors>({});

  const setField = (k: keyof FormState, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    if (v.trim()) setErrors(e => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.code.trim()) errs.code = "El código es requerido";
    if (!form.description.trim()) errs.description = "La descripción es requerida";
    if (!form.unit.trim()) errs.unit = "La UM es requerida";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Código <span className="text-red-500">*</span></Label>
          <Input placeholder="ESC-001" value={form.code} onChange={e => setField("code", e.target.value.toUpperCase())}
            className={`font-mono ${errors.code ? "border-red-400" : ""}`} />
          {errors.code && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.code}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Unidad de Medida <span className="text-red-500">*</span></Label>
          <Input placeholder="UND, KG, PQT…" value={form.unit} onChange={e => setField("unit", e.target.value)}
            className={errors.unit ? "border-red-400" : ""} />
          {errors.unit && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.unit}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Descripción <span className="text-red-500">*</span></Label>
        <Input placeholder="Escoba de plástico, Lejía 1L…" value={form.description}
          onChange={e => setField("description", e.target.value)}
          className={errors.description ? "border-red-400" : ""} />
        {errors.description && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.description}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Estado</Label>
        <select value={form.status} onChange={e => setField("status", e.target.value)}
          className="w-full h-10 border border-slate-200 rounded-md px-3 text-sm bg-white">
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>
      <DialogFooter>
        <Button onClick={() => { if (validate()) onSubmit(form); }} disabled={isPending} className="gap-2">
          {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : "Guardar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function SuppliesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supply | null>(null);
  const [deleting, setDeleting] = useState<Supply | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const { data: supplies = [], isLoading } = useQuery<Supply[]>({
    queryKey: ["/api/supplies"],
    queryFn: () => api("/api/supplies"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return supplies.filter(s =>
      s.code.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.unit.toLowerCase().includes(q)
    );
  }, [supplies, search]);

  const refetch = () => qc.invalidateQueries({ queryKey: ["/api/supplies"] });

  const createMutation = useMutation({
    mutationFn: (f: typeof emptyForm) => api("/api/supplies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }),
    onSuccess: () => { toast({ title: "Suministro creado" }); setShowForm(false); refetch(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (f: typeof emptyForm) => api(`/api/supplies/${editing!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }),
    onSuccess: () => { toast({ title: "Suministro actualizado" }); setEditing(null); refetch(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/api/supplies/${deleting!.id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Suministro eliminado" }); setDeleting(null); refetch(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await fetch(`${BASE}/api/supplies/import`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
      }).then(r => r.json());
      setImportResult(result);
      refetch();
    } catch {
      toast({ title: "Error al importar", variant: "destructive" });
    }
  };

  const handleTemplate = () => {
    window.location.href = `${BASE}/api/supplies/template`;
  };

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
              <PackageSearch className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Maestro de Suministros</h1>
              <p className="text-slate-500 text-sm">Catálogo de insumos recurrentes del área</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleTemplate} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Plantilla
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5 text-xs">
              <Upload className="w-3.5 h-3.5" /> Importar
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Nuevo
            </Button>
          </div>
        </div>

        {/* Import result */}
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-green-800">Importación completada</p>
              <p className="text-green-700">
                {importResult.inserted} creados · {importResult.updated} actualizados · {importResult.skipped} omitidos
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {importResult.errors.map((e, i) => (
                    <li key={i} className="text-amber-700 text-xs">{e}</li>
                  ))}
                </ul>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="ml-auto text-green-500 hover:text-green-700 text-lg leading-none">×</button>
          </div>
        )}

        {/* Search */}
        <Input
          placeholder="Buscar por código, descripción o UM…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide w-32">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Descripción</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide w-24">UM</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide w-24">Estado</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">
                    {search ? "Sin resultados para tu búsqueda" : "No hay suministros registrados"}
                  </td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded">{s.code}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{s.description}</td>
                    <td className="px-4 py-3 text-slate-500">{s.unit}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {s.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={() => setEditing(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500"
                          onClick={() => setDeleting(s)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
              {filtered.length} de {supplies.length} suministros
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Suministro</DialogTitle></DialogHeader>
          <SupplyForm initial={emptyForm} onSubmit={f => createMutation.mutate(f)} isPending={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Suministro</DialogTitle></DialogHeader>
          {editing && (
            <SupplyForm
              initial={{ code: editing.code, description: editing.description, unit: editing.unit, status: editing.status as "active" | "inactive" }}
              onSubmit={f => updateMutation.mutate(f)}
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar suministro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleting?.description}</strong> del catálogo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-red-600 hover:bg-red-700">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
