import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useActivation, useMutateActivation, useDashboard } from "@/hooks/use-settings";
import { useFuneralPrefs } from "@/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Loader2, CheckCircle2, AlertTriangle, Users, Heart, BookOpen,
  FileText, Zap, ShieldCheck, Clock, Unlock,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { Link } from "wouter";

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  inactive: { label: "INACTIVO",  className: "bg-gray-100 text-gray-600 border-gray-200",   icon: <Clock className="w-4 h-4" /> },
  active:   { label: "ACTIVO",    className: "bg-green-100 text-green-700 border-green-200",  icon: <ShieldCheck className="w-4 h-4" /> },
  released: { label: "LIBERADO",  className: "bg-violet-100 text-violet-700 border-violet-200", icon: <Unlock className="w-4 h-4" /> },
};

function StatusCard({
  icon,
  label,
  value,
  complete,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  complete: boolean;
  to: string;
}) {
  return (
    <Link href={to}>
      <div className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${
        complete
          ? "bg-green-50 border-green-200"
          : "bg-amber-50 border-amber-200"
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          complete ? "bg-green-100" : "bg-amber-100"
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-sm font-semibold ${complete ? "text-green-800" : "text-amber-800"}`}>{value}</p>
        </div>
        {complete
          ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
      </div>
    </Link>
  );
}

export default function ActivationSettings() {
  const { data: settings, isLoading } = useActivation();
  const { data: stats } = useDashboard();
  const { data: funeralPrefs } = useFuneralPrefs();
  const updateMutation = useMutateActivation();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: { minConfirmations: "2" }
  });

  useEffect(() => {
    if (settings) {
      form.reset({ minConfirmations: String(settings.minConfirmations) });
    }
  }, [settings?.minConfirmations]);

  const onSubmit = async (values: any) => {
    try {
      await updateMutation.mutateAsync({ data: {
        minConfirmations: parseInt(values.minConfirmations),
        adminReviewRequired: true,
      }});
      toast({ title: "Configuración actualizada" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const statusKey = settings?.status ?? "inactive";
  const badge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.inactive;

  const legacyCount = (stats as any)?.legacyItemsCount ?? 0;
  const recipientsCount = (stats as any)?.recipientsCount ?? 0;
  const contactsCount = (stats as any)?.trustedContactsCount ?? 0;
  const hasFuneralPrefs = !!(funeralPrefs?.burialType || funeralPrefs?.ceremonyType);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-7">
        <div>
          <div className="flex items-start justify-between gap-4 mb-1">
            <h1 className="font-serif text-2xl text-gray-900 flex items-center gap-2">
              <Settings className="w-6 h-6 text-violet-500" /> Configuración de Activación
            </h1>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold ${badge.className}`}>
              {badge.icon}
              {badge.label}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Define cuántas confirmaciones se necesitan para iniciar el proceso y revisa el estado de tu legado.
          </p>
        </div>

        {/* ── Estado del legado ── */}
        <section className="space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Estado de tu legado</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatusCard
              icon={<BookOpen className="w-5 h-5 text-violet-500" />}
              label="Ítems de legado"
              value={legacyCount > 0 ? `${legacyCount} ítem${legacyCount !== 1 ? "s" : ""} creados` : "Sin ítems aún"}
              complete={legacyCount > 0}
              to="/legacy"
            />
            <StatusCard
              icon={<Heart className="w-5 h-5 text-rose-500" />}
              label="Destinatarios"
              value={recipientsCount > 0 ? `${recipientsCount} destinatario${recipientsCount !== 1 ? "s" : ""}` : "Sin destinatarios"}
              complete={recipientsCount > 0}
              to="/recipients"
            />
            <StatusCard
              icon={<Users className="w-5 h-5 text-blue-500" />}
              label="Contactos de confianza"
              value={contactsCount > 0 ? `${contactsCount} contacto${contactsCount !== 1 ? "s" : ""}` : "Sin contactos"}
              complete={contactsCount >= 2}
              to="/trusted-contacts"
            />
            <StatusCard
              icon={<FileText className="w-5 h-5 text-amber-500" />}
              label="Preferencias funerarias"
              value={hasFuneralPrefs ? "Configuradas" : "Sin configurar"}
              complete={hasFuneralPrefs}
              to="/funeral"
            />
          </div>
        </section>

        {/* ── Cómo funciona ── */}
        <Card className="bg-violet-50 border-violet-100 shadow-none">
          <CardContent className="p-5">
            <h2 className="font-semibold text-violet-900 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4" /> ¿Cómo funciona la activación?
            </h2>
            <div className="space-y-4">
              {[
                {
                  step: "1",
                  title: "Un contacto reporta el fallecimiento",
                  desc: "Uno de tus contactos de confianza ingresa al portal con su DNI y registra el evento.",
                },
                {
                  step: "2",
                  title: "Los demás contactos confirman",
                  desc: "El resto de tus contactos recibe un correo y debe confirmar el reporte de forma independiente.",
                },
                {
                  step: "3",
                  title: "El equipo de Legado revisa y libera",
                  desc: "Nuestro equipo verifica la autenticidad del reporte y, una vez aprobado, libera el acceso a tus destinatarios.",
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-violet-200 text-violet-800 font-bold text-sm flex items-center justify-center shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <p className="font-semibold text-violet-900 text-sm">{s.title}</p>
                    <p className="text-violet-700 text-xs mt-0.5 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Confirmaciones mínimas ── */}
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="border border-gray-100 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <Label className="text-base font-semibold text-gray-900">Confirmaciones mínimas</Label>
                <p className="text-sm text-gray-500 mt-1">
                  ¿Cuántos de tus contactos de confianza deben reportar tu partida para que el proceso comience?
                </p>
              </div>
              <Controller
                control={form.control}
                name="minConfirmations"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full sm:w-[240px] h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 contacto (más rápido)</SelectItem>
                      <SelectItem value="2">2 contactos (recomendado)</SelectItem>
                      <SelectItem value="3">3 contactos (máxima seguridad)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-700">
                  La revisión del equipo de Legado siempre está activa, sin importar el número de confirmaciones.
                </p>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" className="rounded-xl h-11 px-6 bg-violet-600 hover:bg-violet-700 text-white" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar configuración"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppLayout>
  );
}
