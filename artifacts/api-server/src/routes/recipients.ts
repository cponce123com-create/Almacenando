import { Router } from "express";
import { db } from "@workspace/db";
import { recipientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

const toRecipient = (r: typeof recipientsTable.$inferSelect) => ({
  id: r.id,
  userId: r.userId,
  fullName: r.fullName,
  email: r.email,
  phone: r.phone,
  relationship: r.relationship,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(recipientsTable).where(eq(recipientsTable.userId, userId));
  res.json(items.map(toRecipient));
});

router.post("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { fullName, email, phone, relationship } = req.body;

  if (!fullName || !email || !relationship) {
    res.status(400).json({ error: "fullName, email, and relationship are required" });
    return;
  }

  const id = generateId();
  await db.insert(recipientsTable).values({ id, userId, fullName, email, phone, relationship });
  const items = await db.select().from(recipientsTable).where(eq(recipientsTable.id, id)).limit(1);
  res.status(201).json(toRecipient(items[0]!));
});

router.put("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(recipientsTable).where(and(eq(recipientsTable.id, req.params.id), eq(recipientsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }
  const { fullName, email, phone, relationship } = req.body;
  await db.update(recipientsTable).set({
    fullName: fullName ?? existing[0]!.fullName,
    email: email ?? existing[0]!.email,
    phone: phone !== undefined ? phone : existing[0]!.phone,
    relationship: relationship ?? existing[0]!.relationship,
    updatedAt: new Date(),
  }).where(eq(recipientsTable.id, req.params.id));
  const updated = await db.select().from(recipientsTable).where(eq(recipientsTable.id, req.params.id)).limit(1);
  res.json(toRecipient(updated[0]!));
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(recipientsTable).where(and(eq(recipientsTable.id, req.params.id), eq(recipientsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }
  await db.delete(recipientsTable).where(eq(recipientsTable.id, req.params.id));
  res.json({ message: "Recipient deleted" });
});

export default router;
