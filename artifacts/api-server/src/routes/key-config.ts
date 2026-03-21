import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { profilesTable, trustedContactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sendEncryptionKeyEmail } from "../lib/email.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const profile = profiles[0];
  if (!profile) {
    res.status(404).json({ error: "Perfil no encontrado" });
    return;
  }
  res.json({
    hasSecretQuestion: !!profile.secretQuestion,
    secretQuestion: profile.secretQuestion ?? null,
    hasStoredKey: !!profile.encryptedLegacyKey,
  });
});

router.post("/secret-question", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { secretQuestion, secretAnswer, encryptionKey } = req.body;

  if (!secretQuestion || typeof secretQuestion !== "string" || secretQuestion.trim().length < 5) {
    res.status(400).json({ error: "La pregunta debe tener al menos 5 caracteres" });
    return;
  }
  if (!secretAnswer || typeof secretAnswer !== "string" || secretAnswer.trim().split(" ").length > 1) {
    res.status(400).json({ error: "La respuesta debe ser exactamente una palabra" });
    return;
  }
  if (!encryptionKey || typeof encryptionKey !== "string") {
    res.status(400).json({ error: "Clave de cifrado requerida" });
    return;
  }

  const answerHash = await bcrypt.hash(secretAnswer.trim().toLowerCase(), 10);

  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (profiles.length === 0) {
    res.status(404).json({ error: "Perfil no encontrado" });
    return;
  }

  await db.update(profilesTable).set({
    secretQuestion: secretQuestion.trim(),
    secretAnswerHash: answerHash,
    encryptedLegacyKey: encryptionKey,
    updatedAt: new Date(),
  }).where(eq(profilesTable.userId, userId));

  res.json({ ok: true });
});

router.delete("/secret-question", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  await db.update(profilesTable).set({
    secretQuestion: null,
    secretAnswerHash: null,
    encryptedLegacyKey: null,
    updatedAt: new Date(),
  }).where(eq(profilesTable.userId, userId));
  res.json({ ok: true });
});

router.post("/send-email", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { encryptionKey, contactIds } = req.body;

  if (!encryptionKey || typeof encryptionKey !== "string") {
    res.status(400).json({ error: "Clave de cifrado requerida" });
    return;
  }
  if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
    res.status(400).json({ error: "Selecciona al menos un contacto" });
    return;
  }

  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const ownerName = profiles[0]?.fullName ?? "Tu ser querido";

  const contacts = await db
    .select()
    .from(trustedContactsTable)
    .where(eq(trustedContactsTable.userId, userId));

  const selected = contacts.filter((c) => contactIds.includes(c.id));

  if (selected.length === 0) {
    res.status(400).json({ error: "No se encontraron los contactos seleccionados" });
    return;
  }

  const results: { email: string; ok: boolean }[] = [];

  for (const contact of selected) {
    try {
      await sendEncryptionKeyEmail({
        toEmail: contact.email,
        toName: contact.fullName,
        ownerName,
        encryptionKey,
      });
      results.push({ email: contact.email, ok: true });
    } catch {
      results.push({ email: contact.email, ok: false });
    }
  }

  res.json({ results });
});

export default router;
