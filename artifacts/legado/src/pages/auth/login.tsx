import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FlaskConical, Lock, Mail } from "lucide-react";

export default function Login() {
  const [_, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setIsPending(true);
    try {
      await login(email, password);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: err.message || "Correo o contraseña incorrectos.",
      });
    } finally {
      setIsPending(false);
    }
  }

  const demoCredentials = [
    { label: "Administrador", email: "admin@almacen.com", color: "#0d9488" },
    { label: "Supervisor", email: "supervisor@almacen.com", color: "#0891b2" },
    { label: "Operario", email: "operario@almacen.com", color: "#0369a1" },
  ];

  return (
    <div
      className="min-h-screen flex"
      style={{
        background: "linear-gradient(135deg, #071525 0%, #0c2340 40%, #0c3a38 100%)",
      }}
    >
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-96 p-10" style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>
        <div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-xl"
            style={{ background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)" }}
          >
            <FlaskConical className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 leading-tight font-serif">
            Almacén<br />Químico
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(148,215,208,0.7)" }}>
            Sistema integral de gestión para el control, trazabilidad e inventario de productos químicos industriales.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-4">
          {[
            { label: "Control de inventario multi-almacén", icon: "🏭" },
            { label: "Trazabilidad de productos químicos", icon: "🔬" },
            { label: "Gestión de EPP y seguridad", icon: "🦺" },
            { label: "Reportes y disposición final", icon: "📊" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="text-lg">{f.icon}</span>
              <span className="text-sm" style={{ color: "rgba(203,230,228,0.75)" }}>{f.label}</span>
            </div>
          ))}
        </div>

        <p className="text-xs" style={{ color: "rgba(148,215,208,0.4)" }}>
          © {new Date().getFullYear()} Sistema de Gestión de Almacén Químico
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-xl"
              style={{ background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)" }}
            >
              <FlaskConical className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white font-serif">Almacén Químico</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(148,215,208,0.7)" }}>Sistema de Gestión</p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-8 shadow-2xl"
            style={{
              backgroundColor: "rgba(255,255,255,0.97)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div className="mb-7">
              <h3 className="text-xl font-bold text-slate-900 font-serif">Iniciar Sesión</h3>
              <p className="text-sm text-slate-500 mt-1">Ingresa tus credenciales para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-700 font-medium">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@almacen.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-700 font-medium">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-semibold text-white shadow-md transition-all duration-150"
                style={{ background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)", border: "none" }}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Iniciando sesión...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>

            {/* Password hint */}
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid #e2e8f0" }}>
              <p className="text-xs text-center" style={{ color: "#94a3b8" }}>
                Tu contraseña es tu usuario + <span className="font-mono font-semibold" style={{ color: "#0d9488" }}>123</span>
                <br />
                <span style={{ color: "#cbd5e1" }}>Ej: jcastillo → contraseña: <span className="font-mono font-semibold" style={{ color: "#64748b" }}>jcastillo123</span></span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
