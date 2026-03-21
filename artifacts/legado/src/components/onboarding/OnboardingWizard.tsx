import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Archive, ShieldCheck, Settings, ArrowRight, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "legado_onboarding_done";

const steps = [
  {
    icon: Users,
    emoji: "👤",
    title: "Añade un destinatario",
    description:
      "Los destinatarios son las personas que recibirán tus mensajes y herencia digital. Empieza añadiendo a un ser querido.",
    cta: "Ir a Destinatarios",
    href: "/recipients",
    color: "#9d174d",
    bg: "rgba(157,23,77,0.08)",
  },
  {
    icon: Archive,
    emoji: "✉️",
    title: "Crea tu primer mensaje",
    description:
      "Sube videos, cartas, fotos y documentos que quieres dejar a cada destinatario. Se almacenan cifrados de extremo a extremo.",
    cta: "Crear mensaje",
    href: "/legacy/new",
    color: "#7c3aed",
    bg: "rgba(124,58,237,0.08)",
  },
  {
    icon: ShieldCheck,
    emoji: "🛡️",
    title: "Designa un contacto de confianza",
    description:
      "Son las personas que confirmarán tu partida para que tu legado se libere. Necesitas al menos uno para activar el sistema.",
    cta: "Añadir contacto",
    href: "/trusted-contacts",
    color: "#0369a1",
    bg: "rgba(3,105,161,0.08)",
  },
  {
    icon: Settings,
    emoji: "⚙️",
    title: "Configura la activación",
    description:
      "Define cuántos contactos de confianza deben confirmar para que tu legado se libere y el plazo de espera entre confirmaciones.",
    cta: "Configurar activación",
    href: "/activation",
    color: "#065f46",
    bg: "rgba(6,95,70,0.08)",
  },
];

export function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const goTo = (href: string) => {
    dismiss();
    setLocation(href);
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-0 shadow-2xl">
        {/* Progress bar */}
        <div className="flex gap-1.5 p-5 pb-0">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-all duration-500"
              style={{
                backgroundColor: i <= step ? "#9d174d" : "#e5e7eb",
              }}
            />
          ))}
        </div>

        <div className="p-6 pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}
              className="space-y-5"
            >
              {/* Icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ backgroundColor: current.bg }}
              >
                {current.emoji}
              </div>

              {/* Step indicator */}
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: current.color }}>
                Paso {step + 1} de {steps.length}
              </p>

              {/* Title */}
              <h2 className="font-serif text-2xl font-bold text-gray-900 leading-tight">
                {current.title}
              </h2>

              {/* Description */}
              <p className="text-gray-500 text-[15px] leading-relaxed">
                {current.description}
              </p>

              {/* CTA */}
              <button
                onClick={() => goTo(current.href)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl text-white font-semibold text-[15px] transition-opacity hover:opacity-90"
                style={{ backgroundColor: current.color }}
              >
                <span>{current.cta}</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-0"
                  disabled={step === 0}
                >
                  ← Anterior
                </button>

                {isLast ? (
                  <button
                    onClick={dismiss}
                    className="flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    ¡Listo, empecemos!
                  </button>
                ) : (
                  <button
                    onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                    className="text-sm font-semibold hover:opacity-80 transition-opacity"
                    style={{ color: current.color }}
                  >
                    Siguiente →
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Skip link */}
        <div className="border-t border-gray-100 px-6 py-3 text-center">
          <button
            onClick={dismiss}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Omitir guía de inicio
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
