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
  ShieldCheck,
  Bell as BellIcon,
  PackageX,
  PackageSearch,
  Mail,
  ArchiveX,
  MapPin,
  Scan,
  PackageCheck,
  Map,
  Target,
} from "lucide-react";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/hooks/use-auth";
import { useWarehouse, WAREHOUSES, type Warehouse as WarehouseType } from "@/contexts/WarehouseContext";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
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

// Sidebar color constants — always applied as inline styles to bypass
// browser forced-color modes and Windows high-contrast overrides.
const SB = {
  bg: "#0c1a2e",
  border: "rgba(255,255,255,0.07)",
  text: "#94c5c2",           // resting nav text (teal-grey)
  textHover: "#ffffff",
  activeBg: "rgba(13,148,136,0.75)",
  activeText: "#ffffff",
  activeIcon: "#5eead4",
  restIcon: "#4a7f7c",
  userBorder: "rgba(255,255,255,0.07)",
  userText: "#ffffff",
  mutedText: "rgba(148,215,208,0.65)",
  logoutText: "rgba(252,165,165,0.85)",
  logoutHoverBg: "rgba(239,68,68,0.15)",
  hoverBg: "rgba(255,255,255,0.07)",
};

type ModuleRole = "admin" | "supervisor" | "operator" | "quality" | "readonly";

type ModuleItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: ModuleRole[];
};

type NavGroup = {
  label?: string;
  icon?: React.ElementType;
  items: ModuleItem[];
};

export const navGroups: NavGroup[] = [
  {
    // Dashboard — no label (standalone)
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Gestión de Productos",
    items: [
      { name: "Maestro de Productos", href: "/products", icon: Package },
      { name: "Lotes / Tinturas", href: "/dye-lots", icon: Layers },
      { name: "Control de Lotes", href: "/lot-evaluations", icon: Microscope },
      { name: "Muestras", href: "/samples", icon: TestTube },
      { name: "Disposición Final", href: "/disposition", icon: Recycle },
    ],
  },
  {
    label: "Inventario y Almacén",
    icon: Warehouse,
    items: [
      { name: "Saldo Actualizado", href: "/balances", icon: Scale },
      { name: "Inventarios", href: "/inventory", icon: ClipboardList },
      { name: "Cuadre", href: "/cuadre", icon: Warehouse },
      { name: "Progreso de Inventario", href: "/inventory-progress", icon: Target },
      { name: "Ubicaciones", href: "/locations", icon: MapPin },
      { name: "Mapa del Almacén", href: "/warehouse-map", icon: Map },
      { name: "Productos Inmovilizados", href: "/immobilized", icon: AlertTriangle },
      { name: "Productos Sobrantes", href: "/sobrantes", icon: ArchiveX },
    ],
  },
  {
    label: "Operaciones Logísticas",
    icon: PackageCheck,
    items: [
      { name: "Escáner", href: "/scanner", icon: Scan },
      { name: "Preparación de Pedidos", href: "/picking", icon: PackageCheck },
      { name: "Suministros", href: "/supplies", icon: PackageSearch, roles: ["operator", "supervisor", "admin"] },
    ],
  },
  {
    label: "Seguridad y Calidad",
    icon: ShieldCheck,
    items: [
      { name: "MSDS", href: "/msds", icon: ShieldCheck },
      { name: "Compatibilidad", href: "/compatibility", icon: FlaskConical },
      { name: "EPP", href: "/epp", icon: Shield },
      { name: "Documentos", href: "/documents", icon: FileText },
    ],
  },
  {
    label: "Notificaciones",
    icon: BellIcon,
    items: [
      { name: "Cambio de Lote", href: "/lot-change-notification", icon: BellIcon, roles: ["operator", "supervisor", "admin"] },
      { name: "Envío de Correos", href: "/email-notifications", icon: Mail, roles: ["operator", "supervisor", "admin"] },
    ],
  },
  {
    label: "Administración",
    icon: Settings,
    items: [
      { name: "Personal", href: "/personnel", icon: Users },
      { name: "Reportes", href: "/reports", icon: BarChart2 },
      { name: "Administración", href: "/admin-users", icon: Settings },
    ],
  },
];

