import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BadgeCheck, Loader2, Heart, Users, CheckCircle2, AlertCircle } from "lucide-react";

type Step = "deceased_dni" | "reporter_dni" | "confirm" | "done";

type ValidateResult = {
  valid: boolean;
  contactId: string;
  contactName: string;
  deceasedName: string;
  deceasedUserId: string;
  otherContacts: { id: string; fullName: string }[];
};

export default function ReportDeath() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("deceased_dni");
  const [deceasedDni, setDeceasedDni] = useState("");
  const [reporterDni, setReporterDni] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [error, setError] = useState("");

  const handleValidate = async () => {
    if (!deceasedDni.trim() || !reporterDni.trim()) {
      setError("Ambos DNI son requeridos");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/report-death/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deceasedDni: deceasedDni.trim().toUpperCase(),
          reporterDni: reporterDni.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error de validación");
        return;
      }
      setValidateResult(data);
      setStep("confirm");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateResult) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/report-death/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: validateResult.contactId,
          deceasedUserId: validateResult.deceasedUserId,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al enviar el reporte");
        return;
      }
      setStep("done");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-lavender-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-violet-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </Link>
        </div>

        <AnimatePresence mode="wait">
          {(step === "deceased_dni" || step === "reporter_dni") && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-2xl shadow-xl p-8"
            >
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-3">
                  <Heart className="w-7 h-7 text-violet-600" />
                </div>
                <h1 className="text-xl font-serif font-bold text-gray-900 text-center">
                  Reportar Fallecimiento
                </h1>
                <p className="text-sm text-gray-500 text-center mt-1">
                  Solo los contactos de confianza registrados pueden iniciar este proceso.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-gray-400" />
                    DNI de la persona fallecida
                  </Label>
                  <Input
                    value={deceasedDni}
                    onChange={(e) => setDeceasedDni(e.target.value.toUpperCase())}
                    placeholder="Ej. 12345678A"
                    className="h-11 rounded-xl uppercase tracking-widest"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-violet-500" />
                    Tu DNI (contacto de confianza)
                  </Label>
                  <Input
                    value={reporterDni}
                    onChange={(e) => setReporterDni(e.target.value.toUpperCase())}
                    placeholder="Ej. 87654321B"
                    className="h-11 rounded-xl uppercase tracking-widest"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  onClick={handleValidate}
                  disabled={loading || !deceasedDni.trim() || !reporterDni.trim()}
                  className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verificar identidad"}
                </Button>
              </div>
            </motion.div>
          )}

          {step === "confirm" && validateResult && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-2xl shadow-xl p-8"
            >
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-3">
                  <Users className="w-7 h-7 text-violet-600" />
                </div>
                <h2 className="text-xl font-serif font-bold text-gray-900 text-center">
                  Confirmar reporte
                </h2>
              </div>

              <div className="bg-violet-50 rounded-xl p-4 mb-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Persona fallecida:</span>
                  <span className="font-semibold text-gray-900">{validateResult.deceasedName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reportado por:</span>
                  <span className="font-semibold text-violet-700">{validateResult.contactName}</span>
                </div>
              </div>

              {validateResult.otherContacts.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5">
                  <p className="text-xs font-semibold text-amber-700 mb-1">¿Qué sucede después?</p>
                  <p className="text-xs text-amber-600">
                    El otro contacto de confianza también deberá confirmar. Una vez ambos confirmen, el admin revisará y liberará el legado.
                  </p>
                  {validateResult.otherContacts.map((c) => (
                    <p key={c.id} className="text-xs text-amber-700 font-medium mt-1">• {c.fullName}</p>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 mb-5">
                <Label>Notas adicionales (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Circunstancias, lugar, fecha del fallecimiento…"
                  className="rounded-xl min-h-[80px]"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => { setStep("deceased_dni"); setError(""); }}
                >
                  Atrás
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar reporte"}
                </Button>
              </div>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-serif font-bold text-gray-900 mb-2">Reporte enviado</h2>
              <p className="text-sm text-gray-500 mb-6">
                Hemos registrado el reporte. El otro contacto de confianza deberá confirmarlo también para que el administrador pueda revisar y liberar el legado.
              </p>
              <Link href="/">
                <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white">
                  Volver al inicio
                </Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
