import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { getEncryptionKey } from "@/lib/encryption";
import { encryptFile } from "@/lib/encryption";
import { getAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Upload,
  X,
  StopCircle,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Lock,
  Check,
  Loader2,
  Plus,
  Trash2,
  Music,
  ExternalLink,
} from "lucide-react";

const MAX_PHOTOS = 5;
const MAX_DOCS = 3;
const MAX_VIDEO_SECONDS = 120;
const SPOTIFY_KEY = "legado_spotify_url";

type LegacyItem = {
  id: string;
  title: string;
  type: string;
  mediaUrl?: string;
  mediaPublicId?: string;
  mediaResourceType?: string;
  mediaEncryptionIv?: string;
  createdAt: string;
};

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function PhotoSlot({
  item,
  onDelete,
  onUpload,
  uploading,
}: {
  item?: LegacyItem;
  onDelete: (id: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (item) {
    return (
      <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
        <div className="w-full h-full bg-gradient-to-br from-violet-100 to-violet-200 flex items-center justify-center">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 text-violet-400 mx-auto" />
            <p className="text-xs text-violet-500 mt-1 px-1 truncate max-w-[80px]">{item.title}</p>
          </div>
        </div>
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={() => onDelete(item.id)}
            className="bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute bottom-1 right-1 bg-green-500 text-white rounded-full p-0.5">
          <Lock className="w-3 h-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-square">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full h-full rounded-xl border-2 border-dashed border-gray-200 hover:border-violet-400 bg-gray-50 hover:bg-violet-50 transition-all flex items-center justify-center text-gray-400 hover:text-violet-500"
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Plus className="w-8 h-8" />
        )}
      </button>
    </div>
  );
}

function VideoRecorder({ onRecordingComplete }: { onRecordingComplete: (blob: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCamera = useCallback((s?: MediaStream | null) => {
    (s || stream)?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stream]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      setStream(s);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.muted = true; videoRef.current.play().catch(() => {}); }
    } catch {
      setError("No se pudo acceder a la cámara. Verifica los permisos del navegador.");
    }
  };

  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      onRecordingComplete(blob);
      stopCamera(stream);
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
    mr.start(1000);
    setRecorder(mr);
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    autoStopRef.current = setTimeout(() => { if (mr.state !== "inactive") mr.stop(); }, MAX_VIDEO_SECONDS * 1000);
  };

  const stopRecording = () => { if (recorder && recorder.state !== "inactive") recorder.stop(); };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg p-3">{error}</p>}
      {!stream && (
        <button onClick={startCamera} className="flex items-center gap-2 justify-center w-full py-4 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-all font-medium">
          <Camera className="w-5 h-5" /> Activar cámara
        </button>
      )}
      {stream && (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} autoPlay playsInline className="w-full aspect-video object-cover" />
          {recording && (
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-sm font-mono bg-black/60 px-2 py-0.5 rounded-full">
                {formatTime(elapsed)} / {formatTime(MAX_VIDEO_SECONDS)}
              </span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0">
            {recording && (
              <div className="h-1 bg-white/20">
                <div className="h-full bg-red-500 transition-all" style={{ width: `${(elapsed / MAX_VIDEO_SECONDS) * 100}%` }} />
              </div>
            )}
            <div className="p-3 flex justify-center">
              {!recording ? (
                <button onClick={startRecording} className="bg-red-500 text-white rounded-full px-6 py-2 font-medium flex items-center gap-2 hover:bg-red-600">
                  <StopCircle className="w-4 h-4" /> Iniciar grabación
                </button>
              ) : (
                <button onClick={stopRecording} className="bg-white text-red-600 rounded-full px-6 py-2 font-medium flex items-center gap-2 hover:bg-gray-100">
                  <StopCircle className="w-4 h-4" /> Detener
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {recording && <p className="text-xs text-center text-gray-400">Se detiene automáticamente a los 2 minutos</p>}
    </div>
  );
}

async function uploadAndSave(
  file: File | Blob,
  fileName: string,
  type: string,
  title: string,
  token: string
): Promise<void> {
  const encKey = getEncryptionKey();
  if (!encKey) throw new Error("No hay clave de cifrado. Cierra sesión y vuelve a iniciar.");

  const fileObj = file instanceof File ? file : new File([file], fileName, { type: "video/webm" });
  const originalMimeType = fileObj.type;
  const { encryptedBlob, ivBase64 } = await encryptFile(fileObj, encKey);

  const uploadForm = new FormData();
  uploadForm.append("file", encryptedBlob, fileName);
  uploadForm.append("originalMimeType", originalMimeType);
  const uploadRes = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: uploadForm,
  });
  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error((errData as any).error || "Error al subir el archivo");
  }
  const { url, publicId, resourceType } = await uploadRes.json();

  const itemRes = await fetch("/api/legacy-items", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      title,
      mediaUrl: url,
      mediaPublicId: publicId,
      mediaResourceType: resourceType,
      mediaEncryptionIv: ivBase64,
      status: "active",
    }),
  });
  if (!itemRes.ok) throw new Error("Error al guardar el elemento");
}

