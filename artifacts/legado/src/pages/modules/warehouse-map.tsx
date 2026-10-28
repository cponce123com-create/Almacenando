import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Boxes, FlaskConical, MapPin, Move, PackageSearch, Pencil,
  Plus, Search, Scale, Trash2, Warehouse, X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type MapSection = "colorantes" | "auxiliares" | "reference";
interface Balance {
  id: string; warehouse: string; code: string; productDescription: string;
  unit: string; quantity: string | number; locationSummary: string | null;
  zoneSummary: string | null; ultimoConsumo: string | null;
}
interface Location {
  id: string; warehouse: string; zone: string | null; rack: string | null;
  shelf: string | null; position: string | null; barcode: string | null;
  type: string; parentLocationId: string | null; mapSection: MapSection | null;
  mapLabel: string | null; mapX: number | null; mapY: number | null;
  mapWidth: number | null; mapHeight: number | null;
}
interface InventoryCount {
  id: string; productId: string; productCode: string; productName: string;
  unit: string; physicalCount: string | number; recordDate: string;
  location: string | null; locationId: string | null;
}
interface Layout { x: number; y: number; width: number; height: number }
interface DragState { id: string; mode: "move" | "resize"; startX: number; startY: number; initial: Layout; current: Layout }
interface MapArea extends Layout {
  id: string; label: string; section: MapSection; rack: string | null;
  zone: string | null; kind: "storage" | "reference"; locationId: string;
  description?: string;
}

const normalize = (value: string | null | undefined) => (value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? "No se pudo completar la operación.");
  }
  return response.json() as Promise<T>;
}

function productArea(balance: Balance, locations: Location[]): string | null {
  const locationsById = new Map(locations.map(location => [location.id, location]));
  const resolveArea = (location: Location): string | null => {
    let current: Location | undefined = location;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.mapSection) return current.id;
      current = current.parentLocationId ? locationsById.get(current.parentLocationId) : undefined;
    }
    return null;
  };

  const locCode = normalize(balance.locationSummary);
  if (!locCode) return null;
  // NOW's location code should identify the physical position; follow its
  // complete parent chain to the block shown on the map.
  const exactMatches = locations.filter(location =>
    [location.barcode, location.position].map(normalize).filter(Boolean).includes(locCode));
  const areaIds = [...new Set(exactMatches.map(resolveArea).filter((id): id is string => Boolean(id)))];
  if (areaIds.length === 1) return areaIds[0]!;
  if (areaIds.length > 1) {
    const zoneCode = normalize(balance.zoneSummary);
    const narrowed = exactMatches.filter(location => normalize(location.zone) === zoneCode)
      .map(resolveArea).filter((id): id is string => Boolean(id));
    const narrowedIds = [...new Set(narrowed)];
    return narrowedIds.length === 1 ? narrowedIds[0]! : null;
  }

  // Some NOW records carry a rack/shelf code instead of a position code.
  const structuralMatches = locations.filter(location =>
    [location.shelf, location.rack, location.zone].map(normalize).filter(Boolean).includes(locCode));
  const structuralAreaIds = [...new Set(structuralMatches.map(resolveArea).filter((id): id is string => Boolean(id)))];
  return structuralAreaIds.length === 1 ? structuralAreaIds[0]! : null;
}

const qty = (value: string | number) => {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(number) : String(value);
};

