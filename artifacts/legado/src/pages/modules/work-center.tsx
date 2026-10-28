import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Activity, AlertTriangle, Barcode, CheckCircle2, ClipboardCheck, Copy, ExternalLink, Loader2, Mail, Package, Search, ShieldAlert } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Candidate = { code: string; description: string; unit: string; availability: number; dailyConsumption: number; recommendation: number };
type Incident = { id: string; warehouse: string; recordDate: string; physicalCount: number | null; systemBalance: number; missingLabel: boolean; location: string | null; productId: string; code: string; name: string; unit: string; lots: string; kind: "missing_label" | "count_difference" };
type CycleAlert = { productId: string; code: string; name: string; countedDate: string | null; physicalCount: number | null; systemBalance: number | null; difference: number | null };
type Summary = { warehouse: string; updatedAt: string | null; purchaseCandidates: Candidate[]; activeCycle: { id: string; name: string; warehouse: string } | null; cycleAlerts: CycleAlert[]; incidents: Incident[]; counts: { purchaseCandidates: number; pendingCounts: number; cycleAlerts: number; incidents: number; labelIssues: number; countDifferences: number } };
type TraceRow = { recordId: string; warehouse: string; type: string | null; code: string; description: string; unit: string; recordDate: string; physicalCount: number | null; systemBalance: number; location: string | null; missingLabel: boolean; lot: string | null; weight: string | null; tare: string | null; currentBalance: number | null; lastConsumption: string | null };

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, { headers: getAuthHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los datos.");
  return body as T;
}
const n = (value: unknown) => { const x = Number(value); return Number.isFinite(x) ? x : 0; };
const fmt = (value: unknown) => n(value).toLocaleString("es-PE", { maximumFractionDigits: 2 });
const dateFmt = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PE") : "—";

