import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES } from "@/contexts/WarehouseContext";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  FlaskConical,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import {
  Product, ProductFormData, BalanceRecord, ImportResult,
  sinMovimiento, CATEGORIES, UNITS, HAZARD_CLASSES, emptyForm, BASE,
  fetchProducts, createProduct, updateProduct, deleteProduct,
  downloadTemplate, exportProducts, importProducts,
  ImportResultsModal, StatusBadge, HazardBadge, ProductForm,
} from "./products-partials";
import { ProductsNowSync } from "./products-now-sync";
export default function MaestrodeProductosPage() {
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isTemplating, setIsTemplating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showImportResult, setShowImportResult] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportProducts(warehouse);
    } catch (e: unknown) {
      toast({ title: "Error al exportar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleTemplate = async () => {
    setIsTemplating(true);
    try {
      await downloadTemplate();
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsTemplating(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsImporting(true);
    try {
      const result = await importProducts(file, warehouse);
      setImportResult(result);
      setShowImportResult(true);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
    } catch (err: unknown) {
      toast({ title: "Error al importar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const { data: products = [], isLoading, isError } = useQuery<Product[]>({
    queryKey: ["/api/products", warehouse],
    queryFn: () => fetchProducts(warehouse),
  });

  const { data: latestBalances = [] } = useQuery<BalanceRecord[]>({
    queryKey: ["/api/balances/latest", warehouse],
    queryFn: async () => {
      const params = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
      const res = await fetch(`${BASE}/api/balances/latest${params}`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const balanceByCode = useMemo(
    () => Object.fromEntries(latestBalances.map((b: BalanceRecord) => [`${b.warehouse}::${b.type ?? ""}::${b.code}`, b])),
    [latestBalances]
  );

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Producto creado", description: "El producto fue registrado exitosamente." });
      setShowForm(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductFormData> }) =>
      updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Producto actualizado", description: "Los cambios fueron guardados." });
      setEditProduct(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      if (data.soft) {
        toast({
          title: "Producto marcado como inactivo",
          description: data.reason ?? "El producto tiene registros relacionados y no puede eliminarse físicamente.",
        });
      } else {
        toast({ title: "Producto eliminado", description: "El producto fue eliminado permanentemente." });
      }
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => fetch(`${BASE}/api/products/all`, {
      method: "DELETE",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "ELIMINAR_TODO" }),
    }).then(r => { if (!r.ok) throw new Error("Error al eliminar"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      setShowDeleteAll(false);
      toast({ title: "Maestra vaciada", description: "Todos los productos fueron eliminados." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter(p => {
      const matchSearch = !term || [p.code, p.name, p.category, p.location, p.supplier, p.casNumber]
        .some(v => v?.toLowerCase().includes(term));
      const matchCat = filterCategory === "all" || p.category === filterCategory;
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      return matchSearch && matchCat && matchStatus;
    });
  }, [products, search, filterCategory, filterStatus]);

  const categories = useMemo(() =>
    Array.from(new Set(products.map(p => p.category))).sort(), [products]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Maestro de Productos</h1>
              <p className="text-slate-500 text-sm">Gestión de productos químicos del almacén</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-slate-600"
              onClick={handleTemplate}
              disabled={isTemplating}
            >
              {isTemplating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Plantilla
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-slate-600"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Exportar Excel
            </Button>
            {canWrite && (
              <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors ${isImporting ? "opacity-50 pointer-events-none" : ""}`}>
                {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Importar Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={handleImportFile}
                  disabled={isImporting}
                />
              </label>
            )}
            {canWrite && (
              <Button onClick={() => setShowForm(true)} className="gap-2" size="sm">
                <Plus className="w-4 h-4" />
                Nuevo Producto
              </Button>
            )}
            {user?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => setShowDeleteAll(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar todo
              </Button>
            )}
          </div>
        </div>

        <ProductsNowSync
          warehouse={warehouse}
          canSync={Boolean(user?.role && ["admin", "supervisor"].includes(user.role))}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
          }}
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-500 mb-1">Total Productos</p>
            <p className="text-2xl font-bold text-slate-900">{products.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-500 mb-1">Activos</p>
            <p className="text-2xl font-bold text-emerald-600">
              {products.filter(p => p.status === "active").length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-500 mb-1">Categorías</p>
            <p className="text-2xl font-bold text-blue-600">{categories.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-500 mb-1">Filtrados</p>
            <p className="text-2xl font-bold text-slate-700">{filtered.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por código, nombre, categoría, proveedor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="sm:w-36">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando productos...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm">No se pudo cargar la lista de productos</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <FlaskConical className="w-10 h-10" />
              <p className="text-sm font-medium">
                {search || filterCategory !== "all" || filterStatus !== "all"
                  ? "No hay productos que coincidan con los filtros"
                  : "No hay productos registrados aún"}
              </p>
              {canWrite && !search && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Crear primer producto
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600 w-20">Almacén</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Código</TableHead>
                    <TableHead className="font-semibold text-slate-600">Nombre</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Categoría</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20">Unidad</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Ubicación</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-32">Clase Peligro</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28 text-right">Stock Min/Max</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-16 text-center">MSDS</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28 text-center">
                      <span className="flex items-center justify-center gap-1"><Clock className="w-3.5 h-3.5" />Movilidad</span>
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Estado</TableHead>
                    {(canWrite || canDelete) && (
                      <TableHead className="font-semibold text-slate-600 w-24 text-right">Acciones</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(product => (
                    <TableRow key={product.id} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell>
                        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                          {product.warehouse || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                          {product.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{product.name}</p>
                          {product.type && (
                            <p className="text-xs text-violet-500 mt-0.5">{product.type}</p>
                          )}
                          {product.casNumber && (
                            <p className="text-xs text-slate-400 mt-0.5">CAS: {product.casNumber}</p>
                          )}
                          {product.supplier && (
                            <p className="text-xs text-slate-400">{product.supplier}</p>
                          )}
                          {product.controlled && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Controlado</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700">{product.category}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{product.unit}</span>
                      </TableCell>
                      <TableCell>
                        {product.location ? (
                          <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                            {product.location}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <HazardBadge hazardClass={product.hazardClass} />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs text-slate-600 font-mono">
                          {product.minimumStock}
                          {product.maximumStock ? ` / ${product.maximumStock}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {product.msds ? (
                          <a
                            href={product.msdsUrl ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={product.msdsUrl ? "cursor-pointer" : "cursor-default pointer-events-none"}
                            title={product.msdsUrl ? `Ver MSDS: ${product.msdsUrl}` : "MSDS registrada (sin URL)"}
                          >
                            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: "#dcfce7", color: "#16a34a" }}>
                              Con MSDS
                            </span>
                          </a>
                        ) : (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>
                            Sin MSDS
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const bal = balanceByCode[`${product.warehouse}::${product.type ?? ""}::${product.code}`];
                          const sm = sinMovimiento(bal?.ultimoConsumo);
                          return (
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${sm.pill}`} title={bal?.ultimoConsumo ? `Último movimiento: ${bal.ultimoConsumo}` : "Sin datos de movimiento"}>
                              {sm.label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={product.status} />
                      </TableCell>
                      {(canWrite || canDelete) && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => setEditProduct(product)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(product)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Create Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Nuevo Producto
              </DialogTitle>
            </DialogHeader>
            <ProductForm
              initial={emptyForm(warehouse === "all" ? "General" : warehouse)}
              onSubmit={data => createMutation.mutate(data)}
              onCancel={() => setShowForm(false)}
              isLoading={createMutation.isPending}
              isEdit={false}
            />
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editProduct} onOpenChange={open => { if (!open) setEditProduct(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                Editar Producto — {editProduct?.code}
              </DialogTitle>
            </DialogHeader>
            {editProduct && (
              <ProductForm
                initial={{
                  warehouse: editProduct.warehouse || "General",
                  type: editProduct.type ?? "",
                  code: editProduct.code,
                  name: editProduct.name,
                  casNumber: editProduct.casNumber ?? "",
                  category: editProduct.category,
                  unit: editProduct.unit,
                  minimumStock: editProduct.minimumStock,
                  maximumStock: editProduct.maximumStock ?? "",
                  location: editProduct.location ?? "",
                  supplier: editProduct.supplier ?? "",
                  hazardClass: editProduct.hazardClass ?? "",
                  storageConditions: editProduct.storageConditions ?? "",
                  notes: editProduct.notes ?? "",
                  status: editProduct.status,
                  msds: editProduct.msds ?? false,
                  controlled: editProduct.controlled ?? false,
                }}
                onSubmit={data => updateMutation.mutate({ id: editProduct.id, data })}
                onCancel={() => setEditProduct(null)}
                isLoading={updateMutation.isPending}
                isEdit={true}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
              <AlertDialogDescription>
                Estás a punto de eliminar <strong>{deleteTarget?.name}</strong> ({deleteTarget?.code}).
                Esta acción no se puede deshacer y podría afectar registros relacionados.
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

        <AlertDialog open={showDeleteAll} onOpenChange={open => { if (!open) { setShowDeleteAll(false); setDeleteConfirmText(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar toda la maestra?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminarán <strong>todos los productos</strong> del almacén. Esta acción no se puede deshacer.
                <br /><br />Escribe <strong>ELIMINAR TODO</strong> para confirmar:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-0 pb-2">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINAR TODO"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteAllMutation.isPending} onClick={() => setDeleteConfirmText("")}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteAllMutation.mutate()}
                disabled={deleteAllMutation.isPending || deleteConfirmText !== "ELIMINAR TODO"}
              >
                {deleteAllMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sí, eliminar todo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ImportResultsModal
          open={showImportResult}
          onClose={() => setShowImportResult(false)}
          result={importResult}
        />
      </div>
    </AppLayout>
  );
}
