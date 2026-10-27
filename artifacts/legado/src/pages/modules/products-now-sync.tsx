import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "./products-partials";

type SyncStatus = { id: string; status: string; recordCount: number; errorMessage?: string | null };
type PreviewRow = { warehouse: string; type: "Q"; code: string; name: string; unit: string; location?: string };

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la solicitud.");
  return body as T;
}

export function ProductsNowSync({ warehouse, canSync, onImported }: {
  warehouse: string;
  canSync: boolean;
  onImported: () => void;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const { toast } = useToast();
  const validWarehouse = ["QA", "Q1", "QP", "QL", "QC", "all"].includes(warehouse);

  const requestMutation = useMutation({
    mutationFn: () => apiRequest<{ id: string }>("/api/balances/now/products/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouse }),
    }),
    onSuccess: data => setRunId(data.id),
    onError: (error: Error) => toast({ title: "No se pudo solicitar la maestra", description: error.message, variant: "destructive" }),
  });

  const statusQuery = useQuery<SyncStatus>({
    queryKey: ["products-now-status", runId],
    queryFn: () => apiRequest<SyncStatus>(`/api/balances/now/products/status/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: query => {
      const status = (query.state.data as SyncStatus | undefined)?.status;
      return status === "requested" || status === "extracting" ? 2500 : false;
    },
  });

  const previewQuery = useQuery<{ recordCount: number; rows: PreviewRow[] }>({
    queryKey: ["products-now-preview", runId],
    queryFn: () => apiRequest(`/api/balances/now/products/${runId}/preview`),
    enabled: Boolean(runId && statusQuery.data?.status === "preview"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiRequest<{ imported: number }>(`/api/balances/now/products/${runId}/confirm`, { method: "POST" }),
    onSuccess: data => {
      toast({ title: "Maestro actualizado", description: `Se sincronizaron ${data.imported} productos químicos Q en ${warehouse}.` });
      onImported();
      setRunId(null);
    },
    onError: (error: Error) => toast({ title: "Error al guardar", description: error.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest(`/api/balances/now/products/${runId}/reject`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Vista previa descartada" });
      setRunId(null);
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const status = statusQuery.data?.status;
  const busy = requestMutation.isPending || status === "requested" || status === "extracting";
  const preview = previewQuery.data;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
        disabled={!canSync || !validWarehouse || busy || Boolean(runId)}
        title={!validWarehouse ? "Selecciona QA, Q1, QP, QL, QC o Todos los almacenes." : undefined}
        onClick={() => requestMutation.mutate()}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Actualizar desde NOW
      </Button>

      {!validWarehouse && (
        <p className="text-xs text-slate-500">Selecciona un almacén o Todos los almacenes para sincronizar la maestra.</p>
      )}

      {busy && (
        <p className="text-sm text-slate-600">Esperando al conector de tu PC para leer los productos Q de {warehouse}…</p>
      )}

      {statusQuery.isError && (
        <p className="text-sm text-red-600">{(statusQuery.error as Error).message}</p>
      )}
      {status === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudo leer la maestra: {statusQuery.data?.errorMessage || "revisa el conector y vuelve a solicitar la actualización."}
          <Button type="button" variant="ghost" size="sm" className="ml-2" onClick={() => setRunId(null)}>Cerrar</Button>
        </div>
      )}

      {status === "preview" && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4 space-y-3">
          <div>
            <p className="font-semibold text-slate-800">Vista previa de Maestro de Productos — {warehouse}</p>
            <p className="text-sm text-slate-600">{preview?.recordCount ?? statusQuery.data?.recordCount ?? 0} productos tipo Q. Se actualizarán por código; los campos de seguridad y stock mínimo existentes se conservarán.</p>
          </div>
          {previewQuery.isLoading ? <p className="text-sm">Cargando vista previa…</p> : (
            <div className="max-h-52 overflow-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-slate-500"><th className="p-2">Código</th><th className="p-2">Descripción</th><th className="p-2">UM</th><th className="p-2">Ubicaciones</th></tr></thead>
                <tbody>
                  {(preview?.rows ?? []).slice(0, 12).map(row => (
                    <tr key={row.code} className="border-b last:border-0">
                      <td className="p-2 font-mono">{row.code}</td><td className="p-2">{row.name}</td><td className="p-2">{row.unit}</td><td className="p-2">{row.location || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(preview?.rows.length ?? 0) > 12 && <p className="p-2 text-xs text-slate-500">Se muestran los primeros 12; la confirmación incluirá todos.</p>}
            </div>
          )}
          {previewQuery.isError && <p className="text-sm text-red-600">No se pudo cargar la vista previa.</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="gap-1.5" disabled={!preview || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
              {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar e importar
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Rechazar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