// Backwards compatibility — flat list of all modules derived from navGroups
export const modules: ModuleItem[] = navGroups.flatMap(g => g.items);

function GroupHeader({ label, icon: Icon, isFirst }: { label: string; icon?: React.ElementType; isFirst?: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "16px 12px 6px",
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: SB.mutedText,
      borderTop: isFirst ? "none" : "1px solid rgba(255,255,255,0.05)",
      marginTop: isFirst ? 0 : 6,
    }}>
      {Icon && <Icon style={{ width: 12, height: 12, opacity: 0.6 }} />}
      {label}
    </div>
  );
}

function NavItem({ item, onClick, mobile = false }: { item: ModuleItem; onClick?: () => void; mobile?: boolean }) {
  const [location] = useLocation();
  const isActive = location === item.href || location.startsWith(item.href + "/");
  const [hovered, setHovered] = useState(false);

  const bgColor = isActive ? SB.activeBg : hovered ? SB.hoverBg : "transparent";
  const textColor = isActive ? SB.activeText : hovered ? SB.textHover : SB.text;
  const iconColor = isActive ? SB.activeIcon : hovered ? SB.textHover : SB.restIcon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: mobile ? "13px 14px" : "9px 12px",
        borderRadius: "8px",
        fontSize: mobile ? "14.5px" : "13.5px",
        fontWeight: isActive ? 600 : 400,
        backgroundColor: bgColor,
        color: textColor,
        textDecoration: "none",
        transition: "background-color 0.12s, color 0.12s",
        marginBottom: "2px",
        minHeight: mobile ? "48px" : undefined,
      }}
    >
      <item.icon style={{ width: mobile ? 20 : 17, height: mobile ? 20 : 17, color: iconColor, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.name}
      </span>
      {isActive && (
        <ChevronRight style={{ width: 14, height: 14, color: SB.activeIcon, opacity: 0.8, flexShrink: 0 }} />
      )}
    </Link>
  );
}

