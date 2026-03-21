import { Router } from "express";
import { db } from "@workspace/db";
import { timeCapsulesTable, profilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";
import { sendTimeCapsuleEmail } from "../lib/email.js";
import { writeAuditLog } from "../lib/audit.js";

const router = Router();

const MAX_CAPSULES_PER_USER = 5;
const MAX_VIDEO_DURATION = 120;

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  return "https://legadoapp.replit.app";
}

// GET /public/:token — portal público (DEBE ir antes de /:id para evitar conflicto)
router.get("/public/:token", async (req, res) => {
  const rows = await db
    .select()
    .from(timeCapsulesTable)
    .where(eq(timeCapsulesTable.accessToken, req.params.token))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Enlace inválido o cápsula no encontrada" });
    return;
  }

  const capsule = rows[0];

  const profiles = await db
    .select({ fullName: profilesTable.fullName, avatarUrl: profilesTable.avatarUrl })
    .from(profilesTable)
    .where(eq(profilesTable.userId, capsule.userId))
    .limit(1);

  writeAuditLog({
    action: "recipient_accessed_portal",
    userId: capsule.userId,
    metadata: { capsuleId: capsule.id, via: "time_capsule" },
  }).catch(() => {});

  res.json({
    title: capsule.title,
    recipientName: capsule.recipientName,
    fromName: profiles[0]?.fullName ?? "Tu ser querido",
    fromAvatarUrl: profiles[0]?.avatarUrl ?? null,
    letterText: capsule.letterText,
    videoUrl: capsule.videoUrl,
    createdAt: capsule.createdAt,
    openDate: capsule.openDate,
  });
});

// GET / — listar cápsulas del usuario
router.get("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const capsules = await db
    .select()
    .from(timeCapsulesTable)
    .where(eq(timeCapsulesTable.userId, userId))
    .orderBy(timeCapsulesTable.createdAt);
  res.json(capsules);
});

// GET /:id — detalle de una cápsula
router.get("/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(timeCapsulesTable)
    .where(and(
      eq(timeCapsulesTable.id, req.params.id),
      eq(timeCapsulesTable.userId, userId)
    ))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Cápsula no encontrada" });
    return;
  }
  res.json(rows[0]);
});

// POST / — crear cápsula
router.post("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  const existing = await db
    .select()
    .from(timeCapsulesTable)
    .where(eq(timeCapsulesTable.userId, userId));

  if (existing.length >= MAX_CAPSULES_PER_USER) {
    res.status(429).json({
      error: `Solo puedes tener ${MAX_CAPSULES_PER_USER} cápsulas activas. Elimina una antes de crear otra.`,
    });
    return;
  }

  const { title, recipientName, recipientEmail, openDate } = req.body;

  if (!title || !recipientName || !recipientEmail || !openDate) {
    res.status(400).json({ error: "Título, destinatario, email y fecha de apertura son requeridos" });
    return;
  }

  const open = new Date(openDate);
  if (open <= new Date()) {
    res.status(400).json({ error: "La fecha de apertura debe ser en el futuro" });
    return;
  }

  const id = generateId();
  await db.insert(timeCapsulesTable).values({
    id,
    userId,
    title,
    recipientName,
    recipientEmail,
    openDate: open,
    status: "draft",
  });

  const created = await db
    .select()
    .from(timeCapsulesTable)
    .where(eq(timeCapsulesTable.id, id))
    .limit(1);

  res.status(201).json(created[0]);
});

