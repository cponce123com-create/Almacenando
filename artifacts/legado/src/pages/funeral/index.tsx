import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useFuneralPrefs, useMutateFuneralPrefs } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Flower2, Loader2, Save, Music2 } from "lucide-react";
import { Input } from "@/components/ui/input";

const BURIAL_TYPES = [
  { value: "cremacion", label: "Cremación" },
  { value: "entierro_tradicional", label: "Entierro tradicional" },
  { value: "entierro_ecologico", label: "Entierro ecológico / natural" },
  { value: "donacion_ciencia", label: "Donación a la ciencia" },
  { value: "mausoleo", label: "Mausoleo / panteón familiar" },
  { value: "otro", label: "Otro (especificar en notas)" },
];

const CEREMONY_TYPES = [
  { value: "intima", label: "Íntima (solo familia cercana)" },
  { value: "religiosa_catolica", label: "Religiosa católica" },
  { value: "religiosa_otra", label: "Religiosa (otra fe)" },
  { value: "civil", label: "Civil / laica" },
  { value: "celebracion_vida", label: "Celebración de vida" },
  { value: "sin_ceremonia", label: "Sin ceremonia" },
  { value: "otra", label: "Otra (especificar en notas)" },
];

const DRESS_CODES = [
  { value: "negro_tradicional", label: "Negro tradicional" },
  { value: "colores_vivos", label: "Colores vivos y alegres" },
  { value: "blanco", label: "Blanco (pureza / paz)" },
  { value: "informal_comodo", label: "Informal y cómodo" },
  { value: "formal_elegante", label: "Formal elegante" },
  { value: "a_eleccion", label: "A elección de cada uno" },
  { value: "tematico", label: "Temático (especificar en notas)" },
];

export default function FuneralPreferences() {
  const { data: prefs, isLoading } = useFuneralPrefs();
  const updateMutation = useMutateFuneralPrefs();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      burialType: "",
      ceremonyType: "",
      spotifyPlaylistUrl: "",
      musicNotes: "",
      dressCode: "",
      guestNotes: "",
      locationNotes: "",
      additionalNotes: "",
    },
  });

  useEffect(() => {
    if (prefs) {
      form.reset({
        burialType: prefs.burialType || "",
        ceremonyType: prefs.ceremonyType || "",
        spotifyPlaylistUrl: (prefs as any).spotifyPlaylistUrl || "",
        musicNotes: prefs.musicNotes || "",
        dressCode: prefs.dressCode || "",
        guestNotes: prefs.guestNotes || "",
        locationNotes: prefs.locationNotes || "",
        additionalNotes: prefs.additionalNotes || "",
      });
    }
  }, [prefs, form]);

  const onSubmit = async (values: any) => {
    try {
      await updateMutation.mutateAsync({ data: values });
      toast({ title: "Preferencias guardadas exitosamente" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (isLoading)
    return (
      <AppLayout>
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-2xl text-gray-900 flex items-center gap-2">
            <Flower2 className="w-6 h-6 text-violet-500" /> Preferencias Funerarias
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Asegúrate de que tus últimos deseos sean respetados. Esta información estará disponible para tus contactos de confianza.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Card className="border border-gray-100 shadow-sm">
            <CardContent className="p-6 space-y-5">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label>Tipo de disposición de restos</Label>
                  <Select
                    value={form.watch("burialType")}
                    onValueChange={(v) => form.setValue("burialType", v)}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {BURIAL_TYPES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Tipo de ceremonia</Label>
                  <Select
                    value={form.watch("ceremonyType")}
                    onValueChange={(v) => form.setValue("ceremonyType", v)}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CEREMONY_TYPES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Código de vestimenta</Label>
                <Select
                  value={form.watch("dressCode")}
                  onValueChange={(v) => form.setValue("dressCode", v)}
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DRESS_CODES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Ubicación deseada</Label>
                <Textarea
                  {...form.register("locationNotes")}
                  className="rounded-xl min-h-[80px]"
                  placeholder="Ej: Iglesia principal del pueblo, esparcir cenizas en el mar…"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Music2 className="w-4 h-4 text-green-500" />
                  Playlist de Spotify para el velatorio
                </Label>
                <Input
                  {...form.register("spotifyPlaylistUrl")}
                  className="rounded-xl h-11"
                  placeholder="https://open.spotify.com/playlist/..."
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  Comparte la música que quieres que suene durante el velatorio. Pega el enlace de tu playlist de Spotify.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Notas sobre la música</Label>
                <Textarea
                  {...form.register("musicNotes")}
                  className="rounded-xl min-h-[80px]"
                  placeholder="Canciones, artistas, géneros musicales que te gustaría que sonaran en la ceremonia…"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Invitados y personas especiales</Label>
                <Textarea
                  {...form.register("guestNotes")}
                  className="rounded-xl min-h-[80px]"
                  placeholder="A quién avisar primero, personas que deben asistir…"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Notas adicionales</Label>
                <Textarea
                  {...form.register("additionalNotes")}
                  className="rounded-xl min-h-[100px]"
                  placeholder="Cualquier otro deseo, lectura específica, petición especial…"
                />
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11 rounded-xl"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Guardar preferencias</>
            )}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
