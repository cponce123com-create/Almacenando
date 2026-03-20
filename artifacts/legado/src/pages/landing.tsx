import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Heart, 
  Lock, 
  Play, 
  Mail, 
  Image as ImageIcon, 
  Music, 
  FolderOpen, 
  Upload, 
  Users, 
  ShieldCheck, 
  Asterisk, 
  ChevronRight,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export default function Landing() {
  const [dniQuery, setDniQuery] = useState("");
  const [dniResult, setDniResult] = useState<"found" | "not_found" | null>(null);
  const [dniLoading, setDniLoading] = useState(false);

  async function handleDniSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = dniQuery.trim().toUpperCase();
    if (!q || q.length < 3) return;
    setDniLoading(true);
    setDniResult(null);
    try {
      const res = await fetch(`/api/public/legacy-check?dni=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      const { hasLegacy } = await res.json();
      setDniResult(hasLegacy ? "found" : "not_found");
    } catch {
      setDniResult("not_found");
    } finally {
      setDniLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="absolute top-0 inset-x-0 z-50 px-6 py-6 flex justify-between items-center max-w-7xl mx-auto w-full text-white">
        <div className="flex items-center gap-2">
          <Asterisk className="w-6 h-6" />
          <span className="font-serif font-bold text-xl tracking-tight">Legado</span>
        </div>
        <div className="hidden md:flex gap-8 items-center text-sm font-medium">
          <Link href="/" className="hover:text-white/80 transition-colors">Inicio</Link>
          <Link href="/dashboard" className="hover:text-white/80 transition-colors">Mi legado</Link>
          <Link href="#como-funciona" className="hover:text-white/80 transition-colors">Cómo funciona</Link>
          <Link href="/login" className="hover:text-white/80 transition-colors">Ingresar</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-40 lg:pt-48 lg:pb-48 px-6 min-h-[70vh] flex flex-col justify-center">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt="Lake and mountains at dusk"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30"></div>
        </div>

        <div className="relative z-10 max-w-3xl mx-auto text-center mt-[-4rem]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-normal text-white leading-tight">
              Tu historia no termina contigo
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl mx-auto font-light">
              Deja mensajes, recuerdos y decisiones para las personas que más quieres.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/register">
                <Button size="lg" className="rounded-xl px-8 py-6 text-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white border-0">
                  Crear mi legado
                </Button>
              </Link>
              <Link href="#como-funciona">
                <Button size="lg" variant="outline" className="rounded-xl px-8 py-6 text-lg bg-white/20 backdrop-blur-sm border border-white/40 text-white hover:bg-white/30">
                  Ver cómo funciona
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* DNI Search Section */}
      <section className="relative z-20 px-4 pt-10 pb-4 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-100 p-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-5 h-5 text-violet-500" />
            <h2 className="font-semibold text-gray-900 text-base">¿Alguien dejó un legado?</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Ingresa el número de DNI de la persona. Solo te diremos si existe o no — ningún dato personal será revelado.
          </p>
          <form onSubmit={handleDniSearch} className="flex gap-2">
            <Input
              value={dniQuery}
              onChange={(e) => { setDniQuery(e.target.value.toUpperCase()); setDniResult(null); }}
              placeholder="Ej. 12345678A"
              className="flex-1 uppercase tracking-widest font-mono"
              maxLength={20}
            />
            <Button
              type="submit"
              disabled={dniLoading || dniQuery.trim().length < 3}
              className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
            >
              {dniLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          <AnimatePresence>
            {dniResult && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                {dniResult === "found" ? (
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-green-800 text-sm">Sí hay legado registrado</p>
                      <p className="text-xs text-green-600 mt-0.5">
                        Esta persona dejó mensajes y recuerdos para sus seres queridos. Serán entregados en el momento indicado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <XCircle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-700 text-sm">No encontramos un legado para ese DNI</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Puede que la persona no haya registrado un legado o que el DNI sea distinto.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* Feature Cards Row (Overlapping hero) */}
      <section className="relative z-20 px-4 max-w-7xl mx-auto w-full">
        <div className="flex flex-row overflow-x-auto pb-4 gap-4 snap-x hide-scrollbar md:justify-center">
          {[
            { icon: Play, title: "Video final", desc: "Graba un mensaje", bg: "bg-indigo-100", color: "text-indigo-600" },
            { icon: Mail, title: "Cartas personales", desc: "Tus mensajes privados", bg: "bg-amber-100", color: "text-amber-600" },
            { icon: ImageIcon, title: "Recuerdos", desc: "Fotos y audios", bg: "bg-blue-100", color: "text-blue-600" },
            { icon: Music, title: "Playlist", desc: "Tu música especial", bg: "bg-rose-100", color: "text-rose-600" },
            { icon: FolderOpen, title: "Info importante", desc: "Documentos y claves", bg: "bg-orange-100", color: "text-orange-600" },
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + (i * 0.1) }}
              className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-4 flex items-center gap-4 min-w-[240px] snap-center shrink-0"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${feature.bg}`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900 text-sm md:text-base">{feature.title}</span>
                <span className="text-xs md:text-sm text-gray-500">{feature.desc}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="flex justify-center gap-4 mt-6 md:mt-8">
          <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
            <Lock className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium">Seguro y privado</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
            <Heart className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium">Entrega automática</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-24 px-6 relative bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-gray-900 mb-12 text-left">
            ¿Cómo funciona?
          </h2>

          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">
            {/* Left Column - Steps */}
            <div className="w-full lg:w-[40%] flex flex-col gap-4">
              {[
                { 
                  step: "1. Creas tu legado", 
                  desc: "Sube videos, cartas y fotos", 
                  icon: Upload,
                  gradient: "bg-gradient-to-br from-purple-100 to-purple-50",
                  iconColor: "text-purple-600"
                },
                { 
                  step: "2. Defines a quién va", 
                  desc: "Elige tus destinatarios", 
                  icon: Users,
                  gradient: "bg-gradient-to-br from-blue-100 to-blue-50",
                  iconColor: "text-blue-600"
                },
                { 
                  step: "3. Se entrega al fallecer", 
                  desc: "Solo cuando se confirma", 
                  icon: ShieldCheck,
                  gradient: "bg-gradient-to-br from-emerald-100 to-emerald-50",
                  iconColor: "text-emerald-600"
                },
              ].map((item, i) => (
                <div 
                  key={i}
                  className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 shadow-sm"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${item.gradient}`}>
                    <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.step}</h3>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column - Image & List */}
            <div className="w-full lg:w-[60%] flex flex-col">
              <div className="rounded-2xl overflow-hidden shadow-lg aspect-[4/3] relative">
                <img 
                  src={`${import.meta.env.BASE_URL}images/family-bg.jpg`} 
                  alt="Familia compartiendo" 
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="mt-8 grid grid-cols-2 gap-y-4 gap-x-8">
                {[
                  "Video de despedida",
                  "Cartas privadas",
                  "Álbum de recuerdos",
                  "Mensajes especiales"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Heart className="w-5 h-5 text-[#7C3AED] fill-[#7C3AED]" />
                    <span className="text-gray-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-20 flex justify-center">
            <Link href="/register" className="w-full max-w-md">
              <Button size="lg" className="w-full rounded-full px-8 py-7 text-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-xl shadow-purple-500/20">
                Crear mi legado ahora
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center bg-white border-t border-gray-100 mt-auto">
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-400">
          <Link href="#como-funciona" className="hover:text-gray-600 transition-colors">Cómo funciona</Link>
          <span>›</span>
          <Link href="#" className="hover:text-gray-600 transition-colors">Preguntas frecuentes</Link>
          <span>›</span>
          <Link href="#" className="hover:text-gray-600 transition-colors">Política de privacidad</Link>
          <span>›</span>
          <Link href="#" className="hover:text-gray-600 transition-colors">Contacto</Link>
        </div>
      </footer>
      
      {/* Hide scrollbar for feature cards */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
