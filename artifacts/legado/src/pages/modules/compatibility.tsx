import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, AlertTriangle, CheckCircle2, AlertCircle, Loader2, Beaker } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  warehouse: string;
  code: string;
  name: string;
  category?: string | null;
  status?: string | null;
}

type CompatStatus = "compatible" | "caution" | "incompatible";

// ── Datos de compatibilidad ────────────────────────────────────────────────────

const GENERAL_SUBSTANCES = [
  "Ácidos fuertes (HCl, H₂SO₄, HNO₃)",
  "Bases fuertes (NaOH, KOH)",
  "Agentes oxidantes (H₂O₂, KMnO₄)",
  "Agentes reductores",
  "Solventes orgánicos (acetona, etanol)",
  "Hidrocarburos (gasolina, hexano)",
  "Agua",
  "Aire / Oxígeno",
  "Halógenos (cloro, bromo)",
  "Metales alcalinos (sodio, potasio)",
  "Amoníaco",
  "Materiales inflamables",
];

const COMPATIBILITY_RULES: Record<string, Record<string, CompatStatus>> = {
  COLORANTE: {
    "Ácidos fuertes (HCl, H₂SO₄, HNO₃)": "caution",
    "Bases fuertes (NaOH, KOH)": "caution",
    "Agentes oxidantes (H₂O₂, KMnO₄)": "incompatible",
    "Agentes reductores": "caution",
    "Solventes orgánicos (acetona, etanol)": "caution",
    "Hidrocarburos (gasolina, hexano)": "compatible",
    "Agua": "compatible",
    "Aire / Oxígeno": "compatible",
    "Halógenos (cloro, bromo)": "incompatible",
    "Metales alcalinos (sodio, potasio)": "caution",
    "Amoníaco": "caution",
    "Materiales inflamables": "compatible",
  },
  AUXILIAR: {
    "Ácidos fuertes (HCl, H₂SO₄, HNO₃)": "caution",
    "Bases fuertes (NaOH, KOH)": "caution",
    "Agentes oxidantes (H₂O₂, KMnO₄)": "caution",
    "Agentes reductores": "compatible",
    "Solventes orgánicos (acetona, etanol)": "compatible",
    "Hidrocarburos (gasolina, hexano)": "compatible",
    "Agua": "compatible",
    "Aire / Oxígeno": "compatible",
    "Halógenos (cloro, bromo)": "caution",
    "Metales alcalinos (sodio, potasio)": "incompatible",
    "Amoníaco": "compatible",
    "Materiales inflamables": "caution",
  },
  ACIDO: {
    "Ácidos fuertes (HCl, H₂SO₄, HNO₃)": "caution",
    "Bases fuertes (NaOH, KOH)": "incompatible",
    "Agentes oxidantes (H₂O₂, KMnO₄)": "caution",
    "Agentes reductores": "incompatible",
    "Solventes orgánicos (acetona, etanol)": "caution",
    "Hidrocarburos (gasolina, hexano)": "caution",
    "Agua": "caution",
    "Aire / Oxígeno": "compatible",
    "Halógenos (cloro, bromo)": "caution",
    "Metales alcalinos (sodio, potasio)": "incompatible",
    "Amoníaco": "incompatible",
    "Materiales inflamables": "caution",
  },
  BASE: {
    "Ácidos fuertes (HCl, H₂SO₄, HNO₃)": "incompatible",
    "Bases fuertes (NaOH, KOH)": "caution",
    "Agentes oxidantes (H₂O₂, KMnO₄)": "caution",
    "Agentes reductores": "compatible",
    "Solventes orgánicos (acetona, etanol)": "caution",
    "Hidrocarburos (gasolina, hexano)": "caution",
    "Agua": "compatible",
    "Aire / Oxígeno": "compatible",
    "Halógenos (cloro, bromo)": "incompatible",
    "Metales alcalinos (sodio, potasio)": "caution",
    "Amoníaco": "compatible",
    "Materiales inflamables": "caution",
  },
  SOLVENTE: {
    "Ácidos fuertes (HCl, H₂SO₄, HNO₃)": "incompatible",
    "Bases fuertes (NaOH, KOH)": "caution",
    "Agentes oxidantes (H₂O₂, KMnO₄)": "incompatible",
    "Agentes reductores": "caution",
    "Solventes orgánicos (acetona, etanol)": "compatible",
    "Hidrocarburos (gasolina, hexano)": "compatible",
    "Agua": "caution",
    "Aire / Oxígeno": "incompatible",
    "Halógenos (cloro, bromo)": "incompatible",
    "Metales alcalinos (sodio, potasio)": "incompatible",
    "Amoníaco": "caution",
    "Materiales inflamables": "incompatible",
  },
  DEFAULT: {
    "Ácidos fuertes (HCl, H₂SO₄, HNO₃)": "caution",
    "Bases fuertes (NaOH, KOH)": "caution",
    "Agentes oxidantes (H₂O₂, KMnO₄)": "caution",
    "Agentes reductores": "caution",
    "Solventes orgánicos (acetona, etanol)": "compatible",
    "Hidrocarburos (gasolina, hexano)": "compatible",
    "Agua": "compatible",
    "Aire / Oxígeno": "compatible",
    "Halógenos (cloro, bromo)": "caution",
    "Metales alcalinos (sodio, potasio)": "caution",
    "Amoníaco": "caution",
    "Materiales inflamables": "caution",
  },
};

