import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  Heart,
  CheckCircle2,
  AlertCircle,
  UserCircle2,
  ShieldAlert,
  Unlock,
} from "lucide-react";

type ReportInfo = {
  reportId: string;
  status: string;
  deceasedName: string;
  deceasedAvatarUrl: string | null;
  reportedByName: string;
  createdAt: string;
};

type Step = "info" | "dni" | "done" | "released";

export default function ConfirmDeath() {
  const [, params] = useRoute("/confirm-death/:reportId");
  const reportId = params?.reportId ?? "";
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("info");
  const [confirmerDni, setConfirmerDni] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: info, isLoading: infoLoading, error: infoError } = useQuery<ReportInfo>({
    queryKey: ["confirm-info", reportId],
    queryFn: async () => {
      const res = await fetch(`/api/public/report-death/confirm-info/${reportId}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Reporte no encontrado");
      }
      return res.json();
    },
    enabled: !!reportId,
    retry: false,
  });

  const handleConfirm = async () => {
    if (!confirmerDni.trim()) { setError("Ingresa tu DNI"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/public/report-death/confirm/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmerDni: confirmerDni.trim().toUpperCase(),
          comments: comments.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al confirmar"); return; }
      if (data.released) {
        setStep("released");
      } else {
        setStep("done");
      }
      toast({ title: "Confirmación enviada" });
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-rose-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-violet-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </Link>
        </div>

        {/* Loading state */}
        {infoLoading && (
          <div className="bg-white rounded-2xl shadow-xl p-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
            <p className="text-sm text-gray-500">Cargando información del reporte…</p>
          </div>
        )}

        {/* Error loading report */}
        {!infoLoading && (infoError || !info) && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-serif font-bold text-gray-900 mb-2">Reporte no encontrado</h2>
            <p className="text-sm text-gray-500 mb-6">
              {(infoError as Error)?.message || "Este enlace de confirmación no es válido o ya expiró."}
            </p>
            <Link href="/">
              <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white">
                Volver al inicio
              </Button>
            </Link>
          </div>
        )}

        {/* Report already processed */}
        {!infoLoading && info && info.status !== "pending" && step !== "done" && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-serif font-bold text-gray-900 mb-2">Reporte ya procesado</h2>
            <p className="text-sm text-gray-500 mb-6">
              Este reporte ya fue confirmado y está siendo revisado por el administrador.
            </p>
            <Link href="/">
              <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white">
                Volver al inicio
              </Button>
            </Link>
          </div>
        )}

        {/* Main flow */}
        {!infoLoading && info && info.status === "pending" && (
          <AnimatePresence mode="wait">

            {/* STEP 1 — Mostrar info del fallecido y pedir DNI */}
            {step === "info" && (
              <motion.div
                key="info"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="bg-white rounded-2xl shadow-xl overflow-hidden"
              >
                {/* Foto y nombre del fallecido */}
                <div className="bg-gradient-to-br from-violet-600 to-violet-800 p-8 flex flex-col items-center text-white">
                  <div className="w-24 h-24 rounded-full overflow-hidden mb-4 ring-4 ring-white/30 bg-violet-500 flex items-center justify-center">
                    {info.deceasedAvatarUrl ? (
                      <img
                        src={info.deceasedAvatarUrl}
                        alt={info.deceasedName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserCircle2 className="w-14 h-14 text-white/60" />
                    )}
                  </div>
                  <h1 className="text-2xl font-serif font-bold text-center">{info.deceasedName}</h1>
                  <p className="text-violet-200 text-sm mt-1 text-center">
                    Reporte de fallecimiento pendiente de confirmación
                  </p>
                </div>

                <div className="p-8 space-y-5">
                  <div className="bg-violet-50 rounded-xl p-4 text-sm">
                    <p className="text-violet-700">
                      <span className="font-semibold">{info.reportedByName}</span> ha reportado el fallecimiento
                      de <span className="font-semibold">{info.deceasedName}</span> y necesita tu confirmación
                      como contacto de confianza.
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ Advertencia</p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Si este reporte es falso, el DNI del responsable quedará registrado y será{" "}
                      <strong>bloqueado permanentemente</strong> del servicio. Actuar de mala fe
                      puede tener consecuencias legales.
                    </p>
                  </div>

                  <Button
                    className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-base flex items-center gap-2"
                    onClick={() => setStep("dni")}
                  >
                    <Heart className="w-4 h-4" />
                    Confirmar fallecimiento
                  </Button>

                  <Link href="/">
                    <Button variant="ghost" className="w-full rounded-xl text-gray-500">
                      No soy contacto de confianza
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}

            {/* STEP 2 — Ingresar DNI del confirmante */}
            {step === "dni" && (
              <motion.div
                key="dni"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="bg-white rounded-2xl shadow-xl p-8"
              >
                <div className="flex flex-col items-center mb-7">
                  <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-3">
                    <ShieldAlert className="w-7 h-7 text-rose-600" />
                  </div>
                  <h2 className="text-xl font-serif font-bold text-gray-900 text-center">
                    Verificar tu identidad
                  </h2>
                  <p className="text-sm text-gray-500 text-center mt-1.5">
                    Ingresa tu DNI para confirmar que eres contacto de confianza de{" "}
                    <span className="font-semibold text-gray-800">{info.deceasedName}</span>.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <BadgeCheck className="w-4 h-4 text-violet-500" />
                      Tu DNI
                    </Label>
                    <Input
                      value={confirmerDni}
                      onChange={(e) => { setConfirmerDni(e.target.value.toUpperCase()); setError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                      placeholder="Ej. 87654321B"
                      className="h-12 rounded-xl uppercase tracking-widest text-base"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Comentarios (opcional)</Label>
                    <Textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Circunstancias, fecha, lugar del fallecimiento…"
                      className="rounded-xl min-h-[70px] resize-none"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setStep("info"); setError(""); }}>
                      Atrás
                    </Button>
                    <Button
                      onClick={handleConfirm}
                      disabled={loading || !confirmerDni.trim()}
                      className="flex-1 h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* DONE — esperando al otro contacto */}
            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-xl p-8 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-serif font-bold text-gray-900 mb-3">Confirmación registrada</h2>
                <p className="text-sm text-gray-500 mb-7 leading-relaxed">
                  Gracias por confirmar. Cuando todos los contactos de confianza hayan confirmado,
                  el legado de <strong>{info.deceasedName}</strong> será liberado automáticamente
                  y sus seres queridos recibirán un enlace de acceso.
                </p>
                <Link href="/">
                  <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-8">
                    Volver al inicio
                  </Button>
                </Link>
              </motion.div>
            )}

            {/* RELEASED — todos confirmaron, legado liberado */}
            {step === "released" && (
              <motion.div
                key="released"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-xl overflow-hidden text-center"
              >
                <div className="bg-gradient-to-br from-violet-600 to-violet-800 p-8 flex flex-col items-center text-white">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4">
                    <Unlock className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold mb-2">Legado liberado</h2>
                  <p className="text-violet-200 text-sm">Todos los contactos han confirmado</p>
                </div>
                <div className="p-8">
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                    Todos los contactos de confianza han confirmado el fallecimiento de{" "}
                    <strong className="text-gray-900">{info.deceasedName}</strong>.
                  </p>
                  <div className="bg-violet-50 rounded-xl p-4 mb-7 text-sm text-violet-700 leading-relaxed">
                    Los destinatarios designados ya han recibido sus enlaces de acceso personales
                    por correo electrónico para ver el legado.
                  </div>
                  <Link href="/">
                    <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-8">
                      Volver al inicio
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
