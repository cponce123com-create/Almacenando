import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  X, ExternalLink, Trash2, Loader2, ImageIcon,
  CheckCircle2, AlertCircle, Image, Camera,
} from "lucide-react";

interface SamplePhotoPanelProps {
  sampleId: string;
  sampleCode: string;
  photos: string[];
  canUpload: boolean;
  canDelete: boolean;
  queryKey: unknown[];
  uploadUrl?: string;
  deleteUrl?: (idx: number) => string;
  onUpdate?: (photos: string[]) => void;
}

interface UploadingFile {
  id: string;
  preview: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

function DriveThumb({ url }: { url: string }) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const fileId = match?.[1];
  const thumb = fileId
    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`
    : null;
  const [err, setErr] = useState(false);

  return (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center overflow-hidden">
      {thumb && !err ? (
        <img
          src={thumb}
          alt="Foto Drive"
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <Image className="w-5 h-5" />
          <span className="text-[10px]">Drive</span>
        </div>
      )}
    </div>
  );
}

export function SamplePhotoPanel({
  sampleId,
  sampleCode,
  photos: initialPhotos,
  canUpload,
  canDelete,
  queryKey,
  uploadUrl,
  deleteUrl,
  onUpdate,
}: SamplePhotoPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const remaining = 5 - photos.length;

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || remaining <= 0) return;

    const toUpload = files.slice(0, remaining);
    const previews: UploadingFile[] = toUpload.map(f => ({
      id: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
      status: "uploading" as const,
    }));
    setUploading(prev => [...prev, ...previews]);

    const formData = new FormData();
    toUpload.forEach(f => formData.append("photos", f));

    try {
      const url = uploadUrl ?? `/api/samples/${sampleId}/photos`;
      const res = await fetch(url, {
        method: "POST",
        headers: getAuthHeaders() as Record<string, string>,
        body: formData,
      });

      const body = await res.json();

      if (!res.ok && res.status !== 207) {
        const msg = body.error ?? "Error al subir";
        setUploading(prev => prev.map(p =>
          previews.find(x => x.id === p.id) ? { ...p, status: "error" as const, error: msg } : p
        ));
        toast({ title: "Error al subir fotos", description: msg, variant: "destructive" });
        return;
      }

      const newPhotos = (body.record?.photos as string[] | null) ?? [];
      setPhotos(newPhotos);
      onUpdate?.(newPhotos);
      qc.invalidateQueries({ queryKey });

      const uploadedCount = body.uploaded ?? 0;
      const errors: string[] = body.errors ?? [];

      setUploading(prev => prev.map(p => {
        const idx = previews.findIndex(x => x.id === p.id);
        if (idx === -1) return p;
        if (idx < uploadedCount) return { ...p, status: "done" as const };
        return { ...p, status: "error" as const, error: errors[idx - uploadedCount] ?? "Error" };
      }));

      const errCount = errors.length;
      if (errCount > 0) {
        toast({
          title: `${uploadedCount} foto(s) subida(s), ${errCount} con error`,
          description: errors.join(" | "),
          variant: "destructive",
        });
      } else {
        toast({ title: `${uploadedCount} foto(s) guardada(s) en Google Drive` });
        setTimeout(() => {
          setUploading(prev => prev.filter(p => !previews.find(x => x.id === p.id)));
          previews.forEach(p => URL.revokeObjectURL(p.preview));
        }, 1800);
      }
    } catch {
      setUploading(prev => prev.map(p =>
        previews.find(x => x.id === p.id) ? { ...p, status: "error" as const, error: "Error de red" } : p
      ));
      toast({ title: "Error de conexión", variant: "destructive" });
    }
  }, [remaining, sampleId, uploadUrl, queryKey, onUpdate, toast, qc]);

  const onFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    uploadFiles(arr);
  }, [uploadFiles]);

  const deleteMutation = useMutation({
    mutationFn: async (idx: number) => {
      const url = deleteUrl ? deleteUrl(idx) : `/api/samples/${sampleId}/photos/${idx}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: getAuthHeaders() as Record<string, string>,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error"); }
      return res.json();
    },
    onSuccess: (updated) => {
      const newPhotos = (updated.photos as string[] | null) ?? [];
      setPhotos(newPhotos);
      onUpdate?.(newPhotos);
      qc.invalidateQueries({ queryKey });
      toast({ title: "Foto eliminada" });
    },
    onError: (e: Error) => toast({ title: "Error al eliminar", description: e.message, variant: "destructive" }),
  });

  const isUploading = uploading.some(u => u.status === "uploading");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          {photos.length}/5 fotos en Google Drive
        </p>
        {isUploading && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo a Drive...
          </div>
        )}
      </div>

      {/* Fotos guardadas */}
      {photos.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Guardadas en Google Drive</p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, idx) => (
              <div key={idx} className="relative group">
                <div
                  className="aspect-square rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => setLightbox(url)}
                >
                  <DriveThumb url={url} />
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-1 left-1 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  title="Abrir en Drive"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3 text-blue-600" />
                </a>
                {canDelete && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow hover:bg-red-50"
                    title="Eliminar foto"
                    onClick={() => deleteMutation.mutate(idx)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 text-red-500" />
                    )}
                  </button>
                )}
                <span className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] px-1 py-0.5 rounded-sm font-mono">
                  {idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fotos en proceso de subida */}
      {uploading.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Subiendo...</p>
          <div className="grid grid-cols-3 gap-2">
            {uploading.map(p => (
              <div key={p.id} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden border-2 border-dashed border-slate-200 relative">
                  <img src={p.preview} alt="preview" className="w-full h-full object-cover" />
                  {p.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                  {p.status === "done" && (
                    <div className="absolute inset-0 bg-emerald-600/50 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  )}
                  {p.status === "error" && (
                    <div className="absolute inset-0 bg-red-600/40 flex items-center justify-center flex-col gap-1">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
                {p.status === "error" && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 shadow hover:bg-red-50"
                    onClick={() => {
                      URL.revokeObjectURL(p.preview);
                      setUploading(prev => prev.filter(x => x.id !== p.id));
                    }}
                  >
                    <X className="w-3 h-3 text-slate-500" />
                  </button>
                )}
                {p.status === "error" && p.error && (
                  <p className="text-[9px] text-red-600 text-center mt-1 leading-tight">{p.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botones de cámara / galería */}
      {canUpload && photos.length < 5 && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-14 gap-2 border-dashed border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400 flex-col py-2"
            disabled={isUploading}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs">Tomar foto</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 gap-2 border-dashed border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-400 flex-col py-2"
            disabled={isUploading}
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs">Galería / archivo</span>
          </Button>
        </div>
      )}

      {/* Inputs ocultos */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { onFilesSelected(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { onFilesSelected(e.target.files); e.target.value = ""; }}
      />

      {!canUpload && photos.length === 0 && (
        <div className="text-center py-6 text-slate-400">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin fotos registradas</p>
        </div>
      )}

      {photos.length === 5 && (
        <p className="text-xs text-center text-slate-400">
          Se alcanzó el máximo de 5 fotos por muestra.
        </p>
      )}

      <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">Convención de nombres en Drive</p>
        <p>
          Las fotos se guardan como:{" "}
          <span className="font-mono bg-slate-100 px-1 rounded">
            {sampleCode
              .toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "_")}_fotoN.jpg
          </span>
        </p>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <iframe
              src={lightbox.replace("/view", "/preview")}
              className="w-full aspect-video rounded-xl"
              allow="autoplay"
            />
            <div className="flex justify-end gap-2 mt-3">
              <a
                href={lightbox}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-white text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en Drive
              </a>
              <button
                className="text-white text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
                onClick={() => setLightbox(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
