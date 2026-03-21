import { useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileVideo, Mail, Mic, Image as ImageIcon, FileText, Heart,
  LockKeyhole, Unlock, Eye, EyeOff, Download, Loader2,
  BookOpen, AlertCircle, Globe, ChevronDown, ChevronUp,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decryptFile } from "@/lib/encryption";

type Item = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  contentText?: string | null;
  mediaUrl?: string | null;
  mediaEncryptionIv?: string | null;
  status: string;
};

type AccessData = {
  recipient: {
    fullName: string;
    relationship: string;
    accessType: "all" | "specific";
  };
  items: Item[];
  deceasedName: string;
  deceasedAvatarUrl?: string | null;
  deceasedIntroMessage?: string | null;
};

const TYPE_ICONS: Record<string, any> = {
  letter: BookOpen,
  video: FileVideo,
  audio: Mic,
  photo: ImageIcon,
  document: FileText,
};

const TYPE_LABELS: Record<string, string> = {
  letter: "Carta personal",
  video: "Video",
  audio: "Audio",
  photo: "Fotografía",
  document: "Documento",
};

const TYPE_COLORS: Record<string, string> = {
  letter: "bg-rose-100 text-rose-600",
  video: "bg-violet-100 text-violet-600",
  audio: "bg-indigo-100 text-indigo-600",
  photo: "bg-amber-100 text-amber-600",
  document: "bg-zinc-100 text-zinc-600",
};

function MediaDecryptor({
  item,
  encKey,
}: {
  item: Item;
  encKey: string | null;
}) {
  const [decrypting, setDecrypting] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getMimeType = (type: string) => {
    if (type === "video") return "video/mp4";
    if (type === "audio") return "audio/mpeg";
    if (type === "photo") return "image/jpeg";
    return "application/octet-stream";
  };

  const handleDecrypt = useCallback(async () => {
    if (!encKey || !item.mediaUrl || !item.mediaEncryptionIv) return;
    setDecrypting(true);
    setError(null);
    try {
      const response = await fetch(item.mediaUrl);
      if (!response.ok) throw new Error("No se pudo descargar el archivo");
      const encryptedBuffer = await response.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, encKey, item.mediaEncryptionIv);
      const mime = getMimeType(item.type);
      const blob = new Blob([decryptedBuffer], { type: mime });
      setBlobUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError("Error al descifrar. Verifica que la clave sea correcta.");
    } finally {
      setDecrypting(false);
    }
  }, [encKey, item]);

  if (!item.mediaUrl) return null;

  if (!encKey) {
    return (
      <div className="mt-4 flex items-center gap-3 bg-zinc-100 rounded-xl p-4">
        <LockKeyhole className="w-5 h-5 text-zinc-400 shrink-0" />
        <p className="text-sm text-zinc-500">
          Archivo cifrado — ingresa la clave de acceso arriba para descifrarlo
        </p>
      </div>
    );
  }

  if (blobUrl) {
    if (item.type === "video") {
      return (
        <div className="mt-4">
          <video controls className="w-full rounded-xl bg-black" src={blobUrl}>
            Tu navegador no soporta video.
          </video>
        </div>
      );
    }
    if (item.type === "audio") {
      return (
        <div className="mt-4">
          <audio controls className="w-full" src={blobUrl}>
            Tu navegador no soporta audio.
          </audio>
        </div>
      );
    }
    if (item.type === "photo") {
      return (
        <div className="mt-4">
          <img src={blobUrl} alt={item.title} className="w-full rounded-xl object-contain max-h-96" />
        </div>
      );
    }
    return (
      <div className="mt-4">
        <a href={blobUrl} download={item.title} className="inline-block">
          <Button className="gap-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">
            <Download className="w-4 h-4" />
            Descargar {TYPE_LABELS[item.type] ?? "Archivo"}
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 mb-3 bg-red-50 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      <Button
        onClick={handleDecrypt}
        disabled={decrypting}
        className="gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
      >
        {decrypting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Unlock className="w-4 h-4" />
        )}
        {decrypting ? "Descifrando…" : `Ver ${TYPE_LABELS[item.type] ?? "archivo"}`}
      </Button>
    </div>
  );
}

