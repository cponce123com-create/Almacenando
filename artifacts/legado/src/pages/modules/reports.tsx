import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart2, Download, Loader2, AlertCircle, Filter } from "lucide-react";

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

type ReportType = "inventory" | "immobilized" | "samples" | "disposition" | "epp-deliveries" | "epp-alerts";

const REPORT_TYPES: { id: ReportType; label: string; description: string; color: string }[] = [
  { id: "inventory", label: "Inventario", description: "Registros de entradas y salidas por período", color: "bg-emerald-600" },
  { id: "immobilized", label: "Inmovilizados", description: "Productos bloqueados y su estado actual", color: "bg-orange-600" },
  { id: "samples", label: "Muestras", description: "Registro de muestras tomadas y sus resultados", color: "bg-purple-600" },
  { id: "disposition", label: "Disposición Final", description: "Gestión de residuos y disposición final", color: "bg-teal-600" },
  { id: "epp-deliveries", label: "Entregas EPP", description: "Equipos entregados al personal por período", color: "bg-indigo-600" },
  { id: "epp-alerts", label: "Alertas EPP", description: "Equipos próximos a su fecha de reemplazo", color: "bg-red-600" },
];

const STATUSES: Record<ReportType, { label: string; value: string }[]> = {
  inventory: [],
  immobilized: [
    { value: "immobilized", label: "Inmovilizado" },
    { value: "released", label: "Liberado" },
    { value: "disposed", label: "Dispuesto" },
  ],
  samples: [
    { value: "pending", label: "Pendiente" },
    { value: "in_lab", label: "En Laboratorio" },
    { value: "completed", label: "Completada" },
    { value: "rejected", label: "Rechazada" },
  ],
  disposition: [
    { value: "pending", label: "Pendiente" },
    { value: "in_progress", label: "En Proceso" },
    { value: "completed", label: "Completado" },
    { value: "cancelled", label: "Cancelado" },
  ],
  "epp-deliveries": [],
  "epp-alerts": [],
};

function AlertBadge({ level }: { level: string }) {
  if (level === "overdue") return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs">Vencido</Badge>;
  if (level === "due") return <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 text-xs">Urgente</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs">Próximo</Badge>;
}

