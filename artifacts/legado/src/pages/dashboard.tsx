import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/hooks/use-auth";
import { Link } from "wouter";
import { modules } from "@/components/layout/AppLayout";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

function cn(...args: any[]) {
  return twMerge(clsx(args));
}

function useSummary() {
  return useQuery({
    queryKey: ["/api/reports/summary"],
    queryFn: async () => {
      const res = await fetch("/api/reports/summary", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json() as Promise<{
        products: number;
        inventoryRecords: number;
        immobilized: number;
        samples: number;
        dyeLots: number;
        dispositions: number;
      }>;
    },
  });
}

// Colores usando violet/emerald/orange/purple en lugar de blue
// (más robustos en monitores con problemas de canal de color azul)
const moduleColors = [
  "bg-violet-100 border-violet-200 hover:border-violet-400",
  "bg-emerald-100 border-emerald-200 hover:border-emerald-400",
  "bg-orange-100 border-orange-200 hover:border-orange-400",
  "bg-purple-100 border-purple-200 hover:border-purple-400",
  "bg-teal-100 border-teal-200 hover:border-teal-400",
  "bg-rose-100 border-rose-200 hover:border-rose-400",
  "bg-indigo-100 border-indigo-200 hover:border-indigo-400",
  "bg-amber-100 border-amber-200 hover:border-amber-400",
  "bg-cyan-100 border-cyan-200 hover:border-cyan-400",
  "bg-slate-100 border-slate-300 hover:border-slate-500",
  "bg-lime-100 border-lime-200 hover:border-lime-400",
  "bg-red-100 border-red-200 hover:border-red-400",
  "bg-fuchsia-100 border-fuchsia-200 hover:border-fuchsia-400",
];

const moduleIconColors = [
  "text-violet-600",
  "text-emerald-600",
  "text-orange-600",
  "text-purple-600",
  "text-teal-600",
  "text-rose-600",
  "text-indigo-600",
  "text-amber-600",
  "text-cyan-600",
  "text-slate-600",
  "text-lime-600",
  "text-red-600",
  "text-fuchsia-600",
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useSummary();

  const quickStats = summary ? [
    { label: "Productos", value: summary.products, module: 1 },
    { label: "Registros de Inventario", value: summary.inventoryRecords, module: 2 },
    { label: "Inmovilizados", value: summary.immobilized, module: 3 },
    { label: "Muestras", value: summary.samples, module: 4 },
  ] : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Bienvenido, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-slate-500 mt-1">
            Panel de Control — Sistema de Almacén de Productos Químicos
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando estadísticas...
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickStats.map((stat) => {
              const mod = modules[stat.module]!;
              const Icon = mod.icon;
              return (
                <Link key={stat.label} href={mod.href}>
                  <div className={cn("p-4 rounded-xl border cursor-pointer transition-all", moduleColors[stat.module])}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={cn("w-5 h-5", moduleIconColors[stat.module])} />
                      <span className="text-xs font-medium text-slate-600">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Módulos del Sistema
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {modules.map((module, i) => {
              const Icon = module.icon;
              return (
                <Link key={module.href} href={module.href}>
                  <div className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all duration-150 group",
                    moduleColors[i]
                  )}>
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-white/70 group-hover:scale-110 transition-transform", moduleIconColors[i])}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{module.name}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className={cn("px-3 py-1 rounded-full text-xs font-semibold", user?.role ? ROLE_COLORS[user.role] : "")}>
              {user?.role ? ROLE_LABELS[user.role] : ""}
            </div>
            <p className="text-sm text-slate-600">
              Sesión activa como <strong>{user?.email}</strong>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
