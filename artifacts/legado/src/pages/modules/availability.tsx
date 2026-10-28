import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Check, ClipboardCopy, Loader2, Mail, RefreshCw, Search, TableProperties } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api/availability`;
type RunStatus = "requested" | "extracting" | "completed" | "failed" | "rejected";
interface AvailabilityRun { id: string; status: RunStatus; requestedAt: string; extractedAt?: string | null; completedAt?: string | null; recordCount: number; errorMessage?: string | null; }
interface AvailabilityConfig { warehouse: "Q1"; consumptionStart: string; consumptionEnd: string; q1MovementsStart: string; q1MovementsEnd: string; qpMovementsStart: string; qpMovementsEnd: string; }
interface AvailabilityRow {
  code: string; description: string; lineStatus: "Linea" | "No Linea"; unit: string;
  productionReservations: string; internalOrders: string; internalDocuments: string; consumptionTwoDays: string;
  qpMovements: string; q1Movements: string; q1Balance: string; availability: string;
  qaLot: string; qaQuantity: string; qaZone: string; qaLocation: string; qdBalance: string; qdPreparation: string;
}
interface AvailabilityStatus { latest: AvailabilityRun | null; connectorOnline: boolean; connectorLastSeenAt: string | null; }
interface AvailabilityData { id: string | null; extractedAt: string | null; config: AvailabilityConfig | null; rows: AvailabilityRow[]; }

function localISO(date: Date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function defaultConfig(): AvailabilityConfig {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 179);
  const recent = new Date(end); recent.setDate(recent.getDate() - 1);
  return { warehouse: "Q1", consumptionStart: localISO(start), consumptionEnd: localISO(end), q1MovementsStart: localISO(recent), q1MovementsEnd: localISO(end), qpMovementsStart: localISO(recent), qpMovementsEnd: localISO(end) };
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options?.body ? { "Content-Type": "application/json" } : {}), ...(options?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudo consultar la disponibilidad.");
  return body as T;
}
function amount(value: string | number | null | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function fmt(value: string | number | null | undefined) { return amount(value).toLocaleString("es-PE", { maximumFractionDigits: 3 }); }
function dateTime(value?: string | null) { return value ? new Date(value).toLocaleString("es-PE") : "—"; }

export default function AvailabilityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [config, setConfig] = useState(defaultConfig);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const canRefresh = user?.role === "admin" || user?.role === "supervisor";

  const statusQuery = useQuery({ queryKey: ["availability-status"], queryFn: () => api<AvailabilityStatus>("/status"), refetchInterval: 10000 });
  const latest = statusQuery.data?.latest ?? null;
  const dataQuery = useQuery({
    queryKey: ["availability-latest", latest?.id],
    queryFn: () => api<AvailabilityData>("/latest"),
    enabled: latest?.status === "completed",
  });
  const requestMutation = useMutation({
    mutationFn: () => api<{ id: string }>("/request", { method: "POST", body: JSON.stringify(config) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["availability-status"] }); toast({ title: "Consulta solicitada", description: "El conector de NOW consultará las órdenes y saldos." }); },
    onError: (error: Error) => toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" }),
  });
  const rows = dataQuery.data?.rows ?? [];
  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? rows.filter(row => row.code.toLowerCase().includes(term) || row.description.toLowerCase().includes(term)) : rows;
  }, [rows, search]);
  const selectedRows = useMemo(() => rows.filter(row => selected.has(row.code)), [rows, selected]);
  const negativeCount = rows.filter(row => amount(row.availability) < 0).length;
  const positiveCount = rows.filter(row => amount(row.availability) >= 0).length;
  const inProgress = latest?.status === "requested" || latest?.status === "extracting";

  const updateConfig = (key: keyof AvailabilityConfig, value: string) => setConfig(current => ({ ...current, [key]: value }));
  const toggleRow = (code: string, checked: boolean) => setSelected(current => {
    const next = new Set(current); if (checked) next.add(code); else next.delete(code); return next;
  });
  const toggleVisible = (checked: boolean) => setSelected(current => {
    const next = new Set(current); for (const row of visibleRows) checked ? next.add(row.code) : next.delete(row.code); return next;
  });
  const emailText = () => {
    const when = dateTime(dataQuery.data?.extractedAt);
    const lines = selectedRows.map(row => {
      const qty = requested[row.code]?.trim() || "Por definir";
      return `${row.code}\t${row.description}\t${fmt(row.availability)} ${row.unit}\t${qty} ${row.unit}`;
    });
    return `Disponibilidad de químicos Q1\nActualizado: ${when}\n\nCódigo\tProducto\tDisponible\tSolicitado\n${lines.join("\n")}`;
  };
  const copyEmail = async () => {
    if (selectedRows.length === 0) { toast({ title: "Selecciona productos", description: "Marca al menos un producto para preparar el correo." }); return; }
    try { await navigator.clipboard.writeText(emailText()); toast({ title: "Copiado", description: `${selectedRows.length} productos listos para pegar en el correo.` }); }
    catch { toast({ title: "No se pudo copiar", description: "El navegador bloqueó el acceso al portapapeles.", variant: "destructive" }); }
  };
  const openEmail = () => {
    if (selectedRows.length === 0) { toast({ title: "Selecciona productos", description: "Marca al menos un producto para preparar el correo." }); return; }
    const subject = `Disponibilidad de químicos Q1 - ${new Date().toLocaleDateString("es-PE")}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailText())}`;
  };

  return <AppLayout>
    <div className="p-4 md:p-6 space-y-5 max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><TableProperties className="w-6 h-6 text-teal-700" /> Disponibilidad</h1>
          <p className="text-sm text-slate-500 mt-1">Análisis de saldos, reservas, órdenes y consumo para preparar solicitudes por correo.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={copyEmail} disabled={!rows.length}><ClipboardCopy className="w-4 h-4 mr-2" /> Copiar seleccionados</Button>
          <Button variant="outline" onClick={openEmail} disabled={!rows.length}><Mail className="w-4 h-4 mr-2" /> Abrir correo</Button>
          <Button onClick={() => requestMutation.mutate()} disabled={!canRefresh || !statusQuery.data?.connectorOnline || inProgress || requestMutation.isPending} className="bg-teal-700 hover:bg-teal-800">
            {requestMutation.isPending || inProgress ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Actualizar desde NOW
          </Button>
        </div>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-slate-800">Rangos de cálculo</div>
          <div className={`text-xs font-medium ${statusQuery.data?.connectorOnline ? "text-emerald-700" : "text-amber-700"}`}>
            {statusQuery.data?.connectorOnline ? `Conector activo · ${dateTime(statusQuery.data.connectorLastSeenAt)}` : "Abre el conector Datatex NOW en la PC del trabajo para actualizar"}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            ["Consumo para estimar 2 días", "consumptionStart", "consumptionEnd"],
            ["Movimientos de Q1", "q1MovementsStart", "q1MovementsEnd"],
            ["Movimientos de QP", "qpMovementsStart", "qpMovementsEnd"],
          ] as const).map(([label, startKey, endKey]) => <div key={startKey} className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600 mb-2">{label}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-500">Desde<Input type="date" value={config[startKey]} onChange={e => updateConfig(startKey, e.target.value)} /></label>
              <label className="text-[11px] text-slate-500">Hasta<Input type="date" value={config[endKey]} onChange={e => updateConfig(endKey, e.target.value)} /></label>
            </div>
          </div>)}
        </div>
        <p className="text-xs text-slate-500">Disponibilidad = saldo Q1 − reservas de producción − órdenes internas − documentos internos − consumo estimado de 2 días − movimientos seleccionados.</p>
        {latest && <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
          <span>Estado: <b>{latest.status === "extracting" ? "Consultando NOW" : latest.status === "requested" ? "Esperando al conector" : latest.status === "completed" ? "Actualizada" : latest.status === "failed" ? "Fallida" : latest.status}</b></span>
          {latest.extractedAt && <span>Extraído: {dateTime(latest.extractedAt)}</span>}
          {latest.errorMessage && <span className="text-red-700">{latest.errorMessage}</span>}
          {latest.status === "completed" && <span>{latest.recordCount} productos</span>}
        </div>}
      </section>

      {!rows.length && !inProgress && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>{statusQuery.data?.connectorOnline ? "Todavía no hay un análisis guardado. Configura los rangos y selecciona Actualizar desde NOW." : "Conecta la PC con Datatex NOW y solicita una consulta para cargar la disponibilidad."}</AlertDescription></Alert>}
      {inProgress && <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>El conector está consultando saldos, reservas, documentos y movimientos en NOW. Puedes dejar esta página abierta.</AlertDescription></Alert>}

      {rows.length > 0 && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric title="Productos" value={rows.length.toLocaleString("es-PE")} />
          <Metric title="Disponibilidad negativa" value={negativeCount.toLocaleString("es-PE")} tone="red" />
          <Metric title="Disponibilidad en cero o positiva" value={positiveCount.toLocaleString("es-PE")} tone="green" />
          <Metric title="Seleccionados para correo" value={selectedRows.length.toLocaleString("es-PE")} tone="violet" />
        </div>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o descripción" className="pl-9 bg-white" /></div>
          <Button variant="outline" size="sm" onClick={() => toggleVisible(selectedRows.length < visibleRows.length)}>
            {selectedRows.length >= visibleRows.length ? "Quitar selección visible" : "Seleccionar visibles"}
          </Button>
        </div>
        <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[65vh]">
            <table className="min-w-[1850px] w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                <tr>{["Correo", "Código", "Producto", "Línea", "UM", "Reserva prod. Q1", "Órdenes int. pendientes", "Docs. internos (0/1)", "Consumo 2 días", "Mov. QP", "Mov. Q1", "Saldo Q1", "Disponibilidad", "Solicitar", "Lote QA", "Cant. QA", "Zona QA", "Ubicación QA", "Saldo QD", "Preparación QD"].map((head, index) => <th key={head} className={`px-3 py-3 text-left font-semibold whitespace-nowrap ${index === 0 ? "sticky left-0 bg-slate-100" : ""}`}>{index === 0 ? <Checkbox checked={visibleRows.length > 0 && visibleRows.every(row => selected.has(row.code))} onCheckedChange={value => toggleVisible(value === true)} aria-label="Seleccionar productos visibles" /> : head}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map(row => {
                  const available = amount(row.availability); const isSelected = selected.has(row.code);
                  return <tr key={row.code} className={`hover:bg-teal-50/50 ${available < 0 ? "bg-rose-50/40" : ""}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white"><Checkbox checked={isSelected} onCheckedChange={value => toggleRow(row.code, value === true)} aria-label={`Seleccionar ${row.code}`} /></td>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{row.code}</td>
                    <td className="px-3 py-2 min-w-[260px] max-w-[360px]">{row.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className={`px-2 py-1 rounded-full ${row.lineStatus === "Linea" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{row.lineStatus}</span></td>
                    <td className="px-3 py-2">{row.unit}</td>
                    <NumCell value={row.productionReservations} /><NumCell value={row.internalOrders} /><NumCell value={row.internalDocuments} /><NumCell value={row.consumptionTwoDays} /><NumCell value={row.qpMovements} /><NumCell value={row.q1Movements} /><NumCell value={row.q1Balance} />
                    <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${available < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmt(row.availability)}</td>
                    <td className="px-3 py-2"><Input aria-label={`Cantidad solicitada para ${row.code}`} value={requested[row.code] ?? ""} onChange={e => setRequested(current => ({ ...current, [row.code]: e.target.value }))} placeholder="Cantidad" className="h-8 w-24 text-right" /></td>
                    {[row.qaLot || "—", row.qaQuantity ? fmt(row.qaQuantity) : "—", row.qaZone || "—", row.qaLocation || "—", fmt(row.qdBalance), fmt(row.qdPreparation)].map((value, i) => <td key={i} className="px-3 py-2 whitespace-nowrap">{value}</td>)}
                  </tr>;
                })}
                {visibleRows.length === 0 && <tr><td colSpan={20} className="py-12 text-center text-slate-500">No hay productos que coincidan con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-2 text-xs text-slate-500 flex justify-between"><span>{visibleRows.length} de {rows.length} productos</span><span>Valores extraídos de NOW · Q1, QA, QD y QP</span></div>
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-500"><Check className="w-4 h-4 text-teal-700 shrink-0" />Marca los productos y completa “Solicitar”; el borrador del correo usa disponibilidad actual y cantidad solicitada.</div>
      </>}
    </div>
  </AppLayout>;
}

function Metric({ title, value, tone = "slate" }: { title: string; value: string; tone?: "slate" | "red" | "green" | "violet" }) {
  const colors = { slate: "text-slate-900", red: "text-rose-700", green: "text-emerald-700", violet: "text-violet-700" };
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{title}</div><div className={`text-2xl font-bold mt-1 ${colors[tone]}`}>{value}</div></div>;
}
function NumCell({ value }: { value: string }) { return <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{fmt(value)}</td>; }
