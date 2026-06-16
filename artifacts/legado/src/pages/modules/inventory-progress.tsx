import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ClipboardList, Plus, Trash2, Loader2, AlertCircle, Search, Target, CheckCircle2,
  Clock, Radio, CircleDotDashed, BarChart3, Lightbulb, PackageX, TrendingUp,
  TrendingDown, Minus, FileSpreadsheet, Archive, XCircle,
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
}

interface Recommendation {
  id: string; productId: string; code: string; productName: string;
  unit: string; location?: string | null; category?: string | null;
  priority: number; initialQuantity: number | null;
  initialUltimoConsumo: string | null; status: string;
}

interface ProgressResponse {
  cycle: Cycle;
  stats: { pending: number; counted: number; verified: number; withoutMovement: number; skipped: number; total: number };
  products: CycleProduct[];
}

interface RecommendationResponse {
  recommendations: Recommendation[];
  totalPending: number;
  suggestedCount: number;
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
    without_movement: { label: "Sin Movimiento", bg: "bg-slate-100", text: "text-slate-600", icon: <Minus className="w-3 h-3" /> },
    skipped: { label: "Saltado", bg: "bg-red-50", text: "text-red-600", icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.bg} ${s.text} rounded-full px-2.5 py-0.5`}>
      {s.icon} {s.label}
    </span>
  );
}

function RecommendationCard({ rec, onUse }: { rec: Recommendation; onUse: (rec: Recommendation) => void }) {
  const daysSinceConsumo = rec.initialUltimoConsumo
    ? Math.floor((new Date().getTime() - new Date(rec.initialUltimoConsumo).getTime()) / 86400000)
    : null;

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
            {rec.initialQuantity !== null && (
              <span className="font-mono">
                Saldo: {rec.initialQuantity.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => onUse(rec)} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-xs">
          <Target className="w-3.5 h-3.5 mr-1" /> Contar
        </Button>
      </div>
      {rec.initialUltimoConsumo && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          Últ. consumo: {rec.initialUltimoConsumo}
          {daysSinceConsumo !== null && (
            <span className={daysSinceConsumo > 365 ? "text-red-500 font-medium" : ""}>
              ({Math.floor(daysSinceConsumo / 30.44)} meses)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function InventoryProgressPage() {
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const { toast } = useToast();
  const qc = useQueryClient();

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

  const warehouseParam = warehouse === "all" ? "" : `?warehouse=${warehouse}`;

  // Get active cycle
  const { data: activeCycle, isLoading: cycleLoading, error: cycleError } = useQuery<Cycle | null>({
    queryKey: ["active-cycle", warehouse],
    queryFn: () => apiJson(`${BASE}/api/inventory-cycles/active${warehouseParam}`),
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

  // Get recommendations
  const { data: recommendations } = useQuery<RecommendationResponse>({
    queryKey: ["cycle-recommendations", activeCycle?.id],
    queryFn: () => apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/recommendations?limit=5`),
    enabled: !!activeCycle,
    refetchInterval: 30000,
  });

  // Create cycle mutation
  const createCycleMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse: warehouse === "all" ? "QA" : warehouse,
        name: cycleName || `Inventario ${warehouse === "all" ? "QA" : warehouse} - ${today()}`,
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

  // Close cycle mutation
  const closeCycleMutation = useMutation({
    mutationFn: () => apiJson(`${BASE}/api/inventory-cycles/${activeCycle!.id}/close`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      qc.invalidateQueries({ queryKey: ["cycle-progress"] });
      setShowCloseCycle(false);
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
      qc.invalidateQueries({ queryKey: ["cycle-recommendations"] });
      setDetectResult(data);
      toast({ title: "Detección completada", description: data.message });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
  const stats = progress?.stats ?? { pending: 0, counted: 0, verified: 0, withoutMovement: 0, skipped: 0, total: 0 };
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
              <h1 className="text-2xl font-bold text-slate-900">Progreso de Inventario</h1>
              <p className="text-sm text-slate-500">
                {activeCycle
                  ? `Ciclo activo: ${activeCycle.name} · ${pctComplete}% completado`
                  : "No hay un ciclo de inventario activo"}
                {warehouse !== "all" && (
                  <span className="ml-1 font-semibold text-blue-600">· {warehouse}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeCycle ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowDetectNoMovement(true)}>
                  <Radio className="w-4 h-4 mr-1.5" /> Detectar Sin Movimiento
                </Button>
                <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => setShowCloseCycle(true)}>
                  <Archive className="w-4 h-4 mr-1.5" /> Cerrar Ciclo
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setShowCreateCycle(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Iniciar Ciclo
              </Button>
            )}
          </div>
        </div>

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
                { label: "Sin Movimiento", value: stats.withoutMovement, color: "text-slate-500", bg: "bg-slate-100" },
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
        {activeCycle && recommendations && recommendations.recommendations.length > 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-blue-800">Recomendaciones inteligentes</h2>
              <span className="text-xs text-blue-500 ml-auto">
                {recommendations.totalPending} productos pendientes — te sugerimos contar estos {recommendations.suggestedCount}:
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {recommendations.recommendations.map(rec => (
                <RecommendationCard key={rec.id} rec={rec} onUse={(r) => {
                  window.open(`${BASE}/inventory?productId=${r.productId}`, "_self");
                }} />
              ))}
            </div>
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
              El sistema cargará automáticamente todos los productos activos del almacén
              y calculará prioridades basadas en cuándo fue su último inventario.
            </p>
            <Button onClick={() => setShowCreateCycle(true)} className="mt-2">
              <Plus className="w-4 h-4 mr-1.5" /> Iniciar Ciclo de Inventario
            </Button>
          </div>
        )}

        {/* Products table */}
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
                  <SelectItem value="without_movement">Sin Movimiento</SelectItem>
                  <SelectItem value="skipped">Saltados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold text-slate-600">Código</TableHead>
                        <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                        <TableHead className="font-semibold text-slate-600">UM</TableHead>
                        <TableHead className="font-semibold text-slate-600 text-right">Saldo Inicial</TableHead>
                        <TableHead className="font-semibold text-slate-600 text-right">Conteo Físico</TableHead>
                        <TableHead className="font-semibold text-slate-600 text-right">Diferencia</TableHead>
                        <TableHead className="font-semibold text-slate-600">Últ. Consumo</TableHead>
                        <TableHead className="font-semibold text-slate-600">Estado</TableHead>
                        <TableHead className="font-semibold text-slate-600">Prioridad</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-24">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {progress.products.map(p => {
                        const diff = p.difference;
                        return (
                          <TableRow key={p.id} className="hover:bg-slate-50/70">
                            <TableCell className="font-mono text-xs font-medium text-slate-500">{p.code}</TableCell>
                            <TableCell>
                              <p className="text-sm font-medium text-slate-900 truncate max-w-[250px]">{p.productName}</p>
                              {p.location && <p className="text-xs text-slate-400">{p.location}</p>}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">{p.unit}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-600">
                              {p.initialQuantity !== null ? p.initialQuantity.toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-800 font-semibold">
                              {p.physicalCount !== null ? p.physicalCount.toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {diff !== null ? (
                                <span className={`font-mono text-sm font-semibold ${
                                  Math.abs(diff) < 0.01 ? "text-emerald-600"
                                  : diff > 0 ? "text-blue-600" : "text-red-600"
                                }`}>
                                  {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {p.initialUltimoConsumo ? (
                                <span className="text-slate-600">{p.initialUltimoConsumo}</span>
                              ) : <span className="text-slate-300">—</span>}
                            </TableCell>
                            <TableCell>{statusBadge(p.status)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${
                                  p.priority >= 100 ? "bg-red-500"
                                  : p.priority >= 50 ? "bg-amber-500"
                                  : p.priority >= 20 ? "bg-blue-400"
                                  : "bg-slate-300"
                                }`} />
                                <span className="text-xs text-slate-500">{p.priority}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {p.status === "pending" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600"
                                  onClick={() => window.open(`${BASE}/inventory?productId=${p.productId}`, "_self")}>
                                  <Target className="w-3 h-3 mr-1" /> Contar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

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
                placeholder={`Inventario ${warehouse === "all" ? "QA" : warehouse} - ${today()}`}
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
                <li>• Se cargarán todos los productos activos del almacén</li>
                <li>• Se calculará prioridad según último inventario y consumo</li>
                <li>• Podrás marcar productos como "sin movimiento" tras importar saldos</li>
                <li>• El sistema te recomendará qué productos contar cada día</li>
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

      {/* Close cycle dialog */}
      <AlertDialog open={showCloseCycle} onOpenChange={o => { if (!o) setShowCloseCycle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar ciclo de inventario?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 mt-2">
                <p>Esto cerrará el ciclo actual. Se guardarán las estadísticas finales:</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-blue-700">{stats.counted + stats.verified}</p>
                    <p className="text-xs text-blue-600">Conteados</p>
                  </div>
                  <div className="bg-slate-100 rounded-lg p-2">
                    <p className="text-lg font-bold text-slate-700">{stats.withoutMovement}</p>
                    <p className="text-xs text-slate-600">Sin Movimiento</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-amber-700">{stats.pending}</p>
                    <p className="text-xs text-amber-600">Pendientes</p>
                  </div>
                </div>
                {stats.pending > 0 && (
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠️ Quedan {stats.pending} productos pendientes que no serán conteados.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeCycleMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => closeCycleMutation.mutate()}
              disabled={closeCycleMutation.isPending}
            >
              {closeCycleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cerrar Ciclo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