const CATEGORY_VS_CATEGORY: Record<string, Record<string, CompatStatus>> = {
  ACIDO:    { ACIDO: "caution",      BASE: "incompatible", SOLVENTE: "caution",      COLORANTE: "caution",      AUXILIAR: "caution"    },
  BASE:     { ACIDO: "incompatible", BASE: "caution",      SOLVENTE: "caution",      COLORANTE: "caution",      AUXILIAR: "compatible" },
  SOLVENTE: { ACIDO: "caution",      BASE: "caution",      SOLVENTE: "compatible",   COLORANTE: "caution",      AUXILIAR: "compatible" },
  COLORANTE:{ ACIDO: "caution",      BASE: "caution",      SOLVENTE: "caution",      COLORANTE: "compatible",   AUXILIAR: "compatible" },
  AUXILIAR: { ACIDO: "caution",      BASE: "compatible",   SOLVENTE: "compatible",   COLORANTE: "compatible",   AUXILIAR: "compatible" },
};

// ── Funciones de compatibilidad ────────────────────────────────────────────────
function rulesFor(category?: string | null): Record<string, CompatStatus> {
  const key = category?.toUpperCase().trim() ?? "";
  return COMPATIBILITY_RULES[key] ?? COMPATIBILITY_RULES.DEFAULT;
}

function categoryVsCategory(catA?: string | null, catB?: string | null): CompatStatus {
  const a = catA?.toUpperCase().trim() ?? "";
  const b = catB?.toUpperCase().trim() ?? "";
  return CATEGORY_VS_CATEGORY[a]?.[b] ?? CATEGORY_VS_CATEGORY[b]?.[a] ?? "caution";
}

function countByStatus(list: { status: CompatStatus }[]) {
  return {
    compatible:   list.filter(x => x.status === "compatible").length,
    caution:      list.filter(x => x.status === "caution").length,
    incompatible: list.filter(x => x.status === "incompatible").length,
  };
}

// ── Helpers visuales ───────────────────────────────────────────────────────────
function statusIcon(s: CompatStatus) {
  if (s === "compatible")   return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (s === "caution")      return <AlertCircle  className="w-4 h-4 text-amber-500 shrink-0" />;
  return                           <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />;
}

function statusBadge(s: CompatStatus) {
  if (s === "compatible")
    return <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">Compatible</Badge>;
  if (s === "caution")
    return <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">Precaución</Badge>;
  return   <Badge className="text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-50">Incompatible</Badge>;
}

function incompatBadge(count: number) {
  if (count === 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Sin incompatibles
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5">
      <AlertTriangle className="w-3 h-3" /> {count} incompatible{count !== 1 ? "s" : ""}
    </span>
  );
}