function ReportTable({ type, data }: { type: ReportType; data: Record<string, unknown>[] }) {
  if (data.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
      <BarChart2 className="w-10 h-10" />
      <p className="text-sm font-medium">No hay datos para los filtros seleccionados</p>
    </div>
  );

  if (type === "inventory") return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>Código</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Saldo Ant.</TableHead>
          <TableHead className="text-right">Entradas</TableHead>
          <TableHead className="text-right">Salidas</TableHead>
          <TableHead className="text-right">Saldo Final</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{r.productCode as string}</TableCell>
            <TableCell className="text-sm">{r.productName as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.recordDate as string}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.previousBalance as string}</TableCell>
            <TableCell className="text-right font-mono text-sm text-emerald-600">{r.inputs as string}</TableCell>
            <TableCell className="text-right font-mono text-sm text-red-600">{r.outputs as string}</TableCell>
            <TableCell className="text-right font-mono text-sm font-bold">{r.finalBalance as string}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (type === "immobilized") return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>Código</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{r.productCode as string ?? "—"}</TableCell>
            <TableCell className="text-sm">{r.productName as string}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.quantity as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.reason as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.immobilizedDate as string}</TableCell>
            <TableCell><Badge className="text-xs">{r.status as string}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (type === "samples") return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>Código</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Proveedor</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Propósito</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r: Record<string, unknown>, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{r.sampleCode as string}</TableCell>
            <TableCell className="text-sm">{(r.productName as string) ?? "—"}</TableCell>
            <TableCell className="text-sm text-slate-500">{(r.supplier as string) ?? "—"}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.quantity as string} {r.unit as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.sampleDate as string}</TableCell>
            <TableCell className="text-sm">{r.purpose as string}</TableCell>
            <TableCell><Badge className="text-xs">{r.status as string}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (type === "disposition") return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead>Tipo Disposición</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead className="text-right">Costo</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r: Record<string, unknown>, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">{(r.productDisplayName as string) ?? (r.productName as string) ?? (r.productNameManual as string) ?? "—"}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.quantity as string} {r.unit as string}</TableCell>
            <TableCell className="text-sm">{r.dispositionType as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.dispositionDate as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{(r.contractor as string) ?? "—"}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.cost ? `S/. ${parseFloat(r.cost as string).toFixed(2)}` : "—"}</TableCell>
            <TableCell><Badge className="text-xs">{r.status as string}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (type === "epp-deliveries") return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>EPP</TableHead>
          <TableHead>Personal</TableHead>
          <TableHead>Área</TableHead>
          <TableHead>Fecha Entrega</TableHead>
          <TableHead className="text-center">Cant.</TableHead>
          <TableHead>Próx. Reposición</TableHead>
          <TableHead>Alerta</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r: Record<string, unknown>, i) => (
          <TableRow key={i}>
            <TableCell>
              <p className="text-sm font-medium">{r.eppName as string}</p>
              <p className="text-xs text-slate-400">{r.eppCode as string} · {r.eppCategory as string}</p>
            </TableCell>
            <TableCell className="text-sm">{r.personnelName as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{(r.personnelDepartment as string) ?? "—"}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.deliveryDate as string}</TableCell>
            <TableCell className="text-center font-mono text-sm">{r.quantity as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{(r.nextReplacementDate as string) ?? "—"}</TableCell>
            <TableCell>
              {r.alertLevel && r.alertLevel !== "ok" ? <AlertBadge level={r.alertLevel as string} /> : <span className="text-xs text-slate-400">OK</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (type === "epp-alerts") return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead>EPP</TableHead>
          <TableHead>Personal</TableHead>
          <TableHead>Última Entrega</TableHead>
          <TableHead>Próxima Reposición</TableHead>
          <TableHead className="text-right">Días</TableHead>
          <TableHead>Alerta</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r: Record<string, unknown>, i) => (
          <TableRow key={i} className={(r.alertLevel === "overdue" ? "bg-red-50/30" : r.alertLevel === "due" ? "bg-orange-50/30" : "")}>
            <TableCell>
              <p className="text-sm font-medium">{r.eppName as string}</p>
              <p className="text-xs text-slate-400">{r.eppCode as string}</p>
            </TableCell>
            <TableCell className="text-sm">{r.personnelName as string}</TableCell>
            <TableCell className="text-sm text-slate-500">{r.deliveryDate as string}</TableCell>
            <TableCell className="text-sm font-medium">{r.nextReplacementDate as string}</TableCell>
            <TableCell className={`text-right font-mono text-sm font-bold ${(r.daysUntilReplacement as number) < 0 ? "text-red-600" : "text-orange-600"}`}>
              {(r.daysUntilReplacement as number) < 0
                ? `+${Math.abs(r.daysUntilReplacement as number)} venc.`
                : `${r.daysUntilReplacement as number} días`}
            </TableCell>
            <TableCell><AlertBadge level={r.alertLevel as string} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return null;
}

export default function ReportesPage() {
  const { toast } = useToast();
  const [reportType, setReportType] = useState<ReportType>("inventory");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloading, setDownloading] = useState(false);

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (statusFilter !== "all") params.set("status", statusFilter);
    return `/api/reports/${reportType}?${params.toString()}`;
  };

  const { data = [], isLoading, isError, refetch } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/reports", reportType, fromDate, toDate, statusFilter],
    queryFn: () => api(buildUrl()),
  });

  const handleExport = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/reports/export/${reportType.replace("-deliveries", "").replace("-alerts", "")}`, {
        headers: getAuthHeaders() as Record<string, string>,
      });
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte_${reportType}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Exportado correctamente", description: "El archivo Excel fue descargado." });
    } catch {
      toast({ title: "Error", description: "No se pudo exportar el reporte", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const currentReport = REPORT_TYPES.find(r => r.id === reportType)!;
  const statusOptions = STATUSES[reportType];
  const hasDates = !["epp-alerts"].includes(reportType);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
              <BarChart2 className="w-6 h-6 text-slate-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
              <p className="text-slate-500 text-sm">Análisis e informes del sistema de almacén</p>
            </div>
          </div>
          <Button onClick={handleExport} disabled={downloading || data.length === 0}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar Excel
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => { setReportType(rt.id); setStatusFilter("all"); }}
              className={`p-3 rounded-xl border text-left transition-all ${
                reportType === rt.id
                  ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <p className={`text-xs font-semibold ${reportType === rt.id ? "text-white" : "text-slate-700"}`}>
                {rt.label}
              </p>
              <p className={`text-xs mt-0.5 leading-tight ${reportType === rt.id ? "text-slate-300" : "text-slate-400"}`}>
                {rt.description}
              </p>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Filtros para {currentReport.label}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {hasDates && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Desde</Label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    className="w-40 h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Hasta</Label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    className="w-40 h-8 text-sm" />
                </div>
              </>
            )}
            {statusOptions.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Estado</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(fromDate || toDate || statusFilter !== "all") && (
              <div className="space-y-1">
                <Label className="text-xs text-transparent">_</Label>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                  setFromDate(""); setToDate(""); setStatusFilter("all");
                }}>
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">{currentReport.label}</h3>
              {!isLoading && !isError && (
                <p className="text-xs text-slate-400">{data.length} registros encontrados</p>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Generando reporte...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-slate-500">No se pudo cargar el reporte</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <ReportTable type={reportType} data={data} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