// PUT /:id — editar cápsula (solo en draft)
router.put("/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(timeCapsulesTable)
    .where(and(
      eq(timeCapsulesTable.id, req.params.id),
      eq(timeCapsulesTable.userId, userId)
    ))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Cápsula no encontrada" });
    return;
  }

  if (rows[0].status !== "draft") {
    res.status(400).json({ error: "No puedes editar una cápsula sellada o entregada" });
    return;
  }

  const { title, recipientName, recipientEmail, openDate, letterText, videoUrl, videoPublicId, videoDurationSeconds } = req.body;

  if (videoDurationSeconds && videoDurationSeconds > MAX_VIDEO_DURATION) {
    res.status(400).json({ error: "El video no puede durar más de 2 minutos" });
    return;
  }

  await db.update(timeCapsulesTable).set({
    ...(title && { title }),
    ...(recipientName && { recipientName }),
    ...(recipientEmail && { recipientEmail }),
    ...(openDate && { openDate: new Date(openDate) }),
    ...(letterText !== undefined && { letterText }),
    ...(videoUrl !== undefined && { videoUrl }),
    ...(videoPublicId !== undefined && { videoPublicId }),
    ...(videoDurationSeconds !== undefined && { videoDurationSeconds }),
    updatedAt: new Date(),
  }).where(eq(timeCapsulesTable.id, req.params.id));

  const updated = await db
    .select()
    .from(timeCapsulesTable)
    .where(eq(timeCapsulesTable.id, req.params.id))
    .limit(1);

  res.json(updated[0]);
});

// POST /:id/seal — sellar cápsula
router.post("/:id/seal", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(timeCapsulesTable)
    .where(and(
      eq(timeCapsulesTable.id, req.params.id),
      eq(timeCapsulesTable.userId, userId)
    ))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Cápsula no encontrada" });
    return;
  }

  const capsule = rows[0];

  if (capsule.status !== "draft") {
    res.status(400).json({ error: "Esta cápsula ya está sellada" });
    return;
  }

  if (!capsule.letterText && !capsule.videoUrl) {
    res.status(400).json({ error: "Agrega al menos una carta o un video antes de sellar" });
    return;
  }

  await db.update(timeCapsulesTable).set({
    status: "sealed",
    updatedAt: new Date(),
  }).where(eq(timeCapsulesTable.id, req.params.id));

  res.json({ message: "Cápsula sellada. Se entregará automáticamente en la fecha programada." });
});

// DELETE /:id — eliminar cápsula (solo draft o sealed)
router.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select()
    .from(timeCapsulesTable)
    .where(and(
      eq(timeCapsulesTable.id, req.params.id),
      eq(timeCapsulesTable.userId, userId)
    ))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Cápsula no encontrada" });
    return;
  }

  if (rows[0].status === "delivered") {
    res.status(400).json({ error: "No puedes eliminar una cápsula ya entregada" });
    return;
  }

  await db.delete(timeCapsulesTable).where(eq(timeCapsulesTable.id, req.params.id));
  res.json({ message: "Cápsula eliminada" });
});

// Función exportada para el cron job
export async function deliverPendingCapsules(): Promise<void> {
  const now = new Date();

  const pending = await db
    .select()
    .from(timeCapsulesTable)
    .where(eq(timeCapsulesTable.status, "sealed"));

  const due = pending.filter((c) => new Date(c.openDate) <= now);

  if (due.length === 0) return;

  console.log(`[capsules-cron] ${due.length} cápsulas pendientes de entrega`);

  const appUrl = getAppUrl();

  for (const capsule of due) {
    try {
      const token = randomBytes(32).toString("hex");

      await db.update(timeCapsulesTable).set({
        status: "delivered",
        accessToken: token,
        deliveredAt: now,
        updatedAt: now,
      }).where(eq(timeCapsulesTable.id, capsule.id));

      const profiles = await db
        .select({ fullName: profilesTable.fullName })
        .from(profilesTable)
        .where(eq(profilesTable.userId, capsule.userId))
        .limit(1);

      const fromName = profiles[0]?.fullName ?? "Tu ser querido";
      const accessUrl = `${appUrl}/capsula/${token}`;

      await sendTimeCapsuleEmail({
        toEmail: capsule.recipientEmail,
        toName: capsule.recipientName,
        fromName,
        capsuleTitle: capsule.title,
        accessUrl,
        createdAt: capsule.createdAt,
      });

      writeAuditLog({
        action: "legacy_released_auto",
        userId: capsule.userId,
        actorType: "system",
        metadata: { capsuleId: capsule.id, via: "cron" },
      }).catch(() => {});

      console.log(`[capsules-cron] Entregada cápsula ${capsule.id} a ${capsule.recipientEmail}`);
    } catch (err) {
      console.error(`[capsules-cron] Error entregando cápsula ${capsule.id}:`, err);
    }
  }
}

export default router;
