import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (profiles.length === 0) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const p = profiles[0]!;
  res.json({
    id: p.id,
    userId: p.userId,
    fullName: p.fullName,
    displayName: p.displayName,
    birthDate: p.birthDate,
    country: p.country,
    city: p.city,
    avatarUrl: p.avatarUrl,
    introMessage: p.introMessage,
    dni: p.dni,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  });
});

router.put("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { fullName, displayName, birthDate, country, city, avatarUrl, introMessage, dni } = req.body;

  const existing = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);

  if (existing.length === 0) {
    const id = generateId();
    await db.insert(profilesTable).values({
      id,
      userId,
      fullName: fullName || "Usuario",
      displayName,
      birthDate,
      country,
      city,
      avatarUrl,
      introMessage,
      dni: dni ? dni.trim().toUpperCase() : undefined,
    });
    const newProfile = await db.select().from(profilesTable).where(eq(profilesTable.id, id)).limit(1);
    const p = newProfile[0]!;
    res.json({ id: p.id, userId: p.userId, fullName: p.fullName, displayName: p.displayName, birthDate: p.birthDate, country: p.country, city: p.city, avatarUrl: p.avatarUrl, introMessage: p.introMessage, dni: p.dni, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() });
    return;
  }

  await db.update(profilesTable).set({
    fullName: fullName ?? existing[0]!.fullName,
    displayName: displayName !== undefined ? displayName : existing[0]!.displayName,
    birthDate: birthDate !== undefined ? birthDate : existing[0]!.birthDate,
    country: country !== undefined ? country : existing[0]!.country,
    city: city !== undefined ? city : existing[0]!.city,
    avatarUrl: avatarUrl !== undefined ? avatarUrl : existing[0]!.avatarUrl,
    introMessage: introMessage !== undefined ? introMessage : existing[0]!.introMessage,
    dni: dni !== undefined ? (dni ? dni.trim().toUpperCase() : null) : existing[0]!.dni,
    updatedAt: new Date(),
  }).where(eq(profilesTable.userId, userId));

  const updated = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const p = updated[0]!;
  res.json({ id: p.id, userId: p.userId, fullName: p.fullName, displayName: p.displayName, birthDate: p.birthDate, country: p.country, city: p.city, avatarUrl: p.avatarUrl, introMessage: p.introMessage, dni: p.dni, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() });
});

export default router;
