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
import { Shield, Plus, Loader2, AlertCircle, Pencil, Trash2, Package, Users, Bell } from "lucide-react";

interface EppItem {
  id: string; code: string; name: string; category: string;
  description?: string | null; standardReference?: string | null;
  replacementPeriodDays?: number | null; status: string;
}
interface Personnel { id: string; employeeId: string; name: string; position: string; department: string; }
interface EppDelivery {
  id: string; eppId: string; personnelId: string; deliveryDate: string;
  quantity: number; condition: string; returnDate?: string | null;
  returnCondition?: string | null; notes?: string | null; deliveredBy: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const EPP_CATEGORIES = [
  "Protección respiratoria", "Protección ocular", "Protección de manos",
  "Protección de pies", "Protección corporal", "Protección auditiva", "Otro",
];

type ActiveTab = "catalog" | "deliveries" | "alerts";

export default function EquiposdeProtecciónPersonalPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = user?.role && ["admin", "supervisor"].includes(user.role);
  const canDeliver = user?.role && ["admin", "supervisor", "operator"].includes(user.role);

  const [tab, setTab] = useState<ActiveTab>("catalog");
  const [showEppForm, setShowEppForm] = useState(false);
  const [editEpp, setEditEpp] = useState<EppItem | null>(null);
  const [deleteEpp, setDeleteEpp] = useState<EppItem | null>(null);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);

  const [eppForm, setEppForm] = useState({
    code: "", name: "", category: "", description: "",
    standardReference: "", replacementPeriodDays: "", status: "active",
  });
  const setE = (k: keyof typeof eppForm, v: string) => setEppForm(f => ({ ...f, [k]: v }));

  const [deliveryForm, setDeliveryForm] = useState({
    eppId: "", personnelId: "", deliveryDate: today(),
    quantity: 1, condition: "new", notes: "",
  });
  const setD = (k: keyof typeof deliveryForm, v: string | number) =>
    setDeliveryForm(f => ({ ...f, [k]: v }));

  const { data: eppItems = [], isLoading: loadingEpp, isError: errEpp } = useQuery<EppItem[]>({
    queryKey: ["/api/epp"], queryFn: () => api("/api/epp"),
  });
  const { data: deliveries = [], isLoading: loadingDel } = useQuery<EppDelivery[]>({
    queryKey: ["/api/epp/deliveries"], queryFn: () => api("/api/epp/deliveries"),
  });
  const { data: personnel = [] } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"], queryFn: () => api("/api/personnel?limit=500").then((r: any) => r.data ?? r),
  });
  const { data: eppAlerts = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/reports/epp-alerts"], queryFn: () => api("/api/reports/epp-alerts"),
  });

  const eppMap = useMemo(() => Object.fromEntries(eppItems.map(e => [e.id, e])), [eppItems]);
  const personnelMap = useMemo(() => Object.fromEntries(personnel.map(p => [p.id, p])), [personnel]);

  const createEppMutation = useMutation({
    mutationFn: (data: typeof eppForm) => api("/api/epp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        replacementPeriodDays: data.replacementPeriodDays ? parseInt(data.replacementPeriodDays) : undefined,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/epp"] });
      toast({ title: "EPP registrado", description: "El equipo fue agregado al catálogo." });
      setShowEppForm(false);
      setEppForm({ code: "", name: "", category: "", description: "", standardReference: "", replacementPeriodDays: "", status: "active" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateEppMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof eppForm }) =>
      api(`/api/epp/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          replacementPeriodDays: data.replacementPeriodDays ? parseInt(data.replacementPeriodDays) : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/epp"] });
      toast({ title: "EPP actualizado" });
      setEditEpp(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEppMutation = useMutation({
    mutationFn: (id: string) => api(`/api/epp/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/epp"] });
      toast({ title: "EPP eliminado" });
      setDeleteEpp(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteEpp(null); },
  });

  const createDeliveryMutation = useMutation({
    mutationFn: (data: typeof deliveryForm) => api("/api/epp/deliveries", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/epp/deliveries"] });
      toast({ title: "Entrega registrada", description: "El EPP fue asignado al personal." });
      setShowDeliveryForm(false);
      setDeliveryForm({ eppId: "", personnelId: "", deliveryDate: today(), quantity: 1, condition: "new", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const EppForm = ({ initial, onSubmit, onCancel, pending, isEdit }: {
    initial: typeof eppForm; onSubmit: (d: typeof eppForm) => void;
    onCancel: () => void; pending: boolean; isEdit: boolean;
  }) => {
    const [f, setF] = useState(initial);
    const s = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
    return (
      <form onSubmit={e => { e.preventDefault(); onSubmit(f); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Código *</Label>
            <Input placeholder="EPP-001" value={f.code} onChange={e => s("code", e.target.value)} required disabled={isEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={f.status} onValueChange={v => s("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nombre del EPP *</Label>
          <Input placeholder="Respirador media cara 3M 6200" value={f.name} onChange={e => s("name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Categoría *</Label>
          <Select value={f.category} onValueChange={v => s("category", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
            <SelectContent>{EPP_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <Input placeholder="Descripción del equipo" value={f.description} onChange={e => s("description", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Norma de Referencia</Label>
            <Input placeholder="ANSI Z87.1 / EN 166" value={f.standardReference} onChange={e => s("standardReference", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reemplazo (días)</Label>
            <Input type="number" min="1" placeholder="365" value={f.replacementPeriodDays} onChange={e => s("replacementPeriodDays", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={pending || !f.code || !f.name || !f.category}
            className="bg-indigo-600 hover:bg-indigo-700">
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Guardar Cambios" : "Agregar EPP"}
          </Button>
        </DialogFooter>
      </form>
    );
  };

  const activeEpp = eppItems.filter(e => e.status === "active").length;
  const pendingAlerts = eppItems.filter(e => {
    if (!e.replacementPeriodDays) return false;
    const deliveriesForEpp = deliveries.filter(d => d.eppId === e.id);
    if (deliveriesForEpp.length === 0) return false;
    const latest = deliveriesForEpp.sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))[0];
    const daysSince = Math.floor((Date.now() - new Date(latest.deliveryDate).getTime()) / 86400000);
    return daysSince > e.replacementPeriodDays;
  }).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Shield className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Equipos de Protección Personal</h1>
              <p className="text-slate-500 text-sm">Control de EPP y asignación al personal</p>
            </div>
          </div>
          <div className="flex gap-2">
            {canDeliver && tab === "deliveries" && (
              <Button onClick={() => setShowDeliveryForm(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4" /> Registrar Entrega
              </Button>
            )}
            {canManage && tab === "catalog" && (
              <Button onClick={() => setShowEppForm(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4" /> Nuevo EPP
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "EPP en Catálogo", val: eppItems.length, color: "text-slate-900" },
            { label: "Activos", val: activeEpp, color: "text-emerald-600" },
            { label: "Entregas Totales", val: deliveries.length, color: "text-indigo-600" },
            { label: "Alertas Venc.", val: pendingAlerts, color: pendingAlerts > 0 ? "text-red-600" : "text-slate-400" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        {eppAlerts.length > 0 && tab !== "alerts" && (
          <div
            className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-red-100/60 transition-colors"
            onClick={() => setTab("alerts")}
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {eppAlerts.length} equipo(s) próximos a su período de reemplazo — haga clic para ver alertas.
            </p>
          </div>
        )}

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab("catalog")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === "catalog" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Package className="w-4 h-4" /> Catálogo EPP
          </button>
          <button
            onClick={() => setTab("deliveries")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === "deliveries" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Users className="w-4 h-4" /> Entregas
          </button>
          <button
            onClick={() => setTab("alerts")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === "alerts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Bell className="w-4 h-4" /> Alertas
            {eppAlerts.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {eppAlerts.length}
              </span>
            )}
          </button>
        </div>

        {tab === "catalog" && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            {loadingEpp ? (
              <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Cargando catálogo...
              </div>
            ) : errEpp ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm text-slate-500">No se pudo cargar el catálogo</p>
              </div>
            ) : eppItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Shield className="w-10 h-10" />
                <p className="text-sm font-medium">No hay EPP en el catálogo</p>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={() => setShowEppForm(true)} className="gap-2 mt-1">
                    <Plus className="w-4 h-4" /> Agregar primer EPP
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold text-slate-600 w-24">Código</TableHead>
                      <TableHead className="font-semibold text-slate-600">Nombre</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-40">Categoría</TableHead>
                      <TableHead className="font-semibold text-slate-600">Norma</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-28 text-right">Reemplazo</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-24">Estado</TableHead>
                      {canManage && <TableHead className="font-semibold text-slate-600 text-right w-20"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eppItems.map(item => {
                      const isExpired = item.replacementPeriodDays && (() => {
                        const latest = deliveries.filter(d => d.eppId === item.id)
                          .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))[0];
                        if (!latest) return false;
                        const daysSince = Math.floor((Date.now() - new Date(latest.deliveryDate).getTime()) / 86400000);
                        return daysSince > item.replacementPeriodDays!;
                      })();
                      return (
                        <TableRow key={item.id} className={`hover:bg-slate-50/70 ${isExpired ? "bg-red-50/20" : ""}`}>
                          <TableCell>
                            <span className="font-mono text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                              {item.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                            {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                            {isExpired && <p className="text-xs text-red-500 font-medium mt-0.5">⚠ Requiere reemplazo</p>}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{item.category}</TableCell>
                          <TableCell className="text-sm text-slate-500">{item.standardReference ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm text-slate-600">
                            {item.replacementPeriodDays ? `${item.replacementPeriodDays} días` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={item.status === "active"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-100"}>
                              {item.status === "active" ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => {
                                    setEditEpp(item);
                                    setEppForm({
                                      code: item.code, name: item.name, category: item.category,
                                      description: item.description ?? "", standardReference: item.standardReference ?? "",
                                      replacementPeriodDays: item.replacementPeriodDays?.toString() ?? "", status: item.status,
                                    });
                                  }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => setDeleteEpp(item)}>
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
        )}

        {tab === "deliveries" && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            {loadingDel ? (
              <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Cargando entregas...
              </div>
            ) : deliveries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Users className="w-10 h-10" />
                <p className="text-sm font-medium">No hay entregas registradas</p>
                {canDeliver && (
                  <Button variant="outline" size="sm" onClick={() => setShowDeliveryForm(true)} className="gap-2 mt-1">
                    <Plus className="w-4 h-4" /> Registrar primera entrega
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold text-slate-600">EPP Entregado</TableHead>
                      <TableHead className="font-semibold text-slate-600">Personal</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-28">Fecha</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-20 text-center">Cant.</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-24">Condición</TableHead>
                      <TableHead className="font-semibold text-slate-600">Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map(d => {
                      const epp = eppMap[d.eppId];
                      const person = personnelMap[d.personnelId];
                      return (
                        <TableRow key={d.id} className="hover:bg-slate-50/70">
                          <TableCell>
                            <p className="font-medium text-slate-900 text-sm">{epp?.name ?? d.eppId}</p>
                            <p className="text-xs text-slate-400">{epp?.category}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-slate-900 text-sm">{person?.name ?? d.personnelId}</p>
                            <p className="text-xs text-slate-400">{person?.position}</p>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{d.deliveryDate}</TableCell>
                          <TableCell className="text-center font-mono text-sm text-slate-700">{d.quantity}</TableCell>
                          <TableCell>
                            <Badge className={
                              d.condition === "new"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs"
                                : "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs"
                            }>
                              {d.condition === "new" ? "Nuevo" : d.condition}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">{d.notes ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {tab === "alerts" && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            {eppAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Bell className="w-10 h-10" />
                <p className="text-sm font-medium">No hay alertas de reemplazo en este momento</p>
                <p className="text-xs text-slate-400">Los EPP con reposición en los próximos 30 días aparecerán aquí</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold text-slate-600">EPP</TableHead>
                      <TableHead className="font-semibold text-slate-600">Personal</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-28">Última Entrega</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-32">Próx. Reposición</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right w-24">Días Restantes</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-24">Urgencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eppAlerts.map((r, i) => {
                      const days = r.daysUntilReplacement as number;
                      const level = r.alertLevel as string;
                      return (
                        <TableRow key={i} className={level === "overdue" ? "bg-red-50/40" : level === "due" ? "bg-orange-50/30" : "bg-amber-50/20"}>
                          <TableCell>
                            <p className="font-medium text-slate-900 text-sm">{r.eppName as string}</p>
                            <p className="text-xs text-slate-400">{r.eppCode as string}</p>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700">{r.personnelName as string}</TableCell>
                          <TableCell className="text-sm text-slate-500">{r.deliveryDate as string}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-800">{r.nextReplacementDate as string}</TableCell>
                          <TableCell className={`text-right font-mono text-sm font-bold ${days < 0 ? "text-red-600" : days <= 15 ? "text-orange-600" : "text-amber-600"}`}>
                            {days < 0 ? `+${Math.abs(days)} venc.` : `${days} días`}
                          </TableCell>
                          <TableCell>
                            {level === "overdue" && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs">Vencido</Badge>}
                            {level === "due" && <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 text-xs">Urgente</Badge>}
                            {level === "soon" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs">Próximo</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <Dialog open={showEppForm} onOpenChange={setShowEppForm}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" /> Nuevo EPP
              </DialogTitle>
            </DialogHeader>
            <EppForm initial={eppForm} onSubmit={d => createEppMutation.mutate(d)}
              onCancel={() => setShowEppForm(false)} pending={createEppMutation.isPending} isEdit={false} />
          </DialogContent>
        </Dialog>

        <Dialog open={!!editEpp} onOpenChange={o => { if (!o) setEditEpp(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600" /> Editar EPP — {editEpp?.code}
              </DialogTitle>
            </DialogHeader>
            {editEpp && (
              <EppForm initial={eppForm} onSubmit={d => updateEppMutation.mutate({ id: editEpp.id, data: d })}
                onCancel={() => setEditEpp(null)} pending={updateEppMutation.isPending} isEdit={true} />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showDeliveryForm} onOpenChange={setShowDeliveryForm}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> Registrar Entrega de EPP
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createDeliveryMutation.mutate(deliveryForm); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>EPP a Entregar *</Label>
                <Select value={deliveryForm.eppId} onValueChange={v => setD("eppId", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar EPP" /></SelectTrigger>
                  <SelectContent>
                    {eppItems.filter(e => e.status === "active").map(e =>
                      <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Personal Receptor *</Label>
                <Select value={deliveryForm.personnelId} onValueChange={v => setD("personnelId", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar personal" /></SelectTrigger>
                  <SelectContent>
                    {personnel.filter(p => p.status === "active").map(p =>
                      <SelectItem key={p.id} value={p.id}>{p.name} — {p.position}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Fecha *</Label>
                  <Input type="date" value={deliveryForm.deliveryDate}
                    onChange={e => setD("deliveryDate", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Cantidad</Label>
                  <Input type="number" min="1" value={deliveryForm.quantity}
                    onChange={e => setD("quantity", parseInt(e.target.value) || 1)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Condición</Label>
                  <Select value={deliveryForm.condition} onValueChange={v => setD("condition", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nuevo</SelectItem>
                      <SelectItem value="good">Buen estado</SelectItem>
                      <SelectItem value="worn">Desgastado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Input placeholder="Observaciones de la entrega" value={deliveryForm.notes}
                  onChange={e => setD("notes", e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowDeliveryForm(false)}>Cancelar</Button>
                <Button type="submit"
                  disabled={createDeliveryMutation.isPending || !deliveryForm.eppId || !deliveryForm.personnelId}
                  className="bg-indigo-600 hover:bg-indigo-700">
                  {createDeliveryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Registrar Entrega
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteEpp} onOpenChange={o => { if (!o) setDeleteEpp(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar EPP?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará <strong>{deleteEpp?.name}</strong> del catálogo. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteEpp && deleteEppMutation.mutate(deleteEpp.id)}>
                {deleteEppMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