function LegacyItemCard({ item, encKey, index }: { item: Item; encKey: string | null; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const Icon = TYPE_ICONS[item.type] ?? FileText;
  const colorClass = TYPE_COLORS[item.type] ?? "bg-zinc-100 text-zinc-600";
  const hasMedia = !!item.mediaUrl;
  const hasText = !!item.contentText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12 + 0.3 }}
    >
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-4 p-6 text-left hover:bg-zinc-50/50 transition-colors"
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${colorClass}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-0.5">
              {TYPE_LABELS[item.type] ?? item.type}
            </p>
            <h3 className="font-serif text-xl font-bold text-zinc-900 truncate">{item.title}</h3>
          </div>
          <div className="text-zinc-300 shrink-0">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {/* Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-4">
                {item.description && (
                  <p className="text-zinc-500 text-sm leading-relaxed">{item.description}</p>
                )}

                {hasText && (
                  <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-100">
                    <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-zinc-800">
                      {item.contentText}
                    </p>
                  </div>
                )}

                {hasMedia && (
                  <MediaDecryptor item={item} encKey={encKey} />
                )}

                {!hasText && !hasMedia && (
                  <p className="text-zinc-400 text-sm italic">Este elemento no tiene contenido adjunto.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function AccessPortal() {
  const [, params] = useRoute("/access/:token");
  const token = params?.token || "";

  const [encKey, setEncKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [unlockMode, setUnlockMode] = useState<"key" | "question" | null>(null);
  const [secretQuestion, setSecretQuestion] = useState<string | null>(null);
  const [secretAnswer, setSecretAnswer] = useState("");
  const [unlockingQuestion, setUnlockingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<AccessData>({
    queryKey: ["/access", token],
    queryFn: async () => {
      const res = await fetch(`/api/access/${token}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Token inválido");
      }
      const result = await res.json();
      // Fetch secret question info in parallel
      fetch(`/api/access/${token}/secret-question`)
        .then((r) => r.ok ? r.json() : null)
        .then((q) => { if (q?.secretQuestion) setSecretQuestion(q.secretQuestion); })
        .catch(() => {});
      return result;
    },
    retry: false,
  });

  const hasMediaItems = data?.items.some((i) => !!i.mediaUrl) ?? false;

  const handleUnlockKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setEncKey(trimmed);
    setShowKeyInput(false);
    setUnlockMode(null);
    setKeyInput("");
  };

  const handleUnlockQuestion = async () => {
    if (!secretAnswer.trim()) return;
    setUnlockingQuestion(true);
    setQuestionError(null);
    try {
      const res = await fetch(`/api/access/${token}/unlock-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: secretAnswer.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setQuestionError(d.error || "Respuesta incorrecta");
        return;
      }
      setEncKey(d.encryptionKey);
      setUnlockMode(null);
      setSecretAnswer("");
    } catch {
      setQuestionError("Error de conexión");
    } finally {
      setUnlockingQuestion(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 to-zinc-900">
        <div className="flex flex-col items-center gap-3">
          <Heart className="w-10 h-10 animate-pulse text-rose-400 fill-current" />
          <p className="text-zinc-400 text-sm">Cargando tu legado…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-950 to-zinc-900 text-zinc-400 p-6">
        <LockKeyhole className="w-14 h-14 mb-5 opacity-40 text-zinc-300" />
        <h2 className="text-2xl font-serif text-zinc-200 mb-3">Enlace no válido</h2>
        <p className="text-center max-w-sm text-zinc-400 text-sm leading-relaxed">
          Este enlace de acceso no es válido o ha expirado. Si crees que es un error,
          contacta al equipo de Legado.
        </p>
      </div>
    );
  }

  const { recipient, items, deceasedName, deceasedAvatarUrl, deceasedIntroMessage } = data;

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-violet-900 to-violet-700 text-white">
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          {deceasedAvatarUrl ? (
            <img
              src={deceasedAvatarUrl}
              alt={deceasedName}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-5 ring-4 ring-white/20"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-5">
              <Heart className="w-10 h-10 text-rose-300 fill-current" />
            </div>
          )}
          <h1 className="font-serif text-3xl font-bold mb-1">{deceasedName}</h1>
          <p className="text-violet-200 text-sm">
            dejó esto para ti, <span className="font-semibold text-white">{recipient.fullName}</span>
          </p>

          {recipient.accessType === "all" && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-xs text-violet-100">
              <Globe className="w-3.5 h-3.5" />
              Acceso completo al legado
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Intro message */}
        {deceasedIntroMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-8 text-center"
          >
            <p className="font-serif text-xl text-zinc-600 italic leading-relaxed">
              "{deceasedIntroMessage}"
            </p>
          </motion.div>
        )}

        {/* Encryption key unlock bar */}
        {hasMediaItems && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`my-6 rounded-2xl p-4 border ${
              encKey
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            {encKey ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm font-medium text-green-800">
                    Clave de acceso activa — los archivos se descifrarán al abrirlos
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-green-700 hover:text-green-900 shrink-0"
                  onClick={() => { setEncKey(null); setUnlockMode(null); }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-start gap-2 mb-3">
                  <LockKeyhole className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      Algunos archivos están cifrados
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Para ver videos, fotos, audios y documentos necesitas la clave de acceso
                      que {deceasedName} preparó para ti.
                    </p>
                  </div>
                </div>

                {/* Mode selector buttons */}
                {unlockMode === null && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={() => setUnlockMode("key")}
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Tengo la clave
                    </Button>
                    {secretQuestion && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-xl border-violet-300 text-violet-700 hover:bg-violet-50"
                        onClick={() => setUnlockMode("question")}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Responder pregunta secreta
                      </Button>
                    )}
                  </div>
                )}

                {/* Key input */}
                {unlockMode === "key" && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUnlockKey()}
                        placeholder="Pega la clave de acceso aquí"
                        className="pr-10 rounded-xl font-mono text-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button onClick={handleUnlockKey} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white gap-2 shrink-0">
                      <Unlock className="w-4 h-4" />
                      Activar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-zinc-500" onClick={() => setUnlockMode(null)}>
                      Volver
                    </Button>
                  </div>
                )}

                {/* Secret question input */}
                {unlockMode === "question" && secretQuestion && (
                  <div className="space-y-3">
                    <div className="bg-white/60 rounded-xl px-4 py-3 border border-violet-100">
                      <p className="text-xs text-violet-500 font-medium mb-1">Pregunta secreta</p>
                      <p className="text-sm font-serif text-zinc-800 italic">"{secretQuestion}"</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={secretAnswer}
                        onChange={(e) => {
                          setSecretAnswer(e.target.value.replace(/\s/g, ""));
                          setQuestionError(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleUnlockQuestion()}
                        placeholder="Tu respuesta (una palabra)"
                        className="rounded-xl"
                        autoFocus
                      />
                      <Button
                        onClick={handleUnlockQuestion}
                        disabled={unlockingQuestion || !secretAnswer}
                        className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                      >
                        {unlockingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-zinc-500 shrink-0" onClick={() => { setUnlockMode(null); setQuestionError(null); }}>
                        Volver
                      </Button>
                    </div>
                    {questionError && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {questionError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Items */}
        {items.length === 0 ? (
          <div className="my-12 text-center text-zinc-400">
            <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay contenido disponible en este legado.</p>
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            {items.map((item, i) => (
              <LegacyItemCard key={item.id} item={item} encKey={encKey} index={i} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-xs text-zinc-300">✦ Legado — preservando memorias para siempre</p>
        </div>
      </div>
    </div>
  );
}
