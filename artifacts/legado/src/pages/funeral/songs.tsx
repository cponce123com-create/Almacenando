import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Music, Search, Heart, Trash2, Loader2,
  Play, ExternalLink, ListMusic, Youtube
} from "lucide-react";

const BASE = "/api";

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  durationFormatted: string;
};

type SavedSong = {
  id: string;
  youtubeVideoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  position: number;
};

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function FuneralSongs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: savedSongs = [], isLoading } = useQuery<SavedSong[]>({
    queryKey: ["funeral-songs"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/funeral-songs`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al cargar canciones");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (song: SearchResult) => {
      const res = await fetch(`${BASE}/funeral-songs`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeVideoId: song.videoId,
          title: song.title,
          artist: song.artist,
          thumbnailUrl: song.thumbnailUrl,
          durationSeconds: song.durationSeconds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funeral-songs"] });
      toast({ title: "🎵 Canción agregada a tu lista" });
    },
    onError: (e: any) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/funeral-songs/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funeral-songs"] });
      toast({ title: "Canción eliminada" });
    },
  });

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch(
        `${BASE}/funeral-songs/search?q=${encodeURIComponent(query)}`,
        { headers: getAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results || []);
    } catch (err: any) {
      toast({ title: "Error al buscar", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const isSaved = (videoId: string) =>
    savedSongs.some((s) => s.youtubeVideoId === videoId);

  const totalDuration = savedSongs.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-3">
            <Music className="w-8 h-8" style={{ color: "#9d174d" }} />
            Música para mi despedida
          </h1>
          <p className="text-muted-foreground mt-2">
            Elige las canciones que quieres que suenen en tu sepelio. Busca cualquier canción y agrégala a tu lista personal.
          </p>
        </div>

        {/* Buscador */}
        <div className="bg-white rounded-3xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            Buscar canciones
          </h2>
          <form onSubmit={handleSearch} className="flex gap-3">
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej: My Way Frank Sinatra, Ave María, Cielito Lindo..."
              className="rounded-xl h-12 text-gray-900 flex-1"
            />
            <Button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-xl h-12 px-6 gap-2 shrink-0 text-white"
              style={{ backgroundColor: "#dc2626" }}
            >
              {searching
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />}
              Buscar
            </Button>
          </form>

          {/* Resultados */}
          {results.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">{results.length} resultados — haz click en el corazón para agregar</p>
              {results.map((result) => (
                <div
                  key={result.videoId}
                  className="flex items-center gap-4 p-3 rounded-2xl border border-border hover:bg-gray-50 transition-colors group"
                >
                  <div className="relative shrink-0">
                    <img
                      src={result.thumbnailUrl}
                      alt={result.title}
                      className="w-20 h-14 object-cover rounded-xl"
                    />
                    <button
                      onClick={() =>
                        setPlayingId(playingId === result.videoId ? null : result.videoId)
                      }
                      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Play className="w-6 h-6 text-white fill-white" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{result.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{result.artist}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{result.durationFormatted}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`https://www.youtube.com/watch?v=${result.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      title="Ver en YouTube"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <Button
                      size="sm"
                      onClick={() => saveMutation.mutate(result)}
                      disabled={isSaved(result.videoId) || saveMutation.isPending}
                      className="rounded-xl gap-1.5 h-9 px-4 transition-all text-white"
                      style={
                        isSaved(result.videoId)
                          ? { backgroundColor: "#fce7f3", color: "#9d174d", border: "1px solid #fbcfe8" }
                          : { backgroundColor: "#9d174d" }
                      }
                    >
                      <Heart className={`w-4 h-4 ${isSaved(result.videoId) ? "fill-current" : ""}`} />
                      {isSaved(result.videoId) ? "Guardada" : "Agregar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Preview de YouTube embebido */}
          {playingId && (
            <div className="mt-4 rounded-2xl overflow-hidden border border-border">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-border">
                <span className="text-sm font-medium text-gray-700">Vista previa</span>
                <button
                  onClick={() => setPlayingId(null)}
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  Cerrar ✕
                </button>
              </div>
              <iframe
                src={`https://www.youtube.com/embed/${playingId}?autoplay=1`}
                className="w-full aspect-video"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          )}
        </div>

        {/* Lista de canciones guardadas */}
        <div className="bg-white rounded-3xl border border-border shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <ListMusic className="w-5 h-5" style={{ color: "#9d174d" }} />
              Mi lista de música
              {savedSongs.length > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: "rgba(157,23,77,0.1)", color: "#9d174d" }}
                >
                  {savedSongs.length} canciones
                </span>
              )}
            </h2>
            {totalDuration > 0 && (
              <span className="text-sm text-muted-foreground">
                Duración total: {formatDuration(totalDuration)}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#9d174d" }} />
            </div>
          ) : savedSongs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Music className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Aún no tienes canciones guardadas</p>
              <p className="text-sm mt-1">Busca tus canciones favoritas arriba y agrégalas con el corazón</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedSongs.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center gap-4 p-3 rounded-2xl border border-border hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-sm font-bold text-muted-foreground w-6 text-center shrink-0">
                    {index + 1}
                  </span>
                  <img
                    src={song.thumbnailUrl}
                    alt={song.title}
                    className="w-16 h-11 object-cover rounded-lg shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {song.durationSeconds ? formatDuration(song.durationSeconds) : "--:--"}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`https://www.youtube.com/watch?v=${song.youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Ver en YouTube"
                    >
                      <Youtube className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => deleteMutation.mutate(song.id)}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Tus canciones se guardan de forma segura y estarán disponibles para tus seres queridos cuando llegue el momento.
        </p>
      </div>
    </AppLayout>
  );
}
