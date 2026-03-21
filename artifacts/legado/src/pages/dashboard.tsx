import { AppLayout } from "@/components/layout/AppLayout";
import { useDashboard } from "@/hooks/use-settings";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { 
  Archive, 
  Users, 
  ShieldCheck, 
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
  HeartHandshake,
  Clock,
} from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading, error } = useDashboard();

  if (isLoading) return (
    <AppLayout>
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    </AppLayout>
  );

  if (error || !stats) return (
    <AppLayout>
      <div className="text-center text-destructive p-8">Error al cargar estadísticas.</div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <OnboardingWizard />
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Tu Panel de Control</h1>
            <p className="text-muted-foreground mt-2">Un resumen de la preparación de tu legado.</p>
          </div>
          <Link href="/legacy/new">
            <button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
              + Nuevo Mensaje
            </button>
          </Link>
        </div>

        {/* Progress Section */}
        <Card className="border-none shadow-xl shadow-primary/5 bg-gradient-to-br from-white to-primary/5 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-serif text-xl font-bold">Progreso de Preparación</h2>
              <span className="text-2xl font-bold text-primary">{stats.completionPercentage}%</span>
            </div>
            <Progress value={stats.completionPercentage} className="h-3 bg-secondary" />
            
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.completionSteps.map((step) => (
                <div key={step.key} className="flex items-center gap-3">
                  {step.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/50 shrink-0" />
                  )}
                  <span className={`text-sm ${step.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard 
            title="Elementos del Legado" 
            value={stats.legacyItemsCount} 
            subtitle={`${stats.activeItemsCount} activos, ${stats.draftItemsCount} borradores`}
            icon={Archive}
            href="/legacy"
          />
          <StatCard 
            title="Destinatarios" 
            value={stats.recipientsCount} 
            subtitle="Personas que recibirán mensajes"
            icon={Users}
            href="/recipients"
          />
          <StatCard 
            title="Contactos de Confianza" 
            value={stats.trustedContactsCount} 
            subtitle="Guardianes de tu legado"
            icon={ShieldCheck}
            href="/trusted-contacts"
          />
        </div>

        {/* Time Capsules quick access */}
        <Link href="/capsulas">
          <Card className="border border-violet-100 bg-violet-50/40 hover:shadow-md hover:border-violet-200 transition-all cursor-pointer group">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-violet-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-gray-900">Cápsulas del Tiempo</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Programa mensajes para el futuro — videos y cartas que se entregarán en la fecha que elijas.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-violet-400 group-hover:text-violet-600 transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {/* Death Reporting Section */}
        <Link href="/report-death">
          <Card className="border border-rose-100 bg-rose-50/50 hover:shadow-md hover:border-rose-200 transition-all cursor-pointer group">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <HeartHandshake className="w-6 h-6 text-rose-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-gray-900">Reportar el Fallecimiento de Alguien</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  ¿Eres contacto de confianza de alguien? Reporta su partida usando tu DNI para iniciar el proceso de apertura del legado.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-rose-400 group-hover:text-rose-600 transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </motion.div>
    </AppLayout>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, href }: any) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-lg hover:border-primary/30 transition-all duration-300 cursor-pointer h-full border-border/50 group">
        <CardContent className="p-6 flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0" />
          </div>
          <div className="mt-auto">
            <h3 className="text-3xl font-bold text-foreground">{value}</h3>
            <p className="font-serif text-lg font-medium mt-1">{title}</p>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
