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
import { Loader2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña es requerida"),
});

export default function Login() {
  const [_, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      setIsPending(true);
      await login(values);
      toast({ title: "Bienvenido de vuelta" });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: error.message,
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Auth background"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-3xl"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
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
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
            </div>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••"
              className="rounded-xl h-12 bg-white/50 dark:bg-black/50"
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

        <div className="mt-8 text-center text-sm text-muted-foreground">
          ¿No tienes una cuenta?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Regístrate aquí
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