const ROLE_AVATAR_COLORS: Record<string, string> = {
  admin:      "linear-gradient(135deg,#0d7f85,#065f6b)",
  supervisor: "linear-gradient(135deg,#0e7490,#155e75)",
  operator:   "linear-gradient(135deg,#0369a1,#1e40af)",
  quality:    "linear-gradient(135deg,#7c3aed,#4f46e5)",
  readonly:   "linear-gradient(135deg,#475569,#334155)",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const { warehouse, setWarehouse } = useWarehouse();
  const [_, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileHovered, setProfileHovered] = useState(false);
  const [logoutHovered, setLogoutHovered] = useState(false);

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

  const avatarGradient =
    user?.role ? (ROLE_AVATAR_COLORS[user.role] ?? ROLE_AVATAR_COLORS.readonly)
               : ROLE_AVATAR_COLORS.readonly;

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Brand header */}
      <div style={{ padding: "20px 16px", borderBottom: `1px solid ${SB.border}` }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(13,148,136,0.4)",
          }}>
            <FlaskConical style={{ width: 20, height: 20, color: "#ffffff" }} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#ffffff", lineHeight: 1.2, margin: 0 }}>
              Almacén Químico
            </p>
            <p style={{ fontSize: 11, color: SB.mutedText, lineHeight: 1.2, margin: 0 }}>
              Sistema de Gestión
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        {(() => {
          let isFirstRenderedGroup = true;
          return navGroups.map((group) => {
            const visibleItems = group.items.filter(
              item => !item.roles || (user?.role && item.roles.includes(user.role as ModuleRole))
            );
            if (visibleItems.length === 0) return null;

            const result: ReactNode[] = [];

            if (group.label) {
              result.push(
                <GroupHeader
                  key={`header-${group.label}`}
                  label={group.label}
                  icon={group.icon}
                  isFirst={isFirstRenderedGroup}
                />
              );
              isFirstRenderedGroup = false;
            }

            visibleItems.forEach((item) => {
              result.push(
                <NavItem key={item.href} item={item} onClick={onNavClick} mobile={!!onNavClick} />
              );
            });

            return result;
          });
        })()}
      </nav>

      {/* User footer */}
      <div style={{ padding: "10px", borderTop: `1px solid ${SB.border}` }}>

        {/* User info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: avatarGradient,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 13,
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}>
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", margin: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.name}
            </p>
            {user?.role && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", ROLE_COLORS[user.role])}>
                {ROLE_LABELS[user.role]}
              </span>
            )}
          </div>
        </div>

        {/* Profile link */}
        <Link
          href="/profile"
          onClick={onNavClick}
          onMouseEnter={() => setProfileHovered(true)}
          onMouseLeave={() => setProfileHovered(false)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 8, fontSize: 13,
            color: profileHovered ? SB.textHover : SB.mutedText,
            backgroundColor: profileHovered ? SB.hoverBg : "transparent",
            textDecoration: "none", transition: "all 0.12s", marginBottom: 2,
          }}
        >
          <UserCog style={{ width: 16, height: 16 }} />
          Mi Perfil
        </Link>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          onMouseEnter={() => setLogoutHovered(true)}
          onMouseLeave={() => setLogoutHovered(false)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer",
            color: logoutHovered ? "#fca5a5" : SB.logoutText,
            backgroundColor: logoutHovered ? SB.logoutHoverBg : "transparent",
            transition: "all 0.12s",
          }}
        >
          <LogOut style={{ width: 16, height: 16 }} />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", backgroundColor: "#f0f4f8", overflowX: "hidden" }}>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col"
        style={{
          width: 256,
          position: "fixed",
          top: 0, bottom: 0, left: 0,
          zIndex: 50,
          backgroundColor: SB.bg,
          borderRight: `1px solid ${SB.border}`,
        }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            onClick={() => setMobileOpen(false)}
          />
          <div style={{
            position: "relative",
            display: "flex", flexDirection: "column",
            width: 300, maxWidth: "85vw",
            backgroundColor: SB.bg,
            boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
            zIndex: 1,
            overscrollBehavior: "contain",
          }}>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              style={{
                position: "absolute", top: 8, right: 8,
                width: 40, height: 40, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, backgroundColor: SB.hoverBg, color: SB.text,
                zIndex: 1, WebkitTapHighlightColor: "transparent",
              }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: "100vh" }}
        className="lg:ml-64"
      >
        {/* Top header */}
        <header style={{
          backgroundColor: "#ffffff",
          borderBottom: "2.5px solid #0d9488",
          position: "sticky", top: 0, zIndex: 40,
          boxShadow: "0 1px 8px rgba(13,148,136,0.1)",
        }}>
          <div style={{ height: 56, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>

            {/* Left side */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
                style={{
                  width: 44, height: 44, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 10, backgroundColor: "transparent", color: "#64748b",
                  WebkitTapHighlightColor: "transparent", marginLeft: -6,
                }}
              >
                <Menu style={{ width: 22, height: 22 }} />
              </button>
              <div className="hidden sm:flex" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
                <CalendarDays style={{ width: 15, height: 15, color: "#0d9488" }} />
                <span style={{ textTransform: "capitalize" }}>{today}</span>
              </div>
            </div>

            {/* Global Search — centro */}
            <div className="hidden sm:block flex-1 max-w-lg mx-4">
              <GlobalSearch />
            </div>

            {/* Right side */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

              {/* Notification Bell */}
              <NotificationBell />

              {/* Warehouse selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Warehouse className="hidden sm:block" style={{ width: 16, height: 16, color: "#0d9488", flexShrink: 0 }} />
                <Select value={warehouse} onValueChange={(v) => setWarehouse(v as WarehouseType)}>
                  <SelectTrigger className="h-8 w-28 sm:w-40 text-xs" style={{ borderColor: "#99d8d5" }}>
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

              {/* Avatar + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: avatarGradient,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 13,
                  boxShadow: "0 2px 6px rgba(13,148,136,0.3)",
                }}>
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <span className="hidden md:block" style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                  {user?.name}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, overflowX: "auto", minWidth: 0 }} className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
