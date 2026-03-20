import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, getAuthToken } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, User, Save, BadgeCheck } from "lucide-react";
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

  const [form, setForm] = useState<Profile>({ fullName: "" });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      toast({ title: "El nombre completo es requerido", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  };

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
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
            <User className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-gray-900">Mi Perfil</h1>
            <p className="text-sm text-gray-500">Datos personales de tu cuenta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nombre completo */}
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nombre completo <span className="text-red-500">*</span></Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
              placeholder="Ej. María López"
            />
          </div>

          {/* Nombre para mostrar */}
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Cómo te llaman (apodo)</Label>
            <Input
              id="displayName"
              value={form.displayName || ""}
              onChange={(e) => handleChange("displayName", e.target.value)}
              placeholder="Ej. Mary"
            />
          </div>

          {/* DNI */}
          <div className="space-y-1.5">
            <Label htmlFor="dni" className="flex items-center gap-1.5">
              <BadgeCheck className="w-4 h-4 text-violet-500" />
              Número de DNI / Documento de identidad
            </Label>
            <Input
              id="dni"
              value={form.dni || ""}
              onChange={(e) => handleChange("dni", e.target.value.toUpperCase())}
              placeholder="Ej. 12345678A"
              className="uppercase tracking-widest"
            />
            <p className="text-xs text-gray-400">
              Este número permite que tus seres queridos verifiquen si dejaste un legado, sin revelar ningún contenido.
            </p>
          </div>

          {/* Fecha de nacimiento */}
          <div className="space-y-1.5">
            <Label htmlFor="birthDate">Fecha de nacimiento</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate || ""}
              onChange={(e) => handleChange("birthDate", e.target.value)}
            />
          </div>

          {/* País y ciudad */}
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

          {/* Mensaje de introducción */}
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
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
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
