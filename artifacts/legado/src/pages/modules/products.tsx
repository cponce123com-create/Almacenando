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
} from "lucide-react";

interface Product {
  id: string;
  warehouse: string;
  code: string;
  name: string;
  type?: string | null;
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
  msds?: boolean | null;
  controlled?: boolean | null;
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

const emptyForm = (warehouse = "General"): ProductFormData => ({
  warehouse,
  code: "",
  name: "",
  type: "",
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
  msds: false,
  controlled: false,
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchProducts(warehouse?: string): Promise<Product[]> {
  const params = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const res = await fetch(`${BASE}/api/products${params}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Error al cargar productos");
  return res.json();
}

async function createProduct(data: ProductFormData): Promise<Product> {
  const res = await fetch(`${BASE}/api/products`, {
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
  const res = await fetch(`${BASE}/api/products/${id}`, {
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

async function deleteProduct(id: string): Promise<{ soft: boolean; message: string; reason?: string }> {
  const res = await fetch(`${BASE}/api/products/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Error al eliminar producto");
  }
  return json;
}

function downloadFile(res: Response, fallbackName: string) {
  res.blob().then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    a.href = url;
    a.download = match?.[1] ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

async function downloadTemplate() {
  const res = await fetch(`${BASE}/api/products/template`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("No se pudo descargar la plantilla");
  downloadFile(res, "plantilla_productos.xlsx");
}

async function exportProducts(warehouse?: string) {
  const params = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const res = await fetch(`${BASE}/api/products/export${params}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("No se pudo exportar los productos");
  downloadFile(res, "maestro_productos.xlsx");
}

interface ImportResult {
  inserted: number;
  updated: number;
  errors: Array<{ row: number; code: string; error: string }>;
  total: number;
}

async function importProducts(file: File, warehouse?: string): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const params = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const res = await fetch(`${BASE}/api/products/import${params}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error al importar");
  return json as ImportResult;
}

function ImportResultsModal({
  open, onClose, result,
}: {
  open: boolean; onClose: () => void; result: ImportResult | null;
}) {
  if (!result) return null;
  const hasErrors = result.errors.length > 0;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Resultado de la Importación
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.inserted}</p>
              <p className="text-xs text-emerald-700 mt-0.5">Insertados</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
              <p className="text-xs text-blue-700 mt-0.5">Actualizados</p>
            </div>
            <div className={`border rounded-lg p-3 text-center ${hasErrors ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"}`}>
              <p className={`text-2xl font-bold ${hasErrors ? "text-red-600" : "text-slate-400"}`}>{result.errors.length}</p>
              <p className={`text-xs mt-0.5 ${hasErrors ? "text-red-700" : "text-slate-500"}`}>Errores</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Total de filas procesadas: <strong className="text-slate-700">{result.total}</strong></span>
            <span>·</span>
            <span>Exitosos: <strong className="text-emerald-600">{result.inserted + result.updated}</strong></span>
          </div>

          {!hasErrors && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">
                Importación completada sin errores
              </p>
            </div>
          )}

          {hasErrors && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                Detalle de errores:
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {result.errors.map((e, i) => (
                  <div key={i} className="bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    <p className="text-xs font-semibold text-red-700">
                      Fila {e.row} — Código: <span className="font-mono">{e.code}</span>
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">{e.error}</p>
                  </div>
                ))}
              </div>
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

  const set = (key: keyof ProductFormData, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Almacén *</Label>
          <Select value={form.warehouse || "General"} onValueChange={v => set("warehouse", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Almacén" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="General">General</SelectItem>
              {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Tipo</Label>
          <Input
            id="type"
            placeholder="Tipo de producto"
            value={form.type ?? ""}
            onChange={e => set("type", e.target.value)}
          />
        </div>
      </div>

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

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="msds"
            checked={!!form.msds}
            onCheckedChange={v => set("msds", v)}
          />
          <Label htmlFor="msds">Tiene MSDS</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="controlled"
            checked={!!form.controlled}
            onCheckedChange={v => set("controlled", v)}
          />
          <Label htmlFor="controlled">Controlado</Label>
        </div>
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
        {/* IMPORTANT: Radix Select v2+ throws if any <SelectItem> has value="".
            We use the sentinel value "none" to represent "no hazard class"
            and convert it back to "" / null when reading/writing the form. */}
        <Select
          value={form.hazardClass || "none"}
          onValueChange={v => set("hazardClass", v === "none" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin clase asignada" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin clase asignada</SelectItem>
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
          </div>
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
                    <TableHead className="font-semibold text-slate-600 w-20">Almacén</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Código</TableHead>
                    <TableHead className="font-semibold text-slate-600">Nombre</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28">Categoría</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20">Unidad</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Ubicación</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-32">Clase Peligro</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-28 text-right">Stock Min/Max</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-16 text-center">MSDS</TableHead>
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
                        {product.msds
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />
                        }
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

        <ImportResultsModal
          open={showImportResult}
          onClose={() => setShowImportResult(false)}
          result={importResult}
        />
      </div>
    </AppLayout>
  );
}
