import { buildMsdsAlbumHtml } from "./msds-print";
import { sinMovimiento } from "./products-partials";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES, type Warehouse as WarehouseType } from "@/contexts/WarehouseContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, ShieldCheck, ShieldOff, Download, Printer, AlertCircle,
  Loader2, Save, BookOpen, Trash2, Zap, RefreshCw, Link2, CheckCircle2, FileSpreadsheet,
  Clock, HelpCircle, XCircle, ChevronDown, ChevronUp, ScanLine, FlaskConical,
  Skull, HeartPulse, Shield, AlertTriangle, Thermometer, Info, RotateCcw,
  SearchCheck, FileSearch, LayoutList, BarChart3, Eye, EyeOff, Sparkles,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MsdsExtractedData {
  cas: string | null;
  familiaQuimica: string | null;
  identificacionPeligro: string | null;
  primerosAuxiliosContacto: string | null;
  controlExposicion: string | null;
  incompatibilidad: string | null;
  riesgosAgudosSalud: string | null;
  extractedAt: string;
  pagesScanned: number;
  charCount: number;
}

interface Product {
  id: string;
  warehouse: string;
  code: string;
  name: string;
  supplier?: string | null;
  casNumber?: string | null;
  msds: boolean;
  msdsUrl?: string | null;
  hazardLevel?: string | null;
  hazardPictograms?: string | null;
  firstAid?: string | null;
  category?: string | null;
  type?: string | null;
  msdsStatus?: string | null;
  msdsScore?: number | null;
  msdsFileId?: string | null;
  msdsFileName?: string | null;
  msdsMatchReason?: string | null;
  msdsMatchedBy?: string | null;
  msdsLastCheckedAt?: string | null;
  msdsExtractedData?: MsdsExtractedData | null;
  msdsExtractedAt?: string | null;
}

interface MsdsStats {
  sinMsds: number;
  conMsds: number;
  total: number;
}

interface MatchStatusStats {
  EXACT: number;
  PROBABLE: number;
  MANUAL_REVIEW: number;
  NONE: number;
}

interface MatchCandidate {
  fileId: string;
  fileName: string;
  link: string;
  folderName: string;
  score: number;
  reason: string;
}

interface ProductMatchResult {
  status: "EXACT" | "PROBABLE" | "MANUAL_REVIEW" | "NONE";
  score: number;
  best: MatchCandidate | null;
  candidates: MatchCandidate[];
  reason: string;
}

interface ProductMatchResponse {
  product: {
    id: string;
    code: string;
    name: string;
    warehouse: string;
    currentMsdsUrl: string | null;
    currentMsds: boolean;
  };
  filesScanned: number;
  match: ProductMatchResult;
}

interface CandidatesResponse {
  product: { id: string; code: string; name: string; warehouse: string; msdsStatus: string | null };
  filesScanned: number;
  status: string;
  score: number;
  candidates: MatchCandidate[];
  hasCandidates: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_CONFIG = {
  EXACT: {
    label: "Exacto",
    color: "#16a34a",
    bg: "#dcfce7",
    border: "#86efac",
    Icon: CheckCircle2,
    description: "Coincidencia segura — código o fórmula exacta",
  },
  PROBABLE: {
    label: "Probable",
    color: "#ca8a04",
    bg: "#fef9c3",
    border: "#fde68a",
    Icon: Clock,
    description: "Buena coincidencia, verificar antes de usar",
  },
  MANUAL_REVIEW: {
    label: "Revisar",
    color: "#ea580c",
    bg: "#ffedd5",
    border: "#fed7aa",
    Icon: HelpCircle,
    description: "Similitud leve — requiere revisión manual",
  },
  NONE: {
    label: "Sin MSDS",
    color: "#dc2626",
    bg: "#fee2e2",
    border: "#fca5a5",
    Icon: XCircle,
    description: "Sin coincidencia encontrada",
  },
} as const;

// ── API helpers ───────────────────────────────────────────────────────────────

const apiJson = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { headers: getAuthHeaders(), ...opts }).then(async (r) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
    return r.json();
  });

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, size = "sm" }: { status: string | null | undefined; size?: "sm" | "md" }) {
  const cfg = STATUS_CONFIG[(status ?? "NONE") as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NONE;
  const Icon = cfg.Icon;
  const fontSize = size === "md" ? 12 : 11;
  const iconSize = size === "md" ? 13 : 11;
  const padding = size === "md" ? "3px 10px" : "2px 8px";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding, borderRadius: 9999, fontSize, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      <Icon style={{ width: iconSize, height: iconSize }} />
      {cfg.label}
    </span>
  );
}

