import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useFuneralPrefs, useMutateFuneralPrefs } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Flower2, Loader2, Save, Music2, Link2, CheckCircle2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

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

function extractSpotifyPlaylistId(url: string): string | null {
  try {
    const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export default function FuneralPreferences() {
  const { data: prefs, isLoading } = useFuneralPrefs();
  const updateMutation = useMutateFuneralPrefs();
  const { toast } = useToast();

  const [showSpotifyDialog, setShowSpotifyDialog] = useState(false);
  const [spotifyInput, setSpotifyInput] = useState("");
  const [spotifyError, setSpotifyError] = useState("");

  type FuneralFormValues = {
    burialType: string;
    ceremonyType: string;
    spotifyPlaylistUrl: string;
    musicNotes: string;
    dressCode: string;
    guestNotes: string;
    locationNotes: string;
    additionalNotes: string;
  };
  const form = useForm<FuneralFormValues>({
    defaultValues: {
      burialType: prefs?.burialType || "",
      ceremonyType: prefs?.ceremonyType || "",
      spotifyPlaylistUrl: (prefs as any)?.spotifyPlaylistUrl || "",
      musicNotes: prefs?.musicNotes || "",
      dressCode: prefs?.dressCode || "",
      guestNotes: prefs?.guestNotes || "",
      locationNotes: prefs?.locationNotes || "",
      additionalNotes: prefs?.additionalNotes || "",
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
  }, [
    prefs?.burialType, prefs?.ceremonyType, prefs?.musicNotes, prefs?.dressCode,
    prefs?.guestNotes, prefs?.locationNotes, prefs?.additionalNotes,
  ]);

  const spotifyUrl = form.watch("spotifyPlaylistUrl");
  const spotifyId = spotifyUrl ? extractSpotifyPlaylistId(spotifyUrl) : null;

  const handleLinkSpotify = () => {
    const url = spotifyInput.trim();
    if (!url) { setSpotifyError("Pega la URL de tu playlist de Spotify."); return; }
    const id = extractSpotifyPlaylistId(url);
    if (!id) { setSpotifyError("URL no válida. Debe ser del formato https://open.spotify.com/playlist/..."); return; }
    form.setValue("spotifyPlaylistUrl", url);
    setShowSpotifyDialog(false);
    setSpotifyInput("");
    setSpotifyError("");
  };

  const handleRemoveSpotify = () => {
    form.setValue("spotifyPlaylistUrl", "");
  };

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
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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

              {/* ── Spotify ── */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Music2 className="w-4 h-4 text-green-500" />
                  Música para el velatorio
                </Label>

                {spotifyId ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#1DB954] flex items-center justify-center">
                          <Music2 className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm font-medium text-green-800">Playlist vinculada ✓</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => { setSpotifyInput(spotifyUrl); setShowSpotifyDialog(true); }}
                          className="text-xs text-green-700 hover:underline px-2"
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveSpotify}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <iframe
                      src={`https://open.spotify.com/embed/playlist/${spotifyId}`}
                      width="100%"
                      height="152"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      className="rounded-xl"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSpotifyDialog(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all text-sm text-gray-500 hover:text-green-700 font-medium w-full justify-center"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#1DB954] flex items-center justify-center">
                      <Music2 className="w-3 h-3 text-white" />
                    </div>
                    <Link2 className="w-4 h-4" />
                    Vincular playlist de Spotify
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Notas sobre la música</Label>
                <Textarea
                  {...form.register("musicNotes")}
                  className="rounded-xl min-h-[80px]"
                  placeholder="Canciones, artistas, géneros musicales que te gustaría que sonaran…"
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
            className="w-full h-11 rounded-xl"
            style={{ backgroundColor: "#9d174d", color: "white" }}
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

      {/* Spotify Dialog */}
      <Dialog open={showSpotifyDialog} onOpenChange={(o) => { if (!o) { setSpotifyInput(""); setSpotifyError(""); } setShowSpotifyDialog(o); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#1DB954] flex items-center justify-center">
                <Music2 className="w-3 h-3 text-white" />
              </div>
              Vincular playlist de Spotify
            </DialogTitle>
            <DialogDescription>
              Pega el enlace de tu playlist de Spotify para el velatorio.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Input
              value={spotifyInput}
              onChange={(e) => { setSpotifyInput(e.target.value); setSpotifyError(""); }}
              placeholder="https://open.spotify.com/playlist/..."
              className="rounded-xl h-11"
            />
            {spotifyError && (
              <p className="text-sm text-red-600">{spotifyError}</p>
            )}
            <p className="text-xs text-gray-400">
              En Spotify: abre tu playlist → compartir → copiar enlace
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSpotifyDialog(false); setSpotifyInput(""); setSpotifyError(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleLinkSpotify}
              className="bg-[#1DB954] hover:bg-[#1aa34a] text-white"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
