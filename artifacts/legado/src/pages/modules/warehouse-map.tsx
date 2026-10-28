import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  FlaskConical,
  MapPin,
  PackageSearch,
  Search,
  Scale,
  Warehouse,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Balance {
  id: string;
  warehouse: string;
  code: string;
  productDescription: string;
  unit: string;
  quantity: string | number;
  locationSummary: string | null;
  zoneSummary: string | null;
  ultimoConsumo: string | null;
}

interface Location {
  id: string;
  warehouse: string;
  zone: string | null;
  rack: string | null;
  shelf: string | null;
  position: string | null;
  barcode: string | null;
  type: string;
}

interface MapArea {
  id: string;
  label: string;
  section: "colorantes" | "auxiliares" | "reference";
  rack?: string;
  zone?: string;
  kind: "rack" | "landmark";
  className: string;
  subtitle?: string;
}

const COLORANT_AREAS: MapArea[] = [
  { id: "rack-5", label: "RACK 5", section: "colorantes", rack: "RACK 5", kind: "rack", className: "col-start-3 col-span-7 row-start-1", subtitle: "4 niveles" },
  { id: "rack-4", label: "RACK 4", section: "colorantes", rack: "RACK 4", kind: "rack", className: "col-start-11 col-span-2 row-start-2 row-span-3 [writing-mode:vertical-rl]", subtitle: "4 niveles" },
  { id: "lockers", label: "Casilleros personal", section: "colorantes", kind: "landmark", className: "col-start-1 col-span-2 row-start-2", subtitle: "Referencia" },
  { id: "scale-colorants", label: "Balanza", section: "reference", kind: "landmark", className: "col-start-1 col-span-2 row-start-4", subtitle: "Referencia" },
  { id: "rack-1", label: "RACK 1", section: "colorantes", rack: "RACK 1", kind: "rack", className: "col-start-1 col-span-3 row-start-6", subtitle: "4 niveles" },
  { id: "rack-2", label: "RACK 2", section: "colorantes", rack: "RACK 2", kind: "rack", className: "col-start-4 col-span-3 row-start-6", subtitle: "4 niveles" },
  { id: "rack-3", label: "RACK 3", section: "colorantes", rack: "RACK 3", kind: "rack", className: "col-start-7 col-span-3 row-start-6", subtitle: "4 niveles" },
];

const AUXILIARY_AREAS: MapArea[] = [
  { id: "rack-a", label: "AUXILIARES · A", section: "auxiliares", rack: "RACK 1", zone: "AUXILIARES A", kind: "rack", className: "col-start-3 col-span-7 row-start-1", subtitle: "Niveles A, B y C · 9 ubicaciones por nivel" },
  { id: "immobilized", label: "Inmovilizados", section: "reference", kind: "landmark", className: "col-start-1 col-span-2 row-start-1", subtitle: "Referencia" },
  { id: "rack-b", label: "AUXILIARES · B", section: "auxiliares", zone: "AUXILIARES B", kind: "rack", className: "col-start-1 col-span-6 row-start-3", subtitle: "Un nivel" },
  { id: "rack-c", label: "AUXILIARES · C", section: "auxiliares", zone: "AUXILIARES C", kind: "rack", className: "col-start-1 col-span-6 row-start-4", subtitle: "Un nivel" },
  { id: "rack-d", label: "AUXILIARES · D", section: "auxiliares", zone: "AUXILIARES D", kind: "rack", className: "col-start-1 col-span-6 row-start-6", subtitle: "Un nivel" },
  { id: "oxygen", label: "Agua oxigenada", section: "reference", kind: "landmark", className: "col-start-8 col-span-2 row-start-2", subtitle: "Referencia" },
  { id: "blends-2", label: "Blends 2", section: "reference", kind: "landmark", className: "col-start-10 col-span-2 row-start-2", subtitle: "Referencia" },
  { id: "work-table", label: "Mesa de trabajo", section: "reference", kind: "landmark", className: "col-start-8 col-span-3 row-start-3", subtitle: "Referencia" },
  { id: "scale-1", label: "Balanza 1", section: "reference", kind: "landmark", className: "col-start-8 col-span-2 row-start-4", subtitle: "Referencia" },
  { id: "blends-1", label: "Blends 1", section: "reference", kind: "landmark", className: "col-start-10 col-span-2 row-start-4", subtitle: "Referencia" },
  { id: "caustic-soda", label: "Soda cáustica", section: "reference", kind: "landmark", className: "col-start-8 col-span-3 row-start-6", subtitle: "Referencia" },
];

const normalize = (value: string | null | undefined) => (value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("es");

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? "No se pudieron cargar los datos del mapa.");
  }
  return response.json() as Promise<T>;
};

