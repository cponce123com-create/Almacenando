import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  AlertTriangle,
  TestTube,
  Layers,
  Recycle,
  FileText,
  Shield,
  Users,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  FlaskConical,
  CalendarDays,
  User,
  Microscope,
  Scale,
  Warehouse,
  UserCog,
} from "lucide-react";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES, type Warehouse as WarehouseType } from "@/contexts/WarehouseContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const modules = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, short: "Inicio" },
  { name: "Maestro de Productos", href: "/products", icon: Package, short: "Productos" },
  { name: "Saldo Actualizado", href: "/balances", icon: Scale, short: "Saldos" },
  { name: "Inventarios", href: "/inventory", icon: ClipboardList, short: "Inventario" },
  { name: "Cuadre", href: "/cuadre", icon: Warehouse, short: "Cuadre" },
  { name: "Productos Inmovilizados", href: "/immobilized", icon: AlertTriangle, short: "Inmovilizados" },
  { name: "Muestras", href: "/samples", icon: TestTube, short: "Muestras" },
  { name: "Lotes / Tinturas", href: "/dye-lots", icon: Layers, short: "Lotes" },
  { name: "Control de Lotes", href: "/lot-evaluations", icon: Microscope, short: "Control" },
  { name: "Disposición Final", href: "/disposition", icon: Recycle, short: "Disposición" },
  { name: "Documentos", href: "/documents", icon: FileText, short: "Docs" },
  { name: "EPP", href: "/epp", icon: Shield, short: "EPP" },
  { name: "Personal", href: "/personnel", icon: Users, short: "Personal" },
  { name: "Reportes", href: "/reports", icon: BarChart2, short: "Reportes" },
  { name: "Administración", href: "/admin-users", icon: Settings, short: "Admin" },
];

function NavItem({ item, onClick }: { item: typeof modules[0]; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === item.href || location.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
        isActive
          ? "bg-violet-600 text-white font-medium shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <item.icon className="w-4.5 h-4.5 shrink-0" style={{ width: 18, height: 18 }} />
      <span className="truncate">{item.name}</span>
      {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-70" />}
    </Link>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const { warehouse, setWarehouse } = useWarehouse();
  const [_, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const today = new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md"
            style={{ backgroundColor: "#7c3aed" }}
          >
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">Almacén Químico</p>
            <p className="text-xs text-slate-500 leading-tight">Sistema de Gestión</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {modules.map((item) => (
          <NavItem key={item.href} item={item} onClick={onNavClick} />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
            {user?.role && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", ROLE_COLORS[user.role])}>
                {ROLE_LABELS[user.role]}
              </span>
            )}
          </div>
        </div>
        <Link
          href="/profile"
          onClick={onNavClick}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-150 mb-2"
        >
          <UserCog className="w-4 h-4" />
          Mi Perfil
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-100 fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative flex flex-col w-72 bg-white shadow-xl">
            <div className="absolute top-3 right-3">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
          <div className="h-14 px-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
                <CalendarDays className="w-4 h-4" />
                <span className="capitalize">{today}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Warehouse className="w-4 h-4 text-violet-600 shrink-0" />
                <Select value={warehouse} onValueChange={(v) => setWarehouse(v as WarehouseType)}>
                  <SelectTrigger className="h-8 w-36 text-xs border-violet-200 focus:ring-violet-500">
                    <SelectValue placeholder="Almacén" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los almacenes</SelectItem>
                    {WAREHOUSES.map(w => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {user?.role && (
                <span className={cn("hidden sm:inline-flex text-xs px-2.5 py-1 rounded-full font-medium", ROLE_COLORS[user.role])}>
                  {ROLE_LABELS[user.role]}
                </span>
              )}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <span className="hidden md:block text-sm font-medium text-slate-700">{user?.name}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
