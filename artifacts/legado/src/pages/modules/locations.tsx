import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  MapPin,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const WAREHOUSES = ["QA", "Q1", "QP", "QL", "QC", "QD"];

const LOCATION_TYPES = ["warehouse", "zone", "rack", "shelf", "position", "pallet"] as const;

interface Location {
  id: string;
  warehouse: string;
  zone: string | null;
  rack: string | null;
  shelf: string | null;
  position: string | null;
  type: string;
  isActive: boolean;
  isNearScale: boolean;
  mapLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LocationFormData {
  warehouse: string;
  zone: string;
  rack: string;
  shelf: string;
  position: string;
  type: string;
  isNearScale: boolean;
}

const emptyForm: LocationFormData = {
  warehouse: "",
  zone: "",
  rack: "",
  shelf: "",
  position: "",
  type: "position",
  isNearScale: false,
};

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

const TYPE_LABELS: Record<string, string> = {
  warehouse: "Almacén",
  zone: "Zona",
  rack: "Rack",
  shelf: "Nivel",
  position: "Ubicación",
  pallet: "Pallet",
};

const locationDescription = (loc: Location) => loc.mapLabel
  || [loc.zone, loc.rack, loc.shelf, loc.position].filter(Boolean).join(" · ")
  || TYPE_LABELS[loc.type]
  || loc.type;

export default function GestionDeUbicacionesPage() {
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LocationFormData>(emptyForm);
  const [formError, setFormError] = useState("");
  const [descriptionTarget, setDescriptionTarget] = useState<Location | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);

  const perPage = 25;

  const canWrite = user?.role && ["admin", "supervisor"].includes(user.role);

