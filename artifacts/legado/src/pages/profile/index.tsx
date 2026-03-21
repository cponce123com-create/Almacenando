import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, getAuthToken } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, User, Save, BadgeCheck, Camera, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Profile = {
  id?: string;
  fullName: string;
  displayName?: string;
  birthDate?: string;
  country?: string;
  city?: string;
  introMessage?: string;
  dni?: string;
  avatarUrl?: string;
};

async function fetchProfile(token: string): Promise<Profile> {
  const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return { fullName: "" };
  if (!res.ok) throw new Error("Error al cargar el perfil");
  return res.json();
}

async function saveProfile(token: string, data: Profile): Promise<Profile> {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error al guardar el perfil");
  return res.json();
}

export default function ProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken() || "";
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Profile>({ fullName: "" });
  const [avatarUploading, setAvatarUploading] = useState(false);

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(token),
  });

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (data: Profile) => saveProfile(token, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "Perfil guardado", description: "Tus datos se actualizaron correctamente." });
    },
    onError: () => {
      toast({ title: "Error al guardar", variant: "destructive" });
    },
  });

  const handleChange = (field: keyof Profile, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Solo se permiten imágenes", variant: "destructive" });
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Error al subir la imagen");
      const { url } = await res.json();
      const updated = { ...form, avatarUrl: url };
      setForm(updated);
      await saveProfile(token, updated);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "Foto de perfil actualizada" });
    } catch {
      toast({ title: "Error al subir la foto", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      toast({ title: "El nombre completo es requerido", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  };

  const initials = form.fullName
    ? form.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-2xl text-gray-900">Mi Perfil</h1>
          <p className="text-sm text-gray-500">Datos personales de tu cuenta</p>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-violet-100 flex items-center justify-center">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-violet-600">{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
            >
              {avatarUploading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarUpload(f);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Foto de perfil</p>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="text-xs text-violet-600 hover:underline flex items-center gap-1 mt-0.5"
            >
              <Upload className="w-3 h-3" />
              {form.avatarUrl ? "Cambiar foto" : "Subir foto"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nombre completo <span className="text-red-500">*</span></Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
              placeholder="Ej. María López"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Cómo te llaman (apodo)</Label>
            <Input
              id="displayName"
              value={form.displayName || ""}
              onChange={(e) => handleChange("displayName", e.target.value)}
              placeholder="Ej. Mary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dni" className="flex items-center gap-1.5">
              <BadgeCheck className="w-4 h-4 text-violet-500" />
              Número de DNI / Documento de identidad <span className="text-red-500">*</span>
            </Label>
            <Input
              id="dni"
              value={form.dni || ""}
              onChange={(e) => handleChange("dni", e.target.value.toUpperCase())}
              placeholder="Ej. 12345678A"
              className="uppercase tracking-widest"
            />
            <p className="text-xs text-gray-400">
              Tu DNI es la clave que permite verificar tu legado y es usada para el proceso de activación.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="birthDate">Fecha de nacimiento</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate || ""}
              onChange={(e) => handleChange("birthDate", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                value={form.country || ""}
                onChange={(e) => handleChange("country", e.target.value)}
                placeholder="Ej. España"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                value={form.city || ""}
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="Ej. Madrid"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="introMessage">Mensaje de introducción</Label>
            <Textarea
              id="introMessage"
              value={form.introMessage || ""}
              onChange={(e) => handleChange("introMessage", e.target.value)}
              placeholder="Un breve mensaje para quienes reciban tu legado…"
              rows={3}
            />
          </div>

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="w-full text-white"
            style={{ backgroundColor: "#9d174d" }}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Guardar cambios</>
            )}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
