import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import {
  Layers, Plus, Search, Pencil, Trash2,
  CheckCircle, XCircle, AlertCircle, Clock,
  Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface DyeLot {
  id: string;
  productId: string;
  lotNumber: string;
  quantity: string;
  expirationDate: string | null;
  receiptDate: string;
  supplier: string | null;
  certificateNumber: string | null;
  qualityStatus: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Error ${res.status}`);
  }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<
  DyeLot["qualityStatus"],
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pendiente",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  approved: {
    label: "Aprobado",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  rejected: {
    label: "Rechazado",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

function StatusBadge({ status }: { status: DyeLot["qualityStatus"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full border px-2 py-0.5 text-xs",
        cfg.bg, cfg.text, cfg.border
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Default form values
// ---------------------------------------------------------------------------
const defaultForm = {
  productId: "",
  lotNumber: "",
  quantity: "",
  expirationDate: "",
  receiptDate: today(),
  supplier: "",
  certificateNumber: "",
  qualityStatus: "pending" as DyeLot["qualityStatus"],
  notes: "",
};

type FormData = typeof defaultForm;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function LotesyTinturasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canCreate = user?.role && ["admin", "supervisor", "quality", "operator"].includes(user.role);
  const canEdit   = user?.role && ["admin", "supervisor", "quality"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm]       = useState(false);
  const [editTarget, setEditTarget]   = useState<DyeLot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DyeLot | null>(null);
  const [form, setForm]               = useState<FormData>(defaultForm);
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [search, setSearch]           = useState("");
  const [sortField, setSortField]     = useState<keyof DyeLot>("receiptDate");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => api("/api/products?limit=500").then((r: any) => r.data ?? r),
  });

  const { data: lots = [], isLoading, isError } = useQuery<DyeLot[]>({
    queryKey: ["/api/dye-lots"],
    queryFn: () => api("/api/dye-lots"),
  });

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products]
  );

  // ---------------------------------------------------------------------------
  // Filtering & sorting
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    let list = [...lots];
    if (filterStatus !== "all")  list = list.filter(l => l.qualityStatus === filterStatus);
    if (filterProduct !== "all") list = list.filter(l => l.productId === filterProduct);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.lotNumber.toLowerCase().includes(q) ||
        (l.supplier ?? "").toLowerCase().includes(q) ||
        (l.certificateNumber ?? "").toLowerCase().includes(q) ||
        (productMap[l.productId]?.name ?? "").toLowerCase().includes(q) ||
        (productMap[l.productId]?.code ?? "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [lots, filterStatus, filterProduct, search, sortField, sortDir, productMap]);

  const toggleSort = (field: keyof DyeLot) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: keyof DyeLot }) =>
    sortField === field
      ? sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
      : null;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: (data: FormData) => api("/api/dye-lots", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/dye-lots"] }); toast({ title: "Lote registrado" }); closeForm(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormData> }) =>
      api(`/api/dye-lots/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/dye-lots"] }); toast({ title: "Lote actualizado" }); closeForm(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/dye-lots/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/dye-lots"] }); toast({ title: "Lote eliminado" }); setDeleteTarget(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------
  const openCreate = () => { setForm(defaultForm); setEditTarget(null); setShowForm(true); };
  const openEdit   = (lot: DyeLot) => {
    setForm({
      productId: lot.productId, lotNumber: lot.lotNumber,
      quantity: lot.quantity, expirationDate: lot.expirationDate ?? "",
      receiptDate: lot.receiptDate, supplier: lot.supplier ?? "",
      certificateNumber: lot.certificateNumber ?? "",
      qualityStatus: lot.qualityStatus, notes: lot.notes ?? "",
    });
    setEditTarget(lot); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditTarget(null); setForm(defaultForm); };
  const setF = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.productId)         return toast({ title: "Error", description: "Selecciona un producto.", variant: "destructive" });
    if (!form.lotNumber.trim())  return toast({ title: "Error", description: "El número de lote es requerido.", variant: "destructive" });
    if (!form.quantity || isNaN(Number(form.quantity))) return toast({ title: "Error", description: "La cantidad debe ser un número válido.", variant: "destructive" });
    if (!form.receiptDate)       return toast({ title: "Error", description: "La fecha de recepción es requerida.", variant: "destructive" });

    const payload = {
      ...form,
      expirationDate:    form.expirationDate    || undefined,
      supplier:          form.supplier          || undefined,
      certificateNumber: form.certificateNumber || undefined,
      notes:             form.notes             || undefined,
    };

    if (editTarget) updateMutation.mutate({ id: editTarget.id, data: payload });
    else            createMutation.mutate(payload as FormData);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const counts = useMemo(() => ({
    total:    lots.length,
    pending:  lots.filter(l => l.qualityStatus === "pending").length,
    approved: lots.filter(l => l.qualityStatus === "approved").length,
    rejected: lots.filter(l => l.qualityStatus === "rejected").length,
  }), [lots]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Layers className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Lotes y Tinturas</h1>
              <p className="text-slate-500 text-sm">Gestión de lotes y tinturas recibidos</p>
            </div>
          </div>
          {canCreate && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Nuevo Lote
            </Button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total",      value: counts.total,    color: "text-slate-700",   bg: "bg-slate-50 border-slate-200"   },
            { label: "Pendientes", value: counts.pending,  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"   },
            { label: "Aprobados",  value: counts.approved, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Rechazados", value: counts.rejected, color: "text-red-700",     bg: "bg-red-50 border-red-200"       },
          ].map(c => (
            <div key={c.label} className={cn("rounded-xl border p-4", c.bg)}>
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={cn("text-2xl font-bold mt-1", c.color)}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar lote, proveedor, certificado..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="approved">Aprobado</SelectItem>
              <SelectItem value="rejected">Rechazado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-[210px]"><SelectValue placeholder="Producto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los productos</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center p-16 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando lotes...
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center p-16 text-red-500 gap-2">
              <AlertCircle className="w-5 h-5" /> Error al cargar los lotes. Intenta de nuevo.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-16 text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-slate-600">Sin lotes registrados</p>
              <p className="text-sm mt-1">
                {search || filterStatus !== "all" || filterProduct !== "all"
                  ? "No hay resultados para los filtros aplicados."
                  : "Aún no hay lotes. Crea el primero con el botón «Nuevo Lote»."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lotNumber")}>
                      N° Lote <SortIcon field="lotNumber" />
                    </TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("receiptDate")}>
                      Recepción <SortIcon field="receiptDate" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("expirationDate")}>
                      Vencimiento <SortIcon field="expirationDate" />
                    </TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Certificado</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("qualityStatus")}>
                      Estado <SortIcon field="qualityStatus" />
                    </TableHead>
                    {(canEdit || canDelete) && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(lot => {
                    const product = productMap[lot.productId];
                    const expired = lot.expirationDate && lot.expirationDate < today();
                    return (
                      <TableRow key={lot.id} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-mono font-semibold text-slate-800">{lot.lotNumber}</TableCell>
                        <TableCell>
                          {product ? (
                            <div>
                              <p className="font-medium text-sm text-slate-800">{product.name}</p>
                              <p className="text-xs text-slate-400">{product.code}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Producto no encontrado</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{lot.receiptDate}</TableCell>
                        <TableCell className="text-sm">
                          {lot.expirationDate ? (
                            <span className={cn(expired ? "text-red-600 font-medium" : "text-slate-600")}>
                              {lot.expirationDate}
                              {expired && <span className="ml-1 text-xs text-red-400">(vencido)</span>}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700">
                          {Number(lot.quantity).toLocaleString("es-PE")}
                          {product && <span className="ml-1 text-xs text-slate-400">{product.unit}</span>}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{lot.supplier ?? <span className="text-slate-300">—</span>}</TableCell>
                        <TableCell className="text-sm font-mono text-slate-600">{lot.certificateNumber ?? <span className="text-slate-300">—</span>}</TableCell>
                        <TableCell><StatusBadge status={lot.qualityStatus} /></TableCell>
                        {(canEdit || canDelete) && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {canEdit && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600" onClick={() => openEdit(lot)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600" onClick={() => setDeleteTarget(lot)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 text-right">
          Mostrando {filtered.length} de {lots.length} lotes
        </p>
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={showForm} onOpenChange={o => !o && closeForm()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Lote" : "Nuevo Lote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Producto <span className="text-red-500">*</span></Label>
              <Select value={form.productId} onValueChange={v => setF("productId", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona un producto..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>N° de Lote <span className="text-red-500">*</span></Label>
                <Input value={form.lotNumber} onChange={e => setF("lotNumber", e.target.value)} placeholder="Ej: LOT-2025-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad <span className="text-red-500">*</span></Label>
                <Input type="number" min="0" step="0.01" value={form.quantity} onChange={e => setF("quantity", e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fecha de Recepción <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.receiptDate} onChange={e => setF("receiptDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de Vencimiento</Label>
                <Input type="date" value={form.expirationDate} onChange={e => setF("expirationDate", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Proveedor</Label>
                <Input value={form.supplier} onChange={e => setF("supplier", e.target.value)} placeholder="Nombre del proveedor" />
              </div>
              <div className="space-y-1.5">
                <Label>N° Certificado</Label>
                <Input value={form.certificateNumber} onChange={e => setF("certificateNumber", e.target.value)} placeholder="Ej: CERT-001" />
              </div>
            </div>

            {canEdit && (
              <div className="space-y-1.5">
                <Label>Estado de Calidad</Label>
                <Select value={form.qualityStatus} onValueChange={v => setF("qualityStatus", v as DyeLot["qualityStatus"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                    <SelectItem value="rejected">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notas / Observaciones</Label>
              <Textarea value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Observaciones adicionales..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editTarget ? "Guardar cambios" : "Registrar lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el lote <span className="font-semibold">{deleteTarget?.lotNumber}</span> de forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
