import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Heart,
  Users,
  CheckCircle2,
  AlertCircle,
  UserCircle2,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { DniInput } from "@/components/ui/dni-input";

type Step = "lookup" | "contacts" | "reporter_dni" | "confirm" | "done";

async function uploadCertificateImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/public/report-death/upload-certificate", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any).error || "Error al subir la imagen");
  }
  const { url } = await res.json();
  return url as string;
}

type LookupResult = {
  deceasedName: string;
  deceasedUserId: string;
  trustedContacts: { id: string; fullName: string }[];
};

type ValidateResult = {
  valid: boolean;
  contactId: string;
  contactName: string;
  otherContacts: { id: string; fullName: string }[];
};

const PRIMARY = "#9d174d";
const PRIMARY_BG = "rgba(157,23,77,0.08)";
const PRIMARY_BORDER = "rgba(157,23,77,0.2)";

export default function ReportDeath() {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("lookup");
  const [deceasedDni, setDeceasedDni] = useState("");
  const [reporterDni, setReporterDni] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [error, setError] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPersonFile, setCertPersonFile] = useState<File | null>(null);

  const handleLookup = async () => {
    if (!deceasedDni.trim()) { setError("Ingresa el DNI del fallecido"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/report-death/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deceasedDni: deceasedDni.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "DNI no encontrado"); return; }
      setLookupResult(data);
      setStep("contacts");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!reporterDni.trim()) { setError("Ingresa tu DNI"); return; }
    if (!lookupResult) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/report-death/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deceasedUserId: lookupResult.deceasedUserId,
          reporterDni: reporterDni.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "DNI no autorizado"); return; }
      setValidateResult(data);
      setStep("confirm");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateResult || !lookupResult) return;
    setLoading(true);
    try {
      let certificateImageUrl: string | undefined;
      let certificateWithPersonUrl: string | undefined;
      if (certFile) certificateImageUrl = await uploadCertificateImage(certFile);
      if (certPersonFile) certificateWithPersonUrl = await uploadCertificateImage(certPersonFile);

      const res = await fetch("/api/public/report-death/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: validateResult.contactId,
          deceasedUserId: lookupResult.deceasedUserId,
          deceasedName: lookupResult.deceasedName,
          reporterDni: reporterDni.trim().toUpperCase(),
          notes: notes.trim() || undefined,
          certificateImageUrl,
          certificateWithPersonUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al enviar el reporte"); return; }
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const resetError = () => setError("");

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #fdf2f8 0%, #ffffff 50%, #fdf2f8 100%)" }}>
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </Link>
        </div>

        <AnimatePresence mode="wait">

          {/* STEP 1 — DNI del fallecido */}
          {step === "lookup" && (
            <motion.div
              key="lookup"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-2xl shadow-xl p-8"
            >
              <div className="flex flex-col items-center mb-7">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: PRIMARY_BG }}>
                  <Heart className="w-7 h-7" style={{ color: PRIMARY }} />
                </div>
                <h1 className="text-xl font-serif font-bold text-gray-900 text-center">Reportar Fallecimiento</h1>
                <p className="text-sm text-gray-500 text-center mt-1.5 leading-relaxed">
                  Ingresa el DNI de la persona fallecida para identificar quiénes son sus contactos de confianza.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <BadgeCheck className="w-4 h-4 text-gray-400" />
                    DNI de la persona fallecida
                  </Label>
                  <Input
                    value={deceasedDni}
                    onChange={(e) => { setDeceasedDni(e.target.value.toUpperCase()); resetError(); }}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                    placeholder="Ej. 12345678A"
                    className="h-12 rounded-xl uppercase tracking-widest text-base"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  onClick={handleLookup}
                  disabled={loading || !deceasedDni.trim()}
                  className="w-full h-12 rounded-xl text-base text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Buscar"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2 — Mostrar contactos de confianza */}
          {step === "contacts" && lookupResult && (
            <motion.div
              key="contacts"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-2xl shadow-xl p-8"
            >
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: PRIMARY_BG }}>
                  <Users className="w-7 h-7" style={{ color: PRIMARY }} />
                </div>
                <h2 className="text-xl font-serif font-bold text-gray-900 text-center">
                  Contactos de confianza
                </h2>
                <p className="text-sm text-gray-500 text-center mt-1.5">
                  de <span className="font-semibold text-gray-800">{lookupResult.deceasedName}</span>
                </p>
              </div>

              <p className="text-sm text-gray-500 mb-4 text-center">
                Las siguientes personas están registradas como contactos de confianza:
              </p>

              <div className="space-y-2 mb-7">
                {lookupResult.trustedContacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl"
                    style={{ backgroundColor: PRIMARY_BG, border: `1px solid ${PRIMARY_BORDER}` }}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(157,23,77,0.15)" }}>
                      <UserCircle2 className="w-5 h-5" style={{ color: PRIMARY }} />
                    </div>
                    <span className="font-medium text-gray-800">{c.fullName}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 text-center mb-6">
                Si eres uno de estos contactos, puedes iniciar el informe de fallecimiento.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => { setStep("lookup"); resetError(); }}
                >
                  Atrás
                </Button>
                <Button
                  className="flex-1 rounded-xl text-white flex items-center gap-2"
                  style={{ backgroundColor: PRIMARY }}
                  onClick={() => { setStep("reporter_dni"); resetError(); }}
                >
                  <FileText className="w-4 h-4" />
                  Realizar informe
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2b — DNI del reportante */}
          {step === "reporter_dni" && lookupResult && (
            <motion.div
              key="reporter_dni"
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
                <p className="text-sm text-gray-500 text-center mt-1.5 leading-relaxed">
                  Ingresa tu DNI para confirmar que eres uno de los contactos de confianza de{" "}
                  <span className="font-semibold text-gray-800">{lookupResult.deceasedName}</span>.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ Advertencia importante</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Si este reporte es falso, tu DNI quedará registrado y podrá ser{" "}
                  <strong>bloqueado permanentemente</strong> del sistema. Nunca más podrás utilizar el servicio de Legado.
                </p>
              </div>

              <div className="space-y-5">
                <DniInput
                  value={reporterDni}
                  onChange={(digits) => { setReporterDni(digits); resetError(); }}
                  onResolved={(data) => {
                    setReporterName(data.fullName);
                  }}
                  onClear={() => setReporterName("")}
                  label="Tu número de DNI"
                  required
                />

                {reporterName && (
                  <p className="text-sm text-green-700 font-medium">
                    Reportando como: <strong>{reporterName}</strong>
                  </p>
                )}

                {error && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => { setStep("contacts"); resetError(); }}
                  >
                    Atrás
                  </Button>
                  <Button
                    onClick={handleValidate}
                    disabled={loading || reporterDni.length !== 8}
                    className="flex-1 h-12 rounded-xl text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verificar"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — Confirmar y enviar */}
          {step === "confirm" && validateResult && lookupResult && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-2xl shadow-xl p-8"
            >
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="text-xl font-serif font-bold text-gray-900 text-center">
                  Confirmar reporte
                </h2>
              </div>

              <div className="rounded-xl p-4 mb-5 space-y-2" style={{ backgroundColor: PRIMARY_BG }}>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Persona fallecida:</span>
                  <span className="font-semibold text-gray-900">{lookupResult.deceasedName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reportado por:</span>
                  <span className="font-semibold" style={{ color: PRIMARY }}>{validateResult.contactName}</span>
                </div>
              </div>

              {validateResult.otherContacts.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5">
                  <p className="text-xs font-semibold text-amber-700 mb-2">¿Qué sucede después?</p>
                  <p className="text-xs text-amber-600 leading-relaxed">
                    Se notificará por correo al otro contacto de confianza. Una vez ambos confirmen, el administrador revisará y liberará el legado.
                  </p>
                  {validateResult.otherContacts.map((c) => (
                    <p key={c.id} className="text-xs text-amber-700 font-medium mt-1">• {c.fullName}</p>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 mb-5">
                <Label className="text-sm">Notas adicionales (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Circunstancias, fecha, lugar del fallecimiento…"
                  className="rounded-xl min-h-[80px] resize-none"
                />
              </div>

              <div className="space-y-3 mb-5">
                <div className="rounded-xl p-3" style={{ backgroundColor: PRIMARY_BG, border: `1px solid ${PRIMARY_BORDER}` }}>
                  <p className="text-xs font-medium mb-1" style={{ color: PRIMARY }}>📎 Documentación fotográfica (opcional)</p>
                  <p className="text-xs leading-relaxed" style={{ color: "#7c1d45" }}>
                    Adjuntar fotos agiliza significativamente la revisión y aprobación del legado.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-600">
                    📄 Foto del certificado de defunción (opcional pero recomendado)
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      id="cert-file"
                      className="hidden"
                      onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                    />
                    <label
                      htmlFor="cert-file"
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer transition-all text-sm text-gray-500"
                    >
                      {certFile ? (
                        <span className="text-green-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> {certFile.name.slice(0, 30)}
                        </span>
                      ) : (
                        <span>Seleccionar imagen</span>
                      )}
                    </label>
                    {certFile && (
                      <button type="button" onClick={() => setCertFile(null)} className="text-gray-400 hover:text-red-500 p-1">
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-600">
                    🤳 Foto sosteniéndolo (opcional pero recomendado)
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      id="cert-person-file"
                      className="hidden"
                      onChange={(e) => setCertPersonFile(e.target.files?.[0] ?? null)}
                    />
                    <label
                      htmlFor="cert-person-file"
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer transition-all text-sm text-gray-500"
                    >
                      {certPersonFile ? (
                        <span className="text-green-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> {certPersonFile.name.slice(0, 30)}
                        </span>
                      ) : (
                        <span>Seleccionar imagen</span>
                      )}
                    </label>
                    {certPersonFile && (
                      <button type="button" onClick={() => setCertPersonFile(null)} className="text-gray-400 hover:text-red-500 p-1">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setStep("reporter_dni"); resetError(); }}>
                  Atrás
                </Button>
                <Button
                  className="flex-1 rounded-xl text-white"
                  style={{ backgroundColor: PRIMARY }}
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar reporte"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* DONE */}
          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-serif font-bold text-gray-900 mb-3">Reporte enviado</h2>
              <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                Hemos registrado el reporte y hemos notificado al otro contacto de confianza por correo electrónico.
              </p>
              <p className="text-sm text-gray-500 mb-7 leading-relaxed">
                Una vez ambos contactos confirmen, el administrador revisará el caso y decidirá si se libera el legado.
              </p>
              <Link href="/">
                <Button className="rounded-xl text-white px-8" style={{ backgroundColor: PRIMARY }}>
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
