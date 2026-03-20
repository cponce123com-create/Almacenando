import { Router } from "express";
import { db } from "@workspace/db";
import { trustedContactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

const toContact = (c: typeof trustedContactsTable.$inferSelect) => ({
  id: c.id,
  userId: c.userId,
  fullName: c.fullName,
  email: c.email,
  phone: c.phone,
  relationship: c.relationship,
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
  const { fullName, email, phone, relationship } = req.body;

  if (!fullName || !email || !relationship) {
    res.status(400).json({ error: "fullName, email, and relationship are required" });
    return;
  }

  const id = generateId();
  await db.insert(trustedContactsTable).values({
    id,
    userId,
    fullName,
    email,
    phone,
    relationship,
    inviteStatus: "pending",
    isConfirmed: false,
  });
  const items = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.id, id)).limit(1);
  res.status(201).json(toContact(items[0]!));
});

router.put("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(trustedContactsTable).where(and(eq(trustedContactsTable.id, req.params.id), eq(trustedContactsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Trusted contact not found" });
    return;
  }
  const { fullName, email, phone, relationship } = req.body;
  await db.update(trustedContactsTable).set({
    fullName: fullName ?? existing[0]!.fullName,
    email: email ?? existing[0]!.email,
    phone: phone !== undefined ? phone : existing[0]!.phone,
    relationship: relationship ?? existing[0]!.relationship,
    updatedAt: new Date(),
  }).where(eq(trustedContactsTable.id, req.params.id));
  const updated = await db.select().from(trustedContactsTable).where(eq(trustedContactsTable.id, req.params.id)).limit(1);
  res.json(toContact(updated[0]!));
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
