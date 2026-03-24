import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
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
} from "lucide-react";

interface Product {
  id: string;
  code: string;
  name: string;
  casNumber?: string | null;
  category: string;
  unit: string;
  minimumStock: string;
  maximumStock?: string | null;
  location?: string | null;
  supplier?: string | null;
  hazardClass?: string | null;
  storageConditions?: string | null;
  notes?: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;

const CATEGORIES = [
  "Ácido", "Base", "Solvente", "Oxidante", "Reactivo",
  "Tóxico", "Inflamable", "Otro",
];

const UNITS = ["L", "mL", "kg", "g", "mg", "m³", "unidad"];

const HAZARD_CLASSES = [
  "Corrosivo", "Inflamable", "Tóxico", "Oxidante", "Explosivo",
  "Inflamable/Tóxico", "Corrosivo/Oxidante", "Nocivo", "No peligroso",
];

const emptyForm = (): ProductFormData => ({
  code: "",
  name: "",
  casNumber: "",
  category: "",
  unit: "",
  minimumStock: "0",
  maximumStock: "",
  location: "",
  supplier: "",
  hazardClass: "",
  storageConditions: "",
  notes: "",
  status: "active",
});

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products", { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Error al cargar productos");
  return res.json();
}

async function createProduct(data: ProductFormData): Promise<Product> {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error al crear producto");
  }
  return res.json();
}

async function updateProduct(id: string, data: Partial<ProductFormData>): Promise<Product> {
  const res = await fetch(`/api/products/${id}`, {
    method: "PUT",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error al actualizar producto");
  }
  return res.json();
}

async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error al eliminar producto");
  }
}

function StatusBadge({ status }: { status: string }) {
  return status === "active" ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
      Activo
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">
      Inactivo
    </Badge>
  );
}

function HazardBadge({ hazardClass }: { hazardClass?: string | null }) {
  if (!hazardClass) return null;
  const colors: Record<string, string> = {
    "Corrosivo": "bg-orange-100 text-orange-700 border-orange-200",
    "Inflamable": "bg-red-100 text-red-700 border-red-200",
    "Tóxico": "bg-purple-100 text-purple-700 border-purple-200",
    "Oxidante": "bg-yellow-100 text-yellow-700 border-yellow-200",
    "Explosivo": "bg-rose-100 text-rose-800 border-rose-200",
    "Nocivo": "bg-amber-100 text-amber-700 border-amber-200",
    "No peligroso": "bg-green-100 text-green-700 border-green-200",
  };
  const key = Object.keys(colors).find(k => hazardClass.includes(k)) ?? "";
  const cls = colors[key] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <Badge className={`${cls} hover:${cls} text-xs`}>
      {hazardClass}
    </Badge>
  );
}

interface ProductFormProps {
  initial: ProductFormData;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
}

function ProductForm({ initial, onSubmit, onCancel, isLoading, isEdit }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>(initial);

  const set = (key: keyof ProductFormData, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Código *</Label>
          <Input
            id="code"
            placeholder="PROD-001"
            value={form.code}
            onChange={e => set("code", e.target.value)}
            required
            disabled={isEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="casNumber">N° CAS</Label>
          <Input
            id="casNumber"
            placeholder="7664-93-9"
            value={form.casNumber ?? ""}
            onChange={e => set("casNumber", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          placeholder="Ácido Sulfúrico 98%"
          value={form.name}
          onChange={e => set("name", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Categoría *</Label>
          <Select value={form.category} onValueChange={v => set("category", v)} required>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Unidad *</Label>
          <Select value={form.unit} onValueChange={v => set("unit", v)} required>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="minimumStock">Stock Mínimo *</Label>
          <Input
            id="minimumStock"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={form.minimumStock}
            onChange={e => set("minimumStock", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maximumStock">Stock Máximo</Label>
          <Input
            id="maximumStock"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={form.maximumStock ?? ""}
            onChange={e => set("maximumStock", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="location">Ubicación</Label>
          <Input
            id="location"
            placeholder="A-01"
            value={form.location ?? ""}
            onChange={e => set("location", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supplier">Proveedor</Label>
          <Input
            id="supplier"
            placeholder="QuimPeru SAC"
            value={form.supplier ?? ""}
            onChange={e => set("supplier", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Clase de Peligro</Label>
        <Select value={form.hazardClass ?? ""} onValueChange={v => set("hazardClass", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Sin clase asignada" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin clase asignada</SelectItem>
            {HAZARD_CLASSES.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="storageConditions">Condiciones de Almacenamiento</Label>
        <Input
          id="storageConditions"
          placeholder="Área ventilada, lejos de bases"
          value={form.storageConditions ?? ""}
          onChange={e => set("storageConditions", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Input
          id="notes"
          placeholder="Observaciones adicionales"
          value={form.notes ?? ""}
          onChange={e => set("notes", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Estado</Label>
        <Select value={form.status} onValueChange={v => set("status", v as "active" | "inactive")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : "Crear Producto"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function MaestrodeProductosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canDelete = user?.role && ["admin", "supervisor"].includes(user.role);

  const { data: products = [], isLoading, isError } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: fetchProducts,
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Producto eliminado", description: "El producto fue eliminado del sistema." });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeleteTarget(null);
    },
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
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Nuevo Producto
            </Button>
          )}
        </div>

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
                    <TableHead className="font-semibold text-slate-600 w-28">Código</TableHead>
                    <TableHead className="font-semibold text-slate-600">Nombre</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Categoría</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20">Unidad</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Ubicación</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-32">Clase Peligro</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28 text-right">Stock Min/Max</TableHead>
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
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                          {product.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{product.name}</p>
                          {product.casNumber && (
                            <p className="text-xs text-slate-400 mt-0.5">CAS: {product.casNumber}</p>
                          )}
                          {product.supplier && (
                            <p className="text-xs text-slate-400">{product.supplier}</p>
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
              initial={emptyForm()}
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
      </div>
    </AppLayout>
  );
}
