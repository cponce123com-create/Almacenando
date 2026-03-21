import { Router } from "express";
import { db } from "@workspace/db";
import { funeralSongsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  return h * 3600 + m * 60 + s;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

router.get("/search", requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length < 2) {
    res.status(400).json({ error: "Término de búsqueda requerido" });
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "YouTube no está configurado en este servidor" });
    return;
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", q.trim());
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoCategoryId", "10");
    searchUrl.searchParams.set("maxResults", "10");
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      res.status(500).json({ error: "Error al buscar en YouTube" });
      return;
    }

    const videoIds = searchData.items
      ?.map((item: any) => item.id?.videoId)
      .filter(Boolean)
      .join(",");

    if (!videoIds) {
      res.json({ results: [] });
      return;
    }

    const detailUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailUrl.searchParams.set("part", "contentDetails,snippet");
    detailUrl.searchParams.set("id", videoIds);
    detailUrl.searchParams.set("key", apiKey);

    const detailRes = await fetch(detailUrl.toString());
    const detailData = await detailRes.json();

    const results = detailData.items?.map((item: any) => {
      const seconds = parseDuration(item.contentDetails?.duration || "PT0S");
      return {
        videoId: item.id,
        title: item.snippet?.title || "Sin título",
        artist: item.snippet?.channelTitle || "Artista desconocido",
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url || "",
        durationSeconds: seconds,
        durationFormatted: formatDuration(seconds),
      };
    }) || [];

    res.json({ results });
  } catch (err) {
    console.error("[youtube-search]", err);
    res.status(500).json({ error: "Error interno al buscar" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const songs = await db
    .select()
    .from(funeralSongsTable)
    .where(eq(funeralSongsTable.userId, userId))
    .orderBy(funeralSongsTable.position);
  res.json(songs);
});

router.post("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { youtubeVideoId, title, artist, thumbnailUrl, durationSeconds } = req.body;

  if (!youtubeVideoId || !title) {
    res.status(400).json({ error: "Datos de canción incompletos" });
    return;
  }

  const existing = await db
    .select()
    .from(funeralSongsTable)
    .where(
      and(
        eq(funeralSongsTable.userId, userId),
        eq(funeralSongsTable.youtubeVideoId, youtubeVideoId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Esta canción ya está en tu lista" });
    return;
  }

  const allSongs = await db
    .select()
    .from(funeralSongsTable)
    .where(eq(funeralSongsTable.userId, userId));

  const id = generateId();
  await db.insert(funeralSongsTable).values({
    id,
    userId,
    youtubeVideoId,
    title,
    artist,
    thumbnailUrl: thumbnailUrl || "",
    durationSeconds: durationSeconds || 0,
    position: allSongs.length,
  });

  const created = await db
    .select()
    .from(funeralSongsTable)
    .where(eq(funeralSongsTable.id, id))
    .limit(1);

  res.status(201).json(created[0]);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const existing = await db
    .select()
    .from(funeralSongsTable)
    .where(
      and(
        eq(funeralSongsTable.id, req.params.id),
        eq(funeralSongsTable.userId, userId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Canción no encontrada" });
    return;
  }

  await db
    .delete(funeralSongsTable)
    .where(eq(funeralSongsTable.id, req.params.id));

  res.json({ message: "Canción eliminada" });
});

export default router;
