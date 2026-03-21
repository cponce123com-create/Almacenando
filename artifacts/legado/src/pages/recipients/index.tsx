import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Users, Plus, Pencil, Trash2, Loader2, Mail, Phone,
  Globe, FileText, FileVideo, Mic, Image as ImageIcon,
  BookOpen, Heart, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

const TYPE_LABELS: Record<string, string> = {
  letter: "Carta", video: "Video", audio: "Audio",
  photo: "Foto", document: "Documento",
};
const TYPE_ICONS: Record<string, any> = {
  letter: BookOpen, video: FileVideo, audio: Mic,
  photo: ImageIcon, document: FileText,
};

const recipSchema = z.object({
  fullName: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Correo inválido"),
  phone: z.string().optional(),
  relationship: z.string().min(1, "Relación requerida"),
  accessType: z.enum(["all", "specific"]),
  legacyItemIds: z.array(z.string()),
});
type RecipForm = z.infer<typeof recipSchema>;

type Recipient = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  relationship: string;
  accessType: "all" | "specific";
  legacyItemIds: string[];
};

type LegacyItem = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
};

function useRecipients() {
  return useQuery<Recipient[]>({
    queryKey: ["/api/recipients"],
    queryFn: async () => {
      const res = await fetch("/api/recipients", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Error al cargar destinatarios");
      return res.json();
    },
  });
}

function useLegacyItems() {
  return useQuery<LegacyItem[]>({
    queryKey: ["/api/legacy-items"],
    queryFn: async () => {
      const res = await fetch("/api/legacy-items", { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

function useCreateRecip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: RecipForm) => {
      const res = await fetch("/api/recipients", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/recipients"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
  });
}

function useUpdateRecip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RecipForm }) => {
      const res = await fetch(`/api/recipients/${id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error"); }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/recipients"] }),
  });
}

function useDeleteRecip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/recipients/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/recipients"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
  });
}

function AccessTypeBadge({ type }: { type: "all" | "specific" }) {
  return type === "all" ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
      <Globe className="w-3 h-3" /> Todo el legado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
      <FileText className="w-3 h-3" /> Contenido específico
    </span>
  );
}

export default function Recipients() {
  const { data: recipients, isLoading } = useRecipients();
  const { data: legacyItems = [] } = useLegacyItems();
  const createMutation = useCreateRecip();
  const updateMutation = useUpdateRecip();
  const deleteMutation = useDeleteRecip();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<RecipForm>({
    resolver: zodResolver(recipSchema),
    defaultValues: {
      fullName: "", email: "", phone: "", relationship: "",
      accessType: "specific", legacyItemIds: [],
    },
  });

  const accessType = form.watch("accessType");
  const selectedItemIds = form.watch("legacyItemIds");

  const openNew = () => {
    setEditingId(null);
    form.reset({
      fullName: "", email: "", phone: "", relationship: "",
      accessType: "specific", legacyItemIds: [],
    });
    setIsOpen(true);
  };

  const openEdit = (r: Recipient) => {
    setEditingId(r.id);
    form.reset({
      fullName: r.fullName,
      email: r.email,
      phone: r.phone ?? "",
      relationship: r.relationship,
      accessType: r.accessType,
      legacyItemIds: r.legacyItemIds ?? [],
    });
    setIsOpen(true);
  };

  const toggleItem = (itemId: string) => {
    const current = form.getValues("legacyItemIds");
    if (current.includes(itemId)) {
      form.setValue("legacyItemIds", current.filter((id) => id !== itemId));
    } else {
      form.setValue("legacyItemIds", [...current, itemId]);
    }
  };

  const onSubmit = async (values: RecipForm) => {
    const payload = {
      ...values,
      legacyItemIds: values.accessType === "all" ? [] : values.legacyItemIds,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
        toast({ title: "Destinatario actualizado" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Destinatario añadido" });
      }
      setIsOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Destinatarios</h1>
          <p className="text-muted-foreground mt-2">
            Las personas que recibirán tu legado, con acceso completo o a contenido específico.
          </p>
        </div>
        <Button className="rounded-xl shadow-md gap-2" onClick={openNew}>
          <Plus className="w-4 h-4" /> Añadir Destinatario
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : recipients?.length === 0 ? (
        <Card className="border-dashed bg-secondary/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Sin destinatarios</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Añade a las personas que recibirán tu legado cuando llegue el momento.
            </p>
            <Button onClick={openNew}>Añadir Destinatario</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipients?.map((recip) => {
            const linkedItems = legacyItems.filter((i) => recip.legacyItemIds?.includes(i.id));
            return (
              <motion.div key={recip.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="hover:shadow-lg transition-all border-border/50 h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                        {recip.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(recip)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm("¿Eliminar este destinatario?"))
                              deleteMutation.mutate(recip.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <h3 className="font-bold text-lg text-foreground truncate">{recip.fullName}</h3>
                    <p className="text-primary font-medium text-sm mb-1">{recip.relationship}</p>

                    <div className="mb-3">
                      <AccessTypeBadge type={recip.accessType} />
                    </div>

                    <div className="space-y-1.5 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{recip.email}</span>
                      </div>
                      {recip.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{recip.phone}</span>
                        </div>
                      )}
                    </div>

                    {recip.accessType === "specific" && linkedItems.length > 0 && (
                      <div className="mt-auto pt-3 border-t border-border/50 space-y-1">
                        {linkedItems.map((item) => {
                          const Icon = TYPE_ICONS[item.type] ?? FileText;
                          return (
                            <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Icon className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {recip.accessType === "specific" && linkedItems.length === 0 && (
                      <div className="mt-auto pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground/60 italic">Sin contenido asignado aún</p>
                      </div>
                    )}

                    {recip.accessType === "all" && (
                      <div className="mt-auto pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                          Acceso a todos los {legacyItems.length} elemento{legacyItems.length !== 1 ? "s" : ""} de tu legado
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {editingId ? "Editar Destinatario" : "Nuevo Destinatario"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
            {/* Datos personales */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre completo</Label>
                <Input {...form.register("fullName")} className="rounded-xl h-11" placeholder="Ej: María Gómez" />
                {form.formState.errors.fullName && (
                  <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input type="email" {...form.register("email")} className="rounded-xl h-11" placeholder="maria@ejemplo.com" />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Relación</Label>
                <Input {...form.register("relationship")} className="rounded-xl h-11" placeholder="Hija, Hermano…" />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono (opcional)</Label>
                <Input {...form.register("phone")} className="rounded-xl h-11" placeholder="+34 612…" />
              </div>
            </div>

            {/* Tipo de acceso */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">¿Qué puede ver esta persona?</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => form.setValue("accessType", "all")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    accessType === "all"
                      ? "border-violet-500 bg-violet-50"
                      : "border-border hover:border-violet-300 bg-background"
                  }`}
                >
                  <Globe className={`w-5 h-5 mb-2 ${accessType === "all" ? "text-violet-600" : "text-muted-foreground"}`} />
                  <p className={`font-semibold text-sm ${accessType === "all" ? "text-violet-800" : "text-foreground"}`}>
                    Todo el legado
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    Acceso completo a todos tus mensajes, fotos, videos y documentos
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => form.setValue("accessType", "specific")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    accessType === "specific"
                      ? "border-amber-500 bg-amber-50"
                      : "border-border hover:border-amber-300 bg-background"
                  }`}
                >
                  <FileText className={`w-5 h-5 mb-2 ${accessType === "specific" ? "text-amber-600" : "text-muted-foreground"}`} />
                  <p className={`font-semibold text-sm ${accessType === "specific" ? "text-amber-800" : "text-foreground"}`}>
                    Contenido específico
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    Solo verá los elementos que tú elijas — una carta, un video, etc.
                  </p>
                </button>
              </div>
            </div>

            {/* Selección de ítems (solo si "specific") */}
            <AnimatePresence>
              {accessType === "specific" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      Selecciona el contenido a compartir
                      {selectedItemIds.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({selectedItemIds.length} seleccionado{selectedItemIds.length !== 1 ? "s" : ""})
                        </span>
                      )}
                    </Label>

                    {legacyItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-6 text-center">
                        <Heart className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          Aún no tienes mensajes creados. Crea contenido primero y luego asígnalo aquí.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                        <Controller
                          control={form.control}
                          name="legacyItemIds"
                          render={() => (
                            <>
                              {legacyItems.map((item) => {
                                const Icon = TYPE_ICONS[item.type] ?? FileText;
                                const isSelected = selectedItemIds.includes(item.id);
                                return (
                                  <label
                                    key={item.id}
                                    className={`flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                                      isSelected ? "bg-violet-50/60" : "bg-background"
                                    }`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleItem(item.id)}
                                      className="shrink-0"
                                    />
                                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                      <Icon className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{item.title}</p>
                                      <p className="text-xs text-muted-foreground capitalize">
                                        {TYPE_LABELS[item.type] ?? item.type}
                                      </p>
                                    </div>
                                    {isSelected && <ChevronRight className="w-4 h-4 text-violet-500 shrink-0" />}
                                  </label>
                                );
                              })}
                            </>
                          )}
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" className="w-full rounded-xl h-11" disabled={isPending}>
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : editingId ? "Guardar cambios" : "Añadir destinatario"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
