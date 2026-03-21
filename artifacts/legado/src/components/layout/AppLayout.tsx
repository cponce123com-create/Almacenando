import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Archive,
  Users,
  ShieldCheck,
  Flower2,
  Settings,
  LogOut,
  Menu,
  MoreHorizontal,
  Images,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const primaryNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, shortName: "Inicio" },
  { name: "Mi Legado", href: "/legacy", icon: Archive, shortName: "Legado" },
  { name: "Destinatarios", href: "/recipients", icon: Users, shortName: "Para" },
  { name: "Confianza", href: "/trusted-contacts", icon: ShieldCheck, shortName: "Confianza" },
];

const secondaryNav = [
  { name: "Mis Medios", href: "/media", icon: Images },
  { name: "Mi Perfil", href: "/profile", icon: UserCircle },
  { name: "Preferencias Funerarias", href: "/funeral", icon: Flower2 },
  { name: "Activación", href: "/activation", icon: Settings },
];

const allNav = [...primaryNav, ...secondaryNav];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [_, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const SidebarLinks = () => (
    <div className="flex flex-col gap-1">
      {allNav.map((item) => {
        const isActive = location.startsWith(item.href);
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              isActive
                ? "bg-primary/10 text-primary font-medium shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.name}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/30 flex">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-72 bg-card border-r border-border fixed inset-y-0 z-50">
        <div className="p-6 pb-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <span className="text-white font-serif font-bold text-xl">L</span>
            </div>
            <span className="font-serif font-bold text-2xl tracking-tight text-foreground">Legado</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-4 overflow-y-auto">
          <SidebarLinks />
        </nav>

        <div className="p-4 border-t border-border mt-auto space-y-1">
          <Link
            href="/admin/login"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-all text-sm font-medium"
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Panel de Administración
          </Link>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* ── Mobile Top Header ── */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-card border-b border-border z-40 flex items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white font-serif font-bold text-lg">L</span>
          </div>
          <span className="font-serif font-bold text-xl tracking-tight">Legado</span>
        </Link>

        {/* Overflow sheet for secondary nav + logout */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0 flex flex-col">
            <div className="p-5 pb-2 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Más opciones</p>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {secondaryNav.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-border space-y-1">
              <Link
                href="/admin/login"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-rose-600 hover:bg-rose-50 transition-all"
              >
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">Panel de Administración</span>
              </Link>
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="w-5 h-5 mr-3" />
                Cerrar Sesión
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 md:ml-72 pt-14 md:pt-0 pb-20 md:pb-0">
        <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto min-h-[calc(100vh-3.5rem-5rem)] md:min-h-screen">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border safe-area-pb">
        <div className="flex items-stretch h-16">
          {primaryNav.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                <span className={cn("text-[10px] font-medium leading-tight", isActive && "font-semibold")}>
                  {item.shortName}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-t-full" />
                )}
              </Link>
            );
          })}

          {/* Más button opens the sheet */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]",
              (location.startsWith("/funeral") || location.startsWith("/activation") || location.startsWith("/media") || location.startsWith("/profile"))
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">Más</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
