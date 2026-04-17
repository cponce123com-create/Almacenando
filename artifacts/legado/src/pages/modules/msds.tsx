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

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_CONFIG = {
  EXACT: {
    label: "Exacto",
    color: "#16a34a",
    bg: "#dcfce7",
    Icon: CheckCircle2,
    description: "Coincidencia segura — código o fórmula exacta",
  },
  PROBABLE: {
    label: "Probable",
    color: "#ca8a04",
    bg: "#fef9c3",
    Icon: Clock,
    description: "Buena coincidencia, verificar antes de usar",
  },
  MANUAL_REVIEW: {
    label: "Revisar",
    color: "#ea580c",
    bg: "#ffedd5",
    Icon: HelpCircle,
    description: "Similitud leve — requiere revisión manual",
  },
  NONE: {
    label: "Sin MSDS",
    color: "#dc2626",
    bg: "#fee2e2",
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

function StatusBadge({ status }: { status: string | null | undefined }) {
  const cfg = STATUS_CONFIG[(status ?? "NONE") as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NONE;
  const Icon = cfg.Icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      <Icon style={{ width: 11, height: 11 }} />
      {cfg.label}
    </span>
  );
}


function ScoreBar({ score, status }: { score: number | null | undefined; status?: string | null }) {
  const s = score ?? 0;
  const pct = Math.min(100, Math.round((s / 200) * 100));
  // Prefer status-based color so the bar matches the badge (EXACT=green, etc.)
  const derivedStatus = status ?? (s >= 120 ? "EXACT" : s >= 60 ? "PROBABLE" : s >= 25 ? "MANUAL_REVIEW" : "NONE");
  const color = STATUS_CONFIG[derivedStatus as keyof typeof STATUS_CONFIG]?.color ?? "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 80 }}>
      <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{s}pt</span>
    </div>
  );
}

// ── Candidate list ─────────────────────────────────────────────────────────────

function CandidateList({
  candidates,
  productId,
  onLinked,
}: {
  candidates: MatchCandidate[];
  productId: string;
  onLinked: (updatedProduct?: Product) => void;
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
      <div style={{ padding: "12px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        No se encontraron candidatos en Google Drive
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {linkMutation.error && (
        <div style={{ padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
          ⚠ {(linkMutation.error as Error).message}
        </div>
      )}
      {candidates.map((c, i) => {
        const candidateStatus = c.score >= 120 ? "EXACT" : c.score >= 60 ? "PROBABLE" : "MANUAL_REVIEW";
        const cfg = STATUS_CONFIG[candidateStatus];
        const isExpanded = expanded === c.fileId;
        return (
          <div
            key={c.fileId}
            style={{
              border: `1.5px solid ${i === 0 ? cfg.color + "66" : "#e2e8f0"}`,
              borderRadius: 8,
              background: i === 0 ? cfg.bg + "40" : "#fafafa",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {i === 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase" }}>
                      Mejor candidato
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.fileName}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{c.folderName}</span>
                  <ScoreBar score={c.score} status={candidateStatus} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <Button
                  onClick={() => linkMutation.mutate(c)}
                  disabled={linkMutation.isPending}
                  style={{ fontSize: 11, padding: "4px 10px", height: "auto", gap: 4, background: "#0d9488", color: "#fff", border: "none" }}
                >
                  {linkMutation.isPending ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Link2 style={{ width: 11, height: 11 }} />}
                  {linkMutation.isPending ? "Guardando…" : "Vincular"}
                </Button>
                <button
                  onClick={() => setExpanded(isExpanded ? null : c.fileId)}
                  style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, padding: 0 }}
                >
                  {isExpanded ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                  detalle
                </button>
              </div>
            </div>
            {isExpanded && (
              <div style={{ padding: "0 12px 10px", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px 0", fontStyle: "italic" }}>{c.reason}</p>
                <a
                  href={c.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: "#0d9488", wordBreak: "break-all" }}
                >
                  {c.link}
                </a>
              </div>
            )}
          </div>
        );
      })}
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

  const isAdminOrSupervisor = user?.role === "admin" || user?.role === "supervisor";
  const canEdit = user?.role === "admin" || user?.role === "supervisor" || user?.role === "operator";

  const warehouseQ = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const warehouseStats = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";

  const { data: products = [], isLoading, isError } = useQuery<Product[]>({
    queryKey: ["/api/products", warehouse],
    queryFn: () => apiJson(`/api/products${warehouseQ ? warehouseQ + "&limit=500" : "?limit=500"}`).then((r: any) => r.data ?? r),
  });

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
    enabled: !!selected,
  });

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

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((p) => {
      const matchesSearch = !term ||
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || p.msdsStatus === statusFilter ||
        (statusFilter === "NONE" && !p.msdsStatus);
      return matchesSearch && (activeTab === "manual" ? matchesSearch : matchesSearch && matchesStatus);
    });
  }, [products, search, statusFilter, activeTab]);

  // Helper para seleccionar el siguiente producto automáticamente
  const selectNextProduct = useCallback((currentId: string) => {
    const currentIndex = filtered.findIndex(p => p.id === currentId);
    if (currentIndex !== -1 && currentIndex < filtered.length - 1) {
      const nextProduct = filtered[currentIndex + 1];
      setSelected(nextProduct);
      setEditingUrl(false);
      setMsdsInput("");
      setSaveError(null);
      setShowCandidates(true);
    } else {
      setSelected(null);
    }
  }, [filtered]);

  const pct = stats && stats.total > 0
    ? Math.round((stats.conMsds / stats.total) * 100)
    : 0;

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
      
      // Auto-seleccionar siguiente después de guardar manualmente si el usuario lo desea
      // (En gestión manual suele ser más deliberado, pero lo activamos para consistencia)
      setTimeout(() => selectNextProduct(currentId), 300);
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMsds() {
    if (!selected) return;
    // Eliminada la confirmación manual según solicitud del usuario
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
      
      // Auto-seleccionar siguiente tras desvincular
      setTimeout(() => selectNextProduct(currentId), 300);
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
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
    } catch {
      /* silent */
    }
  }

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

  return (
    <AppLayout>
      <div style={{ maxWidth: 1300, margin: "0 auto" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0c1a2e", margin: 0 }}>Control de MSDS</h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "4px 0 0 0" }}>
              Gestión y cruce inteligente de Fichas de Seguridad
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const warehouseParam = warehouse && warehouse !== "all" ? `?warehouse=${encodeURIComponent(warehouse)}` : "";
              const res = await fetch(`${BASE}/api/msds/export${warehouseParam}`, {
                headers: getAuthHeaders(),
              });
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

        {/* Warehouse selector */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {allWarehouses.map((w) => {
            const active = warehouse === w || (w === "all" && (warehouse === "all" || !warehouse));
            return (
              <button
                key={w}
                onClick={() => setWarehouse(w as WarehouseType)}
                style={{
                  padding: "6px 16px", borderRadius: 8,
                  border: active ? "none" : "1.5px solid #cbd5e1",
                  background: active ? "#0d9488" : "#ffffff",
                  color: active ? "#ffffff" : "#475569",
                  fontWeight: active ? 600 : 400, fontSize: 13, cursor: "pointer",
                }}
              >
                {w === "all" ? "Todos" : w}
              </button>
            );
          })}
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>Sin MSDS</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#dc2626", margin: 0 }}>{stats?.sinMsds ?? "—"}</p>
          </div>
          <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>Con MSDS</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#16a34a", margin: 0 }}>{stats?.conMsds ?? "—"}</p>
          </div>
          <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>Completado</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#0d9488", margin: 0 }}>{stats ? `${pct}%` : "—"}</p>
            <div style={{ marginTop: 6, height: 5, background: "#e2e8f0", borderRadius: 3 }}>
              <div style={{ height: 5, width: `${pct}%`, background: pct === 100 ? "#16a34a" : "#0d9488", borderRadius: 3, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* Smart match stats */}
          {matchStats && (
            <>
              <div style={{ background: "#dcfce7", borderRadius: 10, padding: "14px 16px", border: "1px solid #bbf7d0" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>✓ Exactos</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#16a34a", margin: 0 }}>{matchStats.EXACT}</p>
              </div>
              <div style={{ background: "#fef9c3", borderRadius: 10, padding: "14px 16px", border: "1px solid #fde68a" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#ca8a04", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>~ Probables</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#ca8a04", margin: 0 }}>{matchStats.PROBABLE}</p>
              </div>
              <div style={{ background: "#ffedd5", borderRadius: 10, padding: "14px 16px", border: "1px solid #fed7aa" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#ea580c", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>? Revisar</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#ea580c", margin: 0 }}>{matchStats.MANUAL_REVIEW}</p>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
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

        {/* Smart tab toolbar */}
        {activeTab === "smart" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "EXACT", "PROBABLE", "MANUAL_REVIEW", "NONE"].map((s) => {
                const cfg = s === "all" ? null : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "5px 12px", borderRadius: 9999, fontSize: 12, cursor: "pointer",
                      border: active ? "none" : "1.5px solid #e2e8f0",
                      background: active ? (cfg?.color ?? "#0d9488") : "#fff",
                      color: active ? "#fff" : "#475569",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {s === "all" ? "Todos" : (cfg?.label ?? s)}
                  </button>
                );
              })}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isAdminOrSupervisor && (
                <>
                  {(matchStats?.PROBABLE ?? 0) > 0 && (
                    <Button
                      onClick={() => {
                        if (!window.confirm(`¿Sincronizar ${matchStats!.PROBABLE} productos "Con MSDS" de Gestión Manual como Exactos en Cruce Inteligente?`)) return;
                        confirmAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined });
                      }}
                      disabled={confirmAllMutation.isPending || rescanMutation.isPending}
                      variant="outline"
                      style={{ gap: 6, fontSize: 12, borderColor: "#16a34a", color: "#16a34a" }}
                    >
                      {confirmAllMutation.isPending
                        ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Sincronizando...</>
                        : <><CheckCircle2 style={{ width: 13, height: 13 }} />Con MSDS → Exacto ({matchStats!.PROBABLE})</>
                      }
                    </Button>
                  )}
                  <Button
                    onClick={() => rescanMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined })}
                    disabled={rescanMutation.isPending}
                    style={{ gap: 6, background: "#0c1a2e", color: "#fff", border: "none", fontSize: 12 }}
                  >
                    {rescanMutation.isPending
                      ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Escaneando...</>
                      : <><RefreshCw style={{ width: 13, height: 13 }} />Escanear Drive</>
                    }
                  </Button>
                  <Button
                    onClick={() => rescanMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, force: true })}
                    disabled={rescanMutation.isPending || resetAllMutation.isPending}
                    variant="outline"
                    style={{ gap: 6, fontSize: 12 }}
                  >
                    Forzar re-escaneo
                  </Button>
                  {/* Reiniciar solo automáticos */}
                  <Button
                    onClick={() => {
                      const warehouseLabel = warehouse && warehouse !== "all" ? `"${warehouse}"` : "todos los almacenes";
                      const exactCount = matchStats?.EXACT ?? 0;
                      if (!window.confirm(
                        `⚠️ REINICIO (solo automáticos)\n\n` +
                        `Borrará ${exactCount} cruces automáticos de ${warehouseLabel} y re-escaneará con el nuevo algoritmo.\n\n` +
                        `Los vínculos confirmados manualmente se conservarán.\n\n¿Continuar?`
                      )) return;
                      resetAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, resetManual: false });
                    }}
                    disabled={resetAllMutation.isPending || rescanMutation.isPending}
                    variant="outline"
                    style={{
                      gap: 6, fontSize: 12,
                      borderColor: resetAllMutation.isPending ? "#f87171" : "#dc2626",
                      color: resetAllMutation.isPending ? "#f87171" : "#dc2626",
                      background: resetAllMutation.isPending ? "#fff5f5" : "transparent",
                    }}
                  >
                    {resetAllMutation.isPending
                      ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Reiniciando...</>
                      : <><RotateCcw style={{ width: 13, height: 13 }} />Reiniciar y re-escanear</>
                    }
                  </Button>
                  {/* Reiniciar TODO incluyendo manuales */}
                  <Button
                    onClick={() => {
                      const warehouseLabel = warehouse && warehouse !== "all" ? `"${warehouse}"` : "todos los almacenes";
                      if (!window.confirm(
                        `⚠️ REINICIO TOTAL\n\n` +
                        `Borrará TODOS los cruces de ${warehouseLabel}, incluyendo los confirmados manualmente.\n\n` +
                        `Se re-escaneará Drive desde cero.\n\n¿Seguro?`
                      )) return;
                      resetAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, resetManual: true });
                    }}
                    disabled={resetAllMutation.isPending || rescanMutation.isPending}
                    variant="outline"
                    style={{ gap: 6, fontSize: 11, borderColor: "#7f1d1d", color: "#7f1d1d" }}
                  >
                    <RotateCcw style={{ width: 12, height: 12 }} />
                    Reinicio total
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {resetAllMutation.isSuccess && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#c2410c" }}>
            ✓ Reinicio completado — {(resetAllMutation.data as any).resetCount} limpiados,{" "}
            {(resetAllMutation.data as any).rescanned} re-escaneados,{" "}
            {(resetAllMutation.data as any).filesScanned} archivos de Drive
          </div>
        )}
        {resetAllMutation.isError && (
          <div style={{ background: "#fff7f7", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
            Error al reiniciar: {(resetAllMutation.error as Error).message}
          </div>
        )}

        {rescanMutation.isSuccess && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#16a34a" }}>
            ✓ Escaneo completado — {(rescanMutation.data as any).productsProcessed} productos procesados, {(rescanMutation.data as any).filesScanned} archivos leídos de Drive
          </div>
        )}

        {rescanMutation.isError && (
          <div style={{ background: "#fff7f7", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
            Error: {(rescanMutation.error as Error).message}
          </div>
        )}

        {confirmAllMutation.isSuccess && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#16a34a" }}>
            ✓ {(confirmAllMutation.data as any).message}
          </div>
        )}

        {confirmAllMutation.isError && (
          <div style={{ background: "#fff7f7", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
            Error: {(confirmAllMutation.error as Error).message}
          </div>
        )}

        {/* Main two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Left: product list */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
              {activeTab === "manual" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Button
                    onClick={handlePrintAlbum}
                    disabled={products.filter(p => p.msds && p.msdsUrl).length === 0}
                    style={{
                      background: products.filter(p => p.msds && p.msdsUrl).length === 0 ? "#94a3b8" : "#0c1a2e",
                      color: "#fff", border: "none", gap: 6, width: "100%", justifyContent: "center",
                    }}
                  >
                    <BookOpen style={{ width: 15, height: 15 }} />
                    Imprimir Álbum MSDS
                    {products.filter(p => p.msds && p.msdsUrl).length > 0 && (
                      <span style={{ fontSize: 11, opacity: 0.8 }}>({products.filter(p => p.msds && p.msdsUrl).length} productos)</span>
                    )}
                  </Button>

                  {isAdminOrSupervisor && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={() => {
                          const warehouseLabel = warehouse && warehouse !== "all" ? `"${warehouse}"` : "todos los almacenes";
                          if (!window.confirm(
                            `⚠️ REINICIO TOTAL\n\n` +
                            `Borrará TODOS los cruces de ${warehouseLabel}, incluyendo los confirmados manualmente.\n\n` +
                            `Se re-escaneará Drive desde cero.\n\n¿Seguro?`
                          )) return;
                          resetAllMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, resetManual: true });
                        }}
                        disabled={resetAllMutation.isPending || rescanMutation.isPending}
                        variant="outline"
                        style={{ flex: 1, gap: 6, fontSize: 11, borderColor: "#7f1d1d", color: "#7f1d1d", height: "32px" }}
                      >
                        {resetAllMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Reinicio Total
                      </Button>
                      <Button
                        onClick={() => rescanMutation.mutate({ warehouse: warehouse !== "all" ? warehouse : undefined, force: true })}
                        disabled={rescanMutation.isPending || resetAllMutation.isPending}
                        variant="outline"
                        style={{ flex: 1, gap: 6, fontSize: 11, borderColor: "#0c1a2e", color: "#0c1a2e", height: "32px" }}
                      >
                        {rescanMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Re-escaneo
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94a3b8" }} />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código o nombre…"
                  style={{ paddingLeft: 34, fontSize: 13 }}
                />
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

            {!isLoading && !isError && filtered.length > 0 && (
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  const status = p.msdsStatus ?? "NONE";
                  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NONE;
                  const Icon = cfg.Icon;
                  const sm = sinMovimiento(lastMovements[p.code]);
                  return (
                    <div
                      key={p.id}
                      onClick={() => { setSelected(p); setEditingUrl(false); setMsdsInput(""); setSaveError(null); setShowCandidates(false); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid #f8fafc",
                        background: isSelected ? "rgba(13,148,136,0.08)" : "transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.code}</p>
                        <p style={{ fontSize: 12, color: "#64748b", margin: "1px 0 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                        <span
                          className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5 ${sm.pill}`}
                          title={lastMovements[p.code] ? `Último consumo: ${lastMovements[p.code]}` : "Sin datos de movimiento"}
                        >
                          ⏱ {sm.label}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        {activeTab === "smart" && (
                          <div title={cfg.description}>
                            <StatusBadge status={status} />
                          </div>
                        )}
                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {p.msds ? (
                            <ShieldCheck style={{ width: 18, height: 18, color: "#16a34a" }} />
                          ) : (
                            <ShieldOff style={{ width: 18, height: 18, color: "#cbd5e1" }} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: details / edit */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {!selected ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", textAlign: "center", padding: 20 }}>
                <BookOpen style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.2 }} />
                <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Selecciona un producto para gestionar su MSDS</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>Puedes vincular archivos de Drive o ingresar URLs externas</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Badge variant="outline" style={{ background: "#f1f5f9", color: "#475569", fontWeight: 700 }}>{selected.code}</Badge>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{selected.warehouse}</span>
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0c1a2e", margin: 0, lineHeight: 1.2 }}>{selected.name}</h2>
                </div>

                {/* Status card */}
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Estado Actual</span>
                    {selected.msds ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#16a34a", fontSize: 13, fontWeight: 700 }}>
                        <ShieldCheck style={{ width: 16, height: 16 }} />
                        Con MSDS
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b", fontSize: 13, fontWeight: 700 }}>
                        <ShieldOff style={{ width: 16, height: 16 }} />
                        Sin MSDS
                      </span>
                    )}
                  </div>

                  {selected.msdsUrl ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: 0, fontWeight: 600 }}>URL DE LA FICHA</p>
                          <div style={{ display: "flex", gap: 4 }}>
                            <Button
                              onClick={() => window.open(selected.msdsUrl!, "_blank")}
                              style={{ fontSize: 10, padding: "2px 6px", height: "auto", gap: 3, background: "#0d9488", color: "#fff", border: "none" }}
                            >
                              <Download style={{ width: 10, height: 10 }} />
                              Ver
                            </Button>
                            <Button
                              onClick={handlePrintQr}
                              style={{ fontSize: 10, padding: "2px 6px", height: "auto", gap: 3, background: "#0c1a2e", color: "#fff", border: "none" }}
                            >
                              <Printer style={{ width: 10, height: 10 }} />
                              QR
                            </Button>
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: "#0d9488", margin: 0, wordBreak: "break-all", fontWeight: 500 }}>
                          {selected.msdsUrl}
                        </p>
                      </div>

                      <div style={{ display: "none" }}>
                        <QRCodeSVG
                          id="msds-qr-svg"
                          value={selected.msdsUrl}
                          size={200}
                          level="H"
                          includeMargin={true}
                        />
                      </div>

                      {canEdit && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button
                            variant="outline"
                            onClick={() => { setMsdsInput(selected.msdsUrl!); setEditingUrl(true); }}
                            style={{ flex: 1, fontSize: 12, height: 32, gap: 6 }}
                          >
                            <RefreshCw style={{ width: 13, height: 13 }} />
                            Editar URL
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleDeleteMsds}
                            disabled={saving}
                            style={{ flex: 1, fontSize: 12, height: 32, gap: 6, borderColor: "#fca5a5", color: "#dc2626" }}
                          >
                            {saving ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Trash2 style={{ width: 13, height: 13 }} />}
                            Desvincular
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "10px 0" }}>
                      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px 0" }}>No hay una ficha vinculada a este producto.</p>
                      {canEdit && !editingUrl && (
                        <Button
                          onClick={() => setEditingUrl(true)}
                          style={{ background: "#0d9488", color: "#fff", border: "none", fontSize: 12, gap: 6 }}
                        >
                          <Link2 style={{ width: 14, height: 14 }} />
                          Vincular MSDS Manualmente
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit form */}
                {editingUrl && (
                  <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1.5px solid #0d9488", boxShadow: "0 4px 12px rgba(13,148,136,0.1)" }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0d9488", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      <Save style={{ width: 14, height: 14 }} />
                      Vincular URL de MSDS
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <Input
                        value={msdsInput}
                        onChange={(e) => setMsdsInput(e.target.value)}
                        placeholder="https://drive.google.com/..."
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
                          {saving ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : "Guardar Cambios"}
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

                {/* ── SMART MATCH DETAILS (Integration) ── */}
                <div style={{ borderTop: "1.5px solid #f1f5f9", paddingTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <Zap style={{ width: 15, height: 15, color: "#0d9488" }} />
                      Cruce Inteligente
                    </h3>
                    <StatusBadge status={selected.msdsStatus} />
                  </div>

                  {selected.msdsStatus && selected.msdsStatus !== "NONE" ? (
                    <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 2px 0" }}>
                            {selected.msdsFileName || "Archivo vinculado"}
                          </p>
                          {selected.msdsMatchReason && (
                            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px 0", fontStyle: "italic" }}>
                              {selected.msdsMatchReason}
                            </p>
                          )}
                          <ScoreBar score={selected.msdsScore} status={selected.msdsStatus} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                          {selected.msdsUrl && (
                            <Button
                              onClick={() => window.open(selected.msdsUrl!, "_blank")}
                              style={{ fontSize: 11, padding: "4px 8px", height: "auto", gap: 4, background: "#0d9488", color: "#fff", border: "none" }}
                            >
                              <Download style={{ width: 11, height: 11 }} />
                              Ver
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="outline"
                              onClick={async () => {
                                // Eliminada la confirmación manual según solicitud del usuario
                                const currentId = selected.id;
                                const res = await fetch(`${BASE}/api/msds/unlink`, {
                                  method: "POST",
                                  headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                  body: JSON.stringify({ productId: selected.id }),
                                });
                                if (res.ok) {
                                  const updated = await res.json();
                                  setSelected(updated);
                                  void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
                                  void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
                                  
                                  // Auto-seleccionar siguiente tras desvincular
                                  setTimeout(() => selectNextProduct(currentId), 300);
                                }
                              }}
                              style={{ fontSize: 10, padding: "3px 8px", height: "auto", gap: 4, borderColor: "#fca5a5", color: "#dc2626" }}
                            >
                              <Trash2 style={{ width: 11, height: 11 }} />
                              Desvincular
                            </Button>
                          )}
                        </div>
                      </div>
                      {canEdit && (selected.msdsStatus === "PROBABLE" || selected.msdsStatus === "MANUAL_REVIEW") && (
                        <Button
                          onClick={async () => {
                            // Eliminada la confirmación manual según solicitud del usuario
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
                              
                              // Auto-seleccionar siguiente tras confirmar
                              setTimeout(() => selectNextProduct(currentId), 300);
                            } else {
                              const err = await res.json().catch(() => ({}));
                              alert(`Error al confirmar: ${err.error ?? res.statusText}`);
                            }
                          }}
                          style={{ width: "100%", marginTop: 8, fontSize: 11, padding: "4px 10px", height: "auto", gap: 4, background: "#16a34a", color: "#fff", border: "none" }}
                        >
                          <CheckCircle2 style={{ width: 12, height: 12 }} />
                          Confirmar como exacto
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "10px 12px", background: "#fff7f7", border: "1.5px dashed #fca5a5", borderRadius: 8, marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <XCircle style={{ width: 16, height: 16, color: "#dc2626", flexShrink: 0 }} />
                        <p style={{ fontSize: 13, color: "#dc2626", margin: 0, fontWeight: 600 }}>Sin coincidencia encontrada</p>
                      </div>
                    </div>
                  )}

                  {/* Candidates List Integration */}
                  {selected && !selected.msds && showCandidates && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", margin: 0 }}>Candidatos recomendados</h4>
                        {isMatchLoading && <Loader2 style={{ width: 14, height: 14, color: "#0d9488" }} className="animate-spin" />}
                      </div>
                      {productMatch && (
                        <CandidateList
                          productId={selected.id}
                          candidates={productMatch.match.candidates}
                          onLinked={(updated) => {
                            const currentId = selected.id;
                            if (updated) setSelected(updated);
                            void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
                            void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
                            
                            // Auto-seleccionar siguiente tras vincular desde candidatos
                            setTimeout(() => selectNextProduct(currentId), 300);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* IA Extraction Data */}
                {selected.msdsExtractedData && (
                  <div style={{ borderTop: "1.5px solid #f1f5f9", paddingTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        <ScanLine style={{ width: 15, height: 15, color: "#8b5cf6" }} />
                        Extracción IA de Datos de Seguridad
                      </h3>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          onClick={handleClearExtract}
                          style={{ height: 24, padding: "0 6px", fontSize: 10, color: "#94a3b8" }}
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: "#f5f3ff", padding: "8px 10px", borderRadius: 6 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", margin: "0 0 2px 0", textTransform: "uppercase" }}>CAS</p>
                        <p style={{ fontSize: 12, color: "#1e293b", margin: 0, fontWeight: 500 }}>{selected.msdsExtractedData.cas || "—"}</p>
                      </div>
                      <div style={{ background: "#f5f3ff", padding: "8px 10px", borderRadius: 6 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", margin: "0 0 2px 0", textTransform: "uppercase" }}>Familia</p>
                        <p style={{ fontSize: 12, color: "#1e293b", margin: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.msdsExtractedData.familiaQuimica || "—"}</p>
                      </div>
                    </div>

                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <Skull style={{ width: 14, height: 14, color: "#ef4444", marginTop: 2 }} />
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", margin: 0 }}>Peligros</p>
                          <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{selected.msdsExtractedData.identificacionPeligro || "No detectado"}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <HeartPulse style={{ width: 14, height: 14, color: "#10b981", marginTop: 2 }} />
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", margin: 0 }}>Primeros Auxilios</p>
                          <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{selected.msdsExtractedData.primerosAuxiliosContacto || "No detectado"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {canEdit && selected.msdsFileId && !selected.msdsExtractedData && (
                  <div style={{ borderTop: "1.5px solid #f1f5f9", paddingTop: 16 }}>
                    <Button
                      onClick={handleExtract}
                      disabled={isExtracting}
                      style={{ width: "100%", background: "#8b5cf6", color: "#fff", border: "none", gap: 6, fontSize: 12 }}
                    >
                      {isExtracting ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <ScanLine style={{ width: 14, height: 14 }} />}
                      {isExtracting ? "Analizando..." : "Escanear MSDS con IA"}
                    </Button>
                    {extractError && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 6, textAlign: "center" }}>⚠ {extractError}</p>}
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
