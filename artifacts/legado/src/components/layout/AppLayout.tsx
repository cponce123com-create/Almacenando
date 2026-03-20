import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Archive, 
  Users, 
  ShieldCheck, 
  Flower2, 
  Settings, 
  LogOut,
  Menu
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Mi Legado", href: "/legacy", icon: Archive },
  { name: "Destinatarios", href: "/recipients", icon: Users },
  { name: "Contactos de Confianza", href: "/trusted-contacts", icon: ShieldCheck },
  { name: "Preferencias Funerarias", href: "/funeral", icon: Flower2 },
  { name: "Activación", href: "/activation", icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [_, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const NavLinks = () => (
    <div className="flex flex-col gap-2">
      {navigation.map((item) => {
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
            <item.icon className="w-5 h-5" />
            {item.name}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/30 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-card border-r border-border fixed inset-y-0 z-50">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <span className="text-white font-serif font-bold text-xl">L</span>
            </div>
            <span className="font-serif font-bold text-2xl tracking-tight text-foreground">Legado</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={handleLogout}>
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 bg-card border-b border-border z-40 flex items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white font-serif font-bold text-xl">L</span>
          </div>
          <span className="font-serif font-bold text-xl tracking-tight">Legado</span>
        </Link>
        
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <div className="p-6 pb-2">
              <span className="font-serif font-bold text-2xl tracking-tight text-foreground">Menú</span>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
              <NavLinks />
            </nav>
            <div className="p-4 border-t border-border mt-auto">
              <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={handleLogout}>
                <LogOut className="w-5 h-5 mr-3" />
                Cerrar Sesión
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-72 pt-16 md:pt-0">
        <div className="p-6 md:p-10 max-w-6xl mx-auto min-h-[calc(100vh-4rem)] md:min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
