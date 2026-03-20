import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useRoute } from "wouter";
import { useLegacyItem, useCreateLegacy, useUpdateLegacy, useItemRecipients, useSetItemRecipients } from "@/hooks/use-legacy";
import { useRecipients } from "@/hooks/use-contacts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  type: z.enum(["video", "letter", "audio", "photo", "document", "funeral_note"]),
  title: z.string().min(2, "El título es requerido"),
  description: z.string().optional(),
  contentText: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]),
  mediaUrl: z.string().url("Debe ser una URL válida").optional().or(z.literal("")),
});

export default function LegacyForm() {
  const [match, params] = useRoute("/legacy/:id");
  const isNew = params?.id === "new";
  const id = isNew ? "" : params?.id || "";
  
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: item, isLoading: itemLoading } = useLegacyItem(id);
  const { data: itemRecipients } = useItemRecipients(id);
  const { data: allRecipients } = useRecipients();
  
  const createMutation = useCreateLegacy();
  const updateMutation = useUpdateLegacy();
  const setRecipientsMutation = useSetItemRecipients();

  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "letter",
      title: "",
      description: "",
      contentText: "",
      status: "draft",
      mediaUrl: "",
    },
  });

  useEffect(() => {
    if (item && !isNew) {
      form.reset({
        type: item.type,
        title: item.title,
        description: item.description || "",
        contentText: item.contentText || "",
        status: item.status,
        mediaUrl: item.mediaUrl || "",
      });
    }
  }, [item, isNew, form]);

  useEffect(() => {
    if (itemRecipients) {
      setSelectedRecipients(itemRecipients);
    }
  }, [itemRecipients]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      let savedId = id;
      if (isNew) {
        const res = await createMutation.mutateAsync({ data: values });
        savedId = res.id;
        toast({ title: "Elemento creado exitosamente" });
      } else {
        await updateMutation.mutateAsync({ id, data: values });
        toast({ title: "Elemento actualizado" });
      }

      // Guardar destinatarios
      if (selectedRecipients.length > 0 || !isNew) {
        await setRecipientsMutation.mutateAsync({ 
          id: savedId, 
          data: { recipientIds: selectedRecipients } 
        });
      }

      setLocation("/legacy");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || setRecipientsMutation.isPending;
  const currentType = form.watch("type");

  if (!isNew && itemLoading) return <AppLayout><div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Link href="/legacy" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver al listado
        </Link>
        
        <h1 className="font-serif text-3xl font-bold text-foreground mb-8">
          {isNew ? "Crear Nuevo Elemento" : "Editar Elemento"}
        </h1>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-lg border-border/50">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Tipo de Mensaje</Label>
                  <Select onValueChange={(v) => form.setValue("type", v as any)} defaultValue={form.getValues("type")}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="letter">Carta Escrita</SelectItem>
                      <SelectItem value="video">Video (URL)</SelectItem>
                      <SelectItem value="audio">Audio (URL)</SelectItem>
                      <SelectItem value="photo">Fotografía (URL)</SelectItem>
                      <SelectItem value="document">Documento (URL)</SelectItem>
                      <SelectItem value="funeral_note">Nota Funeraria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select onValueChange={(v) => form.setValue("status", v as any)} defaultValue={form.getValues("status")}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Borrador</SelectItem>
                      <SelectItem value="active">Activo (Listo para enviar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Título</Label>
                <Input className="h-12 rounded-xl" placeholder="Ej: Para mi querida hija..." {...form.register("title")} />
                {form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Descripción breve (opcional)</Label>
                <Input className="h-12 rounded-xl" placeholder="Contexto sobre este mensaje" {...form.register("description")} />
              </div>

              {(currentType === "letter" || currentType === "funeral_note") && (
                <div className="space-y-2">
                  <Label>Contenido del Mensaje</Label>
                  <Textarea 
                    className="min-h-[200px] rounded-xl resize-y" 
                    placeholder="Escribe tu mensaje aquí..."
                    {...form.register("contentText")} 
                  />
                </div>
              )}

              {(currentType === "video" || currentType === "audio" || currentType === "photo" || currentType === "document") && (
                <div className="space-y-2">
                  <Label>Enlace del Archivo (URL segura)</Label>
                  <Input className="h-12 rounded-xl" placeholder="https://..." {...form.register("mediaUrl")} />
                  <p className="text-xs text-muted-foreground">Para el MVP, pega un enlace a tu archivo (Google Drive, Dropbox, YouTube privado).</p>
                  {form.formState.errors.mediaUrl && <p className="text-sm text-destructive">{form.formState.errors.mediaUrl.message}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-border/50">
            <CardHeader>
              <CardTitle className="font-serif text-xl">¿Para quién es este mensaje?</CardTitle>
            </CardHeader>
            <CardContent>
              {allRecipients?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tienes destinatarios registrados. Puedes añadirlos más tarde.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {allRecipients?.map(recip => (
                    <div key={recip.id} className="flex items-center space-x-3 p-3 rounded-lg border border-border/50 hover:bg-secondary/50">
                      <Checkbox 
                        id={`recip-${recip.id}`} 
                        checked={selectedRecipients.includes(recip.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedRecipients([...selectedRecipients, recip.id]);
                          else setSelectedRecipients(selectedRecipients.filter(id => id !== recip.id));
                        }}
                      />
                      <label htmlFor={`recip-${recip.id}`} className="flex-1 cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {recip.fullName} <span className="text-muted-foreground text-xs block font-normal">{recip.relationship}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/legacy">
              <Button type="button" variant="outline" className="rounded-xl h-12 px-6">Cancelar</Button>
            </Link>
            <Button type="submit" className="rounded-xl h-12 px-8 shadow-lg shadow-primary/20" disabled={isPending}>
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2"/> Guardar</>}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
