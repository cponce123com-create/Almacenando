import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, ClipboardList, Plus, Trash2, Loader2, AlertCircle, Search, Target, CheckCircle2,
  Clock, Radio, CircleDotDashed, BarChart3, Lightbulb, PackageX, TrendingUp,
  TrendingDown, Minus, FileSpreadsheet, Archive, XCircle, RefreshCw, Scale, MapPin, AlertTriangle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Cycle {
  id: string; warehouse: string; name: string; description?: string | null;
  startDate: string; endDate?: string | null; status: string;
  totalProducts: number; countedProducts: number; withoutMovement: number;
  createdBy: string; createdAt: string;
  stats?: { pending: number; counted: number; verified: number; withoutMovement: number; skipped: number; total: number };
}

interface CycleProduct {
  id: string; cycleId: string; productId: string;
  initialQuantity: number | null; finalQuantity: number | null;
  initialUltimoConsumo: string | null; finalUltimoConsumo: string | null;
  status: string; countedDate: string | null; physicalCount: number | null;
  countedBy: string | null; difference: number | null; notes: string | null;
  inventoryRecordId: string | null; priority: number;
  code: string; productName: string; unit: string;
  warehouse: string; location?: string | null; category?: string | null;
  currentQuantity: number | null; currentBalanceDate: string | null; currentUltimoConsumo: string | null;
}

interface ProgressResponse {
  cycle: Cycle;
  stats: { pending: number; counted: number; verified: number; consumptionAlert: number; withoutMovement: number; skipped: number; total: number };
  products: CycleProduct[];
}

interface CycleHistoryItem {
  id: string; warehouse: string; name: string; description?: string | null;
  startDate: string; endDate?: string | null;
  totalProducts: number; countedProducts: number; withoutMovement: number;
  closedAt: string | null; createdAt: string;
  closedByName: string | null; pending: number;
}

interface CycleSummary {
  cycle: Cycle;
  stats: { pending: number; counted: number; verified: number; withoutMovement: number; skipped: number; total: number };
  differences: {
    exactMatch: number; surplus: number; shortage: number; notCounted: number;
    largestDifferences: Array<{ code: string; productName: string; unit: string; initialQuantity: number | null; physicalCount: number | null; difference: number | null }>;
  };
  sessions: Array<{ date: string; productCount: number; recordCount: number }>;
}

interface CloseResult {
  id: string; status: string;
  countedProducts: number; withoutMovement: number;
  pendingProducts: number;
  criticalDifferences: Array<{ code: string; productName: string; unit: string; initialQuantity: number | null; physicalCount: number | null; difference: number | null }>;
}

const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

function statusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    pending: { label: "Pendiente", bg: "bg-amber-50", text: "text-amber-700", icon: <Clock className="w-3 h-3" /> },
    counted: { label: "Conteado", bg: "bg-blue-50", text: "text-blue-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    verified: { label: "Verificado", bg: "bg-emerald-50", text: "text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    consumption_alert: { label: "Consumido después", bg: "bg-red-100", text: "text-red-700", icon: <AlertTriangle className="w-3 h-3" /> },
    without_movement: { label: "Sin consumo observado", bg: "bg-slate-100", text: "text-slate-600", icon: <Minus className="w-3 h-3" /> },
    skipped: { label: "Saltado", bg: "bg-red-50", text: "text-red-600", icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.bg} ${s.text} rounded-full px-2.5 py-0.5`}>
      {s.icon} {s.label}
    </span>
  );
}

type InactivityFilter = "all" | "3-6" | "6-9" | "9-12" | "12+" | "unknown";
type InactivityBucket = Exclude<InactivityFilter, "all"> | "under3";

const inactivityFilterOptions: Array<{ value: InactivityFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "3-6", label: "3–6 meses" },
  { value: "6-9", label: "6–9 meses" },
  { value: "9-12", label: "9–12 meses" },
  { value: "12+", label: "12+ meses" },
  { value: "unknown", label: "Sin fecha" },
];

function daysSinceConsumption(lastConsumption: string | null | undefined): number | null {
  // NOW usa 2013-01-01 como fecha provisional cuando no hay consumo confiable.
  if (!lastConsumption || lastConsumption <= "2013-01-01") return null;
  const timestamp = Date.parse(`${lastConsumption}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function inactivityBucket(lastConsumption: string | null | undefined): InactivityBucket {
  const days = daysSinceConsumption(lastConsumption);
  if (days === null) return "unknown";
  if (days >= 365) return "12+";
  if (days >= 270) return "9-12";
  if (days >= 180) return "6-9";
  if (days >= 90) return "3-6";
  return "under3";
}

function inactivityBand(lastConsumption: string | null | undefined) {
  const days = daysSinceConsumption(lastConsumption);
  if (days === null) return "Sin fecha confiable";
  if (days >= 365) return `12+ meses · ${days} días`;
  if (days >= 270) return `9–12 meses · ${days} días`;
  if (days >= 180) return `6–9 meses · ${days} días`;
  if (days >= 90) return `3–6 meses · ${days} días`;
  return `Menos de 3 meses · ${days} días`;
}

function RecommendationCard({ rec, onUse }: { rec: CycleProduct; onUse: (rec: CycleProduct) => void }) {
  const daysSinceConsumo = daysSinceConsumption(rec.currentUltimoConsumo);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-slate-400">{rec.code}</span>
            {rec.priority >= 100 && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded px-1.5 py-0.5">URGENTE</span>
            )}
            {rec.priority >= 50 && rec.priority < 100 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">ALTA</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate">{rec.productName}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            <span>{rec.unit}</span>
            {rec.location && <span>{rec.location}</span>}
            {rec.currentQuantity !== null && (
              <span className="font-mono">
                Saldo NOW: {rec.currentQuantity.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => onUse(rec)} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-xs">
          <Target className="w-3.5 h-3.5 mr-1" /> Contar
        </Button>
      </div>
      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
        <Clock className="w-3 h-3" />
        Últ. consumo: {rec.currentUltimoConsumo && rec.currentUltimoConsumo > "2013-01-01" ? rec.currentUltimoConsumo : "Sin fecha confiable"}
        {daysSinceConsumo !== null && (
          <span className={daysSinceConsumo >= 365 ? "text-red-500 font-medium" : ""}>
            ({Math.floor(daysSinceConsumo / 30.44)} meses)
          </span>
        )}
      </div>
    </div>
  );
}

export default function InventoryProgressPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const warehouse = "Q1";

  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [showCloseCycle, setShowCloseCycle] = useState(false);
  const [showDetectNoMovement, setShowDetectNoMovement] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cycle | null>(null);
  const [cycleName, setCycleName] = useState("");
  const [cycleDescription, setCycleDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [detectResult, setDetectResult] = useState<{ marked: number; total: number } | null>(null);
  const [selectedCycleIds, setSelectedCycleIds] = useState<Set<string>>(new Set());
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryCycleId, setSummaryCycleId] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);
  const [closeOptions, setCloseOptions] = useState({ markPendingAsSkipped: false, exportBeforeClose: false });
  const [selectedProduct, setSelectedProduct] = useState<CycleProduct | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [recommendationFilter, setRecommendationFilter] = useState<InactivityFilter>("all");

  const warehouseParam = `?warehouse=${warehouse}&type=Q`;

  // Get active cycle
  const { data: activeCycle, isLoading: cycleLoading, error: cycleError } = useQuery<Cycle | null>({
    queryKey: ["active-cycle", warehouse],
    queryFn: () => apiJson(`${BASE}/api/inventory-cycles/active${warehouseParam}`),
  });

  // ── Live progress (real-time, based on actual inventory records) ──────────
  const { data: liveProgress } = useQuery<{
    totalProducts: number; inventoried: number; pending: number; percentage: number;
  }>({
    queryKey: ["inventory-live-progress", warehouse],
    queryFn: () => apiJson(`${BASE}/api/inventory/progress${warehouseParam}`),
    refetchInterval: 10000, // cada 10 segundos
  });

  // Get available balance dates for the detect-no-movement flow
  const { data: balanceDates = [] } = useQuery<{ balanceDate: string; batchId: string }[]>({
    queryKey: ["balance-dates", warehouse],
    queryFn: () => apiJson(`${BASE}/api/balances/dates${warehouseParam}`),
    enabled: !!activeCycle,
  });

  // Get cycle progress
  const progressQuery = useQuery<ProgressResponse>({
    queryKey: ["cycle-progress", activeCycle?.id, statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const qs = params.toString();
      return apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/progress${qs ? `?${qs}` : ""}`);
    },
    enabled: !!activeCycle,
  });

  // Keep recommendations independent from the Kanban board's search/status filters.
  const { data: pendingProgress } = useQuery<ProgressResponse>({
    queryKey: ["cycle-pending-progress", activeCycle?.id],
    queryFn: () => apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/progress?status=pending`),
    enabled: !!activeCycle,
    refetchInterval: 30000,
  });

  // Get history of closed cycles
  const { data: historyData } = useQuery<{ data: CycleHistoryItem[]; total: number }>({
    queryKey: ["cycle-history", warehouse],
    queryFn: () => apiJson(`${BASE}/api/inventory-cycles/history${warehouseParam}&limit=50`),
  });

  // Get cycle summary
  const { data: summaryData } = useQuery<CycleSummary>({
    queryKey: ["cycle-summary", summaryCycleId],
    queryFn: () => apiJson(`${BASE}/api/inventory-cycles/${summaryCycleId}/summary`),
    enabled: !!summaryCycleId,
  });

  // Create cycle mutation
  const createCycleMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse,
        name: cycleName || `Conteo cíclico ${warehouse} - ${today()}`,
        description: cycleDescription || undefined,
        startDate: today(),
      }),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      setShowCreateCycle(false);
      setCycleName(""); setCycleDescription("");
      toast({ title: "Ciclo creado", description: `Ciclo iniciado con ${data.totalProducts} productos.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetInventoryMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: resetConfirmation }),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      qc.invalidateQueries({ queryKey: ["cycle-progress"] });
      qc.invalidateQueries({ queryKey: ["cycle-pending-progress"] });
      qc.invalidateQueries({ queryKey: ["cycle-history"] });
      qc.invalidateQueries({ queryKey: ["inventory-live-progress"] });
      setShowResetDialog(false);
      setResetConfirmation("");
      toast({ title: "Q1 reiniciado", description: data.archiveId
        ? `${data.productCount} químicos cargados. Respaldo guardado: ${data.archiveId}.`
        : `${data.productCount} químicos cargados. No había registros previos que archivar.` });
    },
    onError: (e: Error) => toast({ title: "No se pudo reiniciar", description: e.message, variant: "destructive" }),
  });

  // Close cycle mutation
  const closeCycleMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/close`, { method: "POST" }),
    onSuccess: (data: CloseResult) => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      qc.invalidateQueries({ queryKey: ["cycle-progress"] });
      qc.invalidateQueries({ queryKey: ["cycle-history"] });
      setCloseResult(data);
      toast({ title: "Ciclo cerrado", description: `${data.countedProducts} conteados, ${data.withoutMovement} sin movimiento.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Detect no movement mutation
  const detectNoMovementMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/detect-no-movement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: selectedBatchId || undefined }),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      qc.invalidateQueries({ queryKey: ["cycle-progress"] });
      qc.invalidateQueries({ queryKey: ["cycle-pending-progress"] });
      setDetectResult(data);
      toast({ title: "Detección completada", description: data.message });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Sync cycle mutation
  const syncCycleMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/sync`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      qc.invalidateQueries({ queryKey: ["cycle-progress"] });
      qc.invalidateQueries({ queryKey: ["cycle-pending-progress"] });
      qc.invalidateQueries({ queryKey: ["inventory-live-progress"] });
      toast({
        title: "Ciclo sincronizado",
        description: `${data.synced} actualizados, ${data.added} agregados — ${data.countedProducts} conteados`,
      });
    },
    onError: (e: Error) => toast({ title: "Error al sincronizar", description: e.message, variant: "destructive" }),
  });

  // Delete cycle mutation
  const deleteCycleMutation = useMutation({
    mutationFn: (id: string) => apiJson(`${BASE}/api/inventory-cycles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      setDeleteTarget(null);
      toast({ title: "Ciclo eliminado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const progress = progressQuery.data;
  const pendingRecommendationProducts = pendingProgress?.products ?? [];
  const recommendationCounts = useMemo(() => {
    const counts: Record<InactivityFilter, number> = {
      all: pendingRecommendationProducts.length,
      "3-6": 0,
      "6-9": 0,
      "9-12": 0,
      "12+": 0,
      unknown: 0,
    };
    for (const product of pendingRecommendationProducts) {
      const bucket = inactivityBucket(product.currentUltimoConsumo);
      if (bucket !== "under3") counts[bucket] += 1;
    }
    return counts;
  }, [pendingProgress?.products]);
  const filteredRecommendationCandidates = useMemo(() => pendingRecommendationProducts
    .filter(product => recommendationFilter === "all" || inactivityBucket(product.currentUltimoConsumo) === recommendationFilter)
    .sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code)),
  [pendingProgress?.products, recommendationFilter]);
  const filteredRecommendations = filteredRecommendationCandidates.slice(0, 5);

  const exportRecommendationsPdf = () => {
    const products = filteredRecommendationCandidates.slice(0, 10);
    if (products.length === 0) return;

    const now = new Date();
    const dateParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now).reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
    const fileDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    const displayDate = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(now);
    const rangeLabel = inactivityFilterOptions.find(option => option.value === recommendationFilter)?.label ?? "Todos";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const columns = [
      { title: "Código", width: 22 },
      { title: "Descripción", width: 57 },
      { title: "Último\nconsumo", width: 30 },
      { title: "Saldo\nsistema", width: 30 },
      { title: "Lote\n(20 dígitos)", width: 54 },
      { title: "¿Tiene\netiqueta?", width: 27 },
      { title: "Peso\nfísico", width: 34 },
      { title: "Tara", width: 23 },
    ];
    const headerY = 42;
    const headerHeight = 12;
    const rowHeight = 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(15, 23, 42);
    doc.text("INVENTARIO DE QUÍMICOS", margin, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Almacén Q1  ·  Fecha: ${displayDate}`, margin, 26);
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Selección: ${rangeLabel}  ·  ${products.length} productos priorizados`, margin, 33);
    doc.text("Marque si tiene etiqueta; anote el lote, el peso físico y la tara.", margin, 39);

    let x = margin;
    for (const column of columns) {
      doc.setFillColor(15, 118, 110);
      doc.setDrawColor(148, 163, 184);
      doc.rect(x, headerY, column.width, headerHeight, "FD");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      const isMultiline = column.title.includes("\n");
      const textY = isMultiline ? headerY + 4.5 : headerY + 7.5;
      doc.text(column.title, x + column.width / 2, textY, {
        align: "center",
        maxWidth: column.width - 4,
      });
      x += column.width;
    }

    products.forEach((product, index) => {
      const y = headerY + headerHeight + index * rowHeight;
      const cells = [
        product.code,
        product.productName,
        product.currentUltimoConsumo && product.currentUltimoConsumo > "2013-01-01"
          ? product.currentUltimoConsumo
          : "Sin fecha",
        product.currentQuantity === null
          ? "Sin saldo"
          : `${product.currentQuantity.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${product.unit}`,
        "",
        "",
        "",
        "",
      ];
      let cellX = margin;
      doc.setDrawColor(180, 190, 200);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      columns.forEach((column, columnIndex) => {
        doc.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
        doc.rect(cellX, y, column.width, rowHeight, "FD");
        if (columnIndex < 4) {
          const value = cells[columnIndex] ?? "";
          const lines = doc.splitTextToSize(value, column.width - 4).slice(0, 2);
          doc.text(lines, cellX + 2, y + 4.5);
        } else if (columnIndex === 5) {
          const checkboxSize = 4;
          doc.setDrawColor(71, 85, 105);
          doc.rect(
            cellX + (column.width - checkboxSize) / 2,
            y + (rowHeight - checkboxSize) / 2,
            checkboxSize,
            checkboxSize,
            "S",
          );
        }
        cellX += column.width;
      });
    });

    const footerY = headerY + headerHeight + products.length * rowHeight + 7;
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("Pesador: ____________________________________", margin, footerY);
    doc.text("Firma: __________________________", pageWidth - margin, footerY, { align: "right" });
    doc.save(`Inventario_Quimicos_Q1_${fileDate}.pdf`);
  };
  const stats = progress?.stats ?? { pending: 0, counted: 0, verified: 0, consumptionAlert: 0, withoutMovement: 0, skipped: 0, total: 0 };
  const totalDone = stats.counted + stats.verified + stats.withoutMovement + stats.skipped;
  const pctComplete = stats.total > 0 ? Math.round((totalDone / stats.total) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Conteo Cíclico · Q1</h1>
              <p className="text-sm text-slate-500">
                {activeCycle
                  ? `Ciclo activo: ${activeCycle.name} · ${pctComplete}% completado`
                  : "No hay un ciclo de inventario activo"}
                <span className="ml-1 font-semibold text-blue-600">· {warehouse}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeCycle ? (
              <>
                <Button variant="outline" size="sm" onClick={async () => {
                  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
                  const url = `${baseUrl}/api/reports/export/inventory-cycle-progress?cycleId=${activeCycle.id}`;
                  try {
                    const res = await fetch(url, {
                      headers: { ...getAuthHeaders() },
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err.error ?? "Error al exportar");
                    }
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.setAttribute("download", `inventario_${activeCycle.name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                  } catch (e) {
                    toast({ title: "Error al exportar", description: String(e), variant: "destructive" });
                  }
                }}>
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Exportar Excel
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setShowCreateCycle(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Iniciar Ciclo
              </Button>
            )}
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => setShowResetDialog(true)}>
                <Trash2 className="w-4 h-4 mr-1.5" /> Reiniciar Q1
              </Button>
            )}
          </div>
        </div>

        {/* ── Live Progress banner (siempre visible) ── */}
        {liveProgress && (
          <div className="bg-white rounded-xl border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              <h2 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Progreso en Tiempo Real</h2>
              {liveProgress.percentage >= 100 ? (
                <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-100 rounded-full px-3 py-1">
                  ¡Completado!
                </span>
              ) : (
                <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-100 rounded-full px-3 py-1">
                  {liveProgress.percentage}%
                </span>
              )}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  liveProgress.percentage >= 100
                    ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                    : "bg-gradient-to-r from-emerald-400 to-blue-500"
                }`}
                style={{ width: `${Math.min(100, liveProgress.percentage)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-emerald-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Total Productos</p>
                <p className="text-xl font-bold text-slate-900">{liveProgress.totalProducts}</p>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Ya Inventariados</p>
                <p className="text-xl font-bold text-blue-600">{liveProgress.inventoried}</p>
              </div>
              <div className="bg-amber-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Pendientes</p>
                <p className={`text-xl font-bold ${liveProgress.pending > 0 ? "text-amber-600" : "text-slate-400"}`}>
                  {liveProgress.pending}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Basado en registros de inventario reales. Se actualiza cada 10 segundos.
              {liveProgress.inventoried > 0 && liveProgress.totalProducts > 0 && (
                <span> Te faltan <strong className="text-amber-600">{liveProgress.pending}</strong> de {liveProgress.totalProducts} productos por inventariar.</span>
              )}
            </p>
          </div>
        )}

        {/* Progress bar */}
        {activeCycle && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">{activeCycle.name}</h2>
              <span className="text-sm font-bold text-blue-600">{pctComplete}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pctComplete}%` }}
              />
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { label: "Pendientes", value: stats.pending, color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Conteados", value: stats.counted + stats.verified, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Consumo posterior", value: stats.consumptionAlert, color: "text-red-600", bg: "bg-red-50" },
                { label: "Total", value: stats.total, color: "text-slate-900", bg: "bg-slate-50" },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2.5`}>
                  <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {activeCycle && pendingProgress && pendingRecommendationProducts.length > 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-blue-800">Recomendaciones inteligentes</h2>
              <span className="text-xs text-blue-500 sm:ml-auto">
                {recommendationCounts[recommendationFilter]} pendientes en esta selección; muestra hasta {filteredRecommendations.length} para contar.
              </span>
              <Button type="button" size="sm" variant="outline" onClick={exportRecommendationsPdf}
                disabled={filteredRecommendationCandidates.length === 0} className="bg-white">
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar PDF · {Math.min(10, filteredRecommendationCandidates.length)} productos
              </Button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {inactivityFilterOptions.map(option => (
                <Button key={option.value} type="button" size="sm"
                  variant={recommendationFilter === option.value ? "default" : "outline"}
                  aria-pressed={recommendationFilter === option.value}
                  onClick={() => setRecommendationFilter(option.value)}
                  className={recommendationFilter === option.value ? "bg-blue-700 hover:bg-blue-800" : "bg-white"}>
                  {option.label} <span className="ml-1 opacity-75">({recommendationCounts[option.value]})</span>
                </Button>
              ))}
            </div>
            {filteredRecommendations.length === 0 ? (
              <p className="rounded-lg bg-white/80 px-3 py-5 text-center text-sm text-slate-500">
                No hay productos pendientes en este rango de inactividad.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {filteredRecommendations.map(product => (
                  <RecommendationCard key={product.id} rec={product} onUse={(r) => {
                    setLocation(`/inventory?productId=${encodeURIComponent(r.productId)}&warehouse=Q1`);
                  }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading / Error states for active cycle */}
        {cycleLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {cycleError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span>Error al cargar el ciclo activo</span>
          </div>
        )}

        {!cycleLoading && !cycleError && !activeCycle && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
            <ClipboardList className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">No hay un ciclo de inventario activo</p>
            <p className="text-xs text-slate-400 text-center max-w-md">
              Crea un ciclo para empezar a rastrear el progreso de tu inventario físico.
              El sistema cargará automáticamente los químicos activos tipo Q de Q1,
              tomará su saldo NOW como referencia y ordenará el trabajo por último consumo real.
            </p>
            <Button onClick={() => setShowCreateCycle(true)} className="mt-2">
              <Plus className="w-4 h-4 mr-1.5" /> Iniciar Ciclo de Inventario
            </Button>
          </div>
        )}

        {/* Kanban board */}
        {activeCycle && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar producto por código o nombre..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="counted">Conteados</SelectItem>
                  <SelectItem value="verified">Verificados</SelectItem>
                  <SelectItem value="consumption_alert">Consumo posterior al conteo</SelectItem>
                  <SelectItem value="without_movement">Sin consumo observado</SelectItem>
                  <SelectItem value="skipped">Saltados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
              {progressQuery.isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : progressQuery.isError ? (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
                  <AlertCircle className="w-5 h-5" />
                  <span>Error al cargar productos del ciclo</span>
                </div>
              ) : !progress?.products?.length ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                  <PackageX className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-medium">No hay productos en este estado</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-3 items-start">
                  {[
                    { id: "pending", title: "Por inventariar", color: "border-red-300 bg-red-50/60", icon: <Clock className="w-4 h-4 text-red-600" />, rows: progress.products.filter(p => ["pending", "assigned", "without_movement"].includes(p.status)) },
                    { id: "difference", title: "Por cuadrar", color: "border-rose-300 bg-rose-50/60", icon: <AlertTriangle className="w-4 h-4 text-rose-600" />, rows: progress.products.filter(p => ["counted", "verified"].includes(p.status) && (p.difference === null || Math.abs(p.difference) >= 0.01)) },
                    { id: "consumption", title: "Recontar · consumo nuevo", color: "border-orange-300 bg-orange-50/60", icon: <TrendingDown className="w-4 h-4 text-orange-600" />, rows: progress.products.filter(p => p.status === "consumption_alert") },
                    { id: "balanced", title: "Cuadrado", color: "border-emerald-300 bg-emerald-50/60", icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, rows: progress.products.filter(p => ["counted", "verified"].includes(p.status) && p.difference !== null && Math.abs(p.difference) < 0.01) },
                    { id: "skipped", title: "Omitidos", color: "border-slate-300 bg-slate-50", icon: <Minus className="w-4 h-4 text-slate-500" />, rows: progress.products.filter(p => p.status === "skipped") },
                  ].map(lane => (
                    <section key={lane.id} className={`rounded-xl border ${lane.color} min-h-36`}>
                      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl border-b border-inherit bg-white/90 px-3 py-2.5 backdrop-blur">
                        {lane.icon}
                        <h3 className="text-sm font-bold text-slate-800">{lane.title}</h3>
                        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600">{lane.rows.length}</span>
                      </div>
                      <div className="max-h-[65vh] space-y-2 overflow-y-auto p-2">
                        {lane.rows.length === 0 ? (
                          <p className="px-2 py-5 text-center text-xs text-slate-400">Sin productos</p>
                        ) : lane.rows.map(p => {
                          const isBalanced = ["counted", "verified"].includes(p.status) && p.difference !== null && Math.abs(p.difference) < 0.01;
                          const needsAttention = !isBalanced;
                          return (
                            <button key={p.id} type="button" onClick={() => setSelectedProduct(p)}
                              className={`w-full rounded-lg border-l-4 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                                isBalanced ? "border-l-emerald-500 border-y-emerald-100 border-r-emerald-100" : "border-l-red-500 border-y-red-100 border-r-red-100"
                              }`}>
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-slate-500">{p.code}</span>
                                <span className="ml-auto shrink-0">{isBalanced ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{p.productName}</p>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <span className="text-slate-500">Saldo NOW</span>
                                <span className="text-right font-mono font-semibold text-slate-800">{p.currentQuantity === null ? "Sin saldo" : `${p.currentQuantity.toFixed(2)} ${p.unit}`}</span>
                                <span className="text-slate-500">Físico</span>
                                <span className="text-right font-mono font-semibold text-slate-800">{p.physicalCount === null ? "Pendiente" : `${p.physicalCount.toFixed(2)} ${p.unit}`}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                                <span>{p.countedDate ? `Conteo ${p.countedDate}` : "Sin fecha de conteo"}</span>
                                <span>·</span>
                                <span>{inactivityBand(p.currentUltimoConsumo)}</span>
                              </div>
                              {needsAttention && p.status === "consumption_alert" && (
                                <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">NOW reportó consumo después del conteo</p>
                              )}
                              {needsAttention && p.status !== "consumption_alert" && p.difference !== null && (
                                <p className="mt-2 text-xs font-bold text-red-700">Diferencia: {p.difference > 0 ? "+" : ""}{p.difference.toFixed(2)} {p.unit}</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Ciclos Anteriores ── */}
        {historyData && historyData.data.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Ciclos Anteriores</h2>
                <span className="text-xs text-slate-400">({historyData.total} cerrados)</span>
              </div>
              {selectedCycleIds.size >= 2 && (
                <Button size="sm" variant="outline" className="border-blue-300 text-blue-700"
                  onClick={async () => {
                    try {
                      const res = await fetch(`${BASE}/api/reports/export/consolidated-cycles`, {
                        method: "POST",
                        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                        body: JSON.stringify({ cycleIds: Array.from(selectedCycleIds) }),
                      });
                      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `inventario_consolidado_${selectedCycleIds.size}_ciclos.xlsx`;
                      document.body.appendChild(a); a.click();
                      document.body.removeChild(a); URL.revokeObjectURL(url);
                      toast({ title: "Exportación completada", description: "Excel consolidado descargado" });
                    } catch (e) {
                      toast({ title: "Error", description: String(e), variant: "destructive" });
                    }
                  }}>
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                  Exportar Combinado ({selectedCycleIds.size})
                </Button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {historyData.data.map(hc => (
                <div key={hc.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={selectedCycleIds.has(hc.id)}
                    onChange={(e) => {
                      const next = new Set(selectedCycleIds);
                      e.target.checked ? next.add(hc.id) : next.delete(hc.id);
                      setSelectedCycleIds(next);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{hc.name}</p>
                    <p className="text-xs text-slate-500">
                      {hc.totalProducts} productos · {hc.countedProducts} conteados · {hc.withoutMovement} s/m
                      {hc.pending > 0 && <span className="text-amber-600"> · {hc.pending} pendientes</span>}
                      {hc.closedByName && <span> · Cerrado por {hc.closedByName}</span>}
                      {hc.endDate && <span> · {hc.endDate}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => { setSummaryCycleId(hc.id); setShowSummaryDialog(true); }}>
                      Ver Resumen
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={async () => {
                        const url = `${BASE}/api/reports/export/inventory-cycle-progress?cycleId=${hc.id}`;
                        try {
                          const res = await fetch(url, { headers: { ...getAuthHeaders() } });
                          if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
                          const blob = await res.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = blobUrl;
                          a.download = `inventario_${hc.name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
                          document.body.appendChild(a); a.click();
                          document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
                        } catch (e) { toast({ title: "Error", description: String(e), variant: "destructive" }); }
                      }}>
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Exportar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product detail card */}
      <Dialog open={!!selectedProduct} onOpenChange={open => { if (!open) setSelectedProduct(null); }}>
        <DialogContent className="max-w-xl">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogDescription className="sr-only">
                  Saldo actual, conteo físico, diferencias, último consumo y ubicación del producto.
                </DialogDescription>
                <DialogTitle className="pr-6 text-left">
                  <span className="mr-2 font-mono text-sm text-slate-500">{selectedProduct.code}</span>
                  {selectedProduct.productName}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(selectedProduct.status)}
                  <Badge variant="outline">Almacén Q1</Badge>
                  <Badge variant="outline">{selectedProduct.unit}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><Scale className="h-3.5 w-3.5" /> Saldo NOW actual</p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                      {selectedProduct.currentQuantity === null ? "Sin dato" : `${selectedProduct.currentQuantity.toFixed(3)} ${selectedProduct.unit}`}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">Actualizado: {selectedProduct.currentBalanceDate ?? "sin saldo cargado"}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${selectedProduct.physicalCount !== null ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" /> Saldo físico</p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                      {selectedProduct.physicalCount === null ? "Pendiente" : `${selectedProduct.physicalCount.toFixed(3)} ${selectedProduct.unit}`}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">Fecha de conteo: {selectedProduct.countedDate ?? "aún no inventariado"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 text-sm sm:grid-cols-2">
                  <div><span className="text-slate-500">Diferencia:</span> <strong className={selectedProduct.difference !== null && Math.abs(selectedProduct.difference) < 0.01 ? "text-emerald-700" : "text-red-700"}>{selectedProduct.difference === null ? "sin conteo" : `${selectedProduct.difference > 0 ? "+" : ""}${selectedProduct.difference.toFixed(3)} ${selectedProduct.unit}`}</strong></div>
                  <div><span className="text-slate-500">Saldo al iniciar ciclo:</span> <strong>{selectedProduct.initialQuantity === null ? "sin dato" : `${selectedProduct.initialQuantity.toFixed(3)} ${selectedProduct.unit}`}</strong></div>
                  <div><span className="text-slate-500">Último consumo NOW:</span> <strong>{selectedProduct.currentUltimoConsumo ?? "sin fecha confiable"}</strong></div>
                  <div><span className="text-slate-500">Antigüedad:</span> <strong>{inactivityBand(selectedProduct.currentUltimoConsumo)}</strong></div>
                  <div className="sm:col-span-2"><span className="text-slate-500"><MapPin className="mr-1 inline h-3.5 w-3.5" />Ubicaciones NOW:</span> <strong>{selectedProduct.location || "sin ubicación registrada"}</strong></div>
                </div>
                {selectedProduct.status === "consumption_alert" && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    NOW registró un consumo posterior al conteo físico. Vuelve a pesarlo para actualizar el saldo vigilado.
                  </div>
                )}
                {selectedProduct.notes && <p className="text-sm text-slate-600">Observaciones: {selectedProduct.notes}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedProduct(null)}>Cerrar</Button>
                <Button onClick={() => setLocation(`/inventory?productId=${encodeURIComponent(selectedProduct.productId)}&warehouse=Q1`)}>
                  <Target className="mr-2 h-4 w-4" /> {selectedProduct.physicalCount === null || selectedProduct.status === "consumption_alert" ? "Inventariar ahora" : "Volver a inventariar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Safe Q1 reset: archive first, then create the clean board */}
      <AlertDialog open={showResetDialog} onOpenChange={open => { if (!open) { setShowResetDialog(false); setResetConfirmation(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700">Reiniciar los inventarios de Q1</AlertDialogTitle>
            <AlertDialogDescription>
              Se retirarán del módulo los registros físicos, rondas y ciclos de Q1. Antes se guardará una copia permanente con sus conteos y cajas; el maestro de productos y los saldos NOW no se modifican. Al terminar se creará un tablero nuevo con los productos activos tipo Q de Q1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Escribe <strong>REINICIAR Q1</strong> para confirmar</Label>
            <Input value={resetConfirmation} onChange={e => setResetConfirmation(e.target.value)} placeholder="REINICIAR Q1" autoComplete="off" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetInventoryMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" disabled={resetConfirmation !== "REINICIAR Q1" || resetInventoryMutation.isPending}
                onClick={e => { e.preventDefault(); resetInventoryMutation.mutate(); }}>
                {resetInventoryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar respaldo y reiniciar
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create cycle dialog */}
      <Dialog open={showCreateCycle} onOpenChange={o => { if (!o) { setShowCreateCycle(false); setCycleName(""); setCycleDescription(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" /> Iniciar Ciclo de Inventario
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre del ciclo</Label>
              <Input
                value={cycleName}
                onChange={e => setCycleName(e.target.value)}
                placeholder={`Conteo cíclico ${warehouse} - ${today()}`}
              />
            </div>
            <div>
              <Label>Descripción (opcional)</Label>
              <Textarea
                value={cycleDescription}
                onChange={e => setCycleDescription(e.target.value)}
                placeholder="Ej: Inventario de fin de mes - Junio 2026"
                rows={2}
              />
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              <p className="font-semibold mb-1">¿Qué pasará?</p>
              <ul className="space-y-1">
                <li>• Se cargarán los productos activos tipo Q del almacén Q1</li>
                <li>• Se priorizará por último consumo: 3, 6, 9 y 12+ meses</li>
                <li>• Al registrar un conteo, el saldo físico se comparará con el saldo NOW</li>
                <li>• Un consumo posterior devolverá el producto a la columna de alerta</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowCreateCycle(false); setCycleName(""); setCycleDescription(""); }}
              disabled={createCycleMutation.isPending}>Cancelar</Button>
            <Button onClick={() => createCycleMutation.mutate()} disabled={createCycleMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700">
              {createCycleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Iniciar Ciclo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detect no movement dialog */}
      <Dialog open={showDetectNoMovement} onOpenChange={o => { if (!o) { setShowDetectNoMovement(false); setDetectResult(null); setSelectedBatchId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-slate-600" /> Detectar "Sin Movimiento"
            </DialogTitle>
          </DialogHeader>
          {detectResult ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 rounded-lg p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-emerald-700">{detectResult.marked} productos</p>
                <p className="text-sm text-emerald-600">marcados como "sin movimiento"</p>
                <p className="text-xs text-emerald-500 mt-1">de {detectResult.total} productos pendientes revisados</p>
              </div>
              <p className="text-xs text-slate-500 text-center">
                Estos productos mantuvieron su <strong>último consumo</strong> y <strong>cantidad</strong> sin cambios
                entre el saldo inicial y el actual. No es necesario contarlos físicamente.
              </p>
              <Button className="w-full" onClick={() => { setShowDetectNoMovement(false); setDetectResult(null); }}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                El sistema comparará el <strong>último consumo</strong> y la <strong>cantidad</strong> de cada
                producto pendiente con los valores del saldo actual (o de un batch específico).
              </p>
              <div>
                <Label>Batch de saldo (opcional)</Label>
                <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Usar el saldo más reciente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Más reciente (sin filtrar)</SelectItem>
                    {balanceDates.map(d => (
                      <SelectItem key={d.batchId} value={d.batchId}>
                        {d.balanceDate} · {d.batchId.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                <p className="font-semibold mb-1">¿Cómo funciona?</p>
                <p>Si un producto tiene el mismo <strong>último consumo</strong> y la misma
                <strong>cantidad</strong> que cuando se creó el ciclo, significa que no tuvo
                movimiento y puedes saltarte su conteo físico.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDetectNoMovement(false)}
                  disabled={detectNoMovementMutation.isPending}>Cancelar</Button>
                <Button onClick={() => detectNoMovementMutation.mutate()}
                  disabled={detectNoMovementMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700">
                  {detectNoMovementMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Detectar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close cycle enhanced dialog */ }
      <Dialog open={showCloseCycle} onOpenChange={o => { if (!o) { setShowCloseCycle(false); setCloseResult(null); setCloseOptions({ markPendingAsSkipped: false, exportBeforeClose: false }); } }} >
        <DialogContent className="max-w-lg">
          {closeResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" /> Ciclo cerrado exitosamente
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-lg font-bold text-blue-700">{closeResult.countedProducts}</p>
                    <p className="text-xs text-blue-600">Conteados</p>
                  </div>
                  <div className="bg-slate-100 rounded-lg p-3">
                    <p className="text-lg font-bold text-slate-700">{closeResult.withoutMovement}</p>
                    <p className="text-xs text-slate-600">Sin Movimiento</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-lg font-bold text-amber-700">{closeResult.pendingProducts}</p>
                    <p className="text-xs text-amber-600">Pendientes</p>
                  </div>
                </div>
                {closeResult.criticalDifferences && closeResult.criticalDifferences.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-600 mb-2">
                      ⚠️ Diferencias críticas detectadas ({closeResult.criticalDifferences.length}):
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {closeResult.criticalDifferences.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-red-50 rounded px-3 py-1.5">
                          <span className="font-mono font-semibold text-slate-600">{d.code}</span>
                          <span className="flex-1 truncate text-slate-700">{d.productName}</span>
                          <span className={`font-mono font-bold ${(d.difference ?? 0) > 0 ? "text-blue-600" : "text-red-600"}`}>
                            {(d.difference ?? 0) > 0 ? "+" : ""}{d.difference?.toFixed(2)} {d.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button className="w-full" onClick={() => { setShowCloseCycle(false); setCloseResult(null); }}>
                  Cerrar
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-700">
                  <Archive className="w-5 h-5" /> Cerrar Ciclo de Inventario
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-sm text-slate-600">
                  <p className="font-semibold mb-2">Resumen final:</p>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-lg font-bold text-blue-700">{stats.counted + stats.verified}</p>
                      <p className="text-xs text-blue-600">Conteados</p>
                    </div>
                    <div className="bg-slate-100 rounded-lg p-3">
                      <p className="text-lg font-bold text-slate-700">{stats.withoutMovement}</p>
                      <p className="text-xs text-slate-600">Sin Movimiento</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-lg font-bold text-amber-700">{stats.pending}</p>
                      <p className="text-xs text-amber-600">Pendientes</p>
                    </div>
                  </div>
                  {stats.pending > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-3">
                      <p className="font-medium">⚠️ Quedan {stats.pending} productos pendientes.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      checked={closeOptions.markPendingAsSkipped}
                      onChange={e => setCloseOptions(prev => ({ ...prev, markPendingAsSkipped: e.target.checked }))}
                      disabled={stats.pending === 0}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Marcar pendientes como "Saltados"</p>
                      <p className="text-xs text-slate-400">Los {stats.pending} productos pendientes quedarán registrados como omitidos</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      checked={closeOptions.exportBeforeClose}
                      onChange={e => setCloseOptions(prev => ({ ...prev, exportBeforeClose: e.target.checked }))}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Exportar resultados a Excel antes de cerrar</p>
                      <p className="text-xs text-slate-400">Descargará automáticamente el archivo .xlsx con los resultados</p>
                    </div>
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCloseCycle(false)}
                  disabled={closeCycleMutation.isPending}>Cancelar</Button>
                <Button className="bg-amber-600 hover:bg-amber-700"
                  onClick={async () => {
                    if (closeOptions.exportBeforeClose && activeCycle) {
                      const url = `${BASE}/api/reports/export/inventory-cycle-progress?cycleId=${activeCycle.id}`;
                      try {
                        const res = await fetch(url, { headers: { ...getAuthHeaders() } });
                        if (res.ok) {
                          const blob = await res.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = blobUrl;
                          a.download = `inventario_${activeCycle.name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
                          document.body.appendChild(a); a.click();
                          document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
                        }
                      } catch { /* best effort */ }
                    }
                    closeCycleMutation.mutate();
                  }}
                  disabled={closeCycleMutation.isPending}
                >
                  {closeCycleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Cerrar Ciclo
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary dialog */}
      <Dialog open={showSummaryDialog} onOpenChange={o => { if (!o) { setShowSummaryDialog(false); setSummaryCycleId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              {summaryData ? summaryData.cycle.name : "Resumen del Ciclo"}
            </DialogTitle>
          </DialogHeader>
          {!summaryData ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: "Conteados", value: summaryData.stats.counted + summaryData.stats.verified, color: "text-blue-700", bg: "bg-blue-50" },
                  { label: "Sin Movimiento", value: summaryData.stats.withoutMovement, color: "text-slate-600", bg: "bg-slate-100" },
                  { label: "Pendientes", value: summaryData.stats.pending, color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Saltados", value: summaryData.stats.skipped, color: "text-red-600", bg: "bg-red-50" },
                  { label: "Total", value: summaryData.stats.total, color: "text-slate-900", bg: "bg-slate-50" },
                  { label: "Diferencia Exacts", value: summaryData.differences.exactMatch, color: "text-emerald-600", bg: "bg-emerald-50" },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2.5 text-center`}>
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Balance */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-blue-50 rounded-lg p-2">
                  <span className="font-bold text-blue-700">{summaryData.differences.surplus}</span>
                  <p className="text-blue-600">Sobrantes</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <span className="font-bold text-red-700">{summaryData.differences.shortage}</span>
                  <p className="text-red-600">Faltantes</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-2">
                  <span className="font-bold text-slate-700">{summaryData.differences.notCounted}</span>
                  <p className="text-slate-600">Sin conteo</p>
                </div>
              </div>

              {/* Sessions */}
              {summaryData.sessions.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Sesiones</p>
                  <div className="space-y-1">
                    {summaryData.sessions.map(s => (
                      <div key={s.date} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="font-semibold text-slate-700">{s.date}</span>
                        <span className="text-slate-500">{s.productCount} productos</span>
                        <span className="text-slate-400">{s.recordCount} registros</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Largest differences */}
              {summaryData.differences.largestDifferences.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                    Mayores diferencias ({summaryData.differences.largestDifferences.length})
                  </p>
                  <div className="space-y-1">
                    {summaryData.differences.largestDifferences.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-3 py-1.5">
                        <span className="font-mono font-semibold text-slate-500">{d.code}</span>
                        <span className="flex-1 truncate">{d.productName}</span>
                        <span className={`font-mono font-bold ${(d.difference ?? 0) > 0 ? "text-blue-600" : "text-red-600"}`}>
                          {(d.difference ?? 0) > 0 ? "+" : ""}{d.difference?.toFixed(2)} {d.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSummaryDialog(false); setSummaryCycleId(null); }}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete cycle dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ciclo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el ciclo <strong>{deleteTarget?.name}</strong> y todo su progreso.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCycleMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteCycleMutation.mutate(deleteTarget.id)}
              disabled={deleteCycleMutation.isPending}
            >
              {deleteCycleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
