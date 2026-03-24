import { useState, useMemo, useRef } from "react";
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
import {
  FileText, Plus, Loader2, AlertCircle, Pencil, Trash2, Download,
  Search, Upload, File, FileSpreadsheet, Image,
} from "lucide-react";

interface Document {
  id: string; title: string; documentType: string; category?: string | null;
  description?: string | null; fileName?: string | null; fileSize?: string | null;
  version?: string | null; issueDate?: string | null; expirationDate?: string | null;
  responsibleParty?: string | null; status: string; notes?: string | null;
  uploadedBy: string; createdAt: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const DOC_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Vigente", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  archived: { label: "Archivado", className: "bg-slate-100 text-slate-500 border-slate-200" },
  expired: { label: "Vencido", className: "bg-red-100 text-red-700 border-red-200" },
};

const DOC_TYPES = [
  "Hoja de Seguridad (SDS/MSDS)", "Ficha Técnica", "Certificado de Análisis",
  "Certificado de Calidad", "Permiso / Licencia", "Procedimiento Operativo",
  "Manual de Uso", "Informe de Auditoría", "Registro de Capacitación", "Otro",
];

const CATEGORIES = [
  "Seguridad", "Calidad", "Medio Ambiente", "Operaciones", "Legal", "RRHH",
];

