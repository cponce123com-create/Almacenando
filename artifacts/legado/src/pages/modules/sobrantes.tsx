import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SamplePhotoPanel } from "@/components/ui/SamplePhotoPanel";
import { PhotoPickerInline, type PendingPhoto } from "@/components/ui/PhotoPickerInline";
import { ArchiveX, Plus, Loader2, AlertCircle, Pencil, Trash2, RefreshCw, Camera } from "lucide-react";

interface Product { id: string; code: string; name: string; unit: string; }
interface Surplus {
  id: string; productId?: string | null; productName?: string | null;
  surplusCode: string; quantity: string; unit: string;
  surplusDate: string; origin?: string | null; reason?: string | null;
  status: string; notes?: string | null; registeredBy: string;
  photos?: string[] | null;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const apiForm = async (path: string, body: FormData, method = "POST") => {
  const res = await fetch(path, { method, headers: getAuthHeaders(), body });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pending:  { label: "Pendiente",  bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  reviewed: { label: "Revisado",   bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  returned: { label: "Devuelto",   bg: "#f0fdf4", text: "#14532d", border: "#bbf7d0" },
  disposed: { label: "Dispuesto",  bg: "#fdf2f8", text: "#701a75", border: "#f0abfc" },
};

const UNITS = ["kg", "g", "L", "mL", "m", "m²", "unidad", "caja", "bolsa", "rollo", "tambor"];

const emptyForm = () => ({
  productName: "", surplusCode: "", quantity: "", unit: "kg",
  surplusDate: today(), origin: "", reason: "", status: "pending", notes: "",
});

function generateCode(name: string): string {
  const clean = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const prefix = words.length === 0
    ? "SO"
    : words.length === 1
      ? words[0].slice(0, 4).padEnd(2, "X")
      : words.slice(0, 3).map(w => w[0]).join("").padEnd(2, words[0][1] ?? "X");
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${prefix.slice(0, 4)}-${digits}`;
}

function SurplusForm({
  initial, onSubmit, onCancel, pending, isEdit,
  pendingPhotos, onPhotosChange,
}: {
  initial: ReturnType<typeof emptyForm>;
  onSubmit: (d: ReturnType<typeof emptyForm>) => void;
  onCancel: () => void;
  pending: boolean; isEdit: boolean;
  pendingPhotos?: PendingPhoto[];
  onPhotosChange?: (photos: PendingPhoto[]) => void;
}) {
  const [f, setF] = useState(initial);
  const [codeAutoGen, setCodeAutoGen] = useState(!isEdit);
  const s = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const handleNameChange = (name: string) => {
    setF(p => ({
      ...p,
      productName: name,
      surplusCode: codeAutoGen && name.trim().length > 0 ? generateCode(name) : p.surplusCode,
    }));
  };

  const handleCodeChange = (v: string) => {
    setCodeAutoGen(false);
    s("surplusCode", v);
  };

  const regenCode = () => {
    const newCode = generateCode(f.productName || "SO");
    setCodeAutoGen(true);
    s("surplusCode", newCode);
  };

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(f); }} className="space-y-4">

      <div className="space-y-1.5">
        <Label>Nombre del Producto <span style={{ color: "#ef4444" }}>*</span></Label>
        <Input
          placeholder="Ej: Colorante Reactivo Azul 19"
          value={f.productName}
          onChange={e => handleNameChange(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">
          Código Sobrante <span style={{ color: "#ef4444" }}>*</span>
          <button
            type="button"
            onClick={regenCode}
            title="Regenerar código"
            style={{ marginLeft: "auto", color: "#7c3aed", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
          >
            <RefreshCw style={{ width: "12px", height: "12px" }} />
            Regenerar
          </button>
        </Label>
        <Input
          placeholder="SO-1234"
          value={f.surplusCode}
          onChange={e => handleCodeChange(e.target.value)}
          required
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <div className="space-y-1.5">
          <Label>Cantidad <span style={{ color: "#ef4444" }}>*</span></Label>
          <Input type="number" step="0.001" min="0.001" placeholder="0.00"
            value={f.quantity} onChange={e => s("quantity", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Unidad</Label>
          <Select value={f.unit} onValueChange={v => s("unit", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha <span style={{ color: "#ef4444" }}>*</span></Label>
          <Input type="date" value={f.surplusDate} onChange={e => s("surplusDate", e.target.value)} required />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div className="space-y-1.5">
          <Label>Procedencia / Origen</Label>
          <Input placeholder="Ej: Lote de prueba, Producción" value={f.origin} onChange={e => s("origin", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Motivo del Sobrante</Label>
          <Input placeholder="Ej: Exceso de pedido, Fórmula cambiada" value={f.reason} onChange={e => s("reason", e.target.value)} />
        </div>
      </div>

      {isEdit && (
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={f.status} onValueChange={v => s("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea
          placeholder="Observaciones adicionales..."
          value={f.notes}
          onChange={e => s("notes", e.target.value)}
          rows={2}
          className="resize-none"
        />
      </div>

      {!isEdit && pendingPhotos !== undefined && onPhotosChange && (
        <PhotoPickerInline
          pendingPhotos={pendingPhotos}
          onChange={onPhotosChange}
          label="Fotos del sobrante"
        />
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          type="submit"
          disabled={pending || !f.productName || !f.surplusCode || !f.quantity}
          style={{ background: "#7c3aed", color: "#fff" }}
          className="hover:opacity-90"
        >
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? "Guardar Cambios" : "Registrar Sobrante"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SobrantesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);
  const canManage = user?.role && ["admin", "supervisor"].includes(user.role);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Surplus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Surplus | null>(null);
  const [photoTarget, setPhotoTarget] = useState<Surplus | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: result = { data: [] }, isLoading, isError } = useQuery({
    queryKey: ["/api/surplus"],
    queryFn: () => api("/api/surplus?limit=200"),
  });
  const records: Surplus[] = Array.isArray(result) ? result : (result.data ?? []);

  const filtered = useMemo(() =>
    filterStatus === "all" ? records : records.filter(r => r.status === filterStatus),
    [records, filterStatus]);

  const createMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof emptyForm>) => {
      const created = await api("/api/surplus", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (pendingPhotos.length > 0) {
        const fd = new FormData();
        pendingPhotos.forEach(p => fd.append("photos", p.file));
        await apiForm(`/api/surplus/${created.id}/photos`, fd).catch(() => {});
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/surplus"] });
      toast({ title: "Sobrante registrado", description: "El producto sobrante fue registrado exitosamente." });
      setShowForm(false);
      setPendingPhotos([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api(`/api/surplus/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/surplus"] });
      toast({ title: "Registro actualizado" });
      setEditItem(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/surplus/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/surplus"] });
      toast({ title: "Registro eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); setDeleteTarget(null); },
  });

  const StatusBadge = ({ status }: { status: string }) => {
    const st = STATUS_MAP[status] ?? STATUS_MAP.pending;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
        background: st.bg, color: st.text, border: `1px solid ${st.border}`,
      }}>
        {st.label}
      </span>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "22px", fontWeight: 700, color: "#1e293b" }}>
              <ArchiveX style={{ width: "24px", height: "24px", color: "#7c3aed" }} />
              Productos Sobrantes
            </h1>
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              Registro y seguimiento de productos en exceso o sin destino asignado
            </p>
          </div>
          {canWrite && (
            <Button
              onClick={() => setShowForm(true)}
              style={{ background: "#7c3aed", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}
              className="hover:opacity-90"
            >
              <Plus style={{ width: "16px", height: "16px" }} /> Nuevo Sobrante
            </Button>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {Object.entries(STATUS_MAP).map(([key, st]) => {
            const count = records.filter(r => r.status === key).length;
            return (
              <div key={key} style={{
                background: "#fff", border: "1px solid #f1f5f9", borderRadius: "12px",
                padding: "12px 16px", borderTop: `3px solid ${st.border}`,
              }}>
                <p style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>{count}</p>
                <p style={{ fontSize: "12px", color: st.text, fontWeight: 600 }}>{st.label}</p>
              </div>
            );
          })}
        </div>

        {/* Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#64748b" }}>Filtrar:</span>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[["all", "Todos"], ...Object.entries(STATUS_MAP).map(([k, v]) => [k, v.label])].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val as string)}
                style={{
                  padding: "4px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 500,
                  cursor: "pointer", border: "1px solid",
                  background: filterStatus === val ? "#7c3aed" : "#f8fafc",
                  color: filterStatus === val ? "#fff" : "#475569",
                  borderColor: filterStatus === val ? "#7c3aed" : "#e2e8f0",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px", color: "#94a3b8" }}>
            <Loader2 style={{ width: "32px", height: "32px" }} className="animate-spin" />
          </div>
        ) : isError ? (
          <div style={{ display: "flex", justifyContent: "center", gap: "8px", padding: "48px", color: "#f43f5e" }}>
            <AlertCircle style={{ width: "20px", height: "20px" }} />
            <span>Error al cargar los registros</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px", color: "#94a3b8" }}>
            <ArchiveX style={{ width: "40px", height: "40px", margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ fontWeight: 500 }}>No hay sobrantes registrados</p>
            {canWrite && (
              <Button
                variant="outline"
                onClick={() => setShowForm(true)}
                style={{ marginTop: "16px" }}
              >
                <Plus style={{ width: "14px", height: "14px", marginRight: "6px" }} /> Registrar el primero
              </Button>
            )}
          </div>
        ) : (
          <div style={{ border: "1px solid #f1f5f9", borderRadius: "12px", overflow: "hidden" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: "#f8fafc" }}>
                  <TableHead>Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fotos</TableHead>
                  {canManage && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 600, color: "#7c3aed" }}>
                        {r.surplusCode}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p style={{ fontWeight: 500, fontSize: "13px", color: "#1e293b" }}>
                        {r.productName ?? "—"}
                      </p>
                      {r.reason && (
                        <p style={{ fontSize: "11px", color: "#94a3b8" }}>{r.reason}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#334155" }}>
                        {r.quantity} {r.unit}
                      </span>
                    </TableCell>
                    <TableCell style={{ fontSize: "13px", color: "#475569" }}>{r.surplusDate}</TableCell>
                    <TableCell style={{ fontSize: "13px", color: "#475569" }}>{r.origin ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      {(r.photos?.length ?? 0) > 0 ? (
                        <button
                          onClick={() => setPhotoTarget(r)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
                            background: "#ede9fe", color: "#7c3aed", border: "none", cursor: "pointer",
                          }}
                        >
                          <Camera style={{ width: "12px", height: "12px" }} />
                          {r.photos!.length}
                        </button>
                      ) : (
                        canWrite ? (
                          <button
                            onClick={() => setPhotoTarget(r)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "4px",
                              padding: "2px 8px", borderRadius: "999px", fontSize: "11px",
                              background: "#f8fafc", color: "#94a3b8", border: "1px dashed #e2e8f0", cursor: "pointer",
                            }}
                          >
                            <Camera style={{ width: "12px", height: "12px" }} />
                            Agregar
                          </button>
                        ) : <span style={{ color: "#cbd5e1", fontSize: "12px" }}>—</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
                          <Button
                            variant="ghost" size="icon"
                            style={{ width: "28px", height: "28px", color: "#94a3b8" }}
                            className="hover:text-indigo-600 hover:bg-indigo-50"
                            onClick={() => setEditItem(r)}
                          >
                            <Pencil style={{ width: "13px", height: "13px" }} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            style={{ width: "28px", height: "28px", color: "#94a3b8" }}
                            className="hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 style={{ width: "13px", height: "13px" }} />
                          </Button>
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

      {/* ── Create Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setPendingPhotos([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ArchiveX style={{ width: "20px", height: "20px", color: "#7c3aed" }} />
              Registrar Producto Sobrante
            </DialogTitle>
          </DialogHeader>
          <SurplusForm
            initial={emptyForm()}
            onSubmit={data => createMutation.mutate(data)}
            onCancel={() => { setShowForm(false); setPendingPhotos([]); }}
            pending={createMutation.isPending}
            isEdit={false}
            pendingPhotos={pendingPhotos}
            onPhotosChange={setPendingPhotos}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={v => { if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ArchiveX style={{ width: "20px", height: "20px", color: "#7c3aed" }} />
              Editar Sobrante — {editItem?.surplusCode}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <SurplusForm
              initial={{
                productName: editItem.productName ?? "",
                surplusCode: editItem.surplusCode,
                quantity: editItem.quantity,
                unit: editItem.unit,
                surplusDate: editItem.surplusDate,
                origin: editItem.origin ?? "",
                reason: editItem.reason ?? "",
                status: editItem.status,
                notes: editItem.notes ?? "",
              }}
              onSubmit={data => updateMutation.mutate({ id: editItem.id, data: data as any })}
              onCancel={() => setEditItem(null)}
              pending={updateMutation.isPending}
              isEdit={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Photo Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!photoTarget} onOpenChange={v => { if (!v) setPhotoTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Camera style={{ width: "20px", height: "20px", color: "#7c3aed" }} />
              Fotos — {photoTarget?.surplusCode}
            </DialogTitle>
            <p style={{ fontSize: "12px", color: "#94a3b8", paddingTop: "4px" }}>
              Las fotos se suben a Google Drive y quedan registradas en el sistema.
            </p>
          </DialogHeader>
          {photoTarget && (
            <SamplePhotoPanel
              sampleId={photoTarget.id}
              sampleCode={photoTarget.surplusCode}
              photos={(photoTarget.photos as string[]) ?? []}
              canUpload={!!canWrite}
              canDelete={!!canManage}
              queryKey={["/api/surplus"]}
              uploadUrl={`/api/surplus/${photoTarget.id}/photos`}
              deleteUrl={(idx) => `/api/surplus/${photoTarget.id}/photos/${idx}`}
              onUpdate={photos => setPhotoTarget(prev => prev ? { ...prev, photos } : null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sobrante?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro <strong>{deleteTarget?.surplusCode}</strong> — {deleteTarget?.productName}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              style={{ background: "#ef4444" }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