export default function WorkCenterPage() {
  const { warehouse: selectedWarehouse } = useWarehouse();
  const warehouse = selectedWarehouse === "all" ? "Q1" : selectedWarehouse;
  const { toast } = useToast();
  const [coverageDays, setCoverageDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [traceTerm, setTraceTerm] = useState("");
  const [traceQuery, setTraceQuery] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["work-center-summary", warehouse],
    queryFn: () => api<Summary>(`/work-center/summary?warehouse=${encodeURIComponent(warehouse)}`),
    refetchInterval: 60_000,
  });
  const traceQueryResult = useQuery({
    queryKey: ["work-center-trace", traceQuery],
    queryFn: () => api<{ query: string; rows: TraceRow[] }>(`/work-center/traceability?q=${encodeURIComponent(traceQuery)}`),
    enabled: traceQuery.length >= 2,
  });
  const summary = summaryQuery.data;
  const candidates = useMemo(() => (summary?.purchaseCandidates ?? []).map(row => {
    const recommendation = Math.max(0, row.dailyConsumption * coverageDays - row.availability);
    return { ...row, recommendation: Number(recommendation.toFixed(2)) };
  }).filter(row => row.recommendation > 0), [summary, coverageDays]);
  const selectedCandidates = candidates.filter(row => selected.has(row.code));

  const setRecommended = () => {
    const suggestions = Object.fromEntries(candidates.map(row => [row.code, String(row.recommendation)]));
    setQuantities(current => ({ ...current, ...suggestions }));
    setSelected(new Set(candidates.filter(row => row.recommendation > 0).map(row => row.code)));
  };
  const requestText = () => [
    `Solicitud de abastecimiento de químicos · Almacén ${warehouse}`,
    `Fecha: ${new Date().toLocaleDateString("es-PE")}`,
    "", "Código | Producto | Disponible | Cantidad solicitada | UM",
    ...selectedCandidates.map(row => `${row.code} | ${row.description} | ${fmt(row.availability)} | ${quantities[row.code] || row.recommendation} | ${row.unit}`),
  ].join("\n");
  const copyRequest = async () => {
    if (!selectedCandidates.length) { toast({ title: "Selecciona productos", description: "Marca al menos un producto para preparar la solicitud." }); return; }
    await navigator.clipboard.writeText(requestText());
    toast({ title: "Solicitud copiada", description: `${selectedCandidates.length} productos listos para pegar en el correo.` });
  };
  const openEmail = () => {
    if (!selectedCandidates.length) { toast({ title: "Selecciona productos", description: "Marca al menos un producto para preparar el correo." }); return; }
    window.location.href = `mailto:?subject=${encodeURIComponent(`Solicitud de abastecimiento · ${warehouse} · ${new Date().toLocaleDateString("es-PE")}`)}&body=${encodeURIComponent(requestText())}`;
  };
  const searchTrace = (event: React.FormEvent) => { event.preventDefault(); setTraceQuery(traceTerm.trim()); };

  return <AppLayout>
    <main className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Activity className="h-6 w-6 text-teal-700" /> Panel de trabajo diario</h1>
          <p className="mt-1 text-sm text-slate-600">Prioriza compras, conteos e incidencias del almacén {warehouse}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/scanner"><Barcode className="mr-2 h-4 w-4" />Buscar / escanear</Link></Button>
          <Button asChild variant="outline"><Link href="/inventory-progress"><ClipboardCheck className="mr-2 h-4 w-4" />Conteo cíclico</Link></Button>
        </div>
      </header>

      {summaryQuery.isLoading && <div className="flex items-center gap-2 rounded-lg border bg-white p-5 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Cargando prioridades…</div>}
      {summaryQuery.isError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(summaryQuery.error as Error).message}</div>}

      {summary && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Productos sugeridos para abastecer" value={candidates.length} href="/availability" tone="violet" />
          <Metric label="Productos pendientes de contar" value={summary.counts.pendingCounts} href="/inventory-progress" tone="amber" />
          <Metric label="Alertas de consumo tras conteo" value={summary.counts.cycleAlerts} href="/inventory-progress" tone="amber" />
          <Metric label="Conteos con diferencia" value={summary.counts.countDifferences} href="/inventory" tone="red" />
          <Metric label="Productos sin etiqueta" value={summary.counts.labelIssues} href="/inventory" tone="red" />
        </section>
        <p className="-mt-2 text-right text-xs text-slate-500">Datos de disponibilidad: {summary.updatedAt ? new Date(summary.updatedAt).toLocaleString("es-PE") : "sin actualización guardada"}</p>

        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Package className="h-5 w-5 text-violet-700" /> Solicitud de compra sugerida · Q1</h2><p className="mt-1 text-xs text-slate-500">Recomendación editable basada en consumo promedio y disponibilidad actual.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">Cobertura
                <select value={coverageDays} onChange={e => setCoverageDays(Number(e.target.value))} className="ml-2 h-9 rounded-md border bg-white px-2 text-sm">
                  {[3, 7, 14, 30].map(days => <option value={days} key={days}>{days} días</option>)}
                </select>
              </label>
              <Button variant="outline" size="sm" onClick={setRecommended}>Seleccionar sugeridos</Button>
              <Button variant="outline" size="sm" onClick={copyRequest} disabled={!selectedCandidates.length}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button>
              <Button size="sm" onClick={openEmail} disabled={!selectedCandidates.length} className="bg-teal-700 hover:bg-teal-800"><Mail className="mr-1.5 h-4 w-4" />Preparar correo</Button>
            </div>
          </div>
          {candidates.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No hay análisis de Disponibilidad. Actualiza primero la sección <Link className="text-teal-700 underline" href="/availability">Disponibilidad</Link>.</div> : <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs text-slate-600"><tr><th className="p-3">Pedir</th><th className="p-3">Código / producto</th><th className="p-3 text-right">Disponible</th><th className="p-3 text-right">Consumo/día</th><th className="p-3 text-right">Sugerencia</th><th className="p-3">Cantidad solicitud</th></tr></thead>
              <tbody>{candidates.slice(0, 50).map(row => <tr key={row.code} className="border-t hover:bg-slate-50">
                <td className="p-3"><input type="checkbox" checked={selected.has(row.code)} onChange={e => setSelected(prev => { const next = new Set(prev); e.target.checked ? next.add(row.code) : next.delete(row.code); return next; })} aria-label={`Incluir ${row.code}`} /></td>
                <td className="p-3"><b className="font-mono text-xs">{row.code}</b><div className="max-w-md truncate text-xs text-slate-600" title={row.description}>{row.description}</div></td>
                <td className={`p-3 text-right font-semibold ${row.availability < 0 ? "text-red-700" : "text-slate-700"}`}>{fmt(row.availability)} {row.unit}</td>
                <td className="p-3 text-right text-slate-600">{fmt(row.dailyConsumption)} {row.unit}</td>
                <td className="p-3 text-right font-semibold text-violet-700">{fmt(row.recommendation)} {row.unit}</td>
                <td className="p-3"><Input className="h-8 w-32" type="number" min="0" step="0.01" value={quantities[row.code] ?? ""} onChange={e => setQuantities(current => ({ ...current, [row.code]: e.target.value }))} placeholder={fmt(row.recommendation)} /></td>
              </tr>)}</tbody>
            </table>
            {candidates.length > 50 && <div className="p-3 text-center text-xs text-slate-500">Mostrando 50 de {candidates.length}; revisa el resto en Disponibilidad.</div>}
          </div>}
          <div className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-900">La cantidad sugerida es una referencia: revisa órdenes, reservas y necesidades de producción antes de enviarla.</div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b p-4"><div><h2 className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5 text-red-600" /> Alertas e incidencias recientes</h2><p className="mt-1 text-xs text-slate-500">Diferencias del último conteo por producto y consumos posteriores.</p></div><Link className="text-xs font-medium text-teal-700" href="/inventory">Abrir conteos <ExternalLink className="inline h-3 w-3" /></Link></div>
            <div className="max-h-[420px] divide-y overflow-auto">
              {summary.cycleAlerts.map(alert => <div key={`cycle-${alert.productId}`} className="flex items-start gap-3 p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><b className="font-mono text-xs">{alert.code}</b><p className="truncate text-sm">{alert.name}</p><p className="text-xs text-red-700">NOW registró consumo después del conteo {dateFmt(alert.countedDate)}.</p></div><Link className="text-xs text-teal-700" href="/inventory-progress">Revisar</Link></div>)}
              {summary.incidents.map(incident => <div key={incident.id} className="flex items-start gap-3 p-3"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${incident.kind === "missing_label" ? "text-red-600" : "text-amber-600"}`} /><div className="min-w-0 flex-1"><b className="font-mono text-xs">{incident.code} · {dateFmt(incident.recordDate)}</b><p className="truncate text-sm">{incident.name}</p><p className="text-xs text-slate-600">{incident.kind === "missing_label" ? "Marcaron el producto sin etiqueta" : `Diferencia: ${fmt(n(incident.physicalCount) - n(incident.systemBalance))} ${incident.unit}`} · Lote: {incident.lots || "—"} · Ubicación: {incident.location || "—"}</p></div><Link className="text-xs text-teal-700" href={`/inventory?productId=${incident.productId}`}>Abrir</Link></div>)}
              {!summary.incidents.length && !summary.cycleAlerts.length && <div className="flex items-center gap-2 p-8 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" />No hay incidencias recientes en los datos consultados.</div>}
            </div>
          </section>

          <section className="rounded-xl border bg-white shadow-sm">
            <div className="border-b p-4"><h2 className="flex items-center gap-2 font-semibold"><Search className="h-5 w-5 text-teal-700" /> Trazabilidad de lotes</h2><p className="mt-1 text-xs text-slate-500">Busca por código, nombre o lote para ver conteos, peso, ubicación y saldo NOW.</p></div>
            <form onSubmit={searchTrace} className="flex gap-2 p-4"><Input value={traceTerm} onChange={e => setTraceTerm(e.target.value)} placeholder="Ej.: 0204-0263 o número de lote" /><Button type="submit" disabled={traceTerm.trim().length < 2}><Search className="mr-1.5 h-4 w-4" />Buscar</Button></form>
            {traceQueryResult.isFetching && <div className="p-4 text-sm text-slate-500">Buscando historial…</div>}
            {traceQuery && traceQueryResult.data?.rows.length === 0 && !traceQueryResult.isFetching && <div className="px-4 pb-4 text-sm text-slate-500">No se encontraron conteos o lotes para “{traceQuery}”.</div>}
            {traceQueryResult.data?.rows && traceQueryResult.data.rows.length > 0 && <div className="max-h-[330px] overflow-auto"><table className="w-full min-w-[650px] text-xs"><thead className="sticky top-0 bg-slate-100 text-left text-slate-600"><tr><th className="p-2">Fecha / almacén</th><th className="p-2">Producto / lote</th><th className="p-2 text-right">Físico</th><th className="p-2 text-right">Saldo NOW</th><th className="p-2">Ubicación</th><th className="p-2">Etiqueta</th></tr></thead><tbody>{traceQueryResult.data.rows.map((row, i) => <tr key={`${row.recordId}-${row.lot ?? i}`} className="border-t"><td className="p-2">{dateFmt(row.recordDate)} · {row.warehouse}</td><td className="max-w-[220px] p-2"><b className="font-mono">{row.code}</b><div className="truncate" title={row.description}>{row.description}</div><span className="text-slate-500">Lote {row.lot || "—"} {row.weight ? `· ${row.weight}` : ""}</span></td><td className="p-2 text-right">{row.physicalCount == null ? "—" : `${fmt(row.physicalCount)} ${row.unit}`}</td><td className="p-2 text-right">{row.currentBalance == null ? "—" : `${fmt(row.currentBalance)} ${row.unit}`}</td><td className="p-2">{row.location || "—"}</td><td className="p-2">{row.missingLabel ? <span className="text-red-700">Falta</span> : "Sí"}</td></tr>)}</tbody></table></div>}
            <div className="flex flex-wrap gap-2 border-t p-3"><Button asChild variant="outline" size="sm"><Link href="/scanner"><Barcode className="mr-1.5 h-4 w-4" />Abrir escáner</Link></Button><span className="self-center text-xs text-slate-500">La búsqueda incluye lotes registrados en las cajas del conteo.</span></div>
          </section>
        </div>
      </>}
    </main>
  </AppLayout>;
}

function Metric({ label, value, href, tone }: { label: string; value: number; href: string; tone: "violet" | "amber" | "red" }) {
  const colors = { violet: "text-violet-700 bg-violet-50", amber: "text-amber-700 bg-amber-50", red: "text-red-700 bg-red-50" }[tone];
  return <Link href={href} className={`rounded-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow ${colors}`}><div className="text-xs font-medium">{label}</div><div className="mt-2 text-3xl font-bold">{value}</div></Link>;
}
