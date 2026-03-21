import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

const ADMIN_TOKEN_KEY = "legado_admin_token";

const schema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

export default function AdminLogin() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    try {
      setIsPending(true);
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Credenciales inválidas");
      }

      const result = await res.json();
      sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      toast({ title: "Acceso concedido", description: "Bienvenido al panel de administración." });
      setLocation("/admin");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de acceso",
        description: error.message,
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7 text-rose-600" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Panel de Administración</h1>
          <p className="text-sm text-zinc-500 mt-1 text-center">Acceso restringido a administradores de Legado</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-zinc-700">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@legado.com"
              className="rounded-xl h-11"
              autoComplete="email"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-zinc-700">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              className="rounded-xl h-11"
              autoComplete="current-password"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-11 rounded-xl font-medium"
            style={{ backgroundColor: "#9d174d", color: "white" }}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar al panel"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