export default function MediaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken() || "";

  const [photoUploading, setPhotoUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState(() => localStorage.getItem(SPOTIFY_KEY) || "");
  const [spotifyInput, setSpotifyInput] = useState(() => localStorage.getItem(SPOTIFY_KEY) || "");
  const videoFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  const saveSpotify = () => {
    const url = spotifyInput.trim();
    if (url && !url.includes("spotify.com") && !url.includes("open.spotify")) {
      toast({ title: "URL de Spotify inválida", variant: "destructive" });
      return;
    }
    localStorage.setItem(SPOTIFY_KEY, url);
    setSpotifyUrl(url);
    toast({ title: url ? "Spotify vinculado" : "Spotify desvinculado" });
  };

  const { data: items = [], isLoading } = useQuery<LegacyItem[]>({
    queryKey: ["media-items"],
    queryFn: async () => {
      const res = await fetch("/api/legacy-items", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data = await res.json();
      return (data as LegacyItem[]).filter((i) => i.mediaUrl);
    },
  });

  const photos = items.filter((i) => i.type === "photo").slice(0, MAX_PHOTOS);
  const video = items.find((i) => i.type === "video");
  const docs = items.filter((i) => i.type === "document").slice(0, MAX_DOCS);

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/legacy-items/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await queryClient.invalidateQueries({ queryKey: ["media-items"] });
      toast({ title: "Eliminado" });
    } catch {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  }

  async function handlePhotoUpload(file: File) {
    if (photos.length >= MAX_PHOTOS) {
      toast({ title: `Máximo ${MAX_PHOTOS} fotos`, variant: "destructive" });
      return;
    }
    setPhotoUploading(true);
    try {
      await uploadAndSave(file, file.name, "photo", `Foto ${photos.length + 1}`, token);
      await queryClient.invalidateQueries({ queryKey: ["media-items"] });
      toast({ title: "Foto guardada", description: "Cifrada y guardada correctamente." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo guardar la foto.", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleVideoUpload(file: File | Blob) {
    setVideoUploading(true);
    setShowRecorder(false);
    setRecordedBlob(null);
    try {
      await uploadAndSave(file, "video.webm", "video", "Mi video", token);
      await queryClient.invalidateQueries({ queryKey: ["media-items"] });
      toast({ title: "Video guardado", description: "Cifrado y guardado correctamente." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo guardar el video.", variant: "destructive" });
    } finally {
      setVideoUploading(false);
    }
  }

  async function handleDocUpload(file: File) {
    if (docs.length >= MAX_DOCS) {
      toast({ title: `Máximo ${MAX_DOCS} documentos`, variant: "destructive" });
      return;
    }
    setDocUploading(true);
    try {
      const title = file.name.replace(/\.[^/.]+$/, "").slice(0, 60);
      await uploadAndSave(file, file.name, "document", title, token);
      await queryClient.invalidateQueries({ queryKey: ["media-items"] });
      toast({ title: "Documento guardado", description: "Cifrado y guardado correctamente." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo guardar el documento.", variant: "destructive" });
    } finally {
      setDocUploading(false);
    }
  }

  const EncryptionBadge = () => (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      <Lock className="w-3 h-3" />
      <span>Cifrado AES-256 antes de subir</span>
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="font-serif text-2xl text-gray-900">Mis Medios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Todo se cifra en tu dispositivo antes de guardarse. Nadie más puede ver tu contenido.
          </p>
        </div>

        {/* PHOTOS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-violet-500" />
              <h2 className="font-semibold text-gray-800">Fotos</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                <PhotoSlot
                  key={i}
                  item={photos[i]}
                  onDelete={handleDelete}
                  onUpload={handlePhotoUpload}
                  uploading={photoUploading && i === photos.length}
                />
              ))}
            </div>
          )}
          <EncryptionBadge />
        </section>

        {/* VIDEO */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VideoIcon className="w-5 h-5 text-violet-500" />
              <h2 className="font-semibold text-gray-800">Video</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {video ? "1/1" : "0/1"}
            </span>
          </div>

          {videoUploading ? (
            <div className="rounded-xl border border-violet-100 bg-violet-50 p-8 flex items-center justify-center gap-3 text-violet-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Cifrando y subiendo video…</span>
            </div>
          ) : video ? (
            <div className="relative rounded-xl bg-gray-900 aspect-video flex items-center justify-center">
              <div className="text-center">
                <VideoIcon className="w-10 h-10 text-white/30 mx-auto" />
                <p className="text-white/50 text-sm mt-2">Video cifrado guardado</p>
                <div className="flex items-center justify-center gap-1 text-green-400 text-xs mt-1">
                  <Check className="w-3 h-3" />
                  <span>AES-256-GCM</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(video.id)}
                className="absolute top-2 right-2 bg-red-500/80 text-white rounded-full p-1.5 hover:bg-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : recordedBlob ? (
            <div className="space-y-3">
              <video src={URL.createObjectURL(recordedBlob)} controls className="w-full rounded-xl aspect-video bg-black" />
              <div className="flex gap-2">
                <Button onClick={() => handleVideoUpload(recordedBlob)} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                  <Upload className="w-4 h-4 mr-2" /> Guardar este video
                </Button>
                <Button variant="outline" onClick={() => { setRecordedBlob(null); setShowRecorder(true); }}>
                  Repetir
                </Button>
              </div>
            </div>
          ) : showRecorder ? (
            <VideoRecorder onRecordingComplete={(blob) => { setRecordedBlob(blob); setShowRecorder(false); }} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowRecorder(true)}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-all"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm font-medium">Grabar ahora</span>
                <span className="text-xs text-violet-400">Máx. 2 minutos</span>
              </button>
              <button
                onClick={() => videoFileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">Subir archivo</span>
                <span className="text-xs text-gray-400">MP4, MOV, WebM</span>
              </button>
            </div>
          )}

          <input ref={videoFileRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ""; }} />
          <EncryptionBadge />
        </section>

        {/* DOCUMENTS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-500" />
              <h2 className="font-semibold text-gray-800">Documentos</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {docs.length}/{MAX_DOCS}
            </span>
          </div>

          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <Lock className="w-3 h-3" /><span>Cifrado</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(doc.id)} className="text-gray-400 hover:text-red-500 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {docs.length < MAX_DOCS && (
              <button
                onClick={() => docFileRef.current?.click()}
                disabled={docUploading}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50 transition-all"
              >
                {docUploading ? <Loader2 className="w-5 h-5 animate-spin ml-1" /> : <Plus className="w-5 h-5 ml-1" />}
                <span className="text-sm font-medium">{docUploading ? "Cifrando y subiendo…" : "Agregar documento"}</span>
                <span className="text-xs text-gray-400 ml-auto">PDF, Word, Excel…</span>
              </button>
            )}
          </div>

          <input ref={docFileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = ""; }} />
          <EncryptionBadge />
        </section>

        {/* SPOTIFY */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-green-500" />
            <h2 className="font-semibold text-gray-800">Música — Vincular Spotify</h2>
          </div>

          {spotifyUrl ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-100">
              <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
                <Music className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">Spotify vinculado</p>
                <a
                  href={spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:underline flex items-center gap-1 truncate"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate">{spotifyUrl}</span>
                </a>
              </div>
              <button
                onClick={() => { setSpotifyInput(""); localStorage.removeItem(SPOTIFY_KEY); setSpotifyUrl(""); }}
                className="text-gray-400 hover:text-red-500 p-1 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={spotifyInput}
                  onChange={(e) => setSpotifyInput(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="flex-1 h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <Button onClick={saveSpotify} className="bg-green-600 hover:bg-green-700 text-white rounded-xl h-11 px-4">
                  Vincular
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Pega el enlace de una playlist, álbum o canción de Spotify para que suene en tu ceremonia.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
