import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Map,
  Loader2,
  Package,
  Warehouse as WarehouseIcon,
  X,
  Layers,
  Grid3X3,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const WAREHOUSES = ["QA", "Q1", "QP", "QL", "QD"];

interface Rack {
  id: string;
  warehouse: string;
  zone: string;
  rack: string;
  shelf: string;
  position: string;
  type: string;
  isActive: boolean;
  productCount?: number;
}

interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  location?: string;
}

const ZONE_COLORS: Record<string, string> = {
  A: { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  B: { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" },
  C: { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  D: { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d" },
  E: { bg: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" },
  F: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  G: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
  H: { bg: "#ecfeff", border: "#67e8f9", text: "#155e75" },
};

const getZoneColor = (zone: string) => {
  const key = zone?.charAt(0).toUpperCase();
  return ZONE_COLORS[key] ?? { bg: "#f8fafc", border: "#e2e8f0", text: "#475569" };
};

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

export default function MapaDelAlmacenPage() {
  const { warehouse, setWarehouse } = useWarehouse();
  const { toast: _toast } = useAuth();
  const { user: _user } = useAuth();

  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [filterWarehouse, setFilterWarehouse] = useState<string>(warehouse);

  const { data: racks = [], isLoading } = useQuery<Rack[]>({
    queryKey: ["/api/locations/racks", filterWarehouse],
    queryFn: () => {
      const params = filterWarehouse && filterWarehouse !== "all" ? `?warehouse=${filterWarehouse}` : "";
      return api(`/api/locations/racks${params}`);
    },
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => api("/api/products"),
  });

  const rackProducts = useMemo(() => {
    if (!selectedRack) return [];
    const searchStr = `${selectedRack.warehouse}-${selectedRack.rack}`.toLowerCase();
    return allProducts.filter((p) => {
      const loc = (p.location ?? "").toLowerCase();
      return loc.includes(searchStr) || loc.includes(selectedRack.rack.toLowerCase());
    });
  }, [allProducts, selectedRack]);

  const groupedByZone = useMemo(() => {
    const map = new Map<string, Rack[]>();
    racks.forEach((rack) => {
      const key = rack.zone || "Sin zona";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rack);
    });
    return map;
  }, [racks]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <Map className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Mapa del Almac\u00e9n</h1>
              <p className="text-slate-500 text-sm">Visualizaci\u00f3n de racks y ubicaciones</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WarehouseIcon className="w-4 h-4 text-slate-400" />
            <Select
              value={filterWarehouse}
              onValueChange={(v) => setFilterWarehouse(v)}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Almac\u00e9n" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {WAREHOUSES.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Zonas
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(groupedByZone.keys()).map((zone) => {
              const color = getZoneColor(zone);
              return (
                <div
                  key={zone}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: color.bg,
                    border: `1px solid ${color.border}`,
                    color: color.text,
                  }}
                >
                  <Grid3X3 className="w-3 h-3" />
                  Zona {zone} ({groupedByZone.get(zone)?.length ?? 0})
                </div>
              );
            })}
          </div>
        </div>

        {/* Racks Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            Cargando mapa del almac\u00e9n...
          </div>
        ) : racks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Map className="w-12 h-12" />
            <p className="text-sm font-medium">No hay racks registrados</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groupedByZone.entries()).map(([zone, zoneRacks]) => {
              const color = getZoneColor(zone);
              return (
                <div key={zone}>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold mb-3"
                    style={{
                      backgroundColor: color.bg,
                      border: `1px solid ${color.border}`,
                      color: color.text,
                    }}
                  >
                    <Grid3X3 className="w-4 h-4" />
                    Zona {zone}
                    <span className="text-xs opacity-70">({zoneRacks.length} racks)</span>
                  </div>
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    }}
                  >
                    {zoneRacks.map((rack) => (
                      <button
                        key={rack.id}
                        onClick={() => setSelectedRack(rack)}
                        aria-label={`Rack ${rack.rack} en zona ${rack.zone}, almac\u00e9n ${rack.warehouse}`}
                        className="text-left group"
                        style={{
                          backgroundColor: color.bg,
                          border: `2px solid ${color.border}`,
                          borderRadius: "12px",
                          padding: "14px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = color.text;
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = color.border;
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: color.border,
                              color: color.text,
                            }}
                          >
                            {rack.warehouse}
                          </span>
                        </div>
                        <p
                          className="text-base font-bold truncate"
                          style={{ color: color.text }}
                        >
                          {rack.rack}
                        </p>
                        <p className="text-xs mt-1 opacity-60" style={{ color: color.text }}>
                          {rack.shelf} / {rack.position}
                        </p>
                        <div className="mt-2 flex items-center gap-1 text-xs opacity-70" style={{ color: color.text }}>
                          <Package className="w-3 h-3" />
                          <span>Ver productos</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rack Products Dialog */}
      <Dialog open={!!selectedRack} onOpenChange={(open) => !open && setSelectedRack(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-500" />
              {selectedRack && (
                <>
                  Rack {selectedRack.rack} - {selectedRack.warehouse} (Zona {selectedRack.zone})
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {rackProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
              <Package className="w-10 h-10" />
              <p className="text-sm">No hay productos en este rack</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-2">
                {rackProducts.length} producto{rackProducts.length !== 1 ? "s" : ""} encontrado
                {rackProducts.length !== 1 ? "s" : ""}
              </p>
              <div className="divide-y divide-slate-100">
                {rackProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-slate-500">{product.code}</span>
                        <Badge variant="outline" className="text-xs">
                          {product.category}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className="text-sm font-semibold text-emerald-600">
                        {product.stock} {product.unit}
                      </p>
                      {product.location && (
                        <p className="text-xs text-slate-400 mt-0.5">{product.location}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
