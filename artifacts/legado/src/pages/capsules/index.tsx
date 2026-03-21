import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { motion } from "framer-motion";
import {
  Clock,
  Plus,
  Lock,
  CheckCircle2,
  Trash2,
  Pencil,
  Loader2,
  Mail,
  Calendar,
  Video,
  FileText,
  Package,
  AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { es } from "date-fns/locale";

const BASE = "/api";
const MAX_CAPSULES = 5;

type Capsule = {
  id: string;
  title: string;
  recipientName: string;
  recipientEmail: string;
  openDate: string;
  status: "draft" | "sealed" | "delivered";
  videoUrl?: string;
  letterText?: string;
  videoDurationSeconds?: number;
  deliveredAt?: string;
  createdAt: string;
};

type FormData = {
  title: string;
  recipientName: string;
  recipientEmail: string;
  openDate: string;
  letterText: string;
};

const emptyForm: FormData = {
  title: "",
  recipientName: "",
  recipientEmail: "",
  openDate: "",
  letterText: "",
};

function StatusBadge({ status }: { status: string }) {
  const cfg =
    {
      draft: { label: "Borrador", className: "bg-amber-100 text-amber-700 border-amber-200" },
      sealed: { label: "Sellada 🔒", className: "bg-violet-100 text-violet-700 border-violet-200" },
      delivered: { label: "Entregada ✓", className: "bg-green-100 text-green-700 border-green-200" },
    }[status] ?? { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };

  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export default function CapsulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [sealTarget, setSealTarget] = useState<Capsule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);

  const { data: capsules = [], isLoading } = useQuery<Capsule[]>({
    queryKey: ["time-capsules"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/time-capsules`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Error al cargar cápsulas");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `${BASE}/time-capsules/${editingId}` : `${BASE}/time-capsules`;
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, openDate: new Date(data.openDate).toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-capsules"] });
      toast({ title: editingId ? "Cápsula actualizada" : "Cápsula creada" });
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const sealMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/time-capsules/${id}/seal`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-capsules"] });
      toast({ title: "🔒 Cápsula sellada — se entregará en la fecha programada" });
      setSealTarget(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/time-capsules/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-capsules"] });
      toast({ title: "Cápsula eliminada" });
      setDeleteTarget(null);
    },
  });

  const handleVideoUpload = async (capsuleId: string, file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "El video no puede superar 100MB", variant: "destructive" });
      return;
    }

    setSavingVideo(true);
    try {
      const sigRes = await fetch(`${BASE}/upload/sign`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType: "video", folder: "capsulas" }),
      });
      const sig = await sigRes.json();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("signature", sig.signature);
      formData.append("timestamp", sig.timestamp);
      formData.append("api_key", sig.apiKey);
      formData.append("folder", sig.folder);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`,
        { method: "POST", body: formData }
      );
      const uploaded = await uploadRes.json();

      if (uploaded.duration && uploaded.duration > 120) {
        toast({ title: "El video no puede durar más de 2 minutos", variant: "destructive" });
        return;
      }

      await fetch(`${BASE}/time-capsules/${capsuleId}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: uploaded.secure_url,
          videoPublicId: uploaded.public_id,
          videoDurationSeconds: Math.round(uploaded.duration || 0),
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["time-capsules"] });
      toast({ title: "✓ Video subido correctamente" });
    } catch {
      toast({ title: "Error al subir el video", variant: "destructive" });
    } finally {
      setSavingVideo(false);
    }
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c: Capsule) => {
    setEditingId(c.id);
    setForm({
      title: c.title,
      recipientName: c.recipientName,
      recipientEmail: c.recipientEmail,
      openDate: c.openDate ? new Date(c.openDate).toISOString().slice(0, 16) : "",
      letterText: c.letterText || "",
    });
    setShowForm(true);
  };

  const canCreate = capsules.length < MAX_CAPSULES;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-3">
              <Clock className="w-8 h-8 text-primary" />
              Cápsulas del Tiempo
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Mensajes programados para abrirse en una fecha especial. Hasta {MAX_CAPSULES} cápsulas activas.
            </p>
          </div>
          <Button
            onClick={openNew}
            disabled={!canCreate}
            className="rounded-xl shadow-md gap-2 shrink-0"
            title={!canCreate ? `Límite de ${MAX_CAPSULES} cápsulas alcanzado` : ""}
          >
            <Plus className="w-4 h-4" />
            Nueva cápsula
          </Button>
        </div>

        {/* Límite visual */}
        <div className="flex items-center gap-3">
          {Array.from({ length: MAX_CAPSULES }).map((_, i) => (
            <div
              key={i}
              className="h-2 flex-1 rounded-full transition-all"
              style={{ backgroundColor: i < capsules.length ? "#9d174d" : "#e5e7eb" }}
            />
          ))}
          <span className="text-sm text-muted-foreground shrink-0">
            {capsules.length}/{MAX_CAPSULES}
          </span>
        </div>

        {/* Lista de cápsulas */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : capsules.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-border p-12 text-center">
            <Package className="w-14 h-14 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="font-serif text-xl font-bold mb-2">No tienes cápsulas aún</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Crea tu primera cápsula del tiempo — un mensaje con video y carta que llegará a alguien especial en la fecha que elijas.
            </p>
            <Button onClick={openNew} className="rounded-xl gap-2">
              <Plus className="w-4 h-4" /> Crear mi primera cápsula
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {capsules.map((capsule, i) => (
              <motion.div
                key={capsule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-3xl border border-border shadow-sm p-6"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="font-serif text-lg font-bold text-foreground truncate">
                        {capsule.title}
                      </h3>
                      <StatusBadge status={capsule.status} />
                    </div>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 shrink-0" />
                        <span>
                          Para: <strong className="text-foreground">{capsule.recipientName}</strong>{" "}
                          ({capsule.recipientEmail})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span>
                          Se abre el{" "}
                          <strong className="text-foreground">
                            {format(new Date(capsule.openDate), "d 'de' MMMM 'de' yyyy", { locale: es })}
                          </strong>
                          {!isPast(new Date(capsule.openDate)) && capsule.status !== "delivered" && (
                            <span className="text-primary ml-1">
                              ({formatDistanceToNow(new Date(capsule.openDate), { locale: es, addSuffix: true })})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Contenido */}
                    <div className="flex items-center gap-3 mt-3">
                      <span
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                          capsule.videoUrl ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Video className="w-3 h-3" />
                        {capsule.videoUrl
                          ? `Video (${capsule.videoDurationSeconds ? Math.round(capsule.videoDurationSeconds) + "s" : "subido"})`
                          : "Sin video"}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                          capsule.letterText ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        {capsule.letterText ? "Carta escrita" : "Sin carta"}
                      </span>
                    </div>

                    {capsule.status === "delivered" && capsule.deliveredAt && (
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Entregada el{" "}
                        {format(new Date(capsule.deliveredAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  {capsule.status === "draft" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => openEdit(capsule)}
                        variant="outline"
                        className="rounded-xl gap-1.5 h-9"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>

                      {/* Subir video */}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleVideoUpload(capsule.id, file);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl gap-1.5 h-9 w-full pointer-events-none"
                          disabled={savingVideo}
                        >
                          {savingVideo ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Video className="w-3.5 h-3.5" />
                          )}
                          {capsule.videoUrl ? "Cambiar video" : "Subir video"}
                        </Button>
                      </label>

                      <Button
                        size="sm"
                        onClick={() => setSealTarget(capsule)}
                        className="rounded-xl gap-1.5 h-9 text-white border-0"
                        style={{ backgroundColor: "#9d174d" }}
                      >
                        <Lock className="w-3.5 h-3.5" /> Sellar
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(capsule.id)}
                        className="rounded-xl gap-1.5 h-9 text-destructive hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog crear/editar */}
      <Dialog
        open={showForm}
        onOpenChange={(o) => {
          setShowForm(o);
          if (!o) {
            setForm(emptyForm);
            setEditingId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {editingId ? "Editar cápsula" : "Nueva cápsula del tiempo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm">Título de la cápsula *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ej: Para ti en tu graduación, Para mi hijo a los 18..."
                className="rounded-xl h-11 text-gray-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">Nombre del destinatario *</Label>
                <Input
                  value={form.recipientName}
                  onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
                  placeholder="Ej: María"
                  className="rounded-xl h-11 text-gray-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">Email del destinatario *</Label>
                <Input
                  type="email"
                  value={form.recipientEmail}
                  onChange={(e) => setForm((p) => ({ ...p, recipientEmail: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  className="rounded-xl h-11 text-gray-900"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm">Fecha y hora de apertura *</Label>
              <Input
                type="datetime-local"
                value={form.openDate}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                onChange={(e) => setForm((p) => ({ ...p, openDate: e.target.value }))}
                className="rounded-xl h-11 text-gray-900"
              />
              <p className="text-xs text-muted-foreground">
                El destinatario recibirá el email exactamente en esta fecha.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary" />
                Carta personal
              </Label>
              <Textarea
                value={form.letterText}
                onChange={(e) => setForm((p) => ({ ...p, letterText: e.target.value }))}
                placeholder="Escribe tu mensaje aquí. Puede ser tan largo como quieras..."
                className="rounded-xl min-h-[140px] text-gray-900 resize-y"
              />
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                El video (máx 2 min) se sube desde la tarjeta de la cápsula después de guardar. Aquí solo guardas los datos básicos y la carta.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setEditingId(null);
                }}
                className="flex-1 rounded-xl h-11"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={
                  saveMutation.isPending ||
                  !form.title ||
                  !form.recipientName ||
                  !form.recipientEmail ||
                  !form.openDate
                }
                className="flex-1 rounded-xl h-11 gap-2"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Guardar cambios" : "Crear cápsula"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar sellar */}
      <AlertDialog open={!!sealTarget} onOpenChange={(o) => !o && setSealTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl">🔒 ¿Sellar esta cápsula?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Una vez sellada, <strong>no podrás editar</strong> el contenido. La cápsula se entregará
              automáticamente a <strong>{sealTarget?.recipientName}</strong> el{" "}
              {sealTarget &&
                format(new Date(sealTarget.openDate), "d 'de' MMMM 'de' yyyy", { locale: es })}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sealTarget && sealMutation.mutate(sealTarget.id)}
              className="rounded-xl text-white border-0"
              style={{ backgroundColor: "#9d174d" }}
            >
              Sí, sellar cápsula
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar eliminar */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl">¿Eliminar esta cápsula?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="rounded-xl bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
