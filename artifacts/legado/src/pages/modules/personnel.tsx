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
import { Users, Plus, Loader2, AlertCircle, Pencil, Trash2, Search, UserCheck, UserX } from "lucide-react";

interface Personnel {
  id: string; name: string; position: string; department: string;
  employeeCode?: string | null; email?: string | null; phone?: string | null;
  status: string; notes?: string | null; createdAt: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const DEPARTMENTS = [
  "Almacén Químico", "Producción", "Calidad", "Seguridad y Salud", "Mantenimiento",
  "Logística", "Administración", "Medio Ambiente",
];

const POSITIONS = [
  "Operario de Almacén", "Técnico de Laboratorio", "Supervisor de Almacén",
  "Jefe de Calidad", "Técnico de Seguridad", "Auxiliar Administrativo", "Otro",
];

const emptyForm = () => ({
  name: "", position: "", department: "", employeeCode: "",
  email: "", phone: "", status: "active", notes: "",
});

export default function PersonalPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Personnel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personnel | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");

  const [form, setForm] = useState(emptyForm());
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: personnel = [], isLoading, isError } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"], queryFn: () => api("/api/personnel"),
  });

  const depts = useMemo(() => [...new Set(personnel.map(p => p.department))].sort(), [personnel]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return personnel.filter(p => {
      const matchSearch = !term || [p.name, p.position, p.department, p.employeeCode, p.email]
        .some(v => v?.toLowerCase().includes(term));
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      const matchDept = filterDept === "all" || p.department === filterDept;
      return matchSearch && matchStatus && matchDept;
    });
  }, [personnel, search, filterStatus, filterDept]);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api("/api/personnel", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/personnel"] });
      toast({ title: "Personal registrado", description: "El trabajador fue agregado exitosamente." });
      setShowForm(false);
      setForm(emptyForm());
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> }) =>
      api(`/api/personnel/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/personnel"] });
      toast({ title: "Datos actualizados" });
      setEditItem(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/personnel/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/personnel"] });
      toast({ title: "Trabajador eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const activeCount = personnel.filter(p => p.status === "active").length;

  const PersonForm = ({ isEdit, onSubmit }: { isEdit: boolean; onSubmit: () => void }) => (
    <form onSubmit={e => { e.preventDefault(); onSubmit(); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Nombre completo *</Label>
          <Input placeholder="Ej: Juan Carlos López" value={form.name} onChange={e => set("name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Código de Empleado</Label>
          <Input placeholder="EMP-001" value={form.employeeCode} onChange={e => set("employeeCode", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Cargo / Puesto *</Label>
        <Select value={form.position} onValueChange={v => set("position", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar cargo" /></SelectTrigger>
          <SelectContent>
            {POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {form.position === "Otro" && (
          <Input className="mt-2" placeholder="Especifique el cargo" value={form.position}
            onChange={e => set("position", e.target.value)} />
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Área / Departamento *</Label>
        <Select value={form.department} onValueChange={v => set("department", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar área" /></SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" placeholder="juan@empresa.com" value={form.email} onChange={e => set("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input placeholder="999 888 777" value={form.phone} onChange={e => set("phone", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Input placeholder="Observaciones adicionales" value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>
          Cancelar
        </Button>
        <Button type="submit"
          disabled={(createMutation.isPending || updateMutation.isPending) || !form.name || !form.position || !form.department}
          className="bg-violet-600 hover:bg-violet-700">
          {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : "Registrar Personal"}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Personal</h1>
              <p className="text-slate-500 text-sm">Gestión de trabajadores del almacén</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
              className="gap-2 bg-violet-600 hover:bg-violet-700">
              <Plus className="w-4 h-4" /> Nuevo Trabajador
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Personal", val: personnel.length, color: "text-slate-900" },
            { label: "Activos", val: activeCount, color: "text-emerald-600" },
            { label: "Inactivos", val: personnel.length - activeCount, color: "text-slate-400" },
            { label: "Áreas", val: new Set(personnel.map(p => p.department)).size, color: "text-violet-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar por nombre, cargo o código..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las áreas</SelectItem>
              {depts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando personal...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-slate-500">No se pudo cargar la lista</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Users className="w-10 h-10" />
              <p className="text-sm font-medium">No hay personal registrado</p>
              {canWrite && !search && (
                <Button variant="outline" size="sm"
                  onClick={() => { setForm(emptyForm()); setShowForm(true); }}
                  className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Agregar primer trabajador
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600">Trabajador</TableHead>
                    <TableHead className="font-semibold text-slate-600">Cargo</TableHead>
                    <TableHead className="font-semibold text-slate-600">Área</TableHead>
                    <TableHead className="font-semibold text-slate-600">Contacto</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Estado</TableHead>
                    {canWrite && <TableHead className="w-20 text-right"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="hover:bg-slate-50/70">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-violet-600">
                              {p.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{p.name}</p>
                            {p.employeeCode && <p className="text-xs text-slate-400 font-mono">{p.employeeCode}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{p.position}</TableCell>
                      <TableCell className="text-sm text-slate-600">{p.department}</TableCell>
                      <TableCell>
                        {p.email && <p className="text-xs text-slate-600">{p.email}</p>}
                        {p.phone && <p className="text-xs text-slate-400">{p.phone}</p>}
                        {!p.email && !p.phone && <span className="text-xs text-slate-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={p.status === "active"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs"
                          : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-100 text-xs"}>
                          {p.status === "active" ? (
                            <><UserCheck className="w-3 h-3 mr-1" />Activo</>
                          ) : (
                            <><UserX className="w-3 h-3 mr-1" />Inactivo</>
                          )}
                        </Badge>
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => {
                                setEditItem(p);
                                setForm({
                                  name: p.name, position: p.position, department: p.department,
                                  employeeCode: p.employeeCode ?? "", email: p.email ?? "",
                                  phone: p.phone ?? "", status: p.status, notes: p.notes ?? "",
                                });
                              }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setDeleteTarget(p)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Dialog open={showForm} onOpenChange={o => { if (!o) { setShowForm(false); setForm(emptyForm()); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-600" /> Nuevo Trabajador
              </DialogTitle>
            </DialogHeader>
            <PersonForm isEdit={false} onSubmit={() => createMutation.mutate(form)} />
          </DialogContent>
        </Dialog>

        <Dialog open={!!editItem} onOpenChange={o => { if (!o) setEditItem(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-violet-600" /> Editar — {editItem?.name}
              </DialogTitle>
            </DialogHeader>
            <PersonForm isEdit={true}
              onSubmit={() => editItem && updateMutation.mutate({ id: editItem.id, data: form })} />
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar trabajador?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el registro de <strong>{deleteTarget?.name}</strong>. No se puede deshacer.
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
