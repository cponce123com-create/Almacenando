import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2 } from "lucide-react";

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const valid =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast({ title: "Enlace inválido", description: "No se encontró el token en la URL.", variant: "destructive" });
      return;
    }
    if (!valid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al restablecer contraseña");
      setDone(true);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Enlace inválido</h1>
          <p className="text-slate-500 text-sm mb-6">El enlace de restablecimiento no es válido. Solicita uno nuevo al administrador.</p>
          <Button onClick={() => navigate("/login")} className="w-full bg-blue-600 hover:bg-blue-700">Ir al inicio de sesión</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Contraseña restablecida</h1>
          <p className="text-slate-500 text-sm mb-6">Tu contraseña ha sido actualizada correctamente. Ya puedes iniciar sesión.</p>
          <Button onClick={() => navigate("/login")} className="w-full bg-blue-600 hover:bg-blue-700">Ir al inicio de sesión</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Restablecer contraseña</h1>
            <p className="text-xs text-slate-500">Almacén Químico</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nueva contraseña</Label>
            <PasswordInput value={password} onChange={setPassword} placeholder="Mín. 8 caracteres, 1 mayúscula, 1 número" />
            {password.length > 0 && (
              <ul className="text-xs space-y-0.5 mt-1">
                <li className={password.length >= 8 ? "text-emerald-600" : "text-red-500"}>
                  {password.length >= 8 ? "✓" : "✗"} Al menos 8 caracteres
                </li>
                <li className={/[A-Z]/.test(password) ? "text-emerald-600" : "text-red-500"}>
                  {/[A-Z]/.test(password) ? "✓" : "✗"} Al menos una mayúscula
                </li>
                <li className={/[0-9]/.test(password) ? "text-emerald-600" : "text-red-500"}>
                  {/[0-9]/.test(password) ? "✓" : "✗"} Al menos un número
                </li>
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Confirmar contraseña</Label>
            <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repite la contraseña" />
            {confirm.length > 0 && password !== confirm && (
              <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
            )}
          </div>

          <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={!valid || loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Restablecer contraseña
          </Button>
        </form>
      </div>
    </div>
  );
}