function productArea(balance: Balance, locations: Location[]): string | null {
  const locationCode = normalize(balance.locationSummary);
  const zoneCode = normalize(balance.zoneSummary);
  if (!locationCode && !zoneCode) return null;

  const match = locations.find((location) => {
    const fields = [location.barcode, location.position, location.shelf, location.rack, location.zone]
      .map(normalize)
      .filter(Boolean);
    return fields.some((field) => field === locationCode || field === zoneCode);
  });
  if (!match) return null;
  if (match.zone === "COLORANTES" && match.rack) return `rack-${match.rack.replace(/\D/g, "")}`;
  if (match.zone?.startsWith("AUXILIARES") && match.zone.endsWith(" A")) return "rack-a";
  if (match.zone?.startsWith("AUXILIARES") && match.zone.endsWith(" B")) return "rack-b";
  if (match.zone?.startsWith("AUXILIARES") && match.zone.endsWith(" C")) return "rack-c";
  if (match.zone?.startsWith("AUXILIARES") && match.zone.endsWith(" D")) return "rack-d";
  return null;
}

const formatQuantity = (quantity: string | number) => {
  const value = Number(quantity);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(value)
    : String(quantity);
};

export default function MapaDelAlmacenPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<"colorantes" | "auxiliares">("colorantes");
  const [search, setSearch] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedBalanceId, setSelectedBalanceId] = useState<string | null>(null);

  const currentWarehouse = "Q1";
  const { data: balances = [], isLoading: balancesLoading, isError: balancesError } = useQuery<Balance[]>({
    queryKey: ["/api/balances/latest", currentWarehouse],
    queryFn: () => api(`/api/balances/latest?warehouse=${encodeURIComponent(currentWarehouse)}`),
  });
  const { data: locationsResult, isLoading: locationsLoading } = useQuery<{ data: Location[] }>({
    queryKey: ["/api/locations", currentWarehouse],
    queryFn: () => api(`/api/locations?warehouse=${encodeURIComponent(currentWarehouse)}&limit=500`),
  });
  const locations = locationsResult?.data ?? [];

  const areas = section === "colorantes" ? COLORANT_AREAS : AUXILIARY_AREAS;
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? null;
  const matchedBalances = useMemo(() => balances.map((balance) => ({
    ...balance,
    mapAreaId: productArea(balance, locations),
  })), [balances, locations]);
  const normalizedSearch = normalize(search);
  const searchResults = useMemo(() => {
    if (normalizedSearch.length < 2) return [];
    return matchedBalances
      .filter((balance) => normalize(`${balance.code} ${balance.productDescription}`).includes(normalizedSearch))
      .slice(0, 8);
  }, [matchedBalances, normalizedSearch]);
  const selectedBalance = matchedBalances.find((balance) => balance.id === selectedBalanceId) ?? null;
  const areaBalances = selectedArea
    ? matchedBalances.filter((balance) => balance.mapAreaId === selectedArea.id)
    : [];
  const unlinkedCount = matchedBalances.filter((balance) =>
    (balance.locationSummary || balance.zoneSummary) && !balance.mapAreaId,
  ).length;
  const canManageLocations = user?.role === "admin" || user?.role === "supervisor";
  const existingLocationCode = selectedBalance?.locationSummary
    ? locations.some((location) => normalize(location.barcode) === normalize(selectedBalance.locationSummary)
      || normalize(location.position) === normalize(selectedBalance.locationSummary))
    : false;
  const associationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBalance?.locationSummary || !selectedArea || selectedArea.kind !== "rack") throw new Error("Selecciona un producto y un rack o zona.");
      const zone = selectedArea.zone ?? "COLORANTES";
      const parent = locations.find((location) => location.type === (selectedArea.rack ? "rack" : "zone")
        && location.zone === zone
        && (!selectedArea.rack || location.rack === selectedArea.rack));
      return api("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: "Q1",
          zone,
          rack: selectedArea.rack,
          position: selectedBalance.locationSummary,
          barcode: selectedBalance.locationSummary,
          type: "position",
          parentLocationId: parent?.id,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", "Q1"] });
      toast({ title: "Ubicación asociada", description: "El código de NOW quedó vinculado al rack del plano." });
    },
    onError: (error: Error) => toast({ title: "No se pudo asociar", description: error.message, variant: "destructive" }),
  });

  const selectProduct = (balance: typeof matchedBalances[number]) => {
    setSelectedBalanceId(balance.id);
    setSelectedAreaId(balance.mapAreaId);
    if (balance.mapAreaId?.startsWith("rack-a") || balance.mapAreaId?.startsWith("rack-b") || balance.mapAreaId?.startsWith("rack-c") || balance.mapAreaId?.startsWith("rack-d")) {
      setSection("auxiliares");
    } else if (balance.mapAreaId?.startsWith("rack-")) {
      setSection("colorantes");
    }
  };

  const renderArea = (area: MapArea) => {
    const active = area.id === selectedAreaId;
    const isRack = area.kind === "rack";
    const count = matchedBalances.filter((balance) => balance.mapAreaId === area.id).length;
    return (
      <button
        key={area.id}
        type="button"
        onClick={() => {
          setSelectedAreaId(isRack ? area.id : null);
          if (!selectedBalance) setSelectedBalanceId(null);
        }}
        aria-label={isRack ? `${area.label}: ver detalle${count ? `, ${count} productos asociados` : ""}` : area.label}
        aria-pressed={active}
        className={`${area.className} flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
          isRack
            ? active
              ? "border-teal-700 bg-teal-100 text-teal-950 shadow-md"
              : "border-teal-300 bg-teal-50 text-teal-950 hover:border-teal-600 hover:bg-teal-100"
            : "border-slate-300 bg-white/90 text-slate-600 hover:border-slate-500"
        }`}
      >
        <span className="text-xs font-bold leading-tight sm:text-sm">{area.label}</span>
        {area.subtitle && <span className="mt-1 text-[10px] leading-tight opacity-75 sm:text-xs">{area.subtitle}</span>}
        {isRack && count > 0 && <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-teal-800">{count} producto{count === 1 ? "" : "s"} asociados</span>}
      </button>
    );
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Mapa del Almacén</h1>
              <p className="text-sm text-slate-500">Busca un químico y encuentra su zona, rack y ubicación registrada</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5 bg-white px-3 py-1.5 text-slate-600">
            <Warehouse className="h-3.5 w-3.5" />
            Almacén {currentWarehouse}
          </Badge>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="warehouse-product-search" className="mb-2 block text-sm font-semibold text-slate-800">
            Buscar producto por código o descripción
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="warehouse-product-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej.: 0101-0001 o almidón modificado"
              className="h-11 pl-9"
              autoComplete="off"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                {searchResults.map((balance) => (
                  <button
                    type="button"
                    key={balance.id}
                    onClick={() => selectProduct(balance)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-teal-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-bold text-slate-700">{balance.code}</span>
                      <span className="block truncate text-sm text-slate-900">{balance.productDescription}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-slate-800">{formatQuantity(balance.quantity)} {balance.unit}</span>
                      <span className="block max-w-48 truncate text-xs text-slate-500">{balance.locationSummary || "Ubicación NOW sin dato"}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {normalizedSearch.length >= 2 && !balancesLoading && searchResults.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">No se encontraron productos con ese código o descripción en el saldo más reciente.</p>
          )}
          {selectedBalance && (
            <div className={`mt-3 rounded-lg border p-3 ${selectedBalance.mapAreaId ? "border-teal-200 bg-teal-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start gap-2">
                {selectedBalance.mapAreaId ? <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">{selectedBalance.code} · {selectedBalance.productDescription}</p>
                  <p className="mt-1 text-slate-700">
                    NOW: <b>{selectedBalance.locationSummary || "sin ubicación"}</b>
                    {selectedBalance.zoneSummary ? ` · ${selectedBalance.zoneSummary}` : ""}
                    <span className="mx-2 text-slate-400">|</span>
                    Saldo: <b>{formatQuantity(selectedBalance.quantity)} {selectedBalance.unit}</b>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {selectedBalance.mapAreaId
                      ? "Área resaltada en el plano según la ubicación asociada."
                      : "La ubicación NOW todavía no está asociada a un rack del plano; se muestra el código real para evitar señalar un lugar incorrecto."}
                  </p>
                  {canManageLocations && selectedBalance.locationSummary && !selectedBalance.mapAreaId && selectedArea?.kind === "rack" && (
                    existingLocationCode ? (
                      <p className="mt-2 text-xs font-medium text-amber-800">Este código ya está registrado; revisa su rack en Ubicaciones.</p>
                    ) : (
                      <Button className="mt-3 h-9" size="sm" onClick={() => associationMutation.mutate()} disabled={associationMutation.isPending || locationsLoading}>
                        {associationMutation.isPending ? "Asociando..." : `Vincular ${selectedBalance.locationSummary} a ${selectedArea.label}`}
                      </Button>
                    )
                  )}
                  {canManageLocations && selectedBalance.locationSummary && !selectedBalance.mapAreaId && !selectedArea && (
                    <p className="mt-2 text-xs font-medium text-teal-800">Toca el rack correcto en el plano para asociar este código NOW.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sectores del almacén Q1">
          <button type="button" role="tab" aria-selected={section === "colorantes"} onClick={() => { setSection("colorantes"); setSelectedAreaId(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section === "colorantes" ? "bg-violet-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <FlaskConical className="mr-2 inline h-4 w-4" />Colorantes
          </button>
          <button type="button" role="tab" aria-selected={section === "auxiliares"} onClick={() => { setSection("auxiliares"); setSelectedAreaId(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section === "auxiliares" ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <Boxes className="mr-2 inline h-4 w-4" />Auxiliares
          </button>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h2 className="font-bold text-slate-800">Plano esquemático · {section === "colorantes" ? "Colorantes" : "Auxiliares"} Q1</h2>
              <p className="text-xs text-slate-500">Distribución basada en tu croquis; el plano no está a escala.</p>
            </div>
            <span className="text-xs text-slate-500">Toca un rack para consultar su detalle</span>
          </div>
          <div className="overflow-x-auto p-3 sm:p-5">
            <div className="grid min-h-[390px] min-w-[680px] grid-cols-12 grid-rows-6 gap-2 rounded-xl border border-dashed border-slate-300 bg-[linear-gradient(135deg,#f8fafc_25%,#f1f5f9_25%,#f1f5f9_50%,#f8fafc_50%,#f8fafc_75%,#f1f5f9_75%,#f1f5f9_100%)] bg-[length:28px_28px] p-3">
              {areas.map(renderArea)}
              <div className="pointer-events-none col-start-4 col-span-6 row-start-5 flex items-center justify-center rounded-full border border-dashed border-slate-300 bg-white/50 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Pasillo
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-800">{selectedArea ? selectedArea.label : "Estructura del sector"}</h2>
              {selectedArea && <Badge variant="outline">{areaBalances.length} producto{areaBalances.length === 1 ? "" : "s"} asociados</Badge>}
            </div>
            {selectedArea ? (
              <>
                <p className="mt-1 text-xs text-slate-500">{selectedArea.subtitle}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {locations.filter((location) => location.rack === selectedArea.rack && (!selectedArea.zone || location.zone === selectedArea.zone))
                    .map((location) => (
                      <span key={location.id} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                        {location.type === "shelf" ? location.shelf : location.position || location.rack || location.zone}
                        {location.type === "position" && location.shelf ? ` · ${location.shelf}` : ""}
                      </span>
                    ))}
                </div>
                {areaBalances.length > 0 ? (
                  <div className="mt-4 divide-y divide-slate-100">
                    {areaBalances.slice(0, 20).map((balance) => (
                      <div key={balance.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{balance.productDescription}</p>
                          <p className="font-mono text-xs text-slate-500">{balance.code} · {balance.locationSummary || "sin código de ubicación"}</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-slate-800">{formatQuantity(balance.quantity)} {balance.unit}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    No hay productos vinculados exactamente a este rack. La lista aparecerá cuando el código de ubicación de NOW se asocie con el rack.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                {section === "colorantes" ? <>
                  <p>5 racks de colorantes</p><p>4 niveles por rack</p><p>20 niveles registrados en total</p><p>La balanza y los casilleros son referencias del croquis</p>
                </> : <>
                  <p>Zona A: 3 niveles · 9 ubicaciones por nivel</p><p>Zonas B, C y D: un nivel cada una</p><p>Áreas de apoyo mostradas según el croquis</p><p>Los espacios de B, C y D se completarán al recibir sus cantidades</p>
                </>}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-slate-800"><PackageSearch className="h-4 w-4 text-teal-700" />Estado de datos</h2>
            {balancesLoading || locationsLoading ? (
              <p className="mt-3 text-sm text-slate-500">Cargando saldos y ubicaciones...</p>
            ) : balancesError ? (
              <p className="mt-3 text-sm text-red-700">No se pudo leer el saldo más reciente. Intenta recargar la página.</p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5"><span>Productos con saldo cargado</span><b>{balances.length}</b></div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5 text-amber-900"><span>Con código NOW pendiente de asociar</span><b>{unlinkedCount}</b></div>
                <p className="text-xs leading-relaxed text-slate-500">El mapa muestra el código de ubicación de NOW tal cual. Solo resalta un rack cuando existe una asociación exacta en Ubicaciones; así no dirige al personal a una posición equivocada.</p>
                <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                  <ArrowLeftRight className="h-4 w-4 shrink-0" />
                  Selecciona un producto y luego el rack o zona correcta para vincular su código NOW al plano.
                </div>
                <div className="flex items-start gap-2 text-xs text-slate-500">
                  <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  La vista es un plano 2D esquemático pensado para localizar rápido desde computadora o celular.
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