export default function MapaDelAlmacenPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const planeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [section, setSection] = useState<"colorantes" | "auxiliares">("colorantes");
  const [search, setSearch] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedBalanceId, setSelectedBalanceId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Layout>>({});
  const [newZoneName, setNewZoneName] = useState("");
  const [showNewZone, setShowNewZone] = useState(false);
  const [confirmRemoveArea, setConfirmRemoveArea] = useState(false);
  const [editingAreaLabel, setEditingAreaLabel] = useState(false);
  const [areaLabelDraft, setAreaLabelDraft] = useState("");
  const warehouse = "Q1";
  const canEdit = user?.role === "admin" || user?.role === "supervisor";

  const { data: balances = [], isLoading: balancesLoading, isError: balancesError } = useQuery<Balance[]>({
    queryKey: ["/api/balances/latest", warehouse],
    queryFn: () => api(`/api/balances/latest?warehouse=${warehouse}`),
  });
  const { data: locationsResponse, isLoading: locationsLoading } = useQuery<{ data: Location[] }>({
    queryKey: ["/api/locations", warehouse],
    queryFn: async () => {
      const first = await api(`/api/locations?warehouse=${warehouse}&limit=500`) as { data?: Location[]; total?: number };
      const data = [...(first.data ?? [])];
      const total = Number(first.total ?? data.length);
      for (let page = 2; data.length < total; page++) {
        const next = await api(`/api/locations?warehouse=${warehouse}&limit=500&page=${page}`) as { data?: Location[] };
        if (!next.data?.length) break;
        data.push(...next.data);
      }
      return { data };
    },
  });
  const { data: selectedAreaCounts = [], isLoading: areaCountsLoading, isError: areaCountsError } = useQuery<InventoryCount[]>({
    queryKey: ["/api/locations", selectedAreaId, "inventory-counts"],
    queryFn: () => api(`/api/locations/${selectedAreaId}/inventory-counts`).then((response: any) => response.data ?? []),
    enabled: Boolean(selectedAreaId),
  });
  const locations = locationsResponse?.data ?? [];
  const areas: MapArea[] = locations.filter((loc) => loc.mapSection === section
    && loc.mapX != null && loc.mapY != null && loc.mapWidth != null && loc.mapHeight != null)
    .map((loc) => ({
      id: loc.id,
      locationId: loc.id,
      label: loc.mapLabel || loc.rack || loc.zone || loc.shelf || "Zona",
      section,
      rack: loc.rack,
      zone: loc.zone,
      kind: loc.zone === "REFERENCIAS" ? "reference" : "storage",
      x: Number(loc.mapX), y: Number(loc.mapY),
      width: Number(loc.mapWidth), height: Number(loc.mapHeight),
      description: loc.type === "rack" ? "Rack" : loc.type === "zone" ? "Zona" : "Ubicación",
    }));

  useEffect(() => {
    setDrafts(Object.fromEntries(areas.map((area) => [area.id, {
      x: area.x, y: area.y, width: area.width, height: area.height,
    }])));
  // Refresh the local editor after the locations query is updated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsResponse, section]);

  const matchedBalances = useMemo(() => balances.map((balance) => ({
    ...balance, mapAreaId: productArea(balance, locations),
  })), [balances, locations]);
  const searchTerm = normalize(search);
  const searchResults = useMemo(() => searchTerm.length < 2 ? [] : matchedBalances
    .filter((balance) => normalize(`${balance.code} ${balance.productDescription}`).includes(searchTerm))
    .slice(0, 10), [matchedBalances, searchTerm]);
  const selectedBalance = matchedBalances.find((balance) => balance.id === selectedBalanceId) ?? null;
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedLayout = selectedArea ? drafts[selectedArea.id] ?? selectedArea : null;
  const areaBalances = selectedArea ? matchedBalances.filter((balance) => balance.mapAreaId === selectedArea.id) : [];
  const unlinked = matchedBalances.filter((balance) => (balance.locationSummary || balance.zoneSummary) && !balance.mapAreaId).length;

  const saveLayout = useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: Layout }) => api(`/api/locations/${id}/map-layout`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapX: layout.x, mapY: layout.y, mapWidth: layout.width, mapHeight: layout.height }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/locations", warehouse] }),
    onError: (error: Error) => toast({ title: "No se guardó el plano", description: error.message, variant: "destructive" }),
  });
  const createZone = useMutation({
    mutationFn: () => {
      const label = newZoneName.trim();
      if (!label) throw new Error("Escribe el nombre de la zona.");
      return api("/api/locations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse, zone: label, shelf: label, type: "zone", mapSection: section,
          mapLabel: label, mapX: 8, mapY: 8, mapWidth: 22, mapHeight: 12,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", warehouse] });
      setNewZoneName(""); setShowNewZone(false);
      toast({ title: "Zona creada", description: "Ya puedes moverla y cambiar su tamaño en el plano." });
    },
    onError: (error: Error) => toast({ title: "No se creó la zona", description: error.message, variant: "destructive" }),
  });
  const removeArea = useMutation({
    mutationFn: (id: string) => api(`/api/locations/${id}/map-layout`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", warehouse] });
      setSelectedAreaId(null);
      setConfirmRemoveArea(false);
      toast({ title: "Elemento quitado del plano", description: "Se conservaron la ubicación física y sus productos vinculados." });
    },
    onError: (error: Error) => toast({ title: "No se pudo quitar del plano", description: error.message, variant: "destructive" }),
  });
  const updateAreaLabel = useMutation({
    mutationFn: ({ id, label, layout }: { id: string; label: string; layout: Layout }) => api(`/api/locations/${id}/map-layout`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapX: layout.x, mapY: layout.y, mapWidth: layout.width, mapHeight: layout.height, mapLabel: label }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", warehouse] });
      setEditingAreaLabel(false);
      toast({ title: "Descripción actualizada", description: "Se cambió el texto que aparece en el plano." });
    },
    onError: (error: Error) => toast({ title: "No se pudo cambiar la descripción", description: error.message, variant: "destructive" }),
  });
  const associateCode = useMutation({
    mutationFn: () => {
      if (!selectedBalance?.locationSummary || !selectedArea || selectedArea.kind === "reference") throw new Error("Selecciona un producto y una zona de almacenamiento.");
      return api("/api/locations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse, zone: selectedArea.zone ?? selectedArea.label, rack: selectedArea.rack ?? undefined,
          position: selectedBalance.locationSummary, barcode: selectedBalance.locationSummary,
          type: "position", parentLocationId: selectedArea.locationId,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", warehouse] });
      toast({ title: "Código de NOW vinculado", description: `Ubicación asociada a ${selectedArea?.label}.` });
    },
    onError: (error: Error) => toast({ title: "No se pudo vincular", description: error.message, variant: "destructive" }),
  });

  const selectProduct = (balance: typeof matchedBalances[number]) => {
    setSelectedBalanceId(balance.id);
    setSelectedAreaId(balance.mapAreaId);
    const areaLocation = locations.find((item) => item.id === balance.mapAreaId);
    if (areaLocation?.mapSection === "auxiliares") setSection("auxiliares");
    else if (areaLocation?.mapSection === "colorantes") setSection("colorantes");
  };

  const startDrag = (event: PointerEvent<HTMLElement>, area: MapArea, mode: DragState["mode"]) => {
    if (!editing || !canEdit || !planeRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const layout = drafts[area.id] ?? area;
    dragRef.current = { id: area.id, mode, startX: event.clientX, startY: event.clientY, initial: layout, current: layout };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; const rect = planeRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = (event.clientX - drag.startX) / rect.width * 100;
    const dy = (event.clientY - drag.startY) / rect.height * 100;
    const next = drag.mode === "move"
      ? { ...drag.initial, x: Math.max(0, Math.min(100 - drag.initial.width, drag.initial.x + dx)), y: Math.max(0, Math.min(100 - drag.initial.height, drag.initial.y + dy)) }
      : { ...drag.initial, width: Math.max(6, Math.min(100 - drag.initial.x, drag.initial.width + dx)), height: Math.max(6, Math.min(100 - drag.initial.y, drag.initial.height + dy)) };
    drag.current = next; setDrafts((current) => ({ ...current, [drag.id]: next }));
  };
  const endDrag = () => {
    const drag = dragRef.current; if (!drag) return;
    dragRef.current = null;
    if (JSON.stringify(drag.initial) !== JSON.stringify(drag.current)) saveLayout.mutate({ id: drag.id, layout: drag.current });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-teal-700"><MapPin className="h-6 w-6" /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Mapa del Almacén</h1><p className="text-sm text-slate-500">Busca químicos y organiza el plano de Q1</p></div>
          </div>
          <Badge variant="outline" className="gap-1.5 bg-white px-3 py-1.5 text-slate-600"><Warehouse className="h-3.5 w-3.5" /> Almacén Q1</Badge>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="warehouse-product-search" className="mb-2 block text-sm font-semibold text-slate-800">Buscar producto por código o descripción</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input id="warehouse-product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej.: 0101-0001 o almidón modificado" className="h-11 pl-9" autoComplete="off" />
            {searchResults.length > 0 && <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {searchResults.map((balance) => <button type="button" key={balance.id} onClick={() => selectProduct(balance)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-teal-50">
                <span className="min-w-0"><span className="block font-mono text-xs font-bold text-slate-700">{balance.code}</span><span className="block truncate text-sm text-slate-900">{balance.productDescription}</span></span>
                <span className="shrink-0 text-right"><span className="block text-sm font-semibold text-slate-800">{qty(balance.quantity)} {balance.unit}</span><span className="block max-w-48 truncate text-xs text-slate-500">{balance.locationSummary || "Sin ubicación NOW"}</span></span>
              </button>)}
            </div>}
          </div>
          {searchTerm.length >= 2 && !balancesLoading && searchResults.length === 0 && <p className="mt-2 text-sm text-slate-500">No se encontraron productos.</p>}
          {selectedBalance && <div className={`mt-3 rounded-lg border p-3 ${selectedBalance.mapAreaId ? "border-teal-200 bg-teal-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /><div className="min-w-0 text-sm">
              <p className="font-semibold text-slate-900">{selectedBalance.code} · {selectedBalance.productDescription}</p>
              <p className="mt-1 text-slate-700">NOW: <b>{selectedBalance.locationSummary || "Sin ubicación"}</b>{selectedBalance.zoneSummary ? ` · ${selectedBalance.zoneSummary}` : ""} <span className="mx-2 text-slate-400">|</span> Saldo: <b>{qty(selectedBalance.quantity)} {selectedBalance.unit}</b></p>
              <p className="mt-1 text-xs text-slate-600">{selectedBalance.mapAreaId ? "Zona resaltada en el plano." : "Selecciona la zona correcta en el plano para vincular este código NOW."}</p>
              {canEdit && selectedBalance.locationSummary && !selectedBalance.mapAreaId && selectedArea?.kind === "storage" && <Button className="mt-3 h-9" size="sm" onClick={() => associateCode.mutate()} disabled={associateCode.isPending}>{associateCode.isPending ? "Vinculando..." : `Vincular ${selectedBalance.locationSummary} a ${selectedArea.label}`}</Button>}
            </div></div>
          </div>}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" role="tablist" aria-label="Sectores del almacén Q1">
            <button type="button" role="tab" aria-selected={section === "colorantes"} onClick={() => { setSection("colorantes"); setSelectedAreaId(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section === "colorantes" ? "bg-violet-700 text-white" : "border bg-white text-slate-700"}`}><FlaskConical className="mr-2 inline h-4 w-4" />Colorantes</button>
            <button type="button" role="tab" aria-selected={section === "auxiliares"} onClick={() => { setSection("auxiliares"); setSelectedAreaId(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section === "auxiliares" ? "bg-teal-700 text-white" : "border bg-white text-slate-700"}`}><Boxes className="mr-2 inline h-4 w-4" />Auxiliares</button>
          </div>
          {canEdit && <div className="flex gap-2">
            <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => { setEditing(!editing); setShowNewZone(false); }} className="gap-2"><Pencil className="h-4 w-4" />{editing ? "Terminar edición" : "Editar plano"}</Button>
            {editing && <Button size="sm" variant="outline" onClick={() => setShowNewZone(true)} className="gap-2"><Plus className="h-4 w-4" />Nueva zona</Button>}
            {selectedArea?.kind === "storage" && <Button size="sm" variant="destructive" onClick={() => setConfirmRemoveArea(true)} disabled={removeArea.isPending} className="gap-2"><Trash2 className="h-4 w-4" />Quitar selección</Button>}
          </div>}
        </div>

        {editing && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><Move className="mr-2 inline h-4 w-4" />Arrastra los bloques para moverlos y la esquina marcada para cambiar su tamaño. Los cambios se guardan automáticamente.</div>}
        {showNewZone && <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); createZone.mutate(); }}>
          <label className="min-w-56 flex-1 text-sm font-medium text-slate-700">Nombre de la nueva zona<Input className="mt-1" autoFocus value={newZoneName} onChange={(event) => setNewZoneName(event.target.value)} placeholder="Ej.: Auxiliares E" maxLength={120} /></label>
          <Button type="submit" disabled={createZone.isPending}>{createZone.isPending ? "Creando..." : "Crear zona"}</Button><Button type="button" variant="ghost" onClick={() => setShowNewZone(false)}><X className="h-4 w-4" /></Button>
        </form>}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><h2 className="font-bold text-slate-800">Plano · {section === "colorantes" ? "Colorantes" : "Auxiliares"} Q1</h2><p className="text-xs text-slate-500">Según tu croquis; no está a escala.</p></div><span className="text-xs text-slate-500">{areas.length} bloques</span></div>
          <div className="overflow-auto p-3 sm:p-5">
            <div ref={planeRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="relative aspect-[16/10] min-h-[480px] min-w-[680px] overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 bg-[linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px)] bg-[size:24px_24px]">
              {areas.map((area) => {
                const layout = drafts[area.id] ?? area;
                const active = selectedAreaId === area.id;
                const isStorage = area.kind === "storage";
                const count = matchedBalances.filter((row) => row.mapAreaId === area.id).length;
                return <button key={area.id} type="button" onClick={() => { setSelectedAreaId(area.id); if (area.section === "auxiliares" || area.section === "colorantes") setSelectedBalanceId((id) => id); }} onPointerDown={(event) => startDrag(event, area, "move")} aria-pressed={active} title={editing ? "Arrastra para mover" : `Abrir ${area.label}`} className={`absolute flex min-h-8 flex-col items-center justify-center overflow-hidden rounded-xl border-2 px-2 py-1.5 text-center transition-colors ${isStorage ? "font-semibold" : "border-slate-300 bg-white/95 text-slate-600"} ${active ? "border-teal-700 bg-teal-100 text-teal-950 shadow-md" : isStorage ? "border-teal-300 bg-teal-50 text-teal-950 hover:border-teal-600" : "hover:border-slate-500"} ${editing ? "cursor-move touch-none ring-1 ring-amber-300" : "cursor-pointer"}`} style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%` }}>
                  <span className="max-w-full truncate text-[11px] sm:text-sm">{area.label}</span>{area.description && <span className="text-[10px] opacity-70">{area.description}</span>}{isStorage && count > 0 && <span className="mt-0.5 text-[10px]">{count} productos</span>}
                  {editing && <span onPointerDown={(event) => startDrag(event, area, "resize")} className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize touch-none items-center justify-center rounded-tl-md bg-teal-700 text-[9px] text-white" aria-label="Cambiar tamaño"><Scale className="h-3 w-3" /></span>}
                </button>;
              })}
              {areas.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">No hay áreas en este sector.</div>}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-bold text-slate-800">{selectedArea?.label ?? "Detalle del plano"}</h2>
            {selectedArea ? <><p className="mt-1 text-xs text-slate-500">{selectedArea.description} · {selectedArea.zone || "Sin zona asignada"}{selectedArea.rack ? ` · ${selectedArea.rack}` : ""}</p>
              {canEdit && selectedArea.kind === "storage" && (editingAreaLabel ? <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-56 flex-1 text-sm font-medium text-slate-700">Descripción visible en el plano<Input className="mt-1" value={areaLabelDraft} onChange={(event) => setAreaLabelDraft(event.target.value)} maxLength={120} autoFocus /></label>
                <Button size="sm" onClick={() => updateAreaLabel.mutate({ id: selectedArea.locationId, label: areaLabelDraft.trim(), layout: drafts[selectedArea.id] ?? selectedArea })} disabled={updateAreaLabel.isPending || !areaLabelDraft.trim()}>{updateAreaLabel.isPending ? "Guardando..." : "Guardar"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingAreaLabel(false)} disabled={updateAreaLabel.isPending}>Cancelar</Button>
              </div> : <Button className="mt-3" size="sm" variant="outline" onClick={() => { setAreaLabelDraft(selectedArea.label); setEditingAreaLabel(true); }}>Cambiar descripción</Button>)}
              {areaBalances.length > 0 && <div className="mt-3 max-h-64 overflow-y-auto divide-y rounded-lg border border-slate-100 px-3"><p className="sticky top-0 bg-white py-2 text-xs font-medium text-slate-500">{areaBalances.length} saldos NOW en esta zona</p>{areaBalances.map((balance) => <div key={balance.id} className="flex justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{balance.productDescription}</p><p className="font-mono text-xs text-slate-500">{balance.code} · {balance.locationSummary}</p></div><b className="shrink-0 text-sm">{qty(balance.quantity)} {balance.unit}</b></div>)}</div>}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="text-sm font-semibold text-slate-800">Conteos registrados en esta zona</h3>
                {areaCountsLoading ? <p className="mt-2 text-xs text-slate-500">Buscando productos contados…</p>
                  : areaCountsError ? <p className="mt-2 rounded bg-red-50 p-3 text-xs text-red-700">No se pudieron consultar los conteos de esta zona.</p>
                  : selectedAreaCounts.length > 0 ? <div className="mt-2 max-h-64 overflow-y-auto divide-y rounded-lg border border-slate-100 px-3"><p className="sticky top-0 bg-white py-2 text-xs font-medium text-slate-500">{selectedAreaCounts.length} productos contados en esta zona</p>{selectedAreaCounts.map((record) => <div key={record.id} className="flex justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{record.productName}</p><p className="font-mono text-xs text-slate-500">{record.productCode} · {record.location || selectedArea.label} · Conteo {record.recordDate}</p></div><b className="shrink-0 text-sm">{qty(record.physicalCount)} {record.unit}</b></div>)}</div>
                  : areaBalances.length === 0 ? <p className="mt-2 rounded bg-slate-50 p-3 text-sm text-slate-500">No hay productos asociados a esta zona. Al registrar un conteo, selecciona esta zona o una de sus ubicaciones para que aparezca aquí.</p>
                    : <p className="mt-2 text-xs text-slate-500">Todavía no hay conteos vinculados a esta zona.</p>}
              </div>
            </> : <p className="mt-2 text-sm text-slate-600">Elige un bloque del plano para ver su detalle. {section === "colorantes" ? "Los cinco racks tienen cuatro niveles." : "Auxiliares A tiene tres niveles y nueve ubicaciones por nivel."}</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-slate-800"><PackageSearch className="h-4 w-4 text-teal-700" />Estado de datos</h2>
            {balancesLoading || locationsLoading ? <p className="mt-3 text-sm text-slate-500">Cargando saldos y plano...</p> : balancesError ? <p className="mt-3 text-sm text-red-700">No se pudo leer el saldo reciente.</p> : <div className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2.5"><span>Productos con saldo Q1</span><b>{balances.length}</b></div><div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2.5 text-amber-900"><span>Ubicaciones NOW sin asociar</span><b>{unlinked}</b></div>
              <p className="text-xs text-slate-500">El plano resalta un área solo cuando el código NOW está asociado a una zona o rack.</p>
            </div>}
          </section>
        </div>
      </div>
      <AlertDialog open={confirmRemoveArea} onOpenChange={(open) => !open && !removeArea.isPending && setConfirmRemoveArea(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar “{selectedArea?.label}” del plano?</AlertDialogTitle>
            <AlertDialogDescription>
              El bloque dejará de aparecer en este plano, incluso si aún no tiene productos vinculados. Se conservarán la ubicación física y los registros de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeArea.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeArea.isPending || !selectedArea}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(event) => { event.preventDefault(); if (selectedArea) removeArea.mutate(selectedArea.locationId); }}
            >
              {removeArea.isPending ? "Quitando..." : "Quitar del plano"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
