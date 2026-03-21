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
import { Loader2, ArrowLeft, Save, UploadCloud, FileCheck2, X, FileVideo, FileAudio, Image, FileText, Lock, Sparkles, Plus, Trash2, AlertCircle, Eye, FileDown, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { getAuthToken, getAuthHeaders } from "@/hooks/use-auth";
import { getEncryptionKey, encryptFile } from "@/lib/encryption";
import { useProfile } from "@/hooks/use-settings";

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
  encryptionIv?: string;
  originalMimeType?: string;
};

const ACCEPT_MAP: Record<string, string> = {
  video: "video/mp4,video/mov,video/avi,video/quicktime,video/webm",
  audio: "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/m4a",
  photo: "image/jpeg,image/png,image/gif,image/webp",
  document: "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const ICON_MAP: Record<string, React.ReactNode> = {
  video: <FileVideo className="w-7 h-7 text-violet-500" />,
  audio: <FileAudio className="w-7 h-7 text-blue-500" />,
  photo: <Image className="w-7 h-7 text-green-500" />,
  document: <FileText className="w-7 h-7 text-orange-500" />,
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

async function fetchEncryptionKey(): Promise<string | null> {
  const stored = getEncryptionKey();
  if (stored) return stored;
  try {
    const res = await fetch("/api/auth/encryption-key", { headers: getAuthHeaders() as HeadersInit });
    if (!res.ok) return null;
    const { encryptionKey } = await res.json();
    return encryptionKey ?? null;
  } catch {
    return null;
  }
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
  const [stage, setStage] = useState<"idle" | "encrypting" | "uploading">("idle");

  const handleFile = async (file: File) => {
    setUploading(true);
    setProgress(5);
    setStage("encrypting");

    try {
      const encKey = await fetchEncryptionKey();

      let uploadBlob: Blob;
      let ivBase64: string | undefined;

      if (encKey) {
        setProgress(20);
        const { encryptedBlob, ivBase64: iv } = await encryptFile(file, encKey);
        uploadBlob = encryptedBlob;
        ivBase64 = iv;
      } else {
        uploadBlob = file;
      }

      setStage("uploading");
      setProgress(30);

      const formData = new FormData();
      formData.append("file", new File([uploadBlob], file.name + (ivBase64 ? ".enc" : ""), {
        type: uploadBlob.type,
      }));

      const token = getAuthToken();
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setProgress(30 + Math.round((e.loaded / e.total) * 65));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(JSON.parse(xhr.responseText)?.error || "Error al subir"));
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
        bytes: file.size,
        encryptionIv: ivBase64,
        originalMimeType: file.type || undefined,
      });
      toast({ title: ivBase64 ? "Archivo cifrado y subido" : "Archivo subido" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al subir", description: err.message });
    } finally {
      setUploading(false);
      setProgress(0);
      setStage("idle");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (mediaData) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-primary/30 bg-primary/5">
        <div className="shrink-0">{ICON_MAP[type] ?? <FileCheck2 className="w-7 h-7 text-primary" />}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-sm text-foreground truncate">{mediaData.url.split("/").pop()?.replace(".enc", "")}</p>
            {mediaData.encryptionIv && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium shrink-0">
                <Lock className="w-2.5 h-2.5" /> Cifrado
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mediaData.bytes ? formatBytes(mediaData.bytes) : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
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
          if (file) {
            if (file.size > 100 * 1024 * 1024) {
              toast({ title: "Archivo demasiado grande", description: "El archivo no puede superar 100 MB", variant: "destructive" });
              e.target.value = "";
              return;
            }
            handleFile(file);
          }
          e.target.value = "";
        }}
      />
      {uploading ? (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground text-center">
            {stage === "encrypting" ? "Cifrando archivo..." : "Subiendo a Cloudinary..."}
          </p>
          <div className="w-full max-w-xs">
            <Progress value={progress} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground">{progress}%</p>
        </>
      ) : (
        <>
          <div className="relative">
            <UploadCloud className="w-10 h-10 text-muted-foreground/60" />
            <Lock className="w-4 h-4 text-green-600 absolute -bottom-1 -right-1 bg-card rounded-full p-0.5" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Arrastra o haz clic para subir</p>
            <p className="text-xs text-muted-foreground mt-1">
              Acepta {LABEL_MAP[type] ?? "archivos"} · máx. 200 MB
            </p>
            <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" /> Se cifra en tu navegador antes de subir
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function convertMarkdownToHtml(text: string): string {
  return text
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:bold;text-align:center;margin:0 0 8px;letter-spacing:1px;">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:15px;font-weight:bold;margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:bold;margin:16px 0 6px;">$1</h3>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;" />')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #999;padding:8px 16px;margin:12px 0;color:#555;font-style:italic;background:#f9f9f9;">$1</blockquote>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0 4px 24px;list-style:decimal;">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:10px 0;">')
    .replace(/\n/g, '<br/>');
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

  const { data: profileData } = useProfile();

  const [testatorData, setTestatorData] = useState({
    fullName: "",
    dni: "",
    civilStatus: "",
    city: "",
    address: "",
    executor: "",
    hasPreviousWill: "no",
  });

  useEffect(() => {
    const name = (profileData as any)?.fullName || (profileData as any)?.data?.fullName;
    if (name && !testatorData.fullName) {
      setTestatorData((p) => ({ ...p, fullName: name }));
    }
  }, [profileData]);

  type Beneficiary = { name: string; relationship: string; bequest: string };
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [newBenef, setNewBenef] = useState<Beneficiary>({ name: "", relationship: "", bequest: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDocument, setGeneratedDocument] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const handleAddBeneficiary = () => {
    if (!newBenef.name.trim() || !newBenef.bequest.trim()) return;
    setBeneficiaries((prev) => [...prev, newBenef]);
    setNewBenef({ name: "", relationship: "", bequest: "" });
  };

  const handleGenerateWill = async () => {
    if (!testatorData.fullName || !testatorData.dni || !testatorData.city || !testatorData.address) {
      toast({
        title: "Completa tus datos personales",
        description: "Nombre, DNI, ciudad y domicilio son obligatorios para generar el documento.",
        variant: "destructive",
      });
      return;
    }
    if (beneficiaries.length === 0) {
      toast({ title: "Agrega al menos un beneficiario", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/generate-will", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionStorage.getItem("legado_token") || localStorage.getItem("legado_token")}`,
        },
        body: JSON.stringify({ beneficiaries, testatorData }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Error al generar", description: data.error || "Intenta de nuevo", variant: "destructive" });
        return;
      }
      const text = data.document || "";
      setGeneratedDocument(text);
      form.setValue("contentText", text);
      toast({ title: "¡Documento generado!", description: "Puedes editarlo antes de guardar." });
    } catch (err) {
      console.error("[generate-will]", err);
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const html2canvas = (await import("html2canvas")).default;

    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 794px;
      padding: 60px 70px;
      background: #ffffff;
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #1a1a1a;
      font-size: 13px;
      line-height: 1.8;
      box-sizing: border-box;
    `;

    const htmlContent = convertMarkdownToHtml(generatedDocument || "");
    container.innerHTML = `<div style="max-width:654px;margin:0 auto;"><p style="margin:8px 0;">${htmlContent}</p></div>`;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidthMm = pageWidth;
      const imgHeightMm = (canvas.height * pageWidth) / canvas.width;

      let heightLeft = imgHeightMm;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeight;
      }

      const today = new Date().toISOString().split("T")[0];
      pdf.save(`mis-ultimos-deseos-${today}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  };

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
      if (item.contentText) {
        setGeneratedDocument(item.contentText);
      }
      if (item.mediaUrl) {
        setMediaData({
          url: item.mediaUrl,
          publicId: item.mediaPublicId || "",
          resourceType: item.mediaResourceType || "raw",
          encryptionIv: (item as any).mediaEncryptionIv || undefined,
          originalMimeType: (item as any).originalMimeType || undefined,
        });
      }
    }
  }, [item, isNew, form]);

  useEffect(() => {
    if (itemRecipients) setSelectedRecipients(itemRecipients);
  }, [itemRecipients]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const payload = {
        ...values,
        mediaUrl: mediaData?.url || "",
        mediaPublicId: mediaData?.publicId || "",
        mediaResourceType: mediaData?.resourceType || "",
        mediaEncryptionIv: mediaData?.encryptionIv || "",
        originalMimeType: mediaData?.originalMimeType || "",
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
        await setRecipientsMutation.mutateAsync({ id: savedId, data: { recipientIds: selectedRecipients } });
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
        <Link href="/legacy" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-5">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver al listado
        </Link>

        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-foreground mb-6">
          {isNew ? "Crear Nuevo Elemento" : "Editar Elemento"}
        </h1>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Card className="shadow-md border-border/50">
            <CardContent className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Mensaje</Label>
                  <Select
                    onValueChange={(v) => { form.setValue("type", v as any); setMediaData(null); }}
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
                <Input className="h-12 rounded-xl" placeholder="Ej: Para mi querida hija..." {...form.register("title")} />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Descripción breve (opcional)</Label>
                <Input className="h-12 rounded-xl" placeholder="Contexto sobre este mensaje" {...form.register("description")} />
              </div>

              {currentType === "letter" && (
                <div className="space-y-2">
                  <Label>Contenido del Mensaje</Label>
                  <Textarea
                    className="min-h-[200px] rounded-xl resize-y"
                    placeholder="Escribe tu mensaje aquí..."
                    {...form.register("contentText")}
                  />
                </div>
              )}

              {currentType === "funeral_note" && (
                <div className="space-y-4">
                  {/* AI Will Builder */}
                  <div className="border border-violet-100 rounded-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-4 py-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      <span className="font-semibold text-violet-900 text-sm">Constructor de testamento con IA</span>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Completa tus datos y añade a tus beneficiarios. La IA redactará el documento sin dejar campos en blanco.
                      </p>

                      {/* Testator data */}
                      <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-fuchsia-600" />
                          Datos del testador
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-gray-700 text-xs">Nombre completo *</Label>
                            <Input
                              value={testatorData.fullName}
                              onChange={(e) => setTestatorData((p) => ({ ...p, fullName: e.target.value }))}
                              placeholder="Ej: Juan Carlos Pérez López"
                              className="rounded-xl h-10 text-gray-900 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-gray-700 text-xs">DNI *</Label>
                            <Input
                              value={testatorData.dni}
                              onChange={(e) => setTestatorData((p) => ({ ...p, dni: e.target.value }))}
                              placeholder="Ej: 12345678"
                              className="rounded-xl h-10 text-gray-900 text-sm"
                              maxLength={12}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-gray-700 text-xs">Estado civil *</Label>
                            <select
                              value={testatorData.civilStatus}
                              onChange={(e) => setTestatorData((p) => ({ ...p, civilStatus: e.target.value }))}
                              className="w-full rounded-xl h-10 border border-gray-200 px-3 text-gray-900 bg-white text-sm"
                            >
                              <option value="">Seleccionar...</option>
                              <option value="soltero/a">Soltero/a</option>
                              <option value="casado/a">Casado/a</option>
                              <option value="divorciado/a">Divorciado/a</option>
                              <option value="viudo/a">Viudo/a</option>
                              <option value="conviviente">Conviviente</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-gray-700 text-xs">Ciudad *</Label>
                            <Input
                              value={testatorData.city}
                              onChange={(e) => setTestatorData((p) => ({ ...p, city: e.target.value }))}
                              placeholder="Ej: Lima"
                              className="rounded-xl h-10 text-gray-900 text-sm"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-gray-700 text-xs">Domicilio completo *</Label>
                            <Input
                              value={testatorData.address}
                              onChange={(e) => setTestatorData((p) => ({ ...p, address: e.target.value }))}
                              placeholder="Ej: Av. Los Pinos 234, Miraflores, Lima"
                              className="rounded-xl h-10 text-gray-900 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-gray-700 text-xs">Nombre del albacea (opcional)</Label>
                            <Input
                              value={testatorData.executor}
                              onChange={(e) => setTestatorData((p) => ({ ...p, executor: e.target.value }))}
                              placeholder="Persona de confianza"
                              className="rounded-xl h-10 text-gray-900 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-gray-700 text-xs">¿Tienes testamento anterior?</Label>
                            <select
                              value={testatorData.hasPreviousWill}
                              onChange={(e) => setTestatorData((p) => ({ ...p, hasPreviousWill: e.target.value }))}
                              className="w-full rounded-xl h-10 border border-gray-200 px-3 text-gray-900 bg-white text-sm"
                            >
                              <option value="no">No tengo testamento anterior</option>
                              <option value="si">Sí tengo y quiero revocarlo</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Beneficiary list */}
                      {beneficiaries.length > 0 && (
                        <div className="space-y-2">
                          {beneficiaries.map((b, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 bg-violet-50 rounded-xl border border-violet-100">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-violet-900">{b.name}
                                  {b.relationship && <span className="font-normal text-violet-600 ml-1">({b.relationship})</span>}
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5">{b.bequest}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setBeneficiaries((prev) => prev.filter((_, j) => j !== i))}
                                className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add beneficiary form */}
                      <div className="space-y-2 bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-600">Agregar beneficiario</p>
                        <Input
                          placeholder="Nombre completo *"
                          value={newBenef.name}
                          onChange={(e) => setNewBenef((p) => ({ ...p, name: e.target.value }))}
                          className="h-9 rounded-lg text-sm"
                        />
                        <Input
                          placeholder="Relación (ej: hijo, esposa, amigo…)"
                          value={newBenef.relationship}
                          onChange={(e) => setNewBenef((p) => ({ ...p, relationship: e.target.value }))}
                          className="h-9 rounded-lg text-sm"
                        />
                        <Textarea
                          placeholder="¿Qué le dejas? Describe los bienes o el mensaje *"
                          value={newBenef.bequest}
                          onChange={(e) => setNewBenef((p) => ({ ...p, bequest: e.target.value }))}
                          className="min-h-[64px] rounded-lg text-sm resize-none"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full rounded-lg gap-1.5"
                          onClick={handleAddBeneficiary}
                          disabled={!newBenef.name.trim() || !newBenef.bequest.trim()}
                        >
                          <Plus className="w-3.5 h-3.5" /> Añadir beneficiario
                        </Button>
                      </div>

                      <Button
                        type="button"
                        onClick={handleGenerateWill}
                        disabled={isGenerating}
                        className="w-full h-12 rounded-xl font-semibold text-white gap-2 shadow-md"
                        style={{ backgroundColor: "#9d174d", borderColor: "#9d174d" }}
                      >
                        {isGenerating
                          ? <><Loader2 className="w-5 h-5 animate-spin" /> Redactando tu documento...</>
                          : <><Sparkles className="w-5 h-5" /> Generar mis últimos deseos con IA</>}
                      </Button>

                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Este documento es un borrador de carácter personal. Para validez legal consulta a un notario.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-800 font-semibold">Contenido del testamento</Label>
                    <Textarea
                      className="min-h-[280px] rounded-xl resize-y text-gray-900 font-mono text-sm leading-relaxed"
                      placeholder="Escribe tu testamento aquí, o usa el Constructor con IA arriba para generarlo automáticamente…"
                      value={generatedDocument}
                      onChange={(e) => {
                        setGeneratedDocument(e.target.value);
                        form.setValue("contentText", e.target.value);
                      }}
                    />
                  </div>

                  {generatedDocument && generatedDocument.trim().length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-3 mt-2">
                      <Button
                        type="button"
                        onClick={() => setShowPreview(true)}
                        variant="outline"
                        className="flex items-center gap-2 border-amber-700 text-amber-800 hover:bg-amber-50 rounded-xl px-6 h-11"
                      >
                        <Eye className="w-4 h-4" />
                        Vista previa
                      </Button>
                      <Button
                        type="button"
                        onClick={exportToPDF}
                        className="flex items-center gap-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl px-6 h-11"
                      >
                        <FileDown className="w-4 h-4" />
                        Descargar como PDF
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {needsFile && (
                <div className="space-y-2">
                  <Label>Archivo</Label>
                  <FileUploadZone type={currentType} mediaData={mediaData} onUploaded={setMediaData} onClear={() => setMediaData(null)} />
                  <p className="text-xs text-muted-foreground">
                    Tus archivos se cifran con AES-256 antes de salir de tu navegador. Ni Cloudinary ni el administrador pueden acceder a su contenido.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-md border-border/50">
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardTitle className="font-serif text-lg sm:text-xl">¿Para quién es este mensaje?</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              {!allRecipients || allRecipients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes destinatarios registrados. Puedes añadirlos más tarde.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allRecipients.map((recip) => (
                    <div key={recip.id} className="flex items-center space-x-3 p-3 rounded-lg border border-border/50 hover:bg-secondary/50 cursor-pointer">
                      <Checkbox
                        id={`recip-${recip.id}`}
                        checked={selectedRecipients.includes(recip.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedRecipients([...selectedRecipients, recip.id]);
                          else setSelectedRecipients(selectedRecipients.filter((rid) => rid !== recip.id));
                        }}
                      />
                      <label htmlFor={`recip-${recip.id}`} className="flex-1 cursor-pointer font-medium leading-none">
                        {recip.fullName}
                        <span className="text-muted-foreground text-xs block font-normal mt-0.5">{recip.relationship}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/legacy">
              <Button type="button" variant="outline" className="rounded-xl h-12 px-5">Cancelar</Button>
            </Link>
            <Button type="submit" className="rounded-xl h-12 px-7 shadow-lg shadow-primary/20" disabled={isPending}>
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Guardar</>}
            </Button>
          </div>
        </form>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
            <DialogTitle className="text-gray-800 font-serif text-lg flex items-center gap-2">
              <Eye className="w-5 h-5" /> Vista previa del documento
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div
              className="min-h-[600px] p-10 bg-white"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              <div
                className="max-w-xl mx-auto"
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  color: "#1a1a1a",
                  lineHeight: "1.8",
                }}
                dangerouslySetInnerHTML={{
                  __html: convertMarkdownToHtml(generatedDocument || form.getValues("contentText") || ""),
                }}
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
            <Button
              type="button"
              onClick={exportToPDF}
              className="rounded-xl gap-2 text-white"
              style={{ backgroundColor: "#9d174d" }}
            >
              <FileDown className="w-4 h-4" /> Descargar PDF
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowPreview(false)} className="rounded-xl">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