  const { data: locationsResult, isLoading, isError } = useQuery<{ data: Location[] }>({
    queryKey: ["/api/locations", warehouse],
    queryFn: () => {
      const params = warehouse && warehouse !== "all"
        ? `?warehouse=${encodeURIComponent(warehouse)}&limit=500`
        : "?limit=500";
      return api(`/api/locations${params}`);
    },
  });
  const locations = locationsResult?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: LocationFormData) =>
      api("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Ubicación creada", description: "La ubicación fue registrada exitosamente." });
      setShowForm(false);
      setForm(emptyForm);
      setFormError("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateDescriptionMutation = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) => api(`/api/locations/${id}/description`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/locations"] });
      setDescriptionTarget(null);
      toast({ title: "Descripción actualizada", description: "El cambio también se verá en el plano del almacén." });
    },
    onError: (err: Error) => toast({ title: "No se pudo actualizar", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/locations"] });
      setDeleteTarget(null);
      toast({ title: "Ubicación eliminada", description: "Se quitó de la lista de ubicaciones." });
    },
    onError: (err: Error) => toast({ title: "No se pudo eliminar", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return locations.filter((loc) => {
      if (!term) return true;
      return [loc.warehouse, loc.zone, loc.rack, loc.shelf, loc.position, loc.type, loc.mapLabel]
        .some((v) => v?.toLowerCase().includes(term));
    });
  }, [locations, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSubmit = () => {
    setFormError("");
    const validStructure = !!form.warehouse
      && (form.type === "warehouse" || !!form.zone)
      && (form.type !== "rack" || !!form.rack)
      && (form.type !== "shelf" || (!!form.rack && !!form.shelf))
      && (form.type !== "position" || (!!form.rack && !!form.shelf && !!form.position));
    if (!validStructure) {
      setFormError("Completa los campos que corresponden al tipo de ubicación.");
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Ubicaciones</h1>
              <p className="text-slate-500 text-sm">Administración de ubicaciones del almacén</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)} className="gap-2" size="sm">
              <Plus className="w-4 h-4" />
              Nueva Ubicación
            </Button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
            <b>Colorantes · Q1:</b> 5 racks con 4 niveles cada uno. Se registran los racks y sus 20 niveles; faltan los espacios por nivel.
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
            <b>Auxiliares · Q1:</b> Zona A con niveles A, B y C y 9 ubicaciones por nivel. Zonas B, C y D con un nivel cada una; sus espacios aún no están especificados.
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por almacén, zona, rack, estante..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando ubicaciones...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm">No se pudo cargar la lista de ubicaciones</p>
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <MapPin className="w-10 h-10" />
              <p className="text-sm font-medium">
                {search
                  ? "No hay ubicaciones que coincidan con la búsqueda"
                  : "No hay ubicaciones registradas aún"}
              </p>
              {canWrite && !search && (
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> Crear primera ubicación
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600 w-20">Almacén</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20">Zona</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Rack</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20">Estante</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20">Posición</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Tipo</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-24">Cerca Balanza</TableHead>
                    <TableHead className="font-semibold text-slate-600 w-20 text-center">Activo</TableHead>
                    <TableHead className="font-semibold text-slate-600 min-w-48">Descripción</TableHead>
                    {canWrite && <TableHead className="font-semibold text-slate-600 w-28 text-center">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((loc) => (
                    <TableRow key={loc.id} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell className="text-xs">
                        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                          {loc.warehouse}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-700 text-xs">{loc.zone || "—"}</TableCell>
                      <TableCell className="font-medium text-slate-900 text-xs">{loc.rack || "—"}</TableCell>
                      <TableCell className="text-slate-700 text-xs">{loc.shelf || "—"}</TableCell>
                      <TableCell className="text-slate-700 text-xs">{loc.position || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[loc.type] ?? loc.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {loc.isNearScale ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-300" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {loc.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Sí
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            <XCircle className="w-3 h-3" />
                            No
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-xs text-slate-700" title={locationDescription(loc)}>{locationDescription(loc)}</TableCell>
                      {canWrite && <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Cambiar descripción de ${locationDescription(loc)}`} title="Cambiar descripción" onClick={() => { setDescriptionTarget(loc); setDescriptionDraft(locationDescription(loc)); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {["zone", "rack"].includes(loc.type) && <Button variant="ghost" size="icon" aria-label={`Eliminar ${locationDescription(loc)}`} title="Eliminar zona o rack" className="text-red-600 hover:text-red-700" onClick={() => setDeleteTarget(loc)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>}
                        </div>
                      </TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                Mostrando {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} de{" "}
                {filtered.length} ubicaciones
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[44px]"
                >
                  Anterior
                </Button>
                <span className="text-xs text-slate-500 px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[44px]"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Ubicación</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-warehouse">Almacén *</Label>
                <Select
                  value={form.warehouse}
                  onValueChange={(v) => setForm((f) => ({ ...f, warehouse: v }))}
                >
                  <SelectTrigger id="loc-warehouse">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {WAREHOUSES.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-zone">Zona {form.type === "warehouse" ? "(opcional)" : "*"}</Label>
                <Input
                  id="loc-zone"
                  value={form.zone}
                  onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                  placeholder="Ej: A, B, Norte..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-rack">Rack {form.type === "rack" || form.type === "shelf" || form.type === "position" ? "*" : "(opcional)"}</Label>
                <Input
                  id="loc-rack"
                  value={form.rack}
                  onChange={(e) => setForm((f) => ({ ...f, rack: e.target.value }))}
                  placeholder="Ej: R1, A-01..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-shelf">Nivel {form.type === "shelf" || form.type === "position" ? "*" : "(opcional)"}</Label>
                <Input
                  id="loc-shelf"
                  value={form.shelf}
                  onChange={(e) => setForm((f) => ({ ...f, shelf: e.target.value }))}
                  placeholder="Ej: E1, Nivel 1..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-position">Ubicación {form.type === "position" ? "*" : "(opcional)"}</Label>
                <Input
                  id="loc-position"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="Ej: P1, 01..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-type">Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger id="loc-type">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="loc-near-scale"
                checked={form.isNearScale}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isNearScale: v }))}
              />
              <Label htmlFor="loc-near-scale" className="font-normal text-slate-600">
                Cerca de balanza
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Guardando...
                </>
              ) : (
                "Crear Ubicación"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!descriptionTarget} onOpenChange={(open) => !open && setDescriptionTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Cambiar descripción</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-slate-600">{descriptionTarget ? `${descriptionTarget.warehouse} · ${TYPE_LABELS[descriptionTarget.type] ?? descriptionTarget.type}` : ""}</p>
            <Label htmlFor="location-description">Descripción visible</Label>
            <Input id="location-description" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} maxLength={120} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescriptionTarget(null)} disabled={updateDescriptionMutation.isPending}>Cancelar</Button>
            <Button onClick={() => descriptionTarget && updateDescriptionMutation.mutate({ id: descriptionTarget.id, description: descriptionDraft.trim() })} disabled={!descriptionDraft.trim() || updateDescriptionMutation.isPending}>
              {updateDescriptionMutation.isPending ? "Guardando..." : "Guardar descripción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta zona o rack?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `Se eliminará “${locationDescription(deleteTarget)}” de Ubicaciones y del plano. Solo se permite si no tiene sububicaciones, productos, conteos ni movimientos asociados.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={!deleteTarget || deleteMutation.isPending} onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}>
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
