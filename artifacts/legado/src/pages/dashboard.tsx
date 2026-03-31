import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/hooks/use-auth";
import { Link } from "wouter";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/hooks/use-auth";
import {
  Loader2, Package, ClipboardList, Scale, Warehouse,
  AlertTriangle, TestTube, Layers, Bell, Mail,
  PackageSearch, Microscope, Recycle, ShieldCheck,
  FileText, Shield, Users, BarChart2, Settings,
  TrendingUp, FlaskConical, Activity, ArrowRight,
  Boxes, Zap, Star,
} from "lucide-react";

function cn(...args: any[]) { return twMerge(clsx(args)); }

function useSummary() {
  return useQuery({
    queryKey: ["/api/reports/summary"],
    queryFn: async () => {
      const res = await fetch("/api/reports/summary", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

// ── KPI card configuration ────────────────────────────────────────────────────
const KPI_CONFIG = [
  {
    key: "products",
    label: "Productos",
    sublabel: "en catálogo",
    href: "/products",
    icon: Package,
    gradient: "from-teal-500 to-cyan-600",
    glow: "shadow-teal-200",
    bg: "bg-teal-50",
    text: "text-teal-700",
  },
  {
    key: "inventoryRecords",
    label: "Inventarios",
    sublabel: "registros totales",
    href: "/inventory",
    icon: ClipboardList,
    gradient: "from-indigo-500 to-blue-600",
    glow: "shadow-indigo-200",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
  },
  {
    key: "activeImmobilized",
    label: "Inmovilizados",
    sublabel: "activos actualmente",
    href: "/immobilized",
    icon: AlertTriangle,
    gradient: "from-orange-500 to-amber-500",
    glow: "shadow-orange-200",
    bg: "bg-orange-50",
    text: "text-orange-700",
  },
  {
    key: "samples",
    label: "Muestras",
    sublabel: "en seguimiento",
    href: "/samples",
    icon: TestTube,
    gradient: "from-purple-500 to-violet-600",
    glow: "shadow-purple-200",
    bg: "bg-purple-50",
    text: "text-purple-700",
  },
  {
    key: "dispositions",
    label: "Disposición Final",
    sublabel: "gestionados",
    href: "/disposition",
    icon: Recycle,
    gradient: "from-rose-500 to-red-600",
    glow: "shadow-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
  },
];

// ── Module groups ─────────────────────────────────────────────────────────────
const GROUPS = [
  {
    name: "Operaciones de Stock",
    icon: Boxes,
    color: "teal",
    accent: "#0d9488",
    headerBg: "bg-teal-600",
    cardBg: "bg-teal-50 hover:bg-teal-100 border-teal-100 hover:border-teal-300",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-700",
    nameColor: "text-teal-900",
    items: [
      { name: "Maestro de Productos", href: "/products",   icon: Package },
      { name: "Saldo Actualizado",    href: "/balances",   icon: Scale },
      { name: "Inventarios",          href: "/inventory",  icon: ClipboardList },
      { name: "Cuadre",               href: "/cuadre",     icon: Warehouse },
    ],
  },
  {
    name: "Calidad & Análisis",
    icon: FlaskConical,
    color: "purple",
    accent: "#7c3aed",
    headerBg: "bg-purple-600",
    cardBg: "bg-purple-50 hover:bg-purple-100 border-purple-100 hover:border-purple-300",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-700",
    nameColor: "text-purple-900",
    items: [
      { name: "Muestras",         href: "/samples",          icon: TestTube },
      { name: "Lotes / Tinturas", href: "/dye-lots",         icon: Layers },
      { name: "Control de Lotes", href: "/lot-evaluations",  icon: Microscope },
    ],
  },
  {
    name: "Seguimiento & Alertas",
    icon: Activity,
    color: "orange",
    accent: "#ea580c",
    headerBg: "bg-orange-600",
    cardBg: "bg-orange-50 hover:bg-orange-100 border-orange-100 hover:border-orange-300",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-700",
    nameColor: "text-orange-900",
    items: [
      { name: "Productos Inmovilizados", href: "/immobilized",             icon: AlertTriangle },
      { name: "Disposición Final",       href: "/disposition",             icon: Recycle },
      { name: "Cambio de Lote",          href: "/lot-change-notification", icon: Bell },
    ],
  },
  {
    name: "Comunicación",
    icon: Mail,
    color: "rose",
    accent: "#e11d48",
    headerBg: "bg-rose-600",
    cardBg: "bg-rose-50 hover:bg-rose-100 border-rose-100 hover:border-rose-300",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-700",
    nameColor: "text-rose-900",
    items: [
      { name: "Envío de Correos", href: "/email-notifications", icon: Mail },
      { name: "Suministros",      href: "/supplies",             icon: PackageSearch },
    ],
  },
  {
    name: "Seguridad & Documentos",
    icon: ShieldCheck,
    color: "sky",
    accent: "#0284c7",
    headerBg: "bg-sky-600",
    cardBg: "bg-sky-50 hover:bg-sky-100 border-sky-100 hover:border-sky-300",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-700",
    nameColor: "text-sky-900",
    items: [
      { name: "MSDS",       href: "/msds",      icon: ShieldCheck },
      { name: "EPP",        href: "/epp",        icon: Shield },
      { name: "Documentos", href: "/documents",  icon: FileText },
    ],
  },
  {
    name: "Administración",
    icon: Settings,
    color: "slate",
    accent: "#475569",
    headerBg: "bg-slate-600",
    cardBg: "bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-slate-400",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
    nameColor: "text-slate-900",
    items: [
      { name: "Reportes",       href: "/reports",     icon: BarChart2 },
      { name: "Personal",       href: "/personnel",   icon: Users },
      { name: "Administración", href: "/admin-users", icon: Settings },
    ],
  },
];

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ cfg, value, loading }: { cfg: typeof KPI_CONFIG[0]; value: number; loading: boolean }) {
  const Icon = cfg.icon;
  return (
    <Link href={cfg.href}>
      <div className={cn(
        "group relative overflow-hidden rounded-2xl p-4 cursor-pointer",
        "bg-white border border-slate-100",
        "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
      )}>
        {/* Gradient top bar */}
        <div className={cn("absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r", cfg.gradient)} />

        <div className="flex items-start justify-between gap-3 mt-1">
          <div>
            {loading ? (
              <div className="h-9 w-16 bg-slate-100 rounded-lg animate-pulse mb-1" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 leading-none mb-1">
                {value.toLocaleString()}
              </p>
            )}
            <p className="text-sm font-semibold text-slate-700">{cfg.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{cfg.sublabel}</p>
          </div>
          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", cfg.bg)}>
            <Icon className={cn("w-5 h-5", cfg.text)} />
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-1 mt-3 text-xs font-medium transition-colors",
          cfg.text, "opacity-0 group-hover:opacity-100",
        )}>
          <span>Ver módulo</span>
          <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </Link>
  );
}

// ── Module card ───────────────────────────────────────────────────────────────
function ModuleCard({ item, group }: { item: typeof GROUPS[0]["items"][0]; group: typeof GROUPS[0] }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer",
        "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm",
        group.cardBg,
      )}>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", group.iconBg)}>
          <Icon className={cn("w-4 h-4", group.iconColor)} />
        </div>
        <span className={cn("text-sm font-medium leading-tight", group.nameColor)}>
          {item.name}
        </span>
        <ArrowRight className={cn("w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100", group.iconColor)} />
      </div>
    </Link>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────
function GroupSection({ group }: { group: typeof GROUPS[0] }) {
  const GroupIcon = group.icon;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className={cn("flex items-center gap-2.5 px-4 py-3", group.headerBg)}>
        <GroupIcon className="w-4 h-4 text-white opacity-90" />
        <span className="text-sm font-semibold text-white">{group.name}</span>
      </div>
      {/* Items */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {group.items.map(item => (
          <ModuleCard key={item.href} item={item} group={group} />
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useSummary();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">

        {/* ── WELCOME HERO ──────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 p-5 sm:p-6">
          {/* decorative circles */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -right-4 w-64 h-64 rounded-full bg-white/5" />
          <div className="absolute top-2 right-16 w-12 h-12 rounded-full bg-white/10" />

          <div className="relative flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="w-5 h-5 text-teal-200" />
                <span className="text-teal-200 text-sm font-medium">Almacén Químico</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                {greeting}, {firstName}
              </h1>
              <p className="text-teal-200 text-sm mt-1">
                Panel de control · Sistema de Gestión
              </p>
            </div>
            <div className="flex-shrink-0">
              <div className={cn(
                "w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl sm:text-2xl",
                "bg-white/20 backdrop-blur-sm border border-white/30",
              )}>
                {firstName.charAt(0).toUpperCase()}
              </div>
              {user?.role && (
                <div className={cn(
                  "mt-2 text-center text-xs font-semibold px-2 py-0.5 rounded-full",
                  "bg-white/20 text-white",
                )}>
                  {ROLE_LABELS[user.role]}
                </div>
              )}
            </div>
          </div>

          {/* Quick stat pills */}
          <div className="relative flex flex-wrap gap-2 mt-4">
            {isLoading ? (
              [1,2,3].map(i => (
                <div key={i} className="h-7 w-28 rounded-full bg-white/10 animate-pulse" />
              ))
            ) : summary ? (
              <>
                <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs text-white font-medium">
                  <Package className="w-3 h-3" />
                  {summary.products} productos
                </div>
                <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs text-white font-medium">
                  <TestTube className="w-3 h-3" />
                  {summary.samples} muestras
                </div>
                {summary.activeImmobilized > 0 && (
                  <div className="flex items-center gap-1.5 bg-orange-400/30 border border-orange-300/30 rounded-full px-3 py-1 text-xs text-orange-100 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    {summary.activeImmobilized} inmovilizados
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* ── KPI CARDS ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Métricas del Sistema
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {KPI_CONFIG.map(cfg => (
              <KpiCard
                key={cfg.key}
                cfg={cfg}
                value={summary?.[cfg.key] ?? 0}
                loading={isLoading}
              />
            ))}
          </div>
        </div>

        {/* ── MODULE GROUPS ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Acceso Rápido a Módulos
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {GROUPS.map(group => (
              <GroupSection key={group.name} group={group} />
            ))}
          </div>
        </div>

        {/* ── FOOTER INFO ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <Star className="w-4 h-4 text-teal-500 flex-shrink-0" />
          <p className="text-xs text-slate-500">
            Sesión activa como <strong className="text-slate-700">{user?.email}</strong>
            {" · "}
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium", user?.role ? ROLE_COLORS[user.role] : "")}>
              {user?.role ? ROLE_LABELS[user.role] : ""}
            </span>
          </p>
        </div>

      </div>
    </AppLayout>
  );
}
