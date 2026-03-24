import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, Plus, Search, History, Shuffle, BarChart2,
  Pencil, Trash2, CheckCircle, XCircle, AlertCircle, Eye,
  Download, ChevronsUpDown, Check, X, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders() {
  const token = sessionStorage.getItem("almacen_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Error ${res.status}`);
  }
  return res.json();
}

type LotEvaluation = {
  id: string;
  colorantName: string;
  usageLot: string;
  newLot: string;
  approvalDate: string | null;
  comments: string | null;
  interpretedStatus: string;
  active: string;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
};

type CompatibilityResult = {
  found: boolean;
  result: string;
  message: string;
  record?: LotEvaluation;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  CONFORME: { label: "Conforme", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  "CONFORME NO MEZCLAR": { label: "Conforme — No Mezclar", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  "NO CONFORME": { label: "No Conforme", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> },
  "FALTA ETIQUETAR": { label: "Falta Etiquetar", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  OBSERVACION: { label: "Observación", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: <Eye className="w-3.5 h-3.5" /> },
  REVISAR: { label: "Revisar", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", icon: <Search className="w-3.5 h-3.5" /> },
};

function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "lg" }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["REVISAR"];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-medium rounded-full border",
      cfg.bg, cfg.text, cfg.border,
      size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
    )}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

const STATUSES = Object.keys(STATUS_CONFIG);

const defaultForm = {
  colorantName: "", usageLot: "", newLot: "",
  approvalDate: "", comments: "", interpretedStatus: "auto",
};

type Tab = "list" | "history" | "compatibility" | "report";

function ColorantCombobox({ value, onChange, colorants }: { value: string; onChange: (v: string) => void; colorants: string[] }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal h-9 text-sm">
          {value || <span className="text-slate-400">Escribir o seleccionar colorante...</span>}
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[340px]" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar colorante..."
            value={inputVal}
            onValueChange={setInputVal}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-3 text-center">
                <p className="text-sm text-slate-500 mb-2">No encontrado</p>
                <Button size="sm" variant="outline" onClick={() => { onChange(inputVal); setOpen(false); }}>
                  Usar "{inputVal}"
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {colorants.filter(c => c.toLowerCase().includes(inputVal.toLowerCase())).map((c) => (
                <CommandItem key={c} value={c} onSelect={() => { onChange(c); setInputVal(c); setOpen(false); }}>
                  <Check className={cn("w-4 h-4 mr-2", value === c ? "opacity-100" : "opacity-0")} />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function LotEvaluationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("list");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<LotEvaluation | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [pending, setPending] = useState(false);
  const [historyColorant, setHistoryColorant] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [compatForm, setCompatForm] = useState({ colorant: "", usageLot: "", newLot: "" });
  const [compatResult, setCompatResult] = useState<CompatibilityResult | null>(null);
  const [compatLoading, setCompatLoading] = useState(false);
  const [reportColorant, setReportColorant] = useState("all");
  const [reportStatus, setReportStatus] = useState("all");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  const { data: records = [], isLoading } = useQuery<LotEvaluation[]>({
    queryKey: ["/api/lot-evaluations"],
    queryFn: () => api("/api/lot-evaluations"),
  });

  const { data: colorants = [] } = useQuery<string[]>({
    queryKey: ["/api/lot-evaluations/colorants"],
    queryFn: () => api("/api/lot-evaluations/colorants"),
  });

  const { data: historyRecords = [] } = useQuery<LotEvaluation[]>({
    queryKey: ["/api/lot-evaluations/history", historyColorant],
    queryFn: () => api(`/api/lot-evaluations/history/${encodeURIComponent(historyColorant)}`),
    enabled: historyColorant.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/lot-evaluations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lot-evaluations"] });
      qc.invalidateQueries({ queryKey: ["/api/lot-evaluations/colorants"] });
      toast({ title: "Evaluación desactivada correctamente" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function s(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function openCreate() {
    setEditRecord(null);
    setForm(defaultForm);
    setShowForm(true);
  }

  function openEdit(r: LotEvaluation) {
    setEditRecord(r);
    setForm({
      colorantName: r.colorantName,
      usageLot: r.usageLot,
      newLot: r.newLot,
      approvalDate: r.approvalDate ?? "",
      comments: r.comments ?? "",
      interpretedStatus: r.interpretedStatus,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.colorantName || !form.usageLot || !form.newLot) {
      toast({ variant: "destructive", title: "Campos requeridos", description: "Colorante, lote de uso y lote nuevo son obligatorios" });
      return;
    }
    setPending(true);
    try {
      if (editRecord) {
        await api(`/api/lot-evaluations/${editRecord.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast({ title: "Evaluación actualizada" });
      } else {
        await api("/api/lot-evaluations", { method: "POST", body: JSON.stringify(form) });
        toast({ title: "Evaluación registrada correctamente" });
      }
      qc.invalidateQueries({ queryKey: ["/api/lot-evaluations"] });
      qc.invalidateQueries({ queryKey: ["/api/lot-evaluations/colorants"] });
      setShowForm(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  async function handleCompatCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!compatForm.colorant || !compatForm.newLot) {
      toast({ variant: "destructive", title: "Campos requeridos", description: "Colorante y lote nuevo son obligatorios" });
      return;
    }
    setCompatLoading(true);
    setCompatResult(null);
    try {
      const params = new URLSearchParams({ colorant: compatForm.colorant, newLot: compatForm.newLot });
      if (compatForm.usageLot) params.set("usageLot", compatForm.usageLot);
      const result = await api(`/api/lot-evaluations/compatibility?${params}`);
      setCompatResult(result as CompatibilityResult);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: (err as Error).message });
    } finally {
      setCompatLoading(false);
    }
  }

  function exportCSV(data: LotEvaluation[]) {
    const headers = ["Colorante", "Lote Uso", "Lote Nuevo", "Fecha V°B°", "Estado", "Comentarios", "Registrado"];
    const rows = data.map(r => [
      r.colorantName, r.usageLot, r.newLot,
      r.approvalDate ?? "", r.interpretedStatus,
      (r.comments ?? "").replace(/,/g, ";"),
      new Date(r.createdAt).toLocaleDateString("es-PE"),
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "control-lotes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const filteredList = useMemo(() => {
    const term = search.toLowerCase();
    return records.filter(r => {
      if (r.active === "false") return false;
      const matchSearch = !term || [r.colorantName, r.usageLot, r.newLot, r.comments ?? ""]
        .some(v => v.toLowerCase().includes(term));
      const matchStatus = filterStatus === "all" || r.interpretedStatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [records, search, filterStatus]);

  const filteredReport = useMemo(() => {
    return records.filter(r => {
      if (r.active === "false") return false;
      const matchColorant = reportColorant === "all" || r.colorantName.toLowerCase().includes(reportColorant.toLowerCase());
      const matchStatus = reportStatus === "all" || r.interpretedStatus === reportStatus;
      const date = r.approvalDate ?? r.createdAt.substring(0, 10);
      const matchFrom = !reportFrom || date >= reportFrom;
      const matchTo = !reportTo || date <= reportTo;
      return matchColorant && matchStatus && matchFrom && matchTo;
    });
  }, [records, reportColorant, reportStatus, reportFrom, reportTo]);

  const uniqueColorants = useMemo(() => [...new Set(records.filter(r => r.active !== "false").map(r => r.colorantName))].sort(), [records]);

  const tabItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "list", label: "Evaluaciones", icon: <FlaskConical className="w-4 h-4" /> },
    { id: "history", label: "Historial", icon: <History className="w-4 h-4" /> },
    { id: "compatibility", label: "Compatibilidad", icon: <Shuffle className="w-4 h-4" /> },
    { id: "report", label: "Reportes", icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Control de Lotes</h1>
              <p className="text-slate-500 text-sm">Evaluaciones de laboratorio y compatibilidad de lotes</p>
            </div>
          </div>
          {tab === "list" && (
            <Button onClick={openCreate} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Registrar Evaluación
            </Button>
          )}
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
          {tabItems.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === "list" && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por colorante, lote uso, lote nuevo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-7 h-7 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                </div>
              ) : filteredList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <FlaskConical className="w-10 h-10" />
                  <p className="text-sm font-medium">No se encontraron evaluaciones</p>
                  <Button variant="outline" size="sm" onClick={openCreate} className="mt-2 gap-2">
                    <Plus className="w-4 h-4" /> Registrar primera evaluación
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold text-slate-600">Colorante</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-28">Lote Uso</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-28">Lote Nuevo</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-28">Fecha V°B°</TableHead>
                        <TableHead className="font-semibold text-slate-600">Estado</TableHead>
                        <TableHead className="font-semibold text-slate-600">Comentarios</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-24 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredList.map(r => (
                        <TableRow key={r.id} className="hover:bg-slate-50/60">
                          <TableCell>
                            <button
                              className="font-medium text-violet-700 hover:underline text-left text-sm"
                              onClick={() => { setHistoryColorant(r.colorantName); setTab("history"); }}
                            >
                              {r.colorantName}
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600 font-semibold">{r.usageLot}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-600 font-semibold">{r.newLot}</TableCell>
                          <TableCell className="text-sm text-slate-500">{r.approvalDate ?? "—"}</TableCell>
                          <TableCell><StatusBadge status={r.interpretedStatus} /></TableCell>
                          <TableCell>
                            <p className="text-xs text-slate-500 max-w-[200px] truncate" title={r.comments ?? ""}>
                              {r.comments || "—"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                                <Pencil className="w-3.5 h-3.5 text-slate-400" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => {
                                  if (confirm(`¿Desactivar evaluación de "${r.colorantName}"?`)) {
                                    deleteMutation.mutate(r.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
                    {filteredList.length} registro{filteredList.length !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "history" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <div className="flex-1">
                <Label className="text-xs text-slate-500 mb-1 block">Seleccionar colorante</Label>
                <ColorantCombobox value={historyColorant} onChange={setHistoryColorant} colorants={colorants} />
              </div>
              {historyColorant && (
                <div className="flex-1">
                  <Label className="text-xs text-slate-500 mb-1 block">Buscar dentro del historial</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Filtrar por lote o comentario..."
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              )}
            </div>

            {!historyColorant ? (
              <div className="bg-white rounded-xl border border-slate-100 flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <History className="w-10 h-10" />
                <p className="text-sm font-medium">Selecciona un colorante para ver su historial</p>
                <p className="text-xs">También puedes hacer clic en un colorante desde la tabla de Evaluaciones</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-violet-50/50">
                  <h3 className="font-semibold text-violet-800 text-sm">
                    Historial: <span className="font-bold">{historyColorant}</span>
                  </h3>
                  <p className="text-xs text-violet-600 mt-0.5">{historyRecords.length} evaluaciones registradas</p>
                </div>
                {historyRecords.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">No hay evaluaciones para este colorante</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {historyRecords
                      .filter(r => {
                        const term = historySearch.toLowerCase();
                        return !term || [r.usageLot, r.newLot, r.comments ?? ""].some(v => v.toLowerCase().includes(term));
                      })
                      .map((r, i) => (
                        <div key={r.id} className="px-5 py-4 hover:bg-slate-50/60">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2 text-xs text-slate-400 w-16 shrink-0">
                              <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-bold text-xs">
                                {i + 1}
                              </span>
                            </div>
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <p className="text-xs text-slate-400 mb-0.5">Lote Uso</p>
                                <p className="font-mono font-semibold text-sm text-slate-800">{r.usageLot}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                                <div>
                                  <p className="text-xs text-slate-400 mb-0.5">Lote Nuevo</p>
                                  <p className="font-mono font-semibold text-sm text-slate-800">{r.newLot}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 mb-0.5">Fecha V°B°</p>
                                <p className="text-sm text-slate-700">{r.approvalDate ?? "—"}</p>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <StatusBadge status={r.interpretedStatus} />
                            </div>
                          </div>
                          {r.comments && (
                            <div className="mt-2 ml-8 pl-2 border-l-2 border-slate-200">
                              <p className="text-xs text-slate-500 italic">"{r.comments}"</p>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "compatibility" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Consulta de Compatibilidad</h3>
                <p className="text-xs text-slate-500">Verifica si un lote nuevo puede usarse en reemplazo del lote anterior</p>
              </div>
              <form onSubmit={handleCompatCheck} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Colorante <span className="text-red-500">*</span></Label>
                  <ColorantCombobox
                    value={compatForm.colorant}
                    onChange={v => setCompatForm(f => ({ ...f, colorant: v }))}
                    colorants={colorants}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Lote Anterior (en uso)</Label>
                  <Input
                    placeholder="Ej: 2024-001"
                    value={compatForm.usageLot}
                    onChange={e => setCompatForm(f => ({ ...f, usageLot: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Lote Nuevo que desea usar <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Ej: 2024-002"
                    value={compatForm.newLot}
                    onChange={e => setCompatForm(f => ({ ...f, newLot: e.target.value }))}
                  />
                </div>
                <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2" disabled={compatLoading}>
                  {compatLoading ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Shuffle className="w-4 h-4" />
                  )}
                  Verificar Compatibilidad
                </Button>
              </form>
            </div>

            <div>
              {!compatResult ? (
                <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed flex flex-col items-center justify-center h-full min-h-[280px] gap-3 text-slate-400">
                  <Shuffle className="w-10 h-10" />
                  <p className="text-sm font-medium">Completa el formulario para consultar</p>
                  <p className="text-xs text-center max-w-[220px]">El resultado aparecerá aquí después de la consulta</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {!compatResult.found ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-3">
                        <Search className="w-6 h-6 text-slate-500" />
                      </div>
                      <h4 className="font-semibold text-slate-700 mb-1">Sin evaluación registrada</h4>
                      <p className="text-sm text-slate-500">{compatResult.message}</p>
                      <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={openCreate}>
                        <Plus className="w-4 h-4" /> Registrar evaluación
                      </Button>
                    </div>
                  ) : (
                    <div className={cn(
                      "rounded-xl border p-6",
                      compatResult.result === "CONFORME" ? "bg-emerald-50 border-emerald-200" :
                        compatResult.result === "CONFORME_NO_MEZCLAR" ? "bg-amber-50 border-amber-200" :
                          compatResult.result === "NO_CONFORME" ? "bg-red-50 border-red-200" :
                            "bg-slate-50 border-slate-200"
                    )}>
                      <div className="flex items-center gap-3 mb-3">
                        {compatResult.result === "CONFORME" && <CheckCircle className="w-8 h-8 text-emerald-600" />}
                        {compatResult.result === "CONFORME_NO_MEZCLAR" && <AlertCircle className="w-8 h-8 text-amber-600" />}
                        {compatResult.result === "NO_CONFORME" && <XCircle className="w-8 h-8 text-red-600" />}
                        {!["CONFORME", "CONFORME_NO_MEZCLAR", "NO_CONFORME"].includes(compatResult.result) && <Search className="w-8 h-8 text-slate-500" />}
                        <div>
                          <StatusBadge status={compatResult.record?.interpretedStatus ?? "REVISAR"} size="lg" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-800 mb-4">{compatResult.message}</p>
                      {compatResult.record && (
                        <div className="bg-white/60 rounded-lg p-3 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="text-slate-400">Colorante:</span> <span className="font-medium">{compatResult.record.colorantName}</span></div>
                            <div><span className="text-slate-400">Fecha V°B°:</span> <span className="font-medium">{compatResult.record.approvalDate ?? "—"}</span></div>
                            <div><span className="text-slate-400">Lote Uso:</span> <span className="font-mono font-semibold">{compatResult.record.usageLot}</span></div>
                            <div><span className="text-slate-400">Lote Nuevo:</span> <span className="font-mono font-semibold">{compatResult.record.newLot}</span></div>
                          </div>
                          {compatResult.record.comments && (
                            <div className="pt-1 border-t border-slate-200/80">
                              <span className="text-slate-400">Comentarios laboratorio: </span>
                              <span className="italic">"{compatResult.record.comments}"</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setCompatResult(null)}>
                    <X className="w-3.5 h-3.5" /> Nueva consulta
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "report" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">Filtros de Reporte</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Colorante</Label>
                  <Select value={reportColorant} onValueChange={setReportColorant}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueColorants.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Estado</Label>
                  <Select value={reportStatus} onValueChange={setReportStatus}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Fecha Desde</Label>
                  <Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Fecha Hasta</Label>
                  <Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {STATUSES.map(s => {
                const count = filteredReport.filter(r => r.interpretedStatus === s).length;
                const cfg = STATUS_CONFIG[s];
                return (
                  <div key={s} className={cn("rounded-xl border p-3 text-center", cfg.bg, cfg.border)}>
                    <p className={cn("text-2xl font-bold", cfg.text)}>{count}</p>
                    <p className={cn("text-xs mt-0.5 font-medium", cfg.text)}>{cfg.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-700">
                  {filteredReport.length} resultado{filteredReport.length !== 1 ? "s" : ""}
                </p>
                <Button
                  size="sm" variant="outline"
                  className="gap-2 text-xs"
                  onClick={() => exportCSV(filteredReport)}
                  disabled={filteredReport.length === 0}
                >
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </Button>
              </div>
              {filteredReport.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No hay registros con los filtros seleccionados
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold text-slate-600">Colorante</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-28">Lote Uso</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-28">Lote Nuevo</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-28">Fecha V°B°</TableHead>
                        <TableHead className="font-semibold text-slate-600">Estado</TableHead>
                        <TableHead className="font-semibold text-slate-600">Comentarios</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReport.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium text-sm text-slate-800">{r.colorantName}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-600">{r.usageLot}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-600">{r.newLot}</TableCell>
                          <TableCell className="text-sm text-slate-500">{r.approvalDate ?? "—"}</TableCell>
                          <TableCell><StatusBadge status={r.interpretedStatus} /></TableCell>
                          <TableCell className="text-xs text-slate-500 max-w-[180px] truncate">{r.comments ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRecord ? "Editar Evaluación" : "Registrar Evaluación de Lote"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Colorante / Tintura <span className="text-red-500">*</span></Label>
              <ColorantCombobox
                value={form.colorantName}
                onChange={v => s("colorantName", v)}
                colorants={colorants}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lote en Uso <span className="text-red-500">*</span></Label>
                <Input placeholder="Ej: 2024-001" value={form.usageLot} onChange={e => s("usageLot", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Lote Nuevo <span className="text-red-500">*</span></Label>
                <Input placeholder="Ej: 2024-002" value={form.newLot} onChange={e => s("newLot", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha V°B°</Label>
              <Input type="date" value={form.approvalDate} onChange={e => s("approvalDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Comentarios del Laboratorio</Label>
              <Textarea
                placeholder="Ej: CONFORME, CONFORME NO MEZCLAR, F/E, etc."
                value={form.comments}
                onChange={e => s("comments", e.target.value)}
                rows={3}
                className="resize-none"
              />
              {form.comments && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Estado interpretado:</span>
                  <StatusBadge status={
                    (() => {
                      const upper = form.comments.toUpperCase().trim();
                      if (!upper) return "REVISAR";
                      if (upper.includes("NO CONFORME") || upper.includes("NO CONFORM")) return "NO CONFORME";
                      if (upper.includes("CONFORME") && (upper.includes("NO MEZCLAR") || upper.includes("NO MESCLAR"))) return "CONFORME NO MEZCLAR";
                      if (upper.includes("CONFORME") || upper.includes("CONFORM")) return "CONFORME";
                      if (upper.includes("F/E") || upper.includes("FALTA ETIQUETAR")) return "FALTA ETIQUETAR";
                      if (upper.includes("OBSERV") || upper.includes("OBS")) return "OBSERVACION";
                      return "REVISAR";
                    })()
                  } />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Estado interpretado (opcional — se calcula automáticamente)</Label>
              <Select value={form.interpretedStatus} onValueChange={v => s("interpretedStatus", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Automático" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (según comentarios)</SelectItem>
                  {STATUSES.map(st => (
                    <SelectItem key={st} value={st}>{STATUS_CONFIG[st].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={pending}>
                {pending ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : (editRecord ? "Actualizar" : "Registrar")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
