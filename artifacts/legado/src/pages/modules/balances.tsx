import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Scale, Plus, Pencil, Trash2, Loader2, AlertCircle, Download, Upload, Search, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BalanceRecord {
  id: string;
  warehouse: string;
  type?: string | null;
  code: string;
  productDescription: string;
  unit: string;
  quantity: string;
  balanceDate: string;
  batchId?: string | null;
  notes?: string | null;
  registeredBy: string;
  createdAt: string;
}

interface ImportResult {
  inserted: number;
  updated: number;
  errors: Array<{ row: number; code: string; error: string }>;
  total: number;
  batchId: string;
}

const apiJson = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (warehouse: string) => ({
  warehouse,
  type: "",
  code: "",
  productDescription: "",
  unit: "",
  quantity: "0",
  balanceDate: today(),
  notes: "",
});

function BalanceForm({ initial, onSubmit, onCancel, isLoading, isEdit }: {
  initial: ReturnType<typeof emptyForm>;
  onSubmit: (data: ReturnType<typeof emptyForm>) => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Almacén *</Label>
          <Select value={form.warehouse} onValueChange={v => set("warehouse", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              <SelectItem value="General">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo</Label>
          <Input value={form.type} onChange={e => set("type", e.target.value)} placeholder="Tipo de producto" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Código *</Label>
          <Input value={form.code} onChange={e => set("code", e.target.value)} placeholder="PROD-001" required />
        </div>
        <div>
          <Label>UM *</Label>
          <Input value={form.unit} onChange={e => set("unit", e.target.value)} placeholder="L, kg, unidad..." required />
        </div>
      </div>
      <div>
        <Label>Descripción Producto *</Label>
        <Input value={form.productDescription} onChange={e => set("productDescription", e.target.value)} placeholder="Ácido Sulfúrico 98%..." required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Cantidad *</Label>
          <Input type="number" step="0.001" value={form.quantity} onChange={e => set("quantity", e.target.value)} />
        </div>
        <div>
          <Label>Fecha *</Label>
          <Input type="date" value={form.balanceDate} onChange={e => set("balanceDate", e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Notas</Label>
        <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Observaciones..." />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>Cancelar</Button>
        <Button
          onClick={() => onSubmit(form)}
          disabled={isLoading || !form.code || !form.productDescription || !form.unit}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : "Registrar Saldo"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ImportResultsModal({ open, onClose, result }: { open: boolean; onClose: () => void; result: ImportResult | null }) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Resultado de Importación</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
              <p className="text-xs text-green-600">Nuevos</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-700">{result.updated ?? 0}</p>
              <p className="text-xs text-blue-600">Actualizados</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
              <p className="text-xs text-red-600">Errores</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-slate-700">{result.total}</p>
              <p className="text-xs text-slate-600">Total</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y text-xs">
              {result.errors.map((e, i) => (
                <div key={i} className="flex gap-2 p-2 bg-red-50">
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <span><span className="font-medium">Fila {e.row} ({e.code}):</span> {e.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BalancesPage() {
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<BalanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BalanceRecord | null>(null);
  const [showImportResult, setShowImportResult] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [filterDate, setFilterDate] = useState<string>("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const warehouseParam = warehouse === "all" ? "" : `?warehouse=${warehouse}`;

  const { data: records = [], isLoading, error } = useQuery<BalanceRecord[]>({
    queryKey: ["balances", warehouse, filterDate],
    queryFn: () => {
      let url = `${BASE}/api/balances`;
      const params = new URLSearchParams();
      if (warehouse !== "all") params.set("warehouse", warehouse);
      if (filterDate) params.set("date", filterDate);
      const qs = params.toString();
      return apiJson(qs ? `${url}?${qs}` : url);
    },
  });

  const { data: dates = [] } = useQuery<{ balanceDate: string; batchId: string; warehouse: string }[]>({
    queryKey: ["balance-dates", warehouse],
    queryFn: () => apiJson(`${BASE}/api/balances/dates${warehouseParam}`),
  });

  const uniqueDates = [...new Map(dates.map(d => [d.balanceDate, d])).values()];

  const filtered = records.filter(r =>
    r.code.toLowerCase().includes(search.toLowerCase()) ||
    r.productDescription.toLowerCase().includes(search.toLowerCase()) ||
    r.warehouse.toLowerCase().includes(search.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: (data: ReturnType<typeof emptyForm>) => apiJson(`${BASE}/api/balances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["balance-dates"] });
      setShowForm(false);
      toast({ title: "Saldo registrado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ReturnType<typeof emptyForm>> }) =>
      apiJson(`${BASE}/api/balances/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      setEditRecord(null);
      toast({ title: "Registro actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`${BASE}/api/balances/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["balance-dates"] });
      setDeleteTarget(null);
      toast({ title: "Registro eliminado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => fetch(`${BASE}/api/balances/all`, { method: "DELETE", headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error("Error al eliminar"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["balance-dates"] });
      setShowDeleteAll(false);
      toast({ title: "Saldos eliminados", description: "Todos los registros de saldo fueron eliminados." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const downloadTemplate = async () => {
    const res = await fetch(`${BASE}/api/balances/template`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_saldo.xlsx";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isImporting) return;
    e.target.value = "";
    setIsImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await apiJson(`${BASE}/api/balances/import`, { method: "POST", body: fd });
      setImportResult(result);
      setShowImportResult(true);
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["balance-dates"] });
    } catch (err: unknown) {
      toast({ title: "Error al importar", description: err instanceof Error ? err.message : "Error desconocido", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-6 h-6 text-violet-600" /> Saldo Actualizado
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Registro de saldos por almacén y fecha — con historial completo
              {warehouse !== "all" && <span className="ml-1 font-semibold text-violet-600">· {warehouse}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-1.5" /> Descargar Plantilla
            </Button>
            <label className={`cursor-pointer ${isImporting ? "opacity-60 pointer-events-none" : ""}`}>
              <Button variant="outline" size="sm" asChild disabled={isImporting}>
                <span>
                  {isImporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                  {isImporting ? "Importando…" : "Importar"}
                </span>
              </Button>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} disabled={isImporting} />
            </label>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Nuevo Saldo
            </Button>
            {user?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => setShowDeleteAll(true)}
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar todo
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Buscar por código o descripción..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Fecha:</Label>
            <Select value={filterDate || "all"} onValueChange={v => setFilterDate(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todas las fechas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fechas</SelectItem>
                {uniqueDates.map(d => (
                  <SelectItem key={d.balanceDate} value={d.balanceDate}>{d.balanceDate}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span>Error al cargar los saldos</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                {filtered.length === records.length
                  ? `${records.length} registro${records.length !== 1 ? "s" : ""}`
                  : `${filtered.length} de ${records.length} registro${records.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Almacén</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>UM</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-20">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                        <Scale className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay saldos registrados{search ? " que coincidan con la búsqueda" : ""}</p>
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.id} className="hover:bg-slate-50">
                      <TableCell>
                        <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">{r.warehouse}</span>
                      </TableCell>
                      <TableCell className="text-slate-600">{r.type || "—"}</TableCell>
                      <TableCell className="font-mono text-sm font-medium">{r.code}</TableCell>
                      <TableCell>{r.productDescription}</TableCell>
                      <TableCell className="text-slate-500">{r.unit}</TableCell>
                      <TableCell className="text-right font-semibold font-mono">{parseFloat(r.quantity).toFixed(2)}</TableCell>
                      <TableCell className="text-slate-500">{r.balanceDate}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditRecord(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={open => !open && setShowForm(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Saldo</DialogTitle></DialogHeader>
          <BalanceForm
            initial={emptyForm(warehouse === "all" ? "QA" : warehouse)}
            onSubmit={data => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
            isLoading={createMutation.isPending}
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRecord} onOpenChange={open => !open && setEditRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Saldo</DialogTitle></DialogHeader>
          {editRecord && (
            <BalanceForm
              initial={{
                warehouse: editRecord.warehouse,
                type: editRecord.type ?? "",
                code: editRecord.code,
                productDescription: editRecord.productDescription,
                unit: editRecord.unit,
                quantity: editRecord.quantity,
                balanceDate: editRecord.balanceDate,
                notes: editRecord.notes ?? "",
              }}
              onSubmit={data => updateMutation.mutate({ id: editRecord.id, data })}
              onCancel={() => setEditRecord(null)}
              isLoading={updateMutation.isPending}
              isEdit={true}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar saldo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el saldo de <strong>{deleteTarget?.productDescription}</strong> con fecha {deleteTarget?.balanceDate}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAll} onOpenChange={open => !open && setShowDeleteAll(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los saldos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán <strong>todos los registros de saldo</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sí, eliminar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportResultsModal open={showImportResult} onClose={() => setShowImportResult(false)} result={importResult} />
    </AppLayout>
  );
}