function fileIcon(name?: string | null) {
  if (!name) return <File className="w-4 h-4" />;
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (["xls", "xlsx", "csv"].includes(ext ?? "")) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  if (["png", "jpg", "jpeg"].includes(ext ?? "")) return <Image className="w-4 h-4 text-blue-400" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

function formatFileSize(bytes: string | null | undefined): string {
  if (!bytes) return "";
  const n = parseInt(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadDocument(id: string, fileName?: string | null) {
  const headers = getAuthHeaders() as Record<string, string>;
  fetch(`/api/documents/${id}/download`, { headers })
    .then(async res => {
      if (!res.ok) throw new Error("No se pudo descargar el archivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName ?? "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })
    .catch(() => alert("No se pudo descargar el archivo"));
}

const emptyForm = () => ({
  title: "", documentType: "", category: "", description: "",
  version: "", issueDate: "", expirationDate: "", responsibleParty: "",
  status: "active", notes: "",
});

export default function DocumentosdeSeguridadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "quality"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const [form, setForm] = useState(emptyForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: docs = [], isLoading, isError } = useQuery<Document[]>({
    queryKey: ["/api/documents"], queryFn: () => api("/api/documents"),
  });

  const allTypes = useMemo(() => [...new Set(docs.map(d => d.documentType))].sort(), [docs]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return docs.filter(d => {
      const matchSearch = !term || [d.title, d.documentType, d.category, d.description, d.responsibleParty, d.fileName]
        .some(v => v?.toLowerCase().includes(term));
      const matchStatus = filterStatus === "all" || d.status === filterStatus;
      const matchType = filterType === "all" || d.documentType === filterType;
      return matchSearch && matchStatus && matchType;
    });
  }, [docs, search, filterStatus, filterType]);

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Documento guardado", description: "El documento fue registrado exitosamente." });
      setShowForm(false);
      setForm(emptyForm());
      setSelectedFile(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> }) =>
      api(`/api/documents/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Documento actualizado" });
      setEditDoc(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Documento eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    if (selectedFile) fd.append("file", selectedFile);
    createMutation.mutate(fd);
  };

  const expiringSoon = docs.filter(d => {
    if (!d.expirationDate || d.status !== "active") return false;
    const days = Math.ceil((new Date(d.expirationDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Documentos de Seguridad</h1>
              <p className="text-slate-500 text-sm">Gestión de SDS, fichas técnicas y certificados</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Nuevo Documento
            </Button>
          )}
        </div>

        {expiringSoon.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Documentos próximos a vencer</p>
              <p className="text-sm text-amber-700 mt-0.5">
                {expiringSoon.map(d => `${d.title} (${d.expirationDate})`).join(", ")}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {Object.entries(DOC_STATUS).map(([k, v]) => (
            <div key={k} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{v.label}</p>
              <p className="text-2xl font-bold text-slate-900">{docs.filter(d => d.status === k).length}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar documentos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(DOC_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {allTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando documentos...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-slate-500">No se pudo cargar la lista</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <FileText className="w-10 h-10" />
              <p className="text-sm font-medium">No hay documentos registrados</p>
              {canWrite && !search && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Agregar primer documento
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600">Título</TableHead>
                    <TableHead className="font-semibold text-slate-600">Tipo</TableHead>
                    <TableHead className="font-semibold text-slate-600">Categoría</TableHead>
                    <TableHead className="font-semibold text-slate-600">Archivo</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Vencimiento</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Versión</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Estado</TableHead>
                    <TableHead className="w-28 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => {
                    const cfg = DOC_STATUS[d.status] ?? DOC_STATUS.active;
                    const expiring = d.expirationDate && d.status === "active" &&
                      Math.ceil((new Date(d.expirationDate).getTime() - Date.now()) / 86400000) <= 30;
                    return (
                      <TableRow key={d.id} className={`hover:bg-slate-50/70 ${expiring ? "bg-amber-50/30" : ""}`}>
                        <TableCell>
                          <p className="font-medium text-slate-900 text-sm">{d.title}</p>
                          {d.description && <p className="text-xs text-slate-400 truncate max-w-52">{d.description}</p>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{d.documentType}</TableCell>
                        <TableCell className="text-xs text-slate-500">{d.category ?? "—"}</TableCell>
                        <TableCell>
                          {d.fileName ? (
                            <div className="flex items-center gap-1.5">
                              {fileIcon(d.fileName)}
                              <div>
                                <p className="text-xs text-slate-700 truncate max-w-32">{d.fileName}</p>
                                {d.fileSize && <p className="text-xs text-slate-400">{formatFileSize(d.fileSize)}</p>}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">Sin archivo</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-xs ${expiring ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                          {d.expirationDate ?? "—"}
                          {expiring && <span className="block text-amber-500">⚠ Próximo</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{d.version ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={`${cfg.className} hover:${cfg.className} text-xs`}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {d.fileName && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => downloadDocument(d.id, d.fileName)} title="Descargar">
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canWrite && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                onClick={() => {
                                  setEditDoc(d);
                                  setForm({
                                    title: d.title, documentType: d.documentType, category: d.category ?? "",
                                    description: d.description ?? "", version: d.version ?? "",
                                    issueDate: d.issueDate ?? "", expirationDate: d.expirationDate ?? "",
                                    responsibleParty: d.responsibleParty ?? "", status: d.status, notes: d.notes ?? "",
                                  });
                                }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(d)}>
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

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" /> Nuevo Documento
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input placeholder="Hoja de Seguridad — Ácido Sulfúrico" value={form.title}
                  onChange={e => set("title", e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de Documento *</Label>
                  <Select value={form.documentType} onValueChange={v => set("documentType", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                    <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Select value={form.category} onValueChange={v => set("category", v)}>
                    <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input placeholder="Breve descripción del documento" value={form.description}
                  onChange={e => set("description", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Versión</Label>
                  <Input placeholder="v2.1" value={form.version} onChange={e => set("version", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha Emisión</Label>
                  <Input type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vencimiento</Label>
                  <Input type="date" value={form.expirationDate} onChange={e => set("expirationDate", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Responsable</Label>
                <Input placeholder="Nombre del responsable" value={form.responsibleParty}
                  onChange={e => set("responsibleParty", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Archivo adjunto</Label>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      {fileIcon(selectedFile.name)}
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-700">{selectedFile.name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(String(selectedFile.size))}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Click para seleccionar archivo</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, PNG, JPG, TXT — máx. 8 MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                  className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setSelectedFile(null); }}>
                  Cancelar
                </Button>
                <Button type="submit"
                  disabled={createMutation.isPending || !form.title || !form.documentType}
                  className="bg-blue-600 hover:bg-blue-700">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Documento
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editDoc} onOpenChange={o => { if (!o) setEditDoc(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" /> Editar Documento
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); editDoc && updateMutation.mutate({ id: editDoc.id, data: form }); }}
              className="space-y-4">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={form.title} onChange={e => set("title", e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select value={form.documentType} onValueChange={v => set("documentType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={form.status} onValueChange={v => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOC_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={v => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input value={form.description} onChange={e => set("description", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Versión</Label>
                  <Input placeholder="v2.1" value={form.version} onChange={e => set("version", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Emisión</Label>
                  <Input type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vencimiento</Label>
                  <Input type="date" value={form.expirationDate} onChange={e => set("expirationDate", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Responsable</Label>
                <Input value={form.responsibleParty} onChange={e => set("responsibleParty", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Input placeholder="Observaciones" value={form.notes} onChange={e => set("notes", e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDoc(null)}>Cancelar</Button>
                <Button type="submit"
                  disabled={updateMutation.isPending || !form.title || !form.documentType}
                  className="bg-blue-600 hover:bg-blue-700">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará <strong>{deleteTarget?.title}</strong> y su archivo adjunto. No se puede deshacer.
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
