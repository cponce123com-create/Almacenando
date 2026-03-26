import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, getAuthHeaders, ROLE_LABELS, ROLE_COLORS } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { User, Lock, Loader2, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { clsx } from "clsx";

interface ProfileData {
  name: string;
  email: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [passwordData, setPasswordData] = useState<PasswordData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [profileChanged, setProfileChanged] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name,
        email: user.email,
      });
    }
  }, [user]);

  const handleProfileChange = (field: keyof ProfileData, value: string) => {
    setProfileData({ ...profileData, [field]: value });
    setProfileChanged(true);
  };

  const handlePasswordChange = (field: keyof PasswordData, value: string) => {
    setPasswordData({ ...passwordData, [field]: value });
    setPasswordChanged(true);
  };

  const handleUpdateProfile = async () => {
    if (!profileData.name || !profileData.email) {
      toast({ title: "Error", description: "Completa todos los campos", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileData.name,
          email: profileData.email,
        }),
      });

      if (response.ok) {
        setProfileChanged(false);
        toast({ title: "Éxito", description: "Perfil actualizado correctamente" });
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "No se pudo actualizar el perfil", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al actualizar perfil", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({ title: "Error", description: "Completa todos los campos", variant: "destructive" });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast({ title: "Error", description: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setShowPasswordForm(false);
        setPasswordChanged(false);
        toast({ title: "Éxito", description: "Contraseña actualizada correctamente" });
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "No se pudo actualizar la contraseña", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al actualizar contraseña", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
            <User className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mi Perfil</h1>
            <p className="text-slate-500 text-sm">Gestiona tu información personal y seguridad</p>
          </div>
        </div>

        {/* Información del usuario */}
        <Card>
          <CardHeader>
            <CardTitle>Información Personal</CardTitle>
            <CardDescription>Actualiza tu nombre y correo electrónico</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Nombre</label>
                <Input
                  value={profileData.name}
                  onChange={(e) => handleProfileChange("name", e.target.value)}
                  placeholder="Tu nombre completo"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Correo</label>
                <Input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => handleProfileChange("email", e.target.value)}
                  placeholder="tu@correo.com"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleUpdateProfile}
                disabled={!profileChanged || loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Guardar Cambios
              </Button>
              {profileChanged && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <AlertCircle className="w-4 h-4" />
                  Tienes cambios sin guardar
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Información de rol */}
        <Card>
          <CardHeader>
            <CardTitle>Información de Cuenta</CardTitle>
            <CardDescription>Detalles de tu cuenta en el sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">ID de Usuario</label>
                <div className="mt-1 p-2 bg-slate-50 rounded border border-slate-200">
                  <code className="text-sm text-slate-600">{user.id}</code>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Rol</label>
                <div className="mt-1">
                  <span className={clsx("text-sm px-3 py-1.5 rounded-full font-medium inline-block", ROLE_COLORS[user.role as keyof typeof ROLE_COLORS])}>
                    {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Miembro desde</label>
              <div className="mt-1 p-2 bg-slate-50 rounded border border-slate-200">
                <p className="text-sm text-slate-600">
                  {new Date(user.createdAt).toLocaleDateString("es-PE", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cambio de contraseña */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Seguridad
            </CardTitle>
            <CardDescription>Gestiona tu contraseña</CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
                Cambiar Contraseña
              </Button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Contraseña Actual</label>
                  <Input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                    placeholder="Tu contraseña actual"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Nueva Contraseña</label>
                  <Input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Confirmar Contraseña</label>
                  <Input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                    placeholder="Repite tu nueva contraseña"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleUpdatePassword}
                    disabled={!passwordChanged || loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Actualizar Contraseña
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
                      setPasswordChanged(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
