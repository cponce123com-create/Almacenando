import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Heart, Lock, FileVideo, ShieldCheck, Mail, Music, ArrowRight, Flower } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="absolute top-0 inset-x-0 z-50 px-6 py-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-xl">L</span>
          </div>
          <span className="font-serif font-bold text-2xl tracking-tight text-foreground">Legado</span>
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/login" className="text-muted-foreground hover:text-foreground font-medium transition-colors">
            Iniciar Sesión
          </Link>
          <Link href="/register" className="hidden sm:block">
            <Button className="rounded-full px-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              Crear mi legado
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt="Soft elegant abstract background"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-[1.1] tracking-tight">
              Tu historia <span className="text-primary italic">no termina</span> contigo.
            </h1>
            <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Prepara mensajes, videos y documentos importantes para tus seres queridos. Se entregarán de forma segura solo cuando ya no estés. Un acto de amor que trasciende el tiempo.
            </p>
            
            <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/register">
                <Button size="lg" className="rounded-full px-8 py-6 text-lg shadow-xl shadow-primary/25 hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto group">
                  Empezar ahora
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="rounded-full px-8 py-6 text-lg bg-white/50 backdrop-blur-sm border-primary/20 hover:bg-white w-full sm:w-auto">
                  Ver ejemplo
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
              Todo lo que necesitas para tu tranquilidad
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">Protegido con encriptación de nivel bancario.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: FileVideo, title: "Video Final", desc: "Deja un último mensaje en video para las personas que más amas." },
              { icon: Mail, title: "Cartas Personales", desc: "Escribe cartas individuales que se entregarán en el momento justo." },
              { icon: Lock, title: "Información Segura", desc: "Contraseñas, cuentas y documentos legales en un solo lugar." },
              { icon: Music, title: "Playlists y Recuerdos", desc: "Comparte la banda sonora de tu vida o esa receta especial." },
              { icon: Flower, title: "Preferencias Funerarias", desc: "Asegúrate de que tus últimos deseos sean conocidos y respetados." },
              { icon: ShieldCheck, title: "Contactos de Confianza", desc: "Tú decides quién confirma tu partida antes de enviar los mensajes." },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-card border border-border p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-serif text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 bg-secondary/50 relative">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-center mb-16">
            ¿Cómo funciona Legado?
          </h2>

          <div className="space-y-12">
            {[
              { step: "01", title: "Crea tu contenido", desc: "Sube videos, escribe cartas y organiza tus documentos a tu propio ritmo. Puedes editar todo cuando quieras." },
              { step: "02", title: "Elige tus guardianes", desc: "Designa 'Contactos de Confianza'. Solo ellos tendrán el poder de reportar y confirmar tu partida." },
              { step: "03", title: "Entrega segura", desc: "Una vez confirmada tu partida, nuestro sistema entrega automáticamente cada mensaje a la persona indicada." },
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex items-start gap-6 md:gap-8"
              >
                <div className="shrink-0 font-serif text-5xl md:text-7xl font-bold text-primary/20">
                  {item.step}
                </div>
                <div className="pt-2 md:pt-4">
                  <h3 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">{item.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 text-center text-muted-foreground border-t border-border mt-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-primary" />
          <span className="font-serif font-bold text-xl text-foreground">Legado</span>
        </div>
        <p>© {new Date().getFullYear()} Legado. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
