import { buildMsdsAlbumHtml } from "./msds-print";
import { useState, useMemo, useCallback } from "react";
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
  Loader2, Save, BookOpen, Trash2, Zap, RefreshCw, Link2, CheckCircle2,
  Clock, HelpCircle, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ── Types ─────────────────────────────────────────────────────────────────────

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

function ScoreBar({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  const pct = Math.min(100, Math.round((s / 200) * 100));
  const color = s >= 120 ? "#16a34a" : s >= 60 ? "#ca8a04" : s >= 25 ? "#ea580c" : "#dc2626";
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
  onLinked: () => void;
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
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onLinked();
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
      {candidates.map((c, i) => {
        const cfg = STATUS_CONFIG[c.score >= 120 ? "EXACT" : c.score >= 60 ? "PROBABLE" : "MANUAL_REVIEW"];
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
                  <ScoreBar score={c.score} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <Button
                  onClick={() => linkMutation.mutate(c)}
                  disabled={linkMutation.isPending}
                  style={{ fontSize: 11, padding: "4px 10px", height: "auto", gap: 4, background: "#0d9488", color: "#fff", border: "none" }}
                >
                  <Link2 style={{ width: 11, height: 11 }} />
                  Vincular
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
  const [activeTab, setActiveTab] = useState<"manual" | "smart">("smart");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCandidates, setShowCandidates] = useState(false);

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

  const { data: productMatch, isLoading: isMatchLoading } = useQuery<ProductMatchResponse>({
    queryKey: ["/api/msds/match", selected?.id],
    queryFn: () => apiJson(`/api/msds/match/${selected!.id}`),
    enabled: !!selected && activeTab === "smart" && showCandidates,
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
      setSelected(updated);
      setMsdsInput("");
      setEditingUrl(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMsds() {
    if (!selected) return;
    if (!window.confirm("¿Quitar el MSDS de este producto?")) return;
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
      setSelected(updated);
      setMsdsInput("");
      setEditingUrl(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products/msds-stats", warehouse] });
    } catch (err: any) {
      setSaveError(err.message ?? "Error desconocido");
    } finally {
      setSaving(false);
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
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0c1a2e", margin: 0 }}>Control de MSDS</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "4px 0 0 0" }}>
            Gestión y cruce inteligente de Fichas de Seguridad
          </p>
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
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {isAdminOrSupervisor && (
                <>
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
                    disabled={rescanMutation.isPending}
                    variant="outline"
                    style={{ gap: 6, fontSize: 12 }}
                  >
                    Forzar re-escaneo
                  </Button>
                </>
              )}
            </div>
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

        {/* Main two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Left: product list */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
              {activeTab === "manual" && (
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
            {!isLoading && !isError && filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No se encontraron productos</div>
            )}

            {!isLoading && !isError && filtered.length > 0 && (
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  const status = p.msdsStatus ?? "NONE";
                  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NONE;
                  const Icon = cfg.Icon;
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
                        <p style={{ fontSize: 12, color: "#64748b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, marginLeft: 10, flexShrink: 0 }}>
                        {activeTab === "smart" ? (
                          <>
                            <StatusBadge status={status} />
                            {(p.msdsScore ?? 0) > 0 && <ScoreBar score={p.msdsScore} />}
                          </>
                        ) : (
                          <Badge style={{
                            fontSize: 11, fontWeight: 600,
                            background: p.msds ? "#dcfce7" : "#fee2e2",
                            color: p.msds ? "#16a34a" : "#dc2626", border: "none",
                          }}>
                            {p.msds ? "Con MSDS" : "Sin MSDS"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            {!selected ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 40, color: "#94a3b8", textAlign: "center" }}>
                <ShieldCheck style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
                <p style={{ fontSize: 14, margin: 0 }}>Selecciona un producto para ver su detalle</p>
              </div>
            ) : (
              <div style={{ padding: 20, overflowY: "auto", maxHeight: 640 }}>

                {/* Product header */}
                <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{selected.warehouse}</p>
                      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0c1a2e", margin: "0 0 2px 0", lineHeight: 1.3 }}>{selected.name}</h2>
                      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Código: <strong>{selected.code}</strong></p>
                      {selected.supplier && <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0 0" }}>Proveedor: {selected.supplier}</p>}
                    </div>
                    {activeTab === "smart" ? (
                      <StatusBadge status={selected.msdsStatus} />
                    ) : (
                      <Badge style={{
                        flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "4px 10px",
                        background: selected.msds ? "#dcfce7" : "#fee2e2",
                        color: selected.msds ? "#16a34a" : "#dc2626", border: "none",
                      }}>
                        {selected.msds ? "MSDS Disponible" : "Sin MSDS"}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* SMART TAB content */}
                {activeTab === "smart" && (
                  <div>
                    {/* Current match info */}
                    {selected.msdsStatus && selected.msdsStatus !== "NONE" && (
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Resultado del cruce</span>
                          <StatusBadge status={selected.msdsStatus} />
                        </div>
                        {selected.msdsFileName && (
                          <p style={{ fontSize: 12, color: "#1e293b", margin: "0 0 4px 0", fontWeight: 600 }}>
                            📄 {selected.msdsFileName}
                          </p>
                        )}
                        {selected.msdsMatchReason && (
                          <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px 0", fontStyle: "italic" }}>
                            {selected.msdsMatchReason}
                          </p>
                        )}
                        <ScoreBar score={selected.msdsScore} />
                        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                          {selected.msdsUrl && (
                            <Button
                              onClick={() => window.open(selected.msdsUrl!, "_blank")}
                              style={{ fontSize: 11, padding: "4px 10px", height: "auto", gap: 4, background: "#0d9488", color: "#fff", border: "none" }}
                            >
                              <Download style={{ width: 12, height: 12 }} />
                              Ver MSDS
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="outline"
                              onClick={async () => {
                                if (!window.confirm("¿Desvinular el MSDS de este producto?")) return;
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
                                }
                              }}
                              style={{ fontSize: 11, padding: "4px 10px", height: "auto", gap: 4, borderColor: "#fca5a5", color: "#dc2626" }}
                            >
                              <Trash2 style={{ width: 12, height: 12 }} />
                              Desvinular
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {selected.msdsStatus === "NONE" || !selected.msdsStatus ? (
                      <div style={{ padding: "10px 12px", background: "#fff7f7", border: "1.5px dashed #fca5a5", borderRadius: 8, marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <XCircle style={{ width: 16, height: 16, color: "#dc2626", flexShrink: 0 }} />
                          <p style={{ fontSize: 13, color: "#dc2626", margin: 0, fontWeight: 600 }}>Sin MSDS asignado</p>
                        </div>
                        <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0 0" }}>
                          Usa el botón "Buscar en Drive" para encontrar candidatos o ejecuta un escaneo masivo.
                        </p>
                      </div>
                    ) : null}

                    {/* Candidate search button */}
                    <Button
                      onClick={() => setShowCandidates(true)}
                      disabled={isMatchLoading}
                      variant="outline"
                      style={{ width: "100%", gap: 6, fontSize: 13, marginBottom: 12 }}
                    >
                      {isMatchLoading
                        ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />Buscando en Drive...</>
                        : <><Search style={{ width: 14, height: 14 }} />Buscar candidatos en Drive</>
                      }
                    </Button>

                    {/* Candidates */}
                    {showCandidates && productMatch && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                            Candidatos ({productMatch.match.candidates.length}) — {productMatch.filesScanned} archivos escaneados
                          </span>
                        </div>
                        <CandidateList
                          candidates={productMatch.match.candidates}
                          productId={selected.id}
                          onLinked={() => {
                            void queryClient.invalidateQueries({ queryKey: ["/api/products", warehouse] });
                            void queryClient.invalidateQueries({ queryKey: ["/api/msds/stats", warehouse] });
                            setShowCandidates(false);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* MANUAL TAB content */}
                {activeTab === "manual" && (
                  <div>
                    {selected.msds && selected.msdsUrl && !editingUrl ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                        <div style={{ padding: 16, border: "2px solid #99f6e4", borderRadius: 12, background: "#f0fdfa" }}>
                          <QRCodeSVG
                            id="msds-qr-svg"
                            value={selected.msdsUrl}
                            size={160}
                            level="H"
                            includeMargin
                          />
                        </div>
                        <p style={{ fontSize: 12, color: "#64748b", margin: 0, textAlign: "center", wordBreak: "break-all", maxWidth: 280 }}>
                          {selected.msdsUrl}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                          <Button
                            onClick={() => window.open(selected.msdsUrl!, "_blank")}
                            style={{ background: "#0d9488", color: "#fff", border: "none", gap: 6 }}
                          >
                            <Download style={{ width: 15, height: 15 }} />
                            Descargar MSDS
                          </Button>
                          <Button variant="outline" onClick={handlePrintQr} style={{ gap: 6 }}>
                            <Printer style={{ width: 15, height: 15 }} />
                            Imprimir QR
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => { setMsdsInput(selected.msdsUrl ?? ""); setSaveError(null); setEditingUrl(true); }}
                                style={{ gap: 6 }}
                              >
                                Editar URL
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => void handleDeleteMsds()}
                                disabled={saving}
                                style={{ gap: 6, borderColor: "#fca5a5", color: "#dc2626" }}
                              >
                                <Trash2 style={{ width: 14, height: 14 }} />
                                Quitar URL
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : canEdit ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {!editingUrl && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fff7f7", borderRadius: 8, border: "1.5px dashed #fca5a5" }}>
                            <ShieldOff style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0 }} />
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", margin: 0 }}>Ficha de Seguridad no disponible</p>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                            {editingUrl ? "Editar URL de MSDS" : "Registrar URL de MSDS"}
                          </label>
                          <input
                            type="url"
                            value={msdsInput}
                            onChange={(e) => { setMsdsInput(e.target.value); setSaveError(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") void handleSaveMsds(); }}
                            placeholder="Pega aquí el enlace de Google Drive..."
                            disabled={saving}
                            style={{
                              width: "100%", padding: "9px 12px", fontSize: 13,
                              border: saveError ? "1.5px solid #dc2626" : "1.5px solid #e2e8f0",
                              borderRadius: 8, outline: "none", boxSizing: "border-box",
                              background: saving ? "#f8fafc" : "#fff", color: "#1e293b",
                            }}
                          />
                          {saveError && <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{saveError}</p>}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <Button
                              onClick={() => void handleSaveMsds()}
                              disabled={saving || !msdsInput.trim()}
                              style={{ gap: 6, background: saving || !msdsInput.trim() ? "#94a3b8" : "#0d9488", color: "#fff", border: "none" }}
                            >
                              {saving
                                ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />Guardando...</>
                                : <><Save style={{ width: 14, height: 14 }} />Guardar MSDS</>
                              }
                            </Button>
                            {editingUrl && (
                              <Button
                                variant="outline"
                                onClick={() => { setEditingUrl(false); setMsdsInput(""); setSaveError(null); }}
                                disabled={saving}
                              >
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "14px 16px", background: "#fff7f7", borderRadius: 8, border: "1.5px dashed #fca5a5" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ShieldOff style={{ width: 18, height: 18, color: "#dc2626" }} />
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", margin: 0 }}>Ficha de Seguridad no disponible</p>
                        </div>
                      </div>
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
