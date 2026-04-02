import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, AlertTriangle, CheckCircle2, AlertCircle, Loader2, Beaker,
  Download, Pencil, Sparkles, X, Check, BrainCircuit,
} from "lucide-react";

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

interface AIIncompat {
  sustancia: string;
  nivel: CompatStatus;
  motivo: string;
}

interface AIAnalysis {
  claseDetectada: string;
  nombreQuimico?: string;
  incompatibilidades: AIIncompat[];
  razonamiento?: string;
}

// ── Sustancias generales ───────────────────────────────────────────────────────
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

const KNOWN_CATEGORIES = ["ACIDO", "BASE", "SOLVENTE", "COLORANTE", "AUXILIAR", "OTRO"];

// ── Reglas por categoría ───────────────────────────────────────────────────────
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
  ACIDO:     { ACIDO: "caution",      BASE: "incompatible", SOLVENTE: "caution",    COLORANTE: "caution",    AUXILIAR: "caution"    },
  BASE:      { ACIDO: "incompatible", BASE: "caution",      SOLVENTE: "caution",    COLORANTE: "caution",    AUXILIAR: "compatible" },
  SOLVENTE:  { ACIDO: "caution",      BASE: "caution",      SOLVENTE: "compatible", COLORANTE: "caution",    AUXILIAR: "compatible" },
  COLORANTE: { ACIDO: "caution",      BASE: "caution",      SOLVENTE: "caution",    COLORANTE: "compatible", AUXILIAR: "compatible" },
  AUXILIAR:  { ACIDO: "caution",      BASE: "compatible",   SOLVENTE: "compatible", COLORANTE: "compatible", AUXILIAR: "compatible" },
};

// ── Helpers de reglas ──────────────────────────────────────────────────────────
function rulesFor(category?: string | null): Record<string, CompatStatus> {
  const key = category?.toUpperCase().trim() ?? "";
  return COMPATIBILITY_RULES[key] ?? COMPATIBILITY_RULES.DEFAULT;
}

