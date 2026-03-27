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
  Microscope,
  Scale,
  Warehouse,
  UserCog,
  Bell,
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
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group",
        isActive
          ? "text-white font-medium shadow-sm"
          : "text-slate-400 hover:text-white hover:bg-white/8"
      )}
      style={isActive ? { backgroundColor: "rgba(13,127,133,0.85)" } : undefined}
    >
      <item.icon
        className={cn("shrink-0 transition-colors", isActive ? "text-teal-300" : "text-slate-500 group-hover:text-slate-300")}
        style={{ width: 17, height: 17 }}
      />
      <span className="truncate">{item.name}</span>
      {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-teal-400 opacity-80" />}
    </Link>
  );
}

const ROLE_AVATAR_COLORS: Record<string, string> = {
  admin: "linear-gradient(135deg,#0d7f85,#065f6b)",
  supervisor: "linear-gradient(135deg,#0e7490,#155e75)",
  operator: "linear-gradient(135deg,#0369a1,#1e40af)",
  quality: "linear-gradient(135deg,#7c3aed,#4f46e5)",
  readonly: "linear-gradient(135deg,#475569,#334155)",
};

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

  const avatarGradient = user?.role ? (ROLE_AVATAR_COLORS[user.role] ?? ROLE_AVATAR_COLORS.readonly) : ROLE_AVATAR_COLORS.readonly;

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="px-4 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shrink-0"
            style={{ background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)" }}
          >
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Almacén Químico</p>
            <p className="text-xs leading-tight" style={{ color: "rgba(148,215,208,0.75)" }}>Sistema de Gestión</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {modules.map((item) => (
          <NavItem key={item.href} item={item} onClick={onNavClick} />
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm text-white shrink-0 shadow"
            style={{ background: avatarGradient }}
          >
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
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
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-1"
          style={{ color: "rgba(148,215,208,0.8)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "white"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.color = "rgba(148,215,208,0.8)"; }}
        >
          <UserCog className="w-4 h-4" />
          Mi Perfil
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150"
          style={{ color: "rgba(252,165,165,0.8)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.12)"; (e.currentTarget as HTMLElement).style.color = "#fca5a5"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.color = "rgba(252,165,165,0.8)"; }}
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#f0f4f8" }}>

      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex flex-col w-64 fixed inset-y-0 z-50"
        style={{ backgroundColor: "#0c1a2e", borderRight: "1px solid rgba(255,255,255,0.07)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div
            className="relative flex flex-col w-72 shadow-2xl"
            style={{ backgroundColor: "#0c1a2e" }}
          >
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: "rgba(148,215,208,0.7)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">

        {/* Top header */}
        <header className="bg-white sticky top-0 z-40 shadow-sm" style={{ borderBottom: "2px solid #0d9488" }}>
          <div className="h-14 px-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
                <CalendarDays className="w-4 h-4 text-teal-600" style={{ color: "#0d9488" }} />
                <span className="capitalize">{today}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Warehouse selector */}
              <div className="flex items-center gap-1.5">
                <Warehouse className="w-4 h-4 shrink-0" style={{ color: "#0d9488" }} />
                <Select value={warehouse} onValueChange={(v) => setWarehouse(v as WarehouseType)}>
                  <SelectTrigger className="h-8 w-38 text-xs" style={{ borderColor: "#b2dfdb" }}>
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

              {/* Role badge */}
              {user?.role && (
                <span className={cn("hidden sm:inline-flex text-xs px-2.5 py-1 rounded-full font-medium", ROLE_COLORS[user.role])}>
                  {ROLE_LABELS[user.role]}
                </span>
              )}

              {/* User avatar */}
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm text-white shadow-sm"
                  style={{ background: avatarGradient }}
                >
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
