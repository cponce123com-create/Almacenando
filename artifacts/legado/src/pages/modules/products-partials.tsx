import { useState } from "react";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES } from "@/contexts/WarehouseContext";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
export interface Product {
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
  msdsUrl?: string | null;
  controlled?: boolean | null;
  hazardLevel?: string | null;
  hazardPictograms?: string | null;
  firstAid?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;

export interface BalanceRecord {
  type?: string | null;
  warehouse: string;
  code: string;
  quantity: string;
  ultimoConsumo?: string | null;
}

export function sinMovimiento(dateStr: string | null | undefined): { label: string; color: string; pill: string; bg: string } {
  if (!dateStr) return { label: "—", color: "text-slate-300", pill: "bg-slate-100 text-slate-400", bg: "bg-slate-50" };
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return { label: "—", color: "text-slate-300", pill: "bg-slate-100 text-slate-400", bg: "bg-slate-50" };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return { label: "—", color: "text-slate-300", pill: "bg-slate-100 text-slate-400", bg: "bg-slate-50" };
  const months = days / 30.44;
  if (months < 6) return { label: `${Math.round(months)}m`, color: "text-emerald-600", pill: "bg-emerald-100 text-emerald-700", bg: "bg-emerald-50" };
  if (months < 12) return { label: `${Math.round(months)}m`, color: "text-amber-500", pill: "bg-amber-100 text-amber-700", bg: "bg-amber-50" };
  const years = Math.floor(months / 12);
  const rem = Math.floor(months % 12);
  const label = rem > 0 ? `${years}a ${rem}m` : `${years}a`;
  return { label, color: "text-red-500", pill: "bg-red-100 text-red-700", bg: "bg-red-50" };
}

export const CATEGORIES = [
  "Ácido", "Base", "Solvente", "Oxidante", "Reactivo",
  "Tóxico", "Inflamable", "Otro",
];

export const UNITS = ["L", "mL", "kg", "g", "mg", "m³", "unidad"];

export const HAZARD_CLASSES = [
  "Corrosivo", "Inflamable", "Tóxico", "Oxidante", "Explosivo",
  "Inflamable/Tóxico", "Corrosivo/Oxidante", "Nocivo", "No peligroso",
];

export const emptyForm = (warehouse = "General"): ProductFormData => ({
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
  hazardLevel: "precaucion",
  hazardPictograms: "[]",
  firstAid: "",
});

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function fetchProducts(warehouse?: string): Promise<Product[]> {
  const base = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}&limit=500` : "?limit=500";
  const res = await fetch(`${BASE}/api/products${base}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Error al cargar productos");
  const json = await res.json();
  return json.data ?? json;
}

export async function createProduct(data: ProductFormData): Promise<Product> {
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

export async function updateProduct(id: string, data: Partial<ProductFormData>): Promise<Product> {
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

export async function deleteProduct(id: string): Promise<{ soft: boolean; message: string; reason?: string }> {
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

export function downloadFile(res: Response, fallbackName: string) {
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

export async function downloadTemplate() {
  const res = await fetch(`${BASE}/api/products/template`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("No se pudo descargar la plantilla");
  downloadFile(res, "plantilla_productos.xlsx");
}

export async function exportProducts(warehouse?: string) {
  const params = warehouse && warehouse !== "all" ? `?warehouse=${warehouse}` : "";
  const res = await fetch(`${BASE}/api/products/export${params}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("No se pudo exportar los productos");
  downloadFile(res, "maestro_productos.xlsx");
}

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: Array<{ row: number; code: string; error: string }>;
  total: number;
}

export async function importProducts(file: File, warehouse?: string): Promise<ImportResult> {
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

export function ImportResultsModal({
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

export function StatusBadge({ status }: { status: string }) {
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

export function HazardBadge({ hazardClass }: { hazardClass?: string | null }) {
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

export interface ProductFormProps {
  initial: ProductFormData;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
}

export function ProductForm({ initial, onSubmit, onCancel, isLoading, isEdit }: ProductFormProps) {
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

      <div className="space-y-3 pt-2">
        <p className="text-sm font-semibold text-slate-700 border-t pt-3">Información de Seguridad (MSDS)</p>

        <div className="space-y-1.5">
          <Label>Nivel de Peligro</Label>
          <Select
            value={form.hazardLevel ?? "precaucion"}
            onValueChange={v => set("hazardLevel", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alto_riesgo">⚠️ Alto Riesgo</SelectItem>
              <SelectItem value="precaucion">⚠️ Precaución</SelectItem>
              <SelectItem value="controlado">⚠️ Uso Controlado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Pictogramas de Peligro GHS</Label>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["explosivo",         "💥 Explosivo"],
              ["inflamable",        "🔥 Inflamable"],
              ["oxidante",          "🔶 Oxidante"],
              ["gas_presion",       "🫧 Gas a presión"],
              ["corrosivo",         "🧪 Corrosivo"],
              ["toxico",            "☠️ Tóxico"],
              ["nocivo",            "❗ Nocivo"],
              ["peligro_ambiental", "🌿 Peligro ambiental"],
              ["peligro_salud",     "⚕️ Peligro para la salud"],
            ] as [string, string][]).map(([val, label]) => {
              const selected: string[] = (() => {
                try { return JSON.parse(form.hazardPictograms ?? "[]") as string[]; } catch { return []; }
              })();
              const checked = selected.includes(val);
              const toggle = () => {
                const next = checked ? selected.filter(s => s !== val) : [...selected, val];
                set("hazardPictograms", JSON.stringify(next));
              };
              return (
                <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={checked} onChange={toggle} className="accent-teal-600" />
                  {label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="firstAid">Primeros Auxilios</Label>
          <textarea
            id="firstAid"
            rows={3}
            maxLength={300}
            placeholder="Ej: Lavar con agua 15 min · Usar guantes · Avisar supervisor"
            value={form.firstAid ?? ""}
            onChange={e => set("firstAid", e.target.value)}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
          <p className="text-xs text-slate-400 text-right">{(form.firstAid ?? "").length}/300</p>
        </div>
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
