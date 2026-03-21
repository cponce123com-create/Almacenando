import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, User, ShieldCheck, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { UserResponse } from "@workspace/api-client-react";

const ADMIN_TOKEN_KEY = "legado_admin_token";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type RoleChoice = {
  hasUser: boolean;
  hasAdmin: boolean;
  userToken?: string;
  userInfo?: UserResponse;
  userEncryptionKey?: string;
  adminToken?: string;
};

export default function Login() {
  const [_, setLocation] = useLocation();
  const { login, setUserSession } = useAuth();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [roleChoice, setRoleChoice] = useState<RoleChoice | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setIsPending(true);

    // Try both user and admin login in parallel
    const [userResult, adminResult] = await Promise.allSettled([
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }).then(r => r.ok ? r.json() : Promise.reject()),
      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }).then(r => r.ok ? r.json() : Promise.reject()),
    ]);

    const hasUser = userResult.status === "fulfilled";
    const hasAdmin = adminResult.status === "fulfilled";
    const userPayload = hasUser ? (userResult as PromiseFulfilledResult<any>).value : undefined;
    const adminToken = hasAdmin ? (adminResult as PromiseFulfilledResult<any>).value?.token : undefined;

    setIsPending(false);

    if (!hasUser && !hasAdmin) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: "Correo o contraseña incorrectos.",
      });
      return;
    }

    // Both roles available → show selection
    if (hasUser && hasAdmin) {
      setRoleChoice({ hasUser, hasAdmin, userToken: userPayload?.token, userInfo: userPayload?.user, userEncryptionKey: userPayload?.encryptionKey, adminToken });
      return;
    }

    // Only user
    if (hasUser && userPayload) {
      setUserSession(userPayload.token, userPayload.user, userPayload.encryptionKey);
      setLocation("/dashboard");
      return;
    }

    // Only admin
    if (hasAdmin && adminToken) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      setLocation("/admin");
    }
  }

  function enterAsUser() {
    if (!roleChoice?.userToken || !roleChoice?.userInfo) return;
    setUserSession(roleChoice.userToken, roleChoice.userInfo, roleChoice.userEncryptionKey);
    setLocation("/dashboard");
  }

  function enterAsAdmin() {
    if (!roleChoice?.adminToken) return;
    sessionStorage.setItem(ADMIN_TOKEN_KEY, roleChoice.adminToken);
    setLocation("/admin");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Auth background"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {/* ROLE SELECTION SCREEN */}
        {roleChoice ? (
          <motion.div
            key="role-select"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 w-full max-w-md p-8 bg-card/80 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl m-4"
          >
            <div className="text-center mb-8">
              <h1 className="font-serif text-2xl font-bold text-foreground">¿Cómo deseas ingresar?</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Tu cuenta tiene acceso a dos áreas. Elige con cuál quieres continuar.
              </p>
            </div>

            <div className="space-y-4">
              {/* User option */}
              <button
                onClick={enterAsUser}
                className="w-full group flex items-center gap-5 p-5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Mi área personal</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Gestiona tu legado, mensajes y destinatarios</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>

              {/* Admin option */}
              <button
                onClick={enterAsAdmin}
                className="w-full group flex items-center gap-5 p-5 rounded-2xl border-2 border-border hover:border-rose-400 hover:bg-rose-50 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6 text-rose-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Panel de administración</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Gestiona usuarios y liberaciones de datos</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-rose-500 group-hover:translate-x-1 transition-all" />
              </button>
            </div>

            <button
              onClick={() => setRoleChoice(null)}
              className="mt-6 w-full text-sm text-center text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Volver al inicio de sesión
            </button>
          </motion.div>
        ) : (
          /* LOGIN FORM */
          <motion.div
            key="login-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 w-full max-w-md p-8 bg-card/80 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-2xl rounded-3xl m-4"
          >
            <div className="mb-8">
              <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al inicio
              </Link>
              <h1 className="font-serif text-3xl font-bold text-foreground">Iniciar Sesión</h1>
              <p className="text-muted-foreground mt-2">Accede a tu cuenta de Legado para continuar preparando tu historia.</p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  className="rounded-xl h-12 bg-white/50 dark:bg-black/50"
                  autoComplete="email"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="rounded-xl h-12 bg-white/50 dark:bg-black/50"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-md font-medium shadow-lg shadow-primary/25"
                disabled={isPending}
              >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              ¿No tienes una cuenta?{" "}
              <Link href="/register" className="text-primary hover:underline font-medium">
                Regístrate aquí
              </Link>
            </div>

            <div className="mt-4 pt-4 border-t border-border text-center">
              <Link
                href="/admin/login"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-rose-600 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Acceso de Administrador
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
