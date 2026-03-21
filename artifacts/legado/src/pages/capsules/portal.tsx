import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Clock, Heart, FileText, Video } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const BASE = "/api";

export default function CapsulePortal() {
  const [, params] = useRoute("/capsula/:token");
  const token = params?.token ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["capsule-portal", token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/time-capsules/public/${token}`);
      if (!res.ok) throw new Error("Token inválido");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-violet-400" />
          <p className="text-violet-200 text-sm">Abriendo tu cápsula...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#0f0a1e] flex flex-col items-center justify-center p-6 text-center">
        <Clock className="w-16 h-16 text-violet-400/50 mb-6" />
        <h1 className="text-2xl font-serif text-white mb-2">Enlace inválido</h1>
        <p className="text-violet-300/70 max-w-md">
          Esta cápsula no existe o el enlace ya no es válido.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a1e] pb-20">
      {/* Header emocional */}
      <div className="relative pt-20 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-900/40 to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div className="text-6xl mb-6">🕰️</div>
            <p className="text-violet-300 uppercase tracking-widest text-sm font-semibold mb-3">
              Cápsula del tiempo para {data.recipientName}
            </p>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4">
              {data.title}
            </h1>
            <p className="text-violet-200/80 text-lg">
              <strong className="text-white">{data.fromName}</strong> guardó este mensaje el{" "}
              {format(new Date(data.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })},
              esperando este momento especial.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 -mt-8 space-y-6 relative z-20">

        {/* Video */}
        {data.videoUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/5 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10"
          >
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
              <Video className="w-5 h-5 text-violet-400" />
              <span className="text-white font-medium">Mensaje en video</span>
            </div>
            <video
              src={data.videoUrl}
              controls
              className="w-full max-h-[400px] bg-black"
              playsInline
            />
          </motion.div>
        )}

        {/* Carta */}
        {data.letterText && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10"
          >
            <div className="flex items-center gap-3 mb-6">
              <FileText className="w-5 h-5 text-violet-400" />
              <span className="text-white font-medium">Carta personal</span>
            </div>
            <div className="font-serif text-violet-100/90 text-lg leading-relaxed whitespace-pre-wrap italic border-l-4 border-violet-500/40 pl-6">
              "{data.letterText}"
            </div>
            <div className="mt-6 text-right">
              <p className="text-violet-300/70 text-sm font-serif">Con todo mi amor,</p>
              <p className="text-white font-serif font-bold text-lg">{data.fromName}</p>
            </div>
          </motion.div>
        )}

        <div className="text-center pt-8">
          <Heart className="w-8 h-8 text-rose-400/50 mx-auto mb-3 fill-current" />
          <p className="text-violet-300/50 text-sm">
            Guardado con amor en{" "}
            <span className="text-violet-400 font-semibold">Legado</span>
          </p>
          <a
            href="/register"
            className="inline-block mt-3 text-xs text-violet-400/70 hover:text-violet-400 transition-colors underline"
          >
            ¿Quieres crear tu propia cápsula del tiempo?
          </a>
        </div>
      </div>
    </div>
  );
}