// ── Panel lateral: compatibilidad general ──────────────────────────────────────
function GeneralPanel({ product, open, onClose }: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  if (!product) return null;

  const rules = rulesFor(product.category);
  const items = GENERAL_SUBSTANCES
    .filter(s => s.toLowerCase().includes(search.toLowerCase()))
    .map(s => ({ name: s, status: rules[s] ?? "caution" as CompatStatus }));
  const counts = countByStatus(items);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base leading-tight">
            Compatibilidad General
          </SheetTitle>
          <p className="text-sm text-slate-500">{product.code} · {product.name}</p>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-emerald-700 font-medium">{counts.compatible} compatibles</span>
            <span className="text-amber-600 font-medium">{counts.caution} precaución</span>
            <span className="text-red-600 font-medium">{counts.incompatible} incompatibles</span>
          </div>
        </SheetHeader>

        <Input
          placeholder="Buscar sustancia..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-3 h-8 text-sm"
        />

        <div className="flex flex-col gap-1.5">
          {items.map(item => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              {statusIcon(item.status)}
              <span className="flex-1 text-sm text-slate-700">{item.name}</span>
              {statusBadge(item.status)}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Sin resultados</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Panel lateral: compatibilidad con maestro ──────────────────────────────────
function MaestroPanel({ product, allProducts, open, onClose }: {
  product: Product | null;
  allProducts: Product[];
  open: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  if (!product) return null;

  const peers = allProducts
    .filter(p => p.id !== product.id)
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
    )
    .map(p => ({
      ...p,
      status: categoryVsCategory(product.category, p.category),
    }))
    .sort((a, b) => {
      const order = { incompatible: 0, caution: 1, compatible: 2 };
      return order[a.status] - order[b.status];
    });

  const counts = countByStatus(peers);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base leading-tight">
            Compatibilidad con Maestro
          </SheetTitle>
          <p className="text-sm text-slate-500">{product.code} · {product.name}</p>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-emerald-700 font-medium">{counts.compatible} compatibles</span>
            <span className="text-amber-600 font-medium">{counts.caution} precaución</span>
            <span className="text-red-600 font-medium">{counts.incompatible} incompatibles</span>
          </div>
        </SheetHeader>

        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-3 h-8 text-sm"
        />

        <div className="flex flex-col gap-1.5">
          {peers.map(peer => (
            <div
              key={peer.id}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              {statusIcon(peer.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{peer.name}</p>
                <p className="text-xs text-slate-400">{peer.code}{peer.category ? ` · ${peer.category}` : ""}</p>
              </div>
              {statusBadge(peer.status)}
            </div>
          ))}
          {peers.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Sin resultados</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function CompatibilityPage() {
  const { warehouse } = useWarehouse();
  const [search, setSearch] = useState("");
  const [generalProduct, setGeneralProduct] = useState<Product | null>(null);
  const [maestroProduct, setMaestroProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", warehouse],
    queryFn: async () => {
      const q = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}&limit=500` : "?limit=500";
      const res = await fetch(`${BASE}/api/products${q}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Error al cargar productos");
      const r = await res.json();
      return r.data ?? r;
    },
  });

  const activeProducts = useMemo(
    () => products.filter((p: Product) => !p.status || p.status === "active"),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter(
      p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [activeProducts, search]);

  // Pre-calcula los conteos de incompatibles por producto para no hacer el
  // cálculo dentro del render de cada fila.
  const incompatCounts = useMemo(() => {
    const result: Record<string, { general: number; maestro: number }> = {};
    for (const p of activeProducts) {
      const rules = rulesFor(p.category);
      const generalIncompat = GENERAL_SUBSTANCES.filter(s => rules[s] === "incompatible").length;
      const maestroIncompat = activeProducts.filter(
        other => other.id !== p.id && categoryVsCategory(p.category, other.category) === "incompatible"
      ).length;
      result[p.id] = { general: generalIncompat, maestro: maestroIncompat };
    }
    return result;
  }, [activeProducts]);

  return (
    <AppLayout>
      <div className="p-6 max-w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Compatibilidad Química</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Verificá la compatibilidad de almacenamiento entre productos del inventario
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Buscar producto o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-64 h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Compatible</span>
          <span className="flex items-center gap-1"><AlertCircle  className="w-3.5 h-3.5 text-amber-500"  /> Precaución</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600"   /> Incompatible</span>
          <span className="ml-2 text-slate-400">· Basado en categoría del producto</span>
        </div>

        {/* Tabla */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando productos...</span>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Producto</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 w-36">Categoría</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 w-52">Con Maestro</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 w-52">General</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-slate-400">
                      <Beaker className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No se encontraron productos</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(product => {
                    const counts = incompatCounts[product.id] ?? { general: 0, maestro: 0 };
                    return (
                      <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{product.name}</td>
                        <td className="px-4 py-3">
                          {product.category ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {product.category}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 hover:bg-slate-100"
                            onClick={() => setMaestroProduct(product)}
                          >
                            {incompatBadge(counts.maestro)}
                          </Button>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 hover:bg-slate-100"
                            onClick={() => setGeneralProduct(product)}
                          >
                            {incompatBadge(counts.general)}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
                {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
                {search && ` · filtrado de ${activeProducts.length}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panels */}
      <GeneralPanel
        product={generalProduct}
        open={!!generalProduct}
        onClose={() => setGeneralProduct(null)}
      />
      <MaestroPanel
        product={maestroProduct}
        allProducts={activeProducts}
        open={!!maestroProduct}
        onClose={() => setMaestroProduct(null)}
      />
    </AppLayout>
  );
}
