import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Upload, X, ExternalLink, Trash2, Loader2, ImageIcon,
  CheckCircle2, AlertCircle, CloudUpload, Image, Camera,
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

interface PendingFile {
  id: string;
  file: File;
  preview: string;
  status: "ready" | "uploading" | "done" | "error";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const remaining = 5 - photos.length;

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const slots = remaining - pending.filter(p => p.status === "ready").length;
    if (slots <= 0) {
      toast({ title: "Límite alcanzado", description: "Solo se permiten 5 fotos por muestra.", variant: "destructive" });
      return;
    }
    const toAdd = arr.slice(0, slots);
    const newPending: PendingFile[] = toAdd.map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
      status: "ready" as const,
    }));
    setPending(prev => [...prev, ...newPending]);
  }, [remaining, pending, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removePending = (id: string) => {
    setPending(prev => {
      const file = prev.find(p => p.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(p => p.id !== id);
    });
  };

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

  const uploadAll = async () => {
    const readyFiles = pending.filter(p => p.status === "ready");
    if (readyFiles.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    readyFiles.forEach(p => formData.append("photos", p.file));

    setPending(prev => prev.map(p =>
      p.status === "ready" ? { ...p, status: "uploading" as const } : p
    ));

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
        setPending(prev => prev.map(p =>
          p.status === "uploading" ? { ...p, status: "error" as const, error: msg } : p
        ));
        toast({ title: "Error al subir fotos", description: msg, variant: "destructive" });
        return;
      }

      const newPhotos = (body.record?.photos as string[] | null) ?? [];
      setPhotos(newPhotos);
      onUpdate?.(newPhotos);
      qc.invalidateQueries({ queryKey });

      setPending(prev => {
        const uploading = prev.filter(p => p.status === "uploading");
        const uploaded = body.uploaded ?? 0;
        const errors: string[] = body.errors ?? [];
        return prev.map(p => {
          if (p.status !== "uploading") return p;
          const i = uploading.indexOf(p);
          if (i < uploaded) return { ...p, status: "done" as const };
          return { ...p, status: "error" as const, error: errors[i - uploaded] ?? "Error" };
        });
      });

      const uploaded = body.uploaded ?? 0;
      const errCount = (body.errors ?? []).length;
      if (errCount > 0) {
        toast({
          title: `${uploaded} foto(s) subida(s), ${errCount} con error`,
          description: (body.errors as string[]).join(" | "),
          variant: "destructive",
        });
      } else {
        toast({ title: `${uploaded} foto(s) guardada(s) en Google Drive` });
        setTimeout(() => setPending(prev => prev.filter(p => p.status !== "done")), 1500);
      }
    } catch (err) {
      setPending(prev => prev.map(p =>
        p.status === "uploading" ? { ...p, status: "error" as const, error: "Error de red" } : p
      ));
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const hasReady = pending.some(p => p.status === "ready");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          {photos.length}/5 fotos guardadas en Google Drive
        </p>
        {hasReady && !uploading && (
          <Button
            type="button"
            size="sm"
            onClick={uploadAll}
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            Subir {pending.filter(p => p.status === "ready").length} foto(s)
          </Button>
        )}
        {uploading && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo a Drive...
          </div>
        )}
      </div>

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

      {pending.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Pendientes de subir</p>
          <div className="grid grid-cols-3 gap-2">
            {pending.map(p => (
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
                    <div className="absolute inset-0 bg-red-600/40 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
                {p.status === "ready" && !uploading && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    onClick={() => removePending(p.id)}
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

      {canUpload && photos.length < 5 && (
        <>
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-purple-400 bg-purple-50"
                : "border-slate-200 hover:border-purple-300 hover:bg-slate-50"
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Upload className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Arrastrá fotos aquí o hacé clic para seleccionar
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hasta {5 - photos.length} imagen(es) más · JPG, PNG, WEBP · máx. 15 MB c/u
                </p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs gap-2 border-dashed border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
            onClick={e => { e.stopPropagation(); cameraRef.current?.click(); }}
          >
            <Camera className="w-3.5 h-3.5" />
            Tomar foto con la cámara
          </Button>
        </>
      )}

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
          Las fotos se guardan automáticamente como:{" "}
          <span className="font-mono bg-slate-100 px-1 rounded">
            {sampleCode
              .toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "_")}_fotoN.jpg
          </span>
        </p>
      </div>

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
