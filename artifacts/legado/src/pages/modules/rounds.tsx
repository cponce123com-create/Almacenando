import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import {
  ClipboardList, Layers, ArrowUpDown, Package,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronRight, History, Eye, Loader2
} from "lucide-react";

interface Round {
  id: string;
  roundNumber: number;
  warehouse: string;
  balanceDate: string | null;
  status: "active" | "closed";
  totalSystemBalance: number | null;
  totalPhysical: number | null;
  difference: number | null;
  recordCount: number | null;
  startedAt: string;
  closedAt: string | null;
}

interface RoundRecord {
  id: string;
  productId: string;
  recordDate: string;
  physicalCount: string | null;
  location: string | null;
  notes: string | null;
  missingLabel: boolean | null;
  boxes: Array<{
    id: string;
    boxNumber: number;
    weight: string | null;
    tare: string | null;
    lot: string | null;
  }>;
}

const api = async (path: string) => {
  const res = await fetch(path, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" }) : "—";
const formatNum = (n: number | null | undefined) => n != null ? Number(n).toFixed(2) : "—";

export default function RoundsPage() {
  const { selectedWarehouse } = useWarehouse();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ round: Round; records: RoundRecord[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/api/rounds?warehouse=${selectedWarehouse}`)
      .then(setRounds)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedWarehouse]);

  const openDetail = async (round: Round) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const data = await api(`/api/rounds/${round.id}`);
      setDetail(data);
    } catch (e) { console.error(e); }
    setLoadingDetail(false);
  };

  return (
    <AppLayout title="Rondas de Inventario">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              Rondas de Inventario
            </h1>
            <p className="text-sm text-slate-500">{selectedWarehouse}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : rounds.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hay rondas registradas</p>
            <p className="text-sm">Las rondas se crean automáticamente al importar saldos</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {rounds.map((round) => {
              const isActive = round.status === "active";
              const diff = round.difference;
              const diffColor = diff === null || diff === 0 ? "text-slate-500"
                : Math.abs(diff) < 5 ? "text-emerald-600"
                : "text-red-500";

              return (
                <Card
                  key={round.id}
                  className={`overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    isActive ? "ring-2 ring-emerald-400 bg-emerald-50/30" : ""
                  } ${detail?.round.id === round.id ? "ring-2 ring-blue-400" : ""}`}
                  onClick={() => openDetail(round)}
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          isActive ? "bg-emerald-100" : "bg-slate-100"
                        }`}>
                          <Layers className={`w-5 h-5 ${isActive ? "text-emerald-600" : "text-slate-500"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-800">
                              Ronda #{round.roundNumber}
                            </h3>
                            {isActive && (
                              <Badge className="bg-emerald-500 text-white text-[10px] px-2 py-0">
                                Activa
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDate(round.startedAt)}
                            {round.closedAt && ` — ${formatDate(round.closedAt)}`}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 text-slate-300 shrink-0 transition-transform ${
                        detail?.round.id === round.id ? "rotate-90" : ""
                      }`} />
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">
                          {isActive ? "Registros" : "Total Físico"}
                        </p>
                        <p className="text-lg font-bold text-slate-800">
                          {isActive ? round.recordCount ?? "—" : formatNum(round.totalPhysical)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Saldo Sistema</p>
                        <p className="text-lg font-bold text-slate-800">{formatNum(round.totalSystemBalance)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Diferencia</p>
                        <p className={`text-lg font-bold ${diffColor}`}>
                          {diff === null ? "—" : diff > 0 ? `+${formatNum(diff)}` : formatNum(diff)}
                        </p>
                      </div>
                    </div>

                    {round.balanceDate && (
                      <p className="text-xs text-slate-400 mt-3">
                        Saldo actualizado: {formatDate(round.balanceDate)}
                      </p>
                    )}
                  </div>

                  {/* Detalle expandido */}
                  {detail?.round.id === round.id && (
                    <div className="border-t border-slate-100 bg-white" onClick={e => e.stopPropagation()}>
                      {loadingDetail ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                      ) : (
                        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                          {detail.records.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">Sin registros en esta ronda</p>
                          ) : (
                            detail.records.map((rec) => (
                              <div key={rec.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5 text-sm">
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">{rec.recordDate}</span>
                                <span className="text-slate-700 font-medium truncate">
                                  {rec.physicalCount ? `${Number(rec.physicalCount).toFixed(2)}` : "—"}
                                </span>
                                {rec.missingLabel && (
                                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">
                                    Falta etiqueta
                                  </span>
                                )}
                                <div className="flex gap-1 ml-auto shrink-0">
                                  {rec.boxes?.map(box => (
                                    <span key={box.id} className="text-[10px] text-slate-400 bg-white rounded px-1.5 py-0.5 border border-slate-200">
                                      C{box.boxNumber}: {box.weight ? Number(box.weight).toFixed(1) : "—"}/{box.tare ? Number(box.tare).toFixed(1) : "—"}kg
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