function ScoreBar({ score, status }: { score: number | null | undefined; status?: string | null }) {
  const s = score ?? 0;
  const pct = Math.min(100, Math.round((s / 200) * 100));
  const derivedStatus = status ?? (s >= 120 ? "EXACT" : s >= 60 ? "PROBABLE" : s >= 25 ? "MANUAL_REVIEW" : "NONE");
  const color = STATUS_CONFIG[derivedStatus as keyof typeof STATUS_CONFIG]?.color ?? "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 80 }}>
      <div style={{ flex: 1, height: 5, background: "#e2e8f0", borderRadius: 3 }}>
        <div style={{ height: 5, width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", fontWeight: 600 }}>{s}pt</span>
    </div>
  );
}

// ── Candidate list ─────────────────────────────────────────────────────────────

function CandidateList({
  candidates,
  productId,
  onLinked,
  compact = false,
}: {
  candidates: MatchCandidate[];
  productId: string;
  onLinked: (updatedProduct?: Product) => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: (candidate: MatchCandidate) =>
      apiJson("/api/msds/link", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          fileId: candidate.fileId,
          fileName: candidate.fileName,
          link: candidate.link,
          score: candidate.score,
          reason: candidate.reason,
        }),
      }),
    onSuccess: (updatedProduct: Product) => {
      void queryClient.invalidateQueries();
      onLinked(updatedProduct);
    },
  });

  if (candidates.length === 0) {
    return (
      <div style={{ padding: "16px 0", textAlign: "center" }}>
        <FileSearch style={{ width: 32, height: 32, color: "#cbd5e1", margin: "0 auto 8px" }} />
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0, fontWeight: 500 }}>
          No se encontraron candidatos en Google Drive
        </p>
        <p style={{ color: "#cbd5e1", fontSize: 11, margin: "4px 0 0 0" }}>
          Verifica el nombre del producto o vincula manualmente
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
      {linkMutation.error && (
        <div style={{ padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
          ⚠ {(linkMutation.error as Error).message}
        </div>
      )}
      {candidates.map((c, i) => {
        const candidateStatus = c.score >= 120 ? "EXACT" : c.score >= 60 ? "PROBABLE" : "MANUAL_REVIEW";
        const cfg = STATUS_CONFIG[candidateStatus];
        const isExpanded = expanded === c.fileId;
        const isBest = i === 0;
        return (
          <div
            key={c.fileId}
            style={{
              border: `1.5px solid ${isBest ? cfg.color + "55" : "#e2e8f0"}`,
              borderRadius: 8,
              background: isBest ? cfg.bg + "30" : "#fafafa",
              overflow: "hidden",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ padding: compact ? "8px 10px" : "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              {isBest && (
                <div style={{
                  minWidth: 6, alignSelf: "stretch",
                  background: cfg.color, borderRadius: "3px 0 0 3px",
                  marginLeft: -10, marginRight: 4,
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <StatusBadge status={candidateStatus} />
                  {isBest && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Mejor coincidencia
                    </span>
                  )}
                </div>
                <p style={{
                  fontSize: 12, fontWeight: 600, color: "#1e293b",
                  margin: "0 0 3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {c.fileName}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 10, color: "#94a3b8",
                    background: "#f1f5f9", padding: "1px 6px", borderRadius: 4,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120,
                  }}>
                    📁 {c.folderName}
                  </span>
                  <ScoreBar score={c.score} status={candidateStatus} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <Button
                  onClick={() => linkMutation.mutate(c)}
                  disabled={linkMutation.isPending}
                  style={{
                    fontSize: 11, padding: "4px 10px", height: "auto", gap: 4,
                    background: cfg.color, color: "#fff", border: "none",
                    opacity: linkMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {linkMutation.isPending
                    ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
                    : <Link2 style={{ width: 11, height: 11 }} />}
                  {linkMutation.isPending ? "Guardando…" : "Vincular"}
                </Button>
                <button
                  onClick={() => setExpanded(isExpanded ? null : c.fileId)}
                  style={{
                    fontSize: 10, color: "#94a3b8", background: "none",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 2, padding: "0 2px",
                  }}
                >
                  {isExpanded ? <ChevronUp style={{ width: 11, height: 11 }} /> : <ChevronDown style={{ width: 11, height: 11 }} />}
                  {isExpanded ? "ocultar" : "detalle"}
                </button>
              </div>
            </div>
            {isExpanded && (
              <div style={{
                padding: "8px 12px 10px",
                borderTop: "1px solid #f1f5f9",
                background: "#f8fafc",
              }}>
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px 0", fontStyle: "italic", lineHeight: 1.4 }}>
                  💡 {c.reason}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <a
                    href={c.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: "#0d9488", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    🔗 {c.link}
                  </a>
                  <button
                    onClick={() => window.open(c.link, "_blank")}
                    style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 4,
                      border: "1px solid #0d9488", color: "#0d9488", background: "transparent",
                      cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 3,
                    }}
                  >
                    <Eye style={{ width: 10, height: 10 }} /> Ver PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Smart Re-search panel (for NONE products) ─────────────────────────────────

function RebuscarPanel({
  product,
  onLinked,
}: {
  product: Product;
  onLinked: (updated?: Product) => void;
}) {
  const [open, setOpen] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<CandidatesResponse>({
    queryKey: ["/api/msds/candidates", product.id],
    queryFn: () =>
      apiJson(`/api/msds/${product.id}/candidates`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    enabled: open,
    staleTime: 60 * 1000,
  });

  return (
    <div style={{
      border: "1.5px dashed #0d9488",
      borderRadius: 10,
      overflow: "hidden",
      background: open ? "#f0fdf4" : "transparent",
      transition: "background 0.2s",
    }}>
      <button
        onClick={() => { setOpen(!open); }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", background: open ? "#d1fae5" : "#f0fdf4",
          border: "none", cursor: "pointer", borderBottom: open ? "1px solid #a7f3d0" : "none",
          transition: "background 0.15s",
        }}
      >
        <SearchCheck style={{ width: 15, height: 15, color: "#0d9488", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#065f46", flex: 1, textAlign: "left" }}>
          Buscar posibles MSDS en Drive
        </span>
        {isFetching && <Loader2 style={{ width: 13, height: 13, color: "#0d9488" }} className="animate-spin" />}
        {data && !isFetching && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#0d9488",
            background: "#a7f3d0", padding: "2px 7px", borderRadius: 9999,
          }}>
            {data.candidates.length} candidatos
          </span>
        )}
        {open ? <ChevronUp style={{ width: 14, height: 14, color: "#0d9488" }} /> : <ChevronDown style={{ width: 14, height: 14, color: "#0d9488" }} />}
      </button>

      {open && (
        <div style={{ padding: 12 }}>
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", justifyContent: "center" }}>
              <Loader2 style={{ width: 16, height: 16, color: "#0d9488" }} className="animate-spin" />
              <span style={{ fontSize: 13, color: "#64748b" }}>Buscando en Google Drive…</span>
            </div>
          )}
          {isError && (
            <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6, marginBottom: 10 }}>
              <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>⚠ {(error as Error).message}</p>
              <button
                onClick={() => void refetch()}
                style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", marginTop: 4, textDecoration: "underline" }}
              >
                Reintentar
              </button>
            </div>
          )}
          {data && !isLoading && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {data.filesScanned} archivos escaneados en Drive
                </span>
                <button
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  style={{
                    fontSize: 10, color: "#0d9488", background: "none",
                    border: "1px solid #0d9488", borderRadius: 4, cursor: "pointer",
                    padding: "2px 8px", display: "flex", alignItems: "center", gap: 3,
                  }}
                >
                  <RefreshCw style={{ width: 10, height: 10 }} />
                  Actualizar
                </button>
              </div>
              <CandidateList
                productId={product.id}
                candidates={data.candidates}
                onLinked={onLinked}
                compact
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MsdsPage() {
  const { warehouse, setWarehouse } = useWarehouse();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [msdsInput, setMsdsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<"smart" | "manual">("smart");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCandidates, setShowCandidates] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  const isAdminOrSupervisor = user?.role === "admin" || user?.role === "supervisor";
  const canEdit = user?.role === "admin" || user?.role === "supervisor" || user?.role === "operator";

  const warehouseQ = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const warehouseStats = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: rawProducts = [], isLoading, isError } = useQuery<Product[]>({
    queryKey: ["/api/products", warehouse],
    queryFn: () => apiJson(`/api/products${warehouseQ ? warehouseQ + "&limit=500" : "?limit=500"}`).then((r: any) => r.data ?? r),
  });

  // Deduplicate products by id (safety net for duplicates)
  const products = useMemo(() => {
    const seen = new Set<string>();
    return rawProducts.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [rawProducts]);

  const { data: stats } = useQuery<MsdsStats>({
    queryKey: ["/api/products/msds-stats", warehouse],
    queryFn: () => apiJson(`/api/products/msds-stats${warehouseStats}`),
  });

  const { data: matchStats } = useQuery<MatchStatusStats>({
    queryKey: ["/api/msds/stats", warehouse],
    queryFn: () => apiJson(`/api/msds/stats${warehouseStats}`),
    enabled: activeTab === "smart",
  });

  const { data: lastMovements = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/msds/last-movements", warehouse],
    queryFn: () => apiJson(`/api/msds/last-movements${warehouseStats}`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: productMatch, isLoading: isMatchLoading } = useQuery<ProductMatchResponse>({
    queryKey: ["/api/msds/match", selected?.id],
    queryFn: () => apiJson(`/api/msds/match/${selected!.id}`),
    enabled: !!selected && (selected.msdsStatus !== "NONE" || !!selected.msds),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const rescanMutation = useMutation({
    mutationFn: (payload: { warehouse?: string; force?: boolean }) =>
      apiJson("/api/msds/rescan", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
    },
  });

  const confirmAllMutation = useMutation({
    mutationFn: (payload: { warehouse?: string }) =>
      apiJson("/api/msds/confirm-all", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
    },
  });

  const resetAllMutation = useMutation({
    mutationFn: (payload: { warehouse?: string; resetManual?: boolean }) =>
      apiJson("/api/msds/reset-all", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
      setSelected(null);
    },
  });

  // ── Filtered products ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return products.filter((p) => {
      const matchesSearch = !term ||
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term) ||
        (p.supplier ?? "").toLowerCase().includes(term) ||
        (p.casNumber ?? "").toLowerCase().includes(term);
      if (activeTab === "manual") return matchesSearch;
      const effectiveStatus = p.msdsStatus ?? "NONE";
      const matchesStatus = statusFilter === "all" || effectiveStatus === statusFilter ||
        (statusFilter === "NONE" && !p.msdsStatus);
      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter, activeTab]);

  // ── Navigation ────────────────────────────────────────────────────────────────

  const selectProduct = useCallback((p: Product) => {
    setSelected(p);
    setEditingUrl(false);
    setMsdsInput("");
    setSaveError(null);
    setShowCandidates(true);
  }, []);

  const selectNextProduct = useCallback((currentId: string) => {
    const currentIndex = filtered.findIndex(p => p.id === currentId);
    if (currentIndex !== -1 && currentIndex < filtered.length - 1) {
      selectProduct(filtered[currentIndex + 1]!);
    } else {
      setSelected(null);
    }
  }, [filtered, selectProduct]);

  const pct = stats && stats.total > 0
    ? Math.round((stats.conMsds / stats.total) * 100)
    : 0;

  // ── MSDS actions ──────────────────────────────────────────────────────────────

  async function handleSaveMsds() {
    if (!selected || !msdsInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${BASE}/api/products/${selected.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ msdsUrl: msdsInput.trim(), msds: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Error al guardar");
      }
      const updated: Product = await res.json();
      const currentId = selected.id;
      setSelected(updated);
      setMsdsInput("");
      setEditingUrl(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
      setTimeout(() => selectNextProduct(currentId), 300);
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMsds() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${BASE}/api/products/${selected.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ msdsUrl: null, msds: false }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Error al eliminar");
      }
      const updated: Product = await res.json();
      const currentId = selected.id;
      setSelected(updated);
      setMsdsInput("");
      setEditingUrl(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
      setTimeout(() => selectNextProduct(currentId), 300);
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlink() {
    if (!selected) return;
    const currentId = selected.id;
    const res = await fetch(`${BASE}/api/msds/unlink`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ productId: selected.id }),
    });
    if (res.ok) {
      const data = await res.json();
      // unlink returns { message, updated: [...] }
      const updatedList = data.updated ?? [];
      const updatedProduct = updatedList.find((p: Product) => p.id === currentId) ?? data;
      setSelected(updatedProduct);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
      setTimeout(() => selectNextProduct(currentId), 300);
    }
  }

  async function handleConfirm() {
    if (!selected) return;
    const currentId = selected.id;
    const res = await fetch(`${BASE}/api/msds/${selected.id}/confirm`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelected(updated);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
      setTimeout(() => selectNextProduct(currentId), 300);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Error al confirmar: ${err.error ?? res.statusText}`);
    }
  }

  async function handleExtract() {
    if (!selected?.msdsFileId) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`${BASE}/api/msds/${selected.id}/extract`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Error al escanear");
      }
      const { product } = await res.json();
      setSelected(product);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
    } catch (err: any) {
      setExtractError(err.message ?? "Error desconocido");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleClearExtract() {
    if (!selected) return;
    if (!window.confirm("¿Eliminar los datos extraídos por IA de este producto?")) return;
    try {
      await fetch(`${BASE}/api/msds/${selected.id}/extract`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setSelected({ ...selected, msdsExtractedData: null, msdsExtractedAt: null });
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
    } catch { /* silent */ }
  }

  // ── Print helpers ─────────────────────────────────────────────────────────────

  function handlePrintQr() {
    if (!selected || !selected.msdsUrl) return;
    const win = window.open("", "_blank", "width=420,height=320");
    if (!win) return;
    const svg = document.getElementById("msds-qr-svg")?.outerHTML ?? "";
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=378, height=276">
  <title>Etiqueta QR - ${selected.code}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
  <style>
    @page { size: 10cm 7.3cm landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 0; width: 10cm; height: 7.3cm; overflow: hidden; font-family: Arial, sans-serif; }
    @media print { .instruccion { display: none; } }
    .instruccion { font-family: sans-serif; font-size: 12px; color: #666; text-align: center; padding: 8px; background: #fffbea; border-bottom: 1px solid #e5c700; }
    .label { position: absolute; top: 0; left: 0; width: 10cm; height: 7.3cm; display: flex; flex-direction: row; padding: 6mm; gap: 4mm; }
    .col-qr { width: 45%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .col-qr svg { display: block; }
    .col-info { width: 55%; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
    .msds-title { font-size: 22px; font-weight: 900; color: #0c1a2e; line-height: 1; margin: 0 0 4px 0; letter-spacing: -0.5px; }
    .prod-name { font-size: 13px; font-weight: 700; color: #1e293b; word-break: break-word; line-height: 1.3; margin: 0 0 3px 0; }
    .prod-code { font-size: 11px; color: #64748b; margin: 0 0 4px 0; }
    .hint { font-size: 9px; color: #94a3b8; margin: 3px 0 0 0; line-height: 1.3; }
    #barcode { display: block; width: 100%; max-width: 120px; }
  </style>
</head>
<body>
  <div class="instruccion">⚠️ En el diálogo de impresión selecciona: <strong>Orientación Horizontal / Landscape</strong></div>
  <div class="label">
    <div class="col-qr">${svg}</div>
    <div class="col-info">
      <p class="msds-title">MSDS</p>
      <p class="prod-name">${selected.name}</p>
      <p class="prod-code">${selected.code}</p>
      <svg id="barcode"></svg>
      <p class="hint">Escanea el QR para ver la ficha de seguridad</p>
    </div>
  </div>
  <script>
    window.onload = function() {
      JsBarcode("#barcode", "${selected.code}", { format: "CODE128", displayValue: false, height: 40, margin: 0 });
      window.print();
    };
  <\/script>
</body>
</html>`);
    win.document.close();
  }

  const handlePrintAlbum = useCallback(async () => {
    const withMsds = products.filter((p) => p.msds && p.msdsUrl);
    if (withMsds.length === 0) return;
    const qrDataUrls: Record<string, string> = {};
    await Promise.all(withMsds.map(async (p) => {
      try {
        qrDataUrls[p.id] = await QRCode.toDataURL(p.msdsUrl!, { width: 95, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      } catch { qrDataUrls[p.id] = ""; }
    }));
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    const warehouseLabel = warehouse === "all" || !warehouse ? "Todos los almacenes" : warehouse;
    const html = buildMsdsAlbumHtml(withMsds, qrDataUrls, warehouseLabel);
    win.document.write(html);
    win.document.close();
  }, [products, warehouse]);

  const allWarehouses: (WarehouseType | "all")[] = ["all", ...WAREHOUSES];

  // ── Render ────────────────────────────────────────────────────────────────────

  const isAnyMutationPending = rescanMutation.isPending || resetAllMutation.isPending;

  return (
    <AppLayout>
      <div style={{ maxWidth: 1380, margin: "0 auto" }}>

        {/* ── Page header ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0c1a2e", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Shield style={{ width: 22, height: 22, color: "#0d9488" }} />
              Control de MSDS
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0 0" }}>
              Gestión y cruce inteligente de Fichas de Seguridad de Materiales
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="outline"
              onClick={() => setShowStats(!showStats)}
              style={{ gap: 5, fontSize: 12, color: "#64748b", borderColor: "#cbd5e1" }}
            >
              {showStats ? <EyeOff style={{ width: 13, height: 13 }} /> : <BarChart3 style={{ width: 13, height: 13 }} />}
              {showStats ? "Ocultar stats" : "Ver stats"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const warehouseParam = warehouse && warehouse !== "all" ? `?warehouse=${encodeURIComponent(warehouse)}` : "";
                const res = await fetch(`${BASE}/api/msds/export${warehouseParam}`, { headers: getAuthHeaders() });
                if (!res.ok) { alert("Error al generar el informe"); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                const cd = res.headers.get("Content-Disposition") ?? "";
                const match = cd.match(/filename="([^"]+)"/);
                a.download = match?.[1] ?? "informe_msds.xlsx";
                a.href = url;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ gap: 6, fontSize: 13, borderColor: "#0d9488", color: "#0d9488", background: "#f0fdf4", whiteSpace: "nowrap" }}
            >
              <FileSpreadsheet style={{ width: 15, height: 15 }} />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* ── Warehouse selector ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {allWarehouses.map((w) => {
            const active = warehouse === w || (w === "all" && (warehouse === "all" || !warehouse));
            return (
              <button
                key={w}
                onClick={() => setWarehouse(w as WarehouseType)}
                style={{
                  padding: "5px 14px", borderRadius: 8,
                  border: active ? "none" : "1.5px solid #cbd5e1",
                  background: active ? "#0d9488" : "#ffffff",
                  color: active ? "#ffffff" : "#475569",
                  fontWeight: active ? 700 : 400, fontSize: 13, cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {w === "all" ? "Todos" : w}
              </button>
            );
          })}
        </div>

        {/* ── Stats row ──────────────────────────────────────────────────────────── */}
        {showStats && (
          <div style={{ marginBottom: 20 }}>
            {/* Coverage bar */}
            <div style={{
              background: "#fff", borderRadius: 10, padding: "12px 16px",
              border: "1px solid #e2e8f0", marginBottom: 10,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Cobertura MSDS global
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: pct === 100 ? "#16a34a" : "#0d9488" }}>
                  {stats ? `${pct}%` : "—"}
                </span>
              </div>
              <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4 }}>
                <div style={{
                  height: 8, borderRadius: 4, transition: "width 0.5s",
                  width: `${pct}%`,
                  background: pct === 100 ? "#16a34a" : pct > 60 ? "#0d9488" : pct > 30 ? "#ca8a04" : "#dc2626",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {stats?.conMsds ?? "—"} con MSDS  ·  {stats?.sinMsds ?? "—"} sin MSDS
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  Total: {stats?.total ?? "—"} productos
                </span>
              </div>
            </div>

            {/* Status breakdown */}
            {matchStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {(["EXACT", "PROBABLE", "MANUAL_REVIEW", "NONE"] as const).map((key) => {
                  const cfg = STATUS_CONFIG[key];
                  const count = matchStats[key] ?? 0;
                  const total = stats?.total ?? 1;
                  const pctKey = Math.round((count / total) * 100);
                  return (
                    <button
                      key={key}
                      onClick={() => { setStatusFilter(key); setActiveTab("smart"); }}
                      style={{
                        background: statusFilter === key && activeTab === "smart" ? cfg.bg : "#fff",
                        borderRadius: 10, padding: "12px 14px",
                        border: `1.5px solid ${statusFilter === key && activeTab === "smart" ? cfg.color + "66" : "#e2e8f0"}`,
                        cursor: "pointer", textAlign: "left",
                        transition: "all 0.15s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <cfg.Icon style={{ width: 16, height: 16, color: cfg.color }} />
                        <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{pctKey}%</span>
                      </div>
                      <p style={{ fontSize: 24, fontWeight: 800, color: cfg.color, margin: "0 0 2px 0" }}>{count}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: cfg.color, margin: 0, opacity: 0.8 }}>{cfg.label}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
          {[
            { key: "smart", label: "Cruce Inteligente", icon: <Zap style={{ width: 14, height: 14 }} /> },
            { key: "manual", label: "Gestión Manual", icon: <Save style={{ width: 14, height: 14 }} /> },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
                fontSize: 13, fontWeight: activeTab === key ? 700 : 400,
                color: activeTab === key ? "#0d9488" : "#64748b",
                borderBottom: `2px solid ${activeTab === key ? "#0d9488" : "transparent"}`,
                marginBottom: -2,
              }}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Smart tab toolbar ──────────────────────────────────────────────────── */}
        {activeTab === "smart" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
            {/* Status filter pills */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(["all", "EXACT", "PROBABLE", "MANUAL_REVIEW", "NONE"] as const).map((s) => {
                const cfg = s === "all" ? null : STATUS_CONFIG[s];
                const active = statusFilter === s;
                const count = s === "all" ? (stats?.total ?? 0) : (matchStats?.[s] ?? 0);
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "4px 11px", borderRadius: 9999, fontSize: 12, cursor: "pointer",
                      border: active ? "none" : "1.5px solid #e2e8f0",
                      background: active ? (cfg?.color ?? "#0d9488") : "#fff",
                      color: active ? "#fff" : "#475569",
                      fontWeight: active ? 700 : 400,
                      display: "flex", alignItems: "center", gap: 4,
                      transition: "all 0.1s",
                    }}
                  >
                    {s === "all" ? "Todos" : (cfg?.label ?? s)}
                    <span style={{
                      fontSize: 10, background: active ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                      color: active ? "#fff" : "#64748b",
                      padding: "0 4px", borderRadius: 9999, fontWeight: 700,
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            {isAdminOrSupervisor && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(matchStats?.PROBABLE ?? 0) > 0 && (
                  <Button
                    onClick={() => {
                      if (!window.confirm(`¿Sincronizar ${matchStats!.PROBABLE} productos como Exactos?`)) return;
                      confirmAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined });
                    }}
                    disabled={confirmAllMutation.isPending || isAnyMutationPending}
                    variant="outline"
                    style={{ gap: 5, fontSize: 12, borderColor: "#16a34a", color: "#16a34a", height: 32 }}
                  >
                    {confirmAllMutation.isPending
                      ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                      : <CheckCircle2 style={{ width: 12, height: 12 }} />}
                    Confirmar probables ({matchStats!.PROBABLE})
                  </Button>
                )}
                <Button
                  onClick={() => rescanMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined })}
                  disabled={isAnyMutationPending}
                  style={{ gap: 5, background: "#0c1a2e", color: "#fff", border: "none", fontSize: 12, height: 32 }}
                >
                  {rescanMutation.isPending
                    ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                    : <RefreshCw style={{ width: 12, height: 12 }} />}
                  Escanear Drive
                </Button>
                <Button
                  onClick={() => rescanMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, force: true })}
                  disabled={isAnyMutationPending}
                  variant="outline"
                  style={{ gap: 5, fontSize: 12, height: 32 }}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  Forzar re-escaneo
                </Button>
                <Button
                  onClick={() => {
                    const warehouseLabel = warehouse && warehouse !== "all" ? `"${warehouse}"` : "todos";
                    if (!window.confirm(
                      `⚠️ Reiniciará cruces automáticos de ${warehouseLabel}.\n` +
                      `Los vínculos manuales se conservan.\n\n¿Continuar?`
                    )) return;
                    resetAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, resetManual: false });
                  }}
                  disabled={isAnyMutationPending}
                  variant="outline"
                  style={{ gap: 5, fontSize: 12, borderColor: "#dc2626", color: "#dc2626", height: 32 }}
                >
                  {resetAllMutation.isPending
                    ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                    : <RotateCcw style={{ width: 12, height: 12 }} />}
                  Reiniciar auto
                </Button>
                <Button
                  onClick={() => {
                    if (!window.confirm(
                      `⚠️ REINICIO TOTAL — borrará TODOS los cruces incluidos manuales.\n¿Seguro?`
                    )) return;
                    resetAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, resetManual: true });
                  }}
                  disabled={isAnyMutationPending}
                  variant="outline"
                  style={{ gap: 5, fontSize: 11, borderColor: "#7f1d1d", color: "#7f1d1d", height: 32 }}
                >
                  <RotateCcw style={{ width: 11, height: 11 }} />
                  Reinicio total
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Feedback banners ───────────────────────────────────────────────────── */}
        {resetAllMutation.isSuccess && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#c2410c", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 style={{ width: 15, height: 15 }} />
            Reinicio completado — {(resetAllMutation.data as any).resetCount} productos limpiados
          </div>
        )}
        {resetAllMutation.isError && (
          <div style={{ background: "#fff7f7", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle style={{ width: 15, height: 15 }} />
            Error al reiniciar: {(resetAllMutation.error as Error).message}
          </div>
        )}
        {rescanMutation.isSuccess && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#16a34a", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 style={{ width: 15, height: 15 }} />
            Escaneo completado — {(rescanMutation.data as any).productsProcessed} productos procesados,{" "}
            {(rescanMutation.data as any).productsSkipped} conservados (manuales),{" "}
            {(rescanMutation.data as any).filesScanned} archivos de Drive
          </div>
        )}
        {rescanMutation.isError && (
          <div style={{ background: "#fff7f7", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle style={{ width: 15, height: 15 }} />
            Error: {(rescanMutation.error as Error).message}
          </div>
        )}
        {confirmAllMutation.isSuccess && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#16a34a", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 style={{ width: 15, height: 15 }} />
            {(confirmAllMutation.data as any).message}
          </div>
        )}

        {/* ── Main layout ─────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>

          {/* ── Left: product list ──────────────────────────────────────────────── */}
          <div style={{
            background: "#fff", borderRadius: 12,
            border: "1px solid #e2e8f0", overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
              {activeTab === "manual" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Button
                    onClick={handlePrintAlbum}
                    disabled={products.filter(p => p.msds && p.msdsUrl).length === 0}
                    style={{
                      background: "#0c1a2e", color: "#fff", border: "none",
                      gap: 6, width: "100%", justifyContent: "center",
                    }}
                  >
                    <BookOpen style={{ width: 14, height: 14 }} />
                    Imprimir Álbum MSDS
                    <span style={{ fontSize: 11, opacity: 0.7 }}>({products.filter(p => p.msds && p.msdsUrl).length})</span>
                  </Button>
                  {isAdminOrSupervisor && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        onClick={() => {
                          if (!window.confirm("¿REINICIO TOTAL? Se borrarán TODOS los cruces incluidos manuales.")) return;
                          resetAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, resetManual: true });
                        }}
                        disabled={isAnyMutationPending}
                        variant="outline"
                        style={{ flex: 1, gap: 5, fontSize: 11, borderColor: "#7f1d1d", color: "#7f1d1d", height: 30 }}
                      >
                        {resetAllMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Reinicio Total
                      </Button>
                      <Button
                        onClick={() => rescanMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, force: true })}
                        disabled={isAnyMutationPending}
                        variant="outline"
                        style={{ flex: 1, gap: 5, fontSize: 11, borderColor: "#0c1a2e", color: "#0c1a2e", height: 30 }}
                      >
                        {rescanMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Re-escaneo
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Search */}
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94a3b8" }} />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código, nombre, proveedor, CAS…"
                  style={{ paddingLeft: 32, fontSize: 13 }}
                />
              </div>

              {/* Results count */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {filtered.length} de {products.length} productos
                </span>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Limpiar ✕
                  </button>
                )}
              </div>
            </div>

            {isLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "#64748b", fontSize: 13 }}>
                <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
                Cargando productos…
              </div>
            )}
            {isError && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "#dc2626", fontSize: 13 }}>
                <AlertCircle style={{ width: 18, height: 18 }} />
                Error al cargar productos
              </div>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, color: "#94a3b8", textAlign: "center" }}>
                <LayoutList style={{ width: 32, height: 32, marginBottom: 8, opacity: 0.3 }} />
                <p style={{ fontSize: 13, margin: 0 }}>
                  {search ? "Sin resultados para esta búsqueda" : "Sin productos en esta categoría"}
                </p>
              </div>
            )}

            {!isLoading && !isError && filtered.length > 0 && (
              <div style={{ flex: 1, overflowY: "auto", maxHeight: 560 }}>
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  const status = p.msdsStatus ?? "NONE";
                  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NONE;
                  const Icon = cfg.Icon;
                  const sm = sinMovimiento(lastMovements[p.code]);
                  return (
                    <div
                      key={p.id}
                      onClick={() => selectProduct(p)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid #f8fafc",
                        background: isSelected
                          ? "rgba(13,148,136,0.07)"
                          : "transparent",
                        borderLeft: isSelected ? `3px solid #0d9488` : "3px solid transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.code}
                          </p>
                          {p.msdsMatchedBy === "manual" && (
                            <span title="Vinculado manualmente" style={{ fontSize: 9, color: "#7c3aed", background: "#f5f3ff", padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                              M
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: "#64748b", margin: "1px 0 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </p>
                        {activeTab === "smart" && p.msdsScore != null && p.msdsScore > 0 && (
                          <div style={{ marginTop: 3 }}>
                            <ScoreBar score={p.msdsScore} status={status} />
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
                        {activeTab === "smart" && <StatusBadge status={status} />}
                        <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {p.msds
                            ? <ShieldCheck style={{ width: 17, height: 17, color: "#16a34a" }} />
                            : <ShieldOff style={{ width: 17, height: 17, color: "#cbd5e1" }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: details panel ────────────────────────────────────────────── */}
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            overflowY: "auto", maxHeight: 720,
          }}>
            {!selected ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", textAlign: "center", padding: 20, minHeight: 300 }}>
                <BookOpen style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.15 }} />
                <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#64748b" }}>Selecciona un producto</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>para gestionar su MSDS</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Product header */}
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Badge variant="outline" style={{ background: "#f1f5f9", color: "#475569", fontWeight: 700, fontSize: 12 }}>
                      {selected.code}
                    </Badge>
                    <span style={{ fontSize: 11, color: "#94a3b8", background: "#f8fafc", padding: "2px 8px", borderRadius: 4 }}>
                      {selected.warehouse}
                    </span>
                    {selected.msdsMatchedBy === "manual" && (
                      <span style={{ fontSize: 10, color: "#7c3aed", background: "#f5f3ff", padding: "2px 7px", borderRadius: 9999, fontWeight: 700 }}>
                        ✓ Vinculado manualmente
                      </span>
                    )}
                    <div style={{ marginLeft: "auto" }}>
                      <StatusBadge status={selected.msdsStatus} size="md" />
                    </div>
                  </div>
                  <h2 style={{ fontSize: 17, fontWeight: 800, color: "#0c1a2e", margin: 0, lineHeight: 1.3 }}>
                    {selected.name}
                  </h2>
                  {selected.supplier && (
                    <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0 0" }}>
                      Proveedor: {selected.supplier}
                      {selected.casNumber && <span style={{ marginLeft: 10 }}>CAS: <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>{selected.casNumber}</code></span>}
                    </p>
                  )}
                </div>

                {/* Current MSDS Status */}
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Ficha de Seguridad
                    </span>
                    <span style={{
                      display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
                      color: selected.msds ? "#16a34a" : "#94a3b8",
                    }}>
                      {selected.msds
                        ? <><ShieldCheck style={{ width: 16, height: 16 }} /> Con MSDS</>
                        : <><ShieldOff style={{ width: 16, height: 16 }} /> Sin MSDS</>}
                    </span>
                  </div>

                  {selected.msdsUrl ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, fontWeight: 700, textTransform: "uppercase" }}>URL de la ficha</p>
                          <div style={{ display: "flex", gap: 4 }}>
                            <Button
                              onClick={() => window.open(selected.msdsUrl!, "_blank")}
                              style={{ fontSize: 10, padding: "2px 7px", height: "auto", gap: 3, background: "#0d9488", color: "#fff", border: "none" }}
                            >
                              <Download style={{ width: 10, height: 10 }} /> Ver
                            </Button>
                            <Button
                              onClick={handlePrintQr}
                              style={{ fontSize: 10, padding: "2px 7px", height: "auto", gap: 3, background: "#0c1a2e", color: "#fff", border: "none" }}
                            >
                              <Printer style={{ width: 10, height: 10 }} /> QR
                            </Button>
                          </div>
                        </div>
                        <p style={{ fontSize: 11, color: "#0d9488", margin: 0, wordBreak: "break-all", fontWeight: 500 }}>
                          {selected.msdsUrl}
                        </p>
                        {selected.msdsFileName && (
                          <p style={{ fontSize: 10, color: "#94a3b8", margin: "4px 0 0 0" }}>
                            📎 {selected.msdsFileName}
                          </p>
                        )}
                      </div>

                      <div style={{ display: "none" }}>
                        <QRCodeSVG id="msds-qr-svg" value={selected.msdsUrl} size={200} level="H" includeMargin />
                      </div>

                      {canEdit && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button
                            variant="outline"
                            onClick={() => { setMsdsInput(selected.msdsUrl!); setEditingUrl(true); }}
                            style={{ flex: 1, fontSize: 12, height: 32, gap: 5 }}
                          >
                            <RefreshCw style={{ width: 12, height: 12 }} /> Editar URL
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleUnlink}
                            disabled={saving}
                            style={{ flex: 1, fontSize: 12, height: 32, gap: 5, borderColor: "#fca5a5", color: "#dc2626" }}
                          >
                            {saving ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Trash2 style={{ width: 12, height: 12 }} />}
                            Desvincular
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "8px 0" }}>
                      <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 10px 0" }}>
                        No hay ficha vinculada a este producto.
                      </p>
                      {canEdit && !editingUrl && (
                        <Button
                          onClick={() => setEditingUrl(true)}
                          style={{ background: "#0d9488", color: "#fff", border: "none", fontSize: 12, gap: 5 }}
                        >
                          <Link2 style={{ width: 13, height: 13 }} />
                          Vincular manualmente
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Manual URL form */}
                {editingUrl && (
                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1.5px solid #0d9488", boxShadow: "0 4px 12px rgba(13,148,136,0.1)" }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0d9488", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                      <Save style={{ width: 13, height: 13 }} /> Vincular URL de MSDS
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Input
                        value={msdsInput}
                        onChange={(e) => setMsdsInput(e.target.value)}
                        placeholder="https://drive.google.com/file/..."
                        style={{ fontSize: 13 }}
                        autoFocus
                      />
                      {saveError && <p style={{ fontSize: 11, color: "#dc2626", margin: 0 }}>⚠ {saveError}</p>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          onClick={handleSaveMsds}
                          disabled={saving || !msdsInput.trim()}
                          style={{ flex: 1, background: "#0d9488", color: "#fff", border: "none", fontSize: 12 }}
                        >
                          {saving ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : "Guardar"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => { setEditingUrl(false); setMsdsInput(""); setSaveError(null); }}
                          disabled={saving}
                          style={{ fontSize: 12 }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Smart Match section ─────────────────────────────────────────────── */}
                <div style={{ borderTop: "1.5px solid #f1f5f9", paddingTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <Zap style={{ width: 14, height: 14, color: "#0d9488" }} />
                      Cruce Inteligente
                    </h3>
                    {selected.msdsLastCheckedAt && (
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        Verificado: {new Date(selected.msdsLastCheckedAt).toLocaleDateString("es-SV")}
                      </span>
                    )}
                  </div>

                  {/* Linked file info (EXACT/PROBABLE/MANUAL_REVIEW) */}
                  {selected.msdsStatus && selected.msdsStatus !== "NONE" ? (
                    <div style={{
                      background: (STATUS_CONFIG[selected.msdsStatus as keyof typeof STATUS_CONFIG]?.bg ?? "#f8fafc") + "50",
                      padding: 12, borderRadius: 8,
                      border: `1px solid ${STATUS_CONFIG[selected.msdsStatus as keyof typeof STATUS_CONFIG]?.border ?? "#e2e8f0"}`,
                      marginBottom: 14,
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", margin: "0 0 3px 0", overflow: "hidden", textOverflow: "ellipsis" }}>
                            📄 {selected.msdsFileName || "Archivo vinculado"}
                          </p>
                          {selected.msdsMatchReason && (
                            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px 0", fontStyle: "italic", lineHeight: 1.4 }}>
                              💡 {selected.msdsMatchReason}
                            </p>
                          )}
                          <ScoreBar score={selected.msdsScore} status={selected.msdsStatus} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                          {selected.msdsUrl && (
                            <Button
                              onClick={() => window.open(selected.msdsUrl!, "_blank")}
                              style={{ fontSize: 10, padding: "3px 9px", height: "auto", gap: 3, background: "#0d9488", color: "#fff", border: "none" }}
                            >
                              <Download style={{ width: 10, height: 10 }} /> Ver
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="outline"
                              onClick={handleUnlink}
                              style={{ fontSize: 10, padding: "3px 9px", height: "auto", gap: 3, borderColor: "#fca5a5", color: "#dc2626" }}
                            >
                              <Trash2 style={{ width: 10, height: 10 }} /> Desvincular
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Confirm button for PROBABLE / MANUAL_REVIEW */}
                      {canEdit && (selected.msdsStatus === "PROBABLE" || selected.msdsStatus === "MANUAL_REVIEW") && (
                        <Button
                          onClick={handleConfirm}
                          style={{
                            width: "100%", marginTop: 10, fontSize: 12, padding: "6px 10px",
                            height: "auto", gap: 5, background: "#16a34a", color: "#fff", border: "none",
                          }}
                        >
                          <CheckCircle2 style={{ width: 13, height: 13 }} />
                          Confirmar como exacto y propagar a todos los almacenes
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: "10px 14px", background: "#fff7f7",
                      border: "1.5px dashed #fca5a5", borderRadius: 8, marginBottom: 14,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <XCircle style={{ width: 15, height: 15, color: "#dc2626", flexShrink: 0 }} />
                        <p style={{ fontSize: 13, color: "#dc2626", margin: 0, fontWeight: 600 }}>Sin coincidencia automática</p>
                      </div>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0 0" }}>
                        Usa "Buscar posibles MSDS" para encontrar candidatos o vincula manualmente.
                      </p>
                    </div>
                  )}

                  {/* Candidates (for products that already have a match — from /match endpoint) */}
                  {selected.msds && showCandidates && productMatch && productMatch.match.candidates.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", margin: 0 }}>
                          Otros candidatos ({productMatch.match.candidates.length})
                        </h4>
                        {isMatchLoading && <Loader2 style={{ width: 13, height: 13, color: "#0d9488" }} className="animate-spin" />}
                      </div>
                      <CandidateList
                        productId={selected.id}
                        candidates={productMatch.match.candidates}
                        onLinked={(updated) => {
                          const currentId = selected.id;
                          if (updated) setSelected(updated);
                          void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
                          void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
                          setTimeout(() => selectNextProduct(currentId), 300);
                        }}
                        compact
                      />
                    </div>
                  )}

                  {/* ── Re-buscar panel for NONE products ──────────────────────────────── */}
                  {(!selected.msdsStatus || selected.msdsStatus === "NONE") && canEdit && (
                    <RebuscarPanel
                      product={selected}
                      onLinked={(updated) => {
                        const currentId = selected.id;
                        if (updated) setSelected(updated);
                        void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
                        void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
                        void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
                        setTimeout(() => selectNextProduct(currentId), 300);
                      }}
                    />
                  )}
                </div>

                {/* ── IA Extraction section ──────────────────────────────────────────── */}
                {selected.msdsExtractedData ? (
                  <div style={{ borderTop: "1.5px solid #f1f5f9", paddingTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        <ScanLine style={{ width: 14, height: 14, color: "#8b5cf6" }} />
                        Datos extraídos por IA
                      </h3>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {selected.msdsExtractedAt && (
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>
                            {new Date(selected.msdsExtractedAt).toLocaleDateString("es-SV")}
                          </span>
                        )}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            onClick={handleClearExtract}
                            style={{ height: 22, padding: "0 6px", fontSize: 10, color: "#94a3b8" }}
                          >
                            Limpiar
                          </Button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      {[
                        { label: "CAS", value: selected.msdsExtractedData.cas },
                        { label: "Familia Química", value: selected.msdsExtractedData.familiaQuimica },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: "#f5f3ff", padding: "8px 10px", borderRadius: 8, border: "1px solid #e9d5ff" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", margin: "0 0 2px 0", textTransform: "uppercase" }}>{label}</p>
                          <p style={{ fontSize: 12, color: "#1e293b", margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {value || "—"}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { Icon: Skull, color: "#ef4444", bg: "#fff1f2", label: "Identificación de peligros", value: selected.msdsExtractedData.identificacionPeligro },
                        { Icon: HeartPulse, color: "#10b981", bg: "#ecfdf5", label: "Primeros auxilios", value: selected.msdsExtractedData.primerosAuxiliosContacto },
                        { Icon: Thermometer, color: "#f59e0b", bg: "#fffbeb", label: "Incompatibilidades", value: selected.msdsExtractedData.incompatibilidad },
                        { Icon: Shield, color: "#3b82f6", bg: "#eff6ff", label: "Control de exposición", value: selected.msdsExtractedData.controlExposicion },
                      ].map(({ Icon, color, bg, label, value }) => value && (
                        <div key={label} style={{ background: bg, padding: "8px 10px", borderRadius: 8, border: `1px solid ${color}22` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <Icon style={{ width: 13, height: 13, color }} />
                            <p style={{ fontSize: 10, fontWeight: 700, color, margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</p>
                          </div>
                          <p style={{ fontSize: 11, color: "#475569", margin: 0, lineHeight: 1.5 }}>{value}</p>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 8, fontSize: 10, color: "#94a3b8" }}>
                      <span>📄 {selected.msdsExtractedData.pagesScanned} págs.</span>
                      <span>·</span>
                      <span>{selected.msdsExtractedData.charCount.toLocaleString()} caracteres</span>
                    </div>
                  </div>
                ) : selected.msdsFileId && canEdit && (
                  <div style={{ borderTop: "1.5px solid #f1f5f9", paddingTop: 14 }}>
                    <Button
                      onClick={handleExtract}
                      disabled={isExtracting}
                      style={{ width: "100%", background: "#8b5cf6", color: "#fff", border: "none", gap: 6, fontSize: 12 }}
                    >
                      {isExtracting
                        ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Analizando con IA…</>
                        : <><ScanLine style={{ width: 13, height: 13 }} /> Extraer datos con IA</>}
                    </Button>
                    <p style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", margin: "6px 0 0 0" }}>
                      Extrae CAS, peligros, primeros auxilios e incompatibilidades del PDF
                    </p>
                    {extractError && (
                      <p style={{ fontSize: 11, color: "#dc2626", marginTop: 6, textAlign: "center" }}>⚠ {extractError}</p>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
