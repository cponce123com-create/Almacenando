import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Check, ChevronDown, ChevronUp, ClipboardCopy, Loader2, Mail, RefreshCw, Search, Sparkles, TableProperties } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api/availability`;
type RunStatus = "requested" | "extracting" | "completed" | "failed" | "rejected";
interface AvailabilityRun { id: string; status: RunStatus; requestedAt: string; extractedAt?: string | null; completedAt?: string | null; recordCount: number; errorMessage?: string | null; }
interface AvailabilityConfig { warehouse: "Q1"; consumptionStart: string; consumptionEnd: string; q1MovementsStart: string; q1MovementsEnd: string; qpMovementsStart: string; qpMovementsEnd: string; }
interface AvailabilityRow {
  code: string; description: string; lineStatus: "Linea" | "No Linea"; unit: string;
  productionReservations: string; internalOrders: string; internalDocuments: string; consumptionTwoDays: string;
  qpMovements: string; q1Movements: string; q1Balance: string; availability: string;
  qaLot: string; qaBalance?: string; qaQuantity: string; qaZone: string; qaLocation: string; qdBalance: string; qdPreparation: string;
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
  const [sortMode, setSortMode] = useState<"availabilityAsc" | "availabilityDesc" | "codeAsc" | "descriptionAsc">("availabilityAsc");
  const [coverageDays, setCoverageDays] = useState(7);
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  const recommendation = (row: AvailabilityRow) => Math.max(0, (amount(row.consumptionTwoDays) / 2 * coverageDays) - amount(row.availability));
  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const filtered = rows.filter(row => (!term || row.code.toLowerCase().includes(term) || row.description.toLowerCase().includes(term))
      && (!onlyRecommended || recommendation(row) > 0));
    return filtered.sort((a, b) => {
      if (sortMode === "availabilityAsc") return amount(a.availability) - amount(b.availability) || a.code.localeCompare(b.code);
      if (sortMode === "availabilityDesc") return amount(b.availability) - amount(a.availability) || a.code.localeCompare(b.code);
      if (sortMode === "descriptionAsc") return a.description.localeCompare(b.description, "es");
      return a.code.localeCompare(b.code);
    });
  }, [rows, search, sortMode, onlyRecommended, coverageDays]);
  const selectedRows = useMemo(() => rows.filter(row => selected.has(row.code)), [rows, selected]);
  const visibleSelectedCount = visibleRows.filter(row => selected.has(row.code)).length;
  const negativeCount = rows.filter(row => amount(row.availability) < 0).length;
  const positiveCount = rows.filter(row => amount(row.availability) >= 0).length;
  const recommendedCount = rows.filter(row => recommendation(row) > 0).length;
  const inProgress = latest?.status === "requested" || latest?.status === "extracting";

  const updateConfig = (key: keyof AvailabilityConfig, value: string) => setConfig(current => ({ ...current, [key]: value }));
  const toggleRow = (code: string, checked: boolean) => setSelected(current => {
    const next = new Set(current); if (checked) next.add(code); else next.delete(code); return next;
  });
  const toggleVisible = (checked: boolean) => setSelected(current => {
    const next = new Set(current); for (const row of visibleRows) checked ? next.add(row.code) : next.delete(row.code); return next;
  });
  const useRecommendation = (row: AvailabilityRow) => {
    const quantity = recommendation(row);
    if (quantity <= 0) return;
    setRequested(current => ({ ...current, [row.code]: String(Number(quantity.toFixed(3))) }));
  };
  const applyRecommendations = () => {
    if (selected.size === 0) {
      toast({ title: "Selecciona productos", description: "Marca los productos a los que quieres aplicar la sugerencia." });
      return;
    }
    const candidates = rows.filter(row => selected.has(row.code));
    const suggestions = Object.fromEntries(candidates.filter(row => recommendation(row) > 0)
      .map(row => [row.code, String(Number(recommendation(row).toFixed(3)))]));
    setRequested(current => ({ ...current, ...suggestions }));
    toast({ title: "Sugerencias aplicadas", description: `${Object.keys(suggestions).length} cantidades sugeridas; puedes ajustarlas antes de enviar.` });
  };
  const emailText = () => {
    const when = dateTime(dataQuery.data?.extractedAt);
    const lines = selectedRows.map(row => {
      const qty = requested[row.code]?.trim() || "Por definir";
      return `${row.code}\t${row.description}\t${fmt(row.productionReservations)} ${row.unit}\t${row.qaBalance == null ? "—" : `${fmt(row.qaBalance)} ${row.unit}`}\t${row.qaLot || "—"}\t${row.qaLocation || "—"}\t${fmt(row.availability)} ${row.unit}\t${qty} ${row.unit}`;
    });
    return `Disponibilidad de químicos Q1\nActualizado: ${when}\n\nCódigo\tProducto\tReserva prod. Q1\tSaldo QA\tLote QA\tUbicación QA\tDisponible Q1\tSolicitado\n${lines.join("\n")}`;
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric title="Productos" value={rows.length.toLocaleString("es-PE")} />
          <Metric title="Disponibilidad negativa" value={negativeCount.toLocaleString("es-PE")} tone="red" />
          <Metric title="Disponibilidad en cero o positiva" value={positiveCount.toLocaleString("es-PE")} tone="green" />
          <Metric title={`Recomendados · ${coverageDays} días`} value={recommendedCount.toLocaleString("es-PE")} tone="violet" />
          <Metric title="Seleccionados para correo" value={selectedRows.length.toLocaleString("es-PE")} tone="violet" />
        </div>
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o descripción" className="pl-9 bg-white" /></div>
          <label className="flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap">Ordenar
            <select value={sortMode} onChange={e => setSortMode(e.target.value as typeof sortMode)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800">
              <option value="availabilityAsc">Disponibilidad: menor primero</option>
              <option value="availabilityDesc">Disponibilidad: mayor primero</option>
              <option value="codeAsc">Código: A–Z</option>
              <option value="descriptionAsc">Producto: A–Z</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap">Cobertura
            <select value={coverageDays} onChange={e => setCoverageDays(Number(e.target.value))} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800">
              {[3, 7, 14].map(days => <option key={days} value={days}>{days} días</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={applyRecommendations} disabled={selected.size === 0} className="whitespace-nowrap"><Sparkles className="w-4 h-4 mr-2 text-violet-600" />Aplicar a seleccionados</Button>
          <Button type="button" variant={onlyRecommended ? "default" : "outline"} onClick={() => setOnlyRecommended(value => !value)} className="whitespace-nowrap">
            {onlyRecommended ? "Ver todos" : "Solo recomendados"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggleVisible(visibleSelectedCount < visibleRows.length)}>
            {visibleSelectedCount >= visibleRows.length ? "Quitar selección visible" : "Seleccionar visibles"}
          </Button>
        </div>
        <p className="text-xs text-slate-500 -mt-1">Sugerencia = consumo promedio diario × días de cobertura − disponibilidad. Es una referencia editable, no una orden automática.</p>
        <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[58vh]">
            <table className="w-full table-fixed text-[11px] leading-4">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                <tr>
                  <th className="w-8 px-1 py-2"><Checkbox checked={visibleRows.length > 0 && visibleRows.every(row => selected.has(row.code))} onCheckedChange={value => toggleVisible(value === true)} aria-label="Seleccionar productos visibles" /></th>
                  <th className="w-[82px] px-1 py-2 text-left">Código</th>
                  <th className="w-[165px] px-1 py-2 text-left">Producto</th>
                  <th className="w-[38px] px-1 py-2 text-left">UM</th>
                  <th className="w-[76px] px-1 py-2 text-right">Reserva prod.</th>
                  <th className="w-[70px] px-1 py-2 text-right">Saldo QA</th>
                  <th className="w-[100px] px-1 py-2 text-left">Lote QA</th>
                  <th className="w-[92px] px-1 py-2 text-left">Ubic. QA</th>
                  <th className="w-[68px] px-1 py-2 text-right">Saldo Q1</th>
                  <th className="w-[82px] px-1 py-2 text-right">Disponible</th>
                  <th className="w-[84px] px-1 py-2 text-right">Sugerir ({coverageDays}d)</th>
                  <th className="w-[100px] px-1 py-2 text-left">Solicitar</th>
                  <th className="w-[48px] px-1 py-2 text-center">Más</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map(row => {
                  const available = amount(row.availability); const isSelected = selected.has(row.code);
                  const suggested = recommendation(row);
                  const isExpanded = expanded.has(row.code);
                  return <FragmentRow key={row.code} row={row} selected={isSelected} onSelect={checked => toggleRow(row.code, checked)} available={available} requested={requested[row.code] ?? ""} onRequest={value => setRequested(current => ({ ...current, [row.code]: value }))} suggested={suggested} onUseSuggestion={() => useRecommendation(row)} expanded={isExpanded} onToggleExpanded={() => setExpanded(current => { const next = new Set(current); next.has(row.code) ? next.delete(row.code) : next.add(row.code); return next; })} />;
                })}
                {visibleRows.length === 0 && <tr><td colSpan={12} className="py-12 text-center text-slate-500">No hay productos que coincidan con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="border-t px-3 py-2 text-[11px] text-slate-500 flex justify-between"><span>{visibleRows.length} de {rows.length} productos · negativos primero</span><span>NOW · Q1, QA, QD y QP</span></div>
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-500"><Check className="w-4 h-4 text-teal-700 shrink-0" />Marca los productos y completa “Solicitar”; la sugerencia usa el promedio del periodo extraído y los días de cobertura que elijas. Revisa y ajusta antes de enviar a Logística.</div>
      </>}
    </div>
  </AppLayout>;
}

function Metric({ title, value, tone = "slate" }: { title: string; value: string; tone?: "slate" | "red" | "green" | "violet" }) {
  const colors = { slate: "text-slate-900", red: "text-rose-700", green: "text-emerald-700", violet: "text-violet-700" };
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{title}</div><div className={`text-2xl font-bold mt-1 ${colors[tone]}`}>{value}</div></div>;
}
function FragmentRow({
  row, selected, onSelect, available, requested, onRequest, suggested, onUseSuggestion,
  expanded, onToggleExpanded,
}: {
  row: AvailabilityRow; selected: boolean; onSelect: (checked: boolean) => void; available: number;
  requested: string; onRequest: (value: string) => void; suggested: number; onUseSuggestion: () => void;
  expanded: boolean; onToggleExpanded: () => void;
}) {
  const details: Array<[string, string]> = [
    ["Línea", row.lineStatus],
    ["Órdenes internas pendientes", fmt(row.internalOrders)],
    ["Documentos internos (0/1)", fmt(row.internalDocuments)],
    ["Consumo estimado 2 días", fmt(row.consumptionTwoDays)],
    ["Movimientos QP", fmt(row.qpMovements)],
    ["Movimientos Q1", fmt(row.q1Movements)],
    ["Cantidad del lote QA mostrado", row.qaQuantity ? fmt(row.qaQuantity) : "—"],
    ["Zona QA", row.qaZone || "—"],
    ["Saldo QD", fmt(row.qdBalance)],
    ["Preparación QD", fmt(row.qdPreparation)],
  ];
  return <Fragment>
    <tr className={`hover:bg-teal-50/60 ${available < 0 ? "bg-rose-50/70" : ""}`}>
      <td className="px-1 py-2 text-center"><Checkbox checked={selected} onCheckedChange={value => onSelect(value === true)} aria-label={`Seleccionar ${row.code}`} /></td>
      <td className="px-1 py-2 font-mono font-semibold whitespace-nowrap" title={row.code}>{row.code}</td>
      <td className="px-1 py-2"><div className="max-w-[150px] truncate" title={row.description}>{row.description}</div></td>
      <td className="px-1 py-2 whitespace-nowrap">{row.unit}</td>
      <td className="px-1 py-2 text-right tabular-nums">{fmt(row.productionReservations)}</td>
      <td className="px-1 py-2 text-right font-semibold tabular-nums">{row.qaBalance == null ? "—" : fmt(row.qaBalance)}</td>
      <td className="px-1 py-2"><div className="truncate" title={row.qaLot ? `Primer lote QA: ${row.qaLot}` : "—"}>{row.qaLot || "—"}</div></td>
      <td className="px-1 py-2"><div className="truncate" title={row.qaLocation || "—"}>{row.qaLocation || "—"}</div></td>
      <td className="px-1 py-2 text-right tabular-nums">{fmt(row.q1Balance)}</td>
      <td className={`px-1 py-2 text-right font-bold tabular-nums ${available < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmt(row.availability)}</td>
      <td className="px-1 py-2 text-right">
        {suggested > 0 ? <Button type="button" variant="ghost" size="sm" onClick={onUseSuggestion} title="Usar la cantidad sugerida" className="h-7 px-1.5 text-[10px] text-violet-700 hover:bg-violet-50"><Sparkles className="mr-1 h-3 w-3" />{fmt(suggested)}</Button> : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-1 py-2"><Input aria-label={`Cantidad solicitada para ${row.code}`} inputMode="decimal" value={requested} onChange={e => onRequest(e.target.value)} placeholder="Cantidad" className="h-7 w-full px-1.5 text-right text-[11px]" /></td>
      <td className="px-1 py-2 text-center"><Button type="button" variant="ghost" size="icon" onClick={onToggleExpanded} aria-label={expanded ? `Ocultar detalle ${row.code}` : `Ver detalle ${row.code}`} className="h-7 w-7">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button></td>
    </tr>
    {expanded && <tr className="bg-slate-50">
      <td colSpan={13} className="px-3 py-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {details.map(([label, value]) => <div key={label} className="flex min-w-0 justify-between gap-2 border-b border-slate-200/70 py-1 text-[10px]">
            <span className="truncate text-slate-500" title={label}>{label}</span><b className="shrink-0 text-slate-800">{value}</b>
          </div>)}
        </div>
      </td>
    </tr>}
  </Fragment>;
}