function catVsCat(a?: string | null, b?: string | null): CompatStatus {
  const ka = a?.toUpperCase().trim() ?? "";
  const kb = b?.toUpperCase().trim() ?? "";
  return CATEGORY_VS_CATEGORY[ka]?.[kb] ?? CATEGORY_VS_CATEGORY[kb]?.[ka] ?? "caution";
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
  if (s === "compatible")  return <CheckCircle2  className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (s === "caution")     return <AlertCircle   className="w-4 h-4 text-amber-500 shrink-0" />;
  return                          <AlertTriangle  className="w-4 h-4 text-red-600 shrink-0" />;
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

// ── Panel: compatibilidad general ──────────────────────────────────────────────
function GeneralPanel({
  product, open, onClose, aiResult,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  aiResult?: AIAnalysis;
}) {
  const [search, setSearch] = useState("");
  if (!product) return null;

  const isAI = !!aiResult?.incompatibilidades?.length;

  const items: { name: string; status: CompatStatus; motivo?: string }[] = isAI
    ? GENERAL_SUBSTANCES
        .filter(s => s.toLowerCase().includes(search.toLowerCase()))
        .map(s => {
          const found = aiResult!.incompatibilidades.find(x => x.sustancia === s);
          return { name: s, status: found?.nivel ?? "caution", motivo: found?.motivo };
        })
    : GENERAL_SUBSTANCES
        .filter(s => s.toLowerCase().includes(search.toLowerCase()))
        .map(s => ({ name: s, status: rulesFor(product.category)[s] ?? "caution" as CompatStatus }));

  const counts = countByStatus(items);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[440px] sm:max-w-[440px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base leading-tight">Compatibilidad General</SheetTitle>
            {isAI && (
              <Badge className="text-xs bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50 gap-1">
                <BrainCircuit className="w-3 h-3" /> IA
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500">{product.code} · {product.name}</p>
          {isAI && aiResult?.razonamiento && (
            <p className="text-xs text-slate-500 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 mt-1">
              {aiResult.razonamiento}
            </p>
          )}
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
            <div key={item.name} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="mt-0.5">{statusIcon(item.status)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700">{item.name}</p>
                {item.motivo && <p className="text-xs text-slate-400 mt-0.5">{item.motivo}</p>}
              </div>
              {statusBadge(item.status)}
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Sin resultados</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Panel: compatibilidad con maestro ─────────────────────────────────────────
function MaestroPanel({
  product, allProducts, effectiveCatOf, open, onClose,
}: {
  product: Product | null;
  allProducts: Product[];
  effectiveCatOf: (p: Product) => string | null | undefined;
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
      status: catVsCat(effectiveCatOf(product), effectiveCatOf(p)),
    }))
    .sort((a, b) => {
      const o = { incompatible: 0, caution: 1, compatible: 2 };
      return o[a.status] - o[b.status];
    });

  const counts = countByStatus(peers);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base leading-tight">Compatibilidad con Maestro</SheetTitle>
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
            <div key={peer.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              {statusIcon(peer.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{peer.name}</p>
                <p className="text-xs text-slate-400">
                  {peer.code}{peer.category ? ` · ${peer.category}` : ""}
                  {effectiveCatOf(peer) && effectiveCatOf(peer) !== peer.category
                    ? ` → ${effectiveCatOf(peer)}`
                    : ""}
                </p>
              </div>
              {statusBadge(peer.status)}
            </div>
          ))}
          {peers.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Sin resultados</p>}
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

  // Overrides manuales de categoría (localStorage)
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("compat-overrides") ?? "{}"); } catch { return {}; }
  });
  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null);

  // Resultados de IA por producto
  const [aiResults, setAiResults] = useState<Record<string, AIAnalysis>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  // ── Carga de productos ──────────────────────────────────────────────────────
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
    () => products.filter(p => !p.status || p.status === "active"),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter(
      p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [activeProducts, search]);

  // ── Categoría efectiva: AI > override manual > original ─────────────────────
  const effectiveCatOf = useCallback((p: Product): string | null | undefined => {
    if (aiResults[p.id]) return aiResults[p.id].claseDetectada;
    if (overrides[p.id])  return overrides[p.id];
    return p.category;
  }, [aiResults, overrides]);

  // ── Conteos de incompatibles (pre-calculado) ─────────────────────────────────
  const incompatCounts = useMemo(() => {
    const result: Record<string, { general: number; maestro: number }> = {};
    for (const p of activeProducts) {
      const effCat = effectiveCatOf(p);
      let generalIncompat: number;
      if (aiResults[p.id]?.incompatibilidades) {
        generalIncompat = aiResults[p.id].incompatibilidades.filter(x => x.nivel === "incompatible").length;
      } else {
        generalIncompat = GENERAL_SUBSTANCES.filter(s => rulesFor(effCat)[s] === "incompatible").length;
      }
      const maestroIncompat = activeProducts.filter(
        other => other.id !== p.id && catVsCat(effCat, effectiveCatOf(other)) === "incompatible"
      ).length;
      result[p.id] = { general: generalIncompat, maestro: maestroIncompat };
    }
    return result;
  }, [activeProducts, aiResults, overrides, effectiveCatOf]);

  // ── Override manual ──────────────────────────────────────────────────────────
  const saveOverride = (id: string, value: string) => {
    const next = { ...overrides };
    if (value === "__clear__" || !value) delete next[id];
    else next[id] = value.trim().toUpperCase();
    setOverrides(next);
    localStorage.setItem("compat-overrides", JSON.stringify(next));
    setEditingId(null);
  };

  // ── Análisis IA ──────────────────────────────────────────────────────────────
  const analyzeWithAI = async (product: Product) => {
    setAiLoading(prev => ({ ...prev, [product.id]: true }));
    try {
      const res = await fetch(`${BASE}/api/compatibility/ai-analyze`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: product.name, code: product.code, category: product.category }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error en el servidor");
      }
      const data: AIAnalysis = await res.json();
      setAiResults(prev => ({ ...prev, [product.id]: data }));
    } catch (err) {
      alert(`Error al analizar con IA: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setAiLoading(prev => ({ ...prev, [product.id]: false }));
    }
  };

  // ── Exportar CSV ─────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows: string[][] = [
      ["Código", "Producto", "Categoría Original", "Clase Efectiva", "Fuente",
       "Incompat. General", "Sustancias Incompatibles", "Incompat. Maestro"],
    ];

    for (const p of activeProducts) {
      const effCat = effectiveCatOf(p);
      const ai = aiResults[p.id];
      const source = ai ? "IA" : overrides[p.id] ? "Manual" : "Reglas";

      let generalN = 0;
      let incompatSubs: string[] = [];
      if (ai?.incompatibilidades) {
        incompatSubs = ai.incompatibilidades.filter(x => x.nivel === "incompatible").map(x => x.sustancia);
        generalN = incompatSubs.length;
      } else {
        incompatSubs = GENERAL_SUBSTANCES.filter(s => rulesFor(effCat)[s] === "incompatible");
        generalN = incompatSubs.length;
      }

      const maestroN = activeProducts.filter(
        other => other.id !== p.id && catVsCat(effCat, effectiveCatOf(other)) === "incompatible"
      ).length;

      rows.push([
        p.code,
        p.name,
        p.category ?? "",
        effCat ?? "",
        source,
        String(generalN),
        incompatSubs.join("; "),
        String(maestroN),
      ]);
    }

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compatibilidad-quimica-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ────────────────────────────────────────────────────────────────────────────
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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Buscar producto o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-60 h-9 text-sm"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={activeProducts.length === 0}
                  className="h-9 gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Exportar CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exporta todos los productos con sus incompatibilidades</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Compatible</span>
          <span className="flex items-center gap-1"><AlertCircle  className="w-3.5 h-3.5 text-amber-500"  /> Precaución</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600"  /> Incompatible</span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1"><Pencil className="w-3 h-3" /> Editar clase química</span>
          <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-500" /> Analizar con IA</span>
        </div>

        {/* Tabla */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando productos...</span>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Código</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Producto</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-56">Clase Química</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-10 text-center">IA</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-44">Con Maestro</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-44">General</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-slate-400">
                        <Beaker className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No se encontraron productos</p>
                      </td>
                    </tr>
                  ) : filtered.map(product => {
                    const counts  = incompatCounts[product.id] ?? { general: 0, maestro: 0 };
                    const ai      = aiResults[product.id];
                    const loading = aiLoading[product.id];
                    const effCat  = effectiveCatOf(product);
                    const override = overrides[product.id];
                    const isAI    = !!ai;
                    const isEdit  = editingId === product.id;

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/60 transition-colors group">
                        {/* Código */}
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.code}</td>

                        {/* Nombre */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{product.name}</p>
                          {ai?.nombreQuimico && (
                            <p className="text-xs text-slate-400">{ai.nombreQuimico}</p>
                          )}
                        </td>

                        {/* Clase química (editable) */}
                        <td className="px-4 py-3">
                          {isEdit ? (
                            <div className="flex items-center gap-1">
                              <Select
                                defaultValue={effCat ?? "__clear__"}
                                onValueChange={v => saveOverride(product.id, v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__clear__" className="text-xs text-slate-400">
                                    — Usar original ({product.category ?? "sin categoría"})
                                  </SelectItem>
                                  {KNOWN_CATEGORIES.map(c => (
                                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-slate-600"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {effCat ? (
                                <Badge
                                  variant="outline"
                                  className={`text-xs font-normal ${isAI ? "border-violet-200 text-violet-700 bg-violet-50" : override ? "border-blue-200 text-blue-700 bg-blue-50" : ""}`}
                                >
                                  {effCat}
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                              {isAI && (
                                <Badge className="text-xs bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-50 px-1 py-0">
                                  <BrainCircuit className="w-3 h-3" />
                                </Badge>
                              )}
                              {override && !isAI && (
                                <Badge className="text-xs bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-50 px-1 py-0">
                                  <Check className="w-3 h-3" />
                                </Badge>
                              )}
                              <button
                                onClick={() => { setEditingId(product.id); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600"
                                title="Editar clase química"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Botón IA */}
                        <td className="px-2 py-3 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${isAI ? "text-violet-600" : "text-slate-400 hover:text-violet-600"}`}
                                onClick={() => analyzeWithAI(product)}
                                disabled={loading}
                              >
                                {loading
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Sparkles className="w-3.5 h-3.5" />
                                }
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isAI ? `Re-analizar con IA (clase: ${ai.claseDetectada})` : "Analizar incompatibilidades con IA"}
                            </TooltipContent>
                          </Tooltip>
                        </td>

                        {/* Con Maestro */}
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" className="h-7 px-2 hover:bg-slate-100"
                            onClick={() => setMaestroProduct(product)}>
                            {incompatBadge(counts.maestro)}
                          </Button>
                        </td>

                        {/* General */}
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" className="h-7 px-2 hover:bg-slate-100"
                            onClick={() => setGeneralProduct(product)}>
                            {incompatBadge(counts.general)}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
                <span>
                  {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
                  {search && ` · filtrado de ${activeProducts.length}`}
                </span>
                <span className="flex gap-3">
                  {Object.keys(aiResults).length > 0 && (
                    <span className="text-violet-600">
                      {Object.keys(aiResults).length} analizados con IA
                    </span>
                  )}
                  {Object.keys(overrides).length > 0 && (
                    <span className="text-blue-600">
                      {Object.keys(overrides).length} editados manualmente
                    </span>
                  )}
                </span>
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
        aiResult={generalProduct ? aiResults[generalProduct.id] : undefined}
      />
      <MaestroPanel
        product={maestroProduct}
        allProducts={activeProducts}
        effectiveCatOf={effectiveCatOf}
        open={!!maestroProduct}
        onClose={() => setMaestroProduct(null)}
      />
    </AppLayout>
  );
}
