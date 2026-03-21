import { Router } from "express";
import { db } from "@workspace/db";
import { trustedContactsTable, profilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";
import { randomBytes } from "crypto";
import { sendTrustedContactInviteEmail } from "../lib/email.js";

const router = Router();

const toContact = (c: typeof trustedContactsTable.$inferSelect) => ({
  id: c.id,
  userId: c.userId,
  fullName: c.fullName,
  email: c.email,
  phone: c.phone,
  relationship: c.relationship,
  dni: c.dni,
  inviteStatus: c.inviteStatus,
  isConfirmed: c.isConfirmed,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.userId, userId));
  res.json(items.map(toContact));
});

router.post("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { fullName, email, phone, relationship, dni } = req.body;

  if (!fullName || !email || !relationship || !dni) {
    res.status(400).json({ error: "fullName, email, relationship, and dni are required" });
    return;
  }

  const id = generateId();
  const confirmToken = randomBytes(32).toString("hex");
  const confirmTokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await db.insert(trustedContactsTable).values({
    id,
    userId,
    fullName,
    email,
    phone,
    relationship,
    dni: dni.toString().toUpperCase(),
    inviteStatus: "pending",
    isConfirmed: false,
    confirmToken,
    confirmTokenExpiresAt,
  });
  const items = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.id, id)).limit(1);
  res.status(201).json(toContact(items[0]!));

  // Send invite email in background — don't await to avoid delaying the response
  db.select({ fullName: profilesTable.fullName })
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1)
    .then(([profile]) => {
      const ownerName = profile?.fullName ?? "Tu contacto de Legado";
      sendTrustedContactInviteEmail({
        toEmail: email,
        toName: fullName,
        ownerName,
        relationship,
      }).catch((err) => console.error("[invite-email] Failed to send to", email, err));
    })
    .catch(() => {});
});

router.post("/:id/regenerate-token", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(trustedContactsTable).where(
    and(eq(trustedContactsTable.id, req.params.id), eq(trustedContactsTable.userId, userId))
  ).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Trusted contact not found" });
    return;
  }
  const newToken = randomBytes(32).toString("hex");
  const newExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await db.update(trustedContactsTable).set({
    confirmToken: newToken,
    confirmTokenExpiresAt: newExpiry,
    updatedAt: new Date(),
  }).where(eq(trustedContactsTable.id, req.params.id));
  res.json({ inviteTokenForEmail: newToken });
});

router.put("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(trustedContactsTable).where(and(eq(trustedContactsTable.id, req.params.id), eq(trustedContactsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Trusted contact not found" });
    return;
  }
  const { fullName, email, phone, relationship, dni } = req.body;
  await db.update(trustedContactsTable).set({
    fullName: fullName ?? existing[0]!.fullName,
    email: email ?? existing[0]!.email,
    phone: phone !== undefined ? phone : existing[0]!.phone,
    relationship: relationship ?? existing[0]!.relationship,
    dni: dni !== undefined ? dni.toString().toUpperCase() : existing[0]!.dni,
    updatedAt: new Date(),
  }).where(eq(trustedContactsTable.id, req.params.id));
  const updated = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.id, req.params.id)).limit(1);
  res.json(toContact(updated[0]!));
});

// POST /verify-dni — consulta RENIEC por DNI (sin auth: también lo usa la página pública)
router.post("/verify-dni", async (req, res) => {
  const { dni } = req.body;
  if (!dni || !/^\d{8}$/.test(String(dni).trim())) {
    res.status(400).json({ error: "DNI debe tener exactamente 8 dígitos numéricos" });
    return;
  }

  const token = process.env.RENIEC_API_TOKEN;
  if (!token) {
    res.status(503).json({ error: "Servicio RENIEC no configurado. Contacta al administrador." });
    return;
  }

  try {
    const response = await fetch(
      `https://api.decolecta.com/v1/reniec/dni?numero=${String(dni).trim()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      res.status(404).json({ error: "DNI no encontrado en RENIEC" });
      return;
    }

    const data: any = await response.json();
    const firstName: string = data.nombres ?? data.nombre ?? "";
    const firstLastName: string = data.apellidoPaterno ?? data.apellido_paterno ?? "";
    const secondLastName: string = data.apellidoMaterno ?? data.apellido_materno ?? "";
    const fullName = [firstName, firstLastName, secondLastName].filter(Boolean).join(" ");

    res.json({ fullName, firstName, firstLastName, secondLastName });
  } catch {
    res.status(503).json({ error: "Error de conexión con RENIEC. Intenta de nuevo." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(trustedContactsTable).where(and(eq(trustedContactsTable.id, req.params.id), eq(trustedContactsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Trusted contact not found" });
    return;
  }
  await db.delete(trustedContactsTable).where(eq(trustedContactsTable.id, req.params.id));
  res.json({ message: "Trusted contact deleted" });
});

export default router;
