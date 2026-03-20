import { useState, useEffect, useRef } from "react";
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
import { Loader2, ArrowLeft, Save, UploadCloud, FileCheck2, X, FileVideo, FileAudio, Image, FileText } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { getAuthToken } from "@/hooks/use-auth";

const formSchema = z.object({
  type: z.enum(["video", "letter", "audio", "photo", "document", "funeral_note"]),
  title: z.string().min(2, "El título es requerido"),
  description: z.string().optional(),
  contentText: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]),
});

type MediaData = {
  url: string;
  publicId: string;
  resourceType: string;
  format?: string;
  bytes?: number;
};

const ACCEPT_MAP: Record<string, string> = {
  video: "video/mp4,video/mov,video/avi,video/quicktime,video/webm",
  audio: "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/m4a",
  photo: "image/jpeg,image/png,image/gif,image/webp",
  document: "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const ICON_MAP: Record<string, React.ReactNode> = {
  video: <FileVideo className="w-8 h-8 text-violet-500" />,
  audio: <FileAudio className="w-8 h-8 text-blue-500" />,
  photo: <Image className="w-8 h-8 text-green-500" />,
  document: <FileText className="w-8 h-8 text-orange-500" />,
};

const LABEL_MAP: Record<string, string> = {
  video: "video (.mp4, .mov, .webm)",
  audio: "audio (.mp3, .wav, .ogg)",
  photo: "imagen (.jpg, .png, .webp)",
  document: "documento (.pdf, .docx)",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileUploadZone({
  type,
  mediaData,
  onUploaded,
  onClear,
}: {
  type: string;
  mediaData: MediaData | null;
  onUploaded: (data: MediaData) => void;
  onClear: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file: File) => {
    setUploading(true);
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = getAuthToken();
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 90));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(JSON.parse(xhr.responseText)?.error || "Error al subir"));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Error de red")));

        xhr.open("POST", "/api/upload");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      });

      setProgress(100);
      const result = JSON.parse(xhr.responseText);
      onUploaded({
        url: result.url,
        publicId: result.publicId,
        resourceType: result.resourceType,
        format: result.format,
        bytes: result.bytes,
      });
      toast({ title: "Archivo subido correctamente" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al subir", description: err.message });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (mediaData) {
    return (
      <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-primary/30 bg-primary/5">
        <div className="shrink-0">{ICON_MAP[type] ?? <FileCheck2 className="w-8 h-8 text-primary" />}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{mediaData.url.split("/").pop()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mediaData.format?.toUpperCase()}
            {mediaData.bytes ? ` · ${formatBytes(mediaData.bytes)}` : ""}
          </p>
          <a
            href={mediaData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Ver archivo ↗
          </a>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPT_MAP[type] ?? "*/*"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">Subiendo a Cloudinary...</p>
          <div className="w-full max-w-xs">
            <Progress value={progress} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground">{progress}%</p>
        </>
      ) : (
        <>
          <UploadCloud className="w-10 h-10 text-muted-foreground/60" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Arrastra o haz clic para subir
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Acepta {LABEL_MAP[type] ?? "archivos"} · máx. 200 MB
            </p>
          </div>
        </>
      )}
    </div>
  );
}

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
  const [mediaData, setMediaData] = useState<MediaData | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "letter",
      title: "",
      description: "",
      contentText: "",
      status: "draft",
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
      });
      if (item.mediaUrl) {
        setMediaData({
          url: item.mediaUrl,
          publicId: item.mediaPublicId || "",
          resourceType: item.mediaResourceType || "image",
        });
      }
    }
  }, [item, isNew, form]);

  useEffect(() => {
    if (itemRecipients) {
      setSelectedRecipients(itemRecipients);
    }
  }, [itemRecipients]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const payload = {
        ...values,
        mediaUrl: mediaData?.url || "",
        mediaPublicId: mediaData?.publicId || "",
        mediaResourceType: mediaData?.resourceType || "",
      };

      let savedId = id;
      if (isNew) {
        const res = await createMutation.mutateAsync({ data: payload });
        savedId = res.id;
        toast({ title: "Elemento creado exitosamente" });
      } else {
        await updateMutation.mutateAsync({ id, data: payload });
        toast({ title: "Elemento actualizado" });
      }

      if (selectedRecipients.length > 0 || !isNew) {
        await setRecipientsMutation.mutateAsync({
          id: savedId,
          data: { recipientIds: selectedRecipients },
        });
      }

      setLocation("/legacy");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || setRecipientsMutation.isPending;
  const currentType = form.watch("type");
  const needsFile = ["video", "audio", "photo", "document"].includes(currentType);

  if (!isNew && itemLoading) {
    return (
      <AppLayout>
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </AppLayout>
    );
  }

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
                  <Select
                    onValueChange={(v) => {
                      form.setValue("type", v as any);
                      setMediaData(null);
                    }}
                    defaultValue={form.getValues("type")}
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="letter">Carta Escrita</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                      <SelectItem value="photo">Fotografía</SelectItem>
                      <SelectItem value="document">Documento / PDF</SelectItem>
                      <SelectItem value="funeral_note">Nota Funeraria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    onValueChange={(v) => form.setValue("status", v as any)}
                    defaultValue={form.getValues("status")}
                  >
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
                <Input
                  className="h-12 rounded-xl"
                  placeholder="Ej: Para mi querida hija..."
                  {...form.register("title")}
                />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Descripción breve (opcional)</Label>
                <Input
                  className="h-12 rounded-xl"
                  placeholder="Contexto sobre este mensaje"
                  {...form.register("description")}
                />
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

              {needsFile && (
                <div className="space-y-2">
                  <Label>Archivo</Label>
                  <FileUploadZone
                    type={currentType}
                    mediaData={mediaData}
                    onUploaded={setMediaData}
                    onClear={() => setMediaData(null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    El archivo se almacena de forma segura en Cloudinary y solo lo verán tus destinatarios.
                  </p>
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
                <p className="text-sm text-muted-foreground">
                  No tienes destinatarios registrados. Puedes añadirlos más tarde.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {allRecipients?.map((recip) => (
                    <div
                      key={recip.id}
                      className="flex items-center space-x-3 p-3 rounded-lg border border-border/50 hover:bg-secondary/50"
                    >
                      <Checkbox
                        id={`recip-${recip.id}`}
                        checked={selectedRecipients.includes(recip.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedRecipients([...selectedRecipients, recip.id]);
                          else setSelectedRecipients(selectedRecipients.filter((rid) => rid !== recip.id));
                        }}
                      />
                      <label
                        htmlFor={`recip-${recip.id}`}
                        className="flex-1 cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {recip.fullName}{" "}
                        <span className="text-muted-foreground text-xs block font-normal">
                          {recip.relationship}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/legacy">
              <Button type="button" variant="outline" className="rounded-xl h-12 px-6">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              className="rounded-xl h-12 px-8 shadow-lg shadow-primary/20"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" /> Guardar
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
