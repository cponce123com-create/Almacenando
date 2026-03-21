import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2, AlertCircle, CheckCircle2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ContactInfo = {
  contactId: string;
  contactName: string;
  ownerName: string;
  userId: string;
  pendingReportId: string | null;
};

export default function ConfirmContact() {
  const [, params] = useRoute("/confirm/:token");
  const token = params?.token ?? "";

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data: info, isLoading, isError } = useQuery<ContactInfo>({
    queryKey: ["confirm-contact-info", token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/activation/trusted-contact-info/${token}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).error ?? "Token inválido");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const handleReport = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`${BASE}/api/activation/death-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: token, notes }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ type: "error", message: (d as any).error ?? "Error al enviar el reporte" });
      } else {
        setResult({
          type: "success",
          message: "Reporte enviado correctamente. Los demás contactos de confianza recibirán un correo para confirmar.",
        });
      }
    } catch {
      setResult({ type: "error", message: "Error de conexión. Intenta de nuevo." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!info?.pendingReportId) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`${BASE}/api/activation/death-reports/${info.pendingReportId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: token, comments: notes }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ type: "error", message: (d as any).error ?? "Error al confirmar el reporte" });
      } else {
        setResult({
          type: "success",
          message: (d as any).released
            ? "Confirmado. Todos los contactos han coincidido — el legado será liberado a los destinatarios."
            : "Confirmación registrada. Esperando que todos los contactos de confianza confirmen.",
        });
      }
    } catch {
      setResult({ type: "error", message: "Error de conexión. Intenta de nuevo." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-lavender-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-violet-700 font-serif text-2xl font-bold">
            <Heart className="w-6 h-6 fill-current text-rose-400" />
            Legado
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg shadow-violet-100 border border-violet-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-violet-700 to-violet-900 px-8 py-8 text-white text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-violet-200" />
            <h1 className="font-serif text-2xl font-bold mb-1">Confirmación de confianza</h1>
            <p className="text-violet-200 text-sm">Eres un contacto de confianza en Legado</p>
          </div>

          <div className="px-8 py-8">
            {isLoading && (
              <div className="flex flex-col items-center gap-3 py-8 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                <p className="text-sm">Verificando tu enlace…</p>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="w-10 h-10 text-red-400" />
                <p className="font-semibold text-zinc-800">Enlace inválido o expirado</p>
                <p className="text-sm text-zinc-500">
                  Este enlace ya no es válido. Si crees que es un error, contacta al equipo de Legado.
                </p>
              </div>
            )}

            {result && (
              <div className={`rounded-2xl p-4 mb-6 flex gap-3 items-start ${
                result.type === "success"
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}>
                {result.type === "success"
                  ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                }
                <p className={`text-sm leading-relaxed ${result.type === "success" ? "text-green-800" : "text-red-700"}`}>
                  {result.message}
                </p>
              </div>
            )}

            {info && !result && (
              <div className="space-y-6">
                <div className="bg-violet-50 rounded-2xl p-5 text-center border border-violet-100">
                  <p className="text-sm text-violet-600 mb-1">Contacto de confianza de</p>
                  <p className="font-serif text-xl font-bold text-violet-900">{info.ownerName}</p>
                  {info.pendingReportId && (
                    <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 rounded-full px-3 py-1 text-xs font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Hay un reporte de fallecimiento pendiente de confirmación
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Observaciones adicionales <span className="text-zinc-400 font-normal">(opcional)</span>
                  </label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Puedes agregar cualquier detalle relevante que consideres importante…"
                    className="resize-none rounded-xl border-zinc-200 text-sm"
                    rows={3}
                  />
                </div>

                {info.pendingReportId ? (
                  <div className="space-y-3">
                    <Button
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="w-full bg-violet-700 hover:bg-violet-800 text-white rounded-xl h-12 font-semibold"
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Confirmando…</>
                      ) : (
                        "Confirmar reporte existente"
                      )}
                    </Button>
                    <p className="text-xs text-zinc-400 text-center leading-relaxed">
                      Hay un reporte ya enviado por otro contacto. Al confirmar, estás corroborando el fallecimiento de {info.ownerName}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      onClick={handleReport}
                      disabled={submitting}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-12 font-semibold"
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando…</>
                      ) : (
                        "Reportar fallecimiento"
                      )}
                    </Button>
                    <p className="text-xs text-zinc-400 text-center leading-relaxed">
                      Al reportar, se notificará a los demás contactos de confianza de {info.ownerName} para que también confirmen.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-6">
          Legado — plataforma de legado digital · Este enlace es personal e intransferible
        </p>
      </div>
    </div>
  );
}
