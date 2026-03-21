import { Router } from "express";
import { db } from "@workspace/db";
import { funeralPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

const toPrefs = (p: typeof funeralPreferencesTable.$inferSelect) => ({
  id: p.id,
  userId: p.userId,
  burialType: p.burialType,
  ceremonyType: p.ceremonyType,
  spotifyPlaylistUrl: p.spotifyPlaylistUrl,
  musicNotes: p.musicNotes,
  dressCode: p.dressCode,
  guestNotes: p.guestNotes,
  locationNotes: p.locationNotes,
  additionalNotes: p.additionalNotes,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(funeralPreferencesTable).where(eq(funeralPreferencesTable.userId, userId)).limit(1);
  if (items.length === 0) {
    const id = generateId();
    await db.insert(funeralPreferencesTable).values({ id, userId });
    const created = await db.select().from(funeralPreferencesTable).where(eq(funeralPreferencesTable.id, id)).limit(1);
    res.json(toPrefs(created[0]!));
    return;
  }
  res.json(toPrefs(items[0]!));
});

router.put("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { burialType, ceremonyType, spotifyPlaylistUrl, musicNotes, dressCode, guestNotes, locationNotes, additionalNotes } = req.body;

  const existing = await db.select().from(funeralPreferencesTable).where(eq(funeralPreferencesTable.userId, userId)).limit(1);
  if (existing.length === 0) {
    const id = generateId();
    await db.insert(funeralPreferencesTable).values({ id, userId, burialType, ceremonyType, spotifyPlaylistUrl, musicNotes, dressCode, guestNotes, locationNotes, additionalNotes });
    const created = await db.select().from(funeralPreferencesTable).where(eq(funeralPreferencesTable.id, id)).limit(1);
    res.json(toPrefs(created[0]!));
    return;
  }

  await db.update(funeralPreferencesTable).set({
    burialType: burialType !== undefined ? burialType : existing[0]!.burialType,
    ceremonyType: ceremonyType !== undefined ? ceremonyType : existing[0]!.ceremonyType,
    spotifyPlaylistUrl: spotifyPlaylistUrl !== undefined ? spotifyPlaylistUrl : existing[0]!.spotifyPlaylistUrl,
    musicNotes: musicNotes !== undefined ? musicNotes : existing[0]!.musicNotes,
    dressCode: dressCode !== undefined ? dressCode : existing[0]!.dressCode,
    guestNotes: guestNotes !== undefined ? guestNotes : existing[0]!.guestNotes,
    locationNotes: locationNotes !== undefined ? locationNotes : existing[0]!.locationNotes,
    additionalNotes: additionalNotes !== undefined ? additionalNotes : existing[0]!.additionalNotes,
    updatedAt: new Date(),
  }).where(eq(funeralPreferencesTable.userId, userId));

  const updated = await db.select().from(funeralPreferencesTable).where(eq(funeralPreferencesTable.userId, userId)).limit(1);
  res.json(toPrefs(updated[0]!));
});

export default router;
