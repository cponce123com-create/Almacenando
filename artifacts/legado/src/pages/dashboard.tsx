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
  "bg-violet-50 border-violet-100 hover:border-violet-300",
  "bg-emerald-50 border-emerald-100 hover:border-emerald-300",
  "bg-orange-50 border-orange-100 hover:border-orange-300",
  "bg-purple-50 border-purple-100 hover:border-purple-300",
  "bg-teal-50 border-teal-100 hover:border-teal-300",
  "bg-rose-50 border-rose-100 hover:border-rose-300",
  "bg-indigo-50 border-indigo-100 hover:border-indigo-300",
  "bg-amber-50 border-amber-100 hover:border-amber-300",
  "bg-cyan-50 border-cyan-100 hover:border-cyan-300",
  "bg-slate-50 border-slate-200 hover:border-slate-400",
  "bg-lime-50 border-lime-100 hover:border-lime-300",
  "bg-red-50 border-red-100 hover:border-red-300",
  "bg-fuchsia-50 border-fuchsia-100 hover:border-fuchsia-300",
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
