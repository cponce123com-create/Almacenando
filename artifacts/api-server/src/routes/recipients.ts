import { Router } from "express";
import { db } from "@workspace/db";
import { recipientsTable, legacyItemRecipientsTable, legacyItemsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

async function getLinkedItemIds(recipientId: string): Promise<string[]> {
  const links = await db
    .select()
    .from(legacyItemRecipientsTable)
    .where(eq(legacyItemRecipientsTable.recipientId, recipientId));
  return links.map((l) => l.legacyItemId);
}

async function syncItemLinks(recipientId: string, legacyItemIds: string[]): Promise<void> {
  await db.delete(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.recipientId, recipientId));
  if (legacyItemIds.length > 0) {
    await db.insert(legacyItemRecipientsTable).values(
      legacyItemIds.map((itemId) => ({
        id: generateId(),
        legacyItemId: itemId,
        recipientId,
      }))
    );
  }
}

const toRecipient = (r: typeof recipientsTable.$inferSelect, legacyItemIds: string[] = []) => ({
  id: r.id,
  userId: r.userId,
  fullName: r.fullName,
  email: r.email,
  phone: r.phone,
  relationship: r.relationship,
  accessType: r.accessType,
  legacyItemIds,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(recipientsTable).where(eq(recipientsTable.userId, userId));
  const result = await Promise.all(
    items.map(async (r) => toRecipient(r, await getLinkedItemIds(r.id)))
  );
  res.json(result);
});

router.post("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { fullName, email, phone, relationship, accessType, legacyItemIds } = req.body;

  if (!fullName || !email || !relationship) {
    res.status(400).json({ error: "fullName, email, and relationship are required" });
    return;
  }

  const type = accessType === "all" ? "all" : "specific";
  const id = generateId();
  await db.insert(recipientsTable).values({ id, userId, fullName, email, phone, relationship, accessType: type });

  if (type === "specific" && Array.isArray(legacyItemIds)) {
    await syncItemLinks(id, legacyItemIds);
  }

  const row = await db.select().from(recipientsTable).where(eq(recipientsTable.id, id)).limit(1);
  const linkedIds = type === "specific" ? await getLinkedItemIds(id) : [];
  res.status(201).json(toRecipient(row[0]!, linkedIds));
});

router.put("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db
    .select()
    .from(recipientsTable)
    .where(and(eq(recipientsTable.id, req.params.id), eq(recipientsTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  const cur = existing[0]!;
  const { fullName, email, phone, relationship, accessType, legacyItemIds } = req.body;
  const type = accessType === "all" ? "all" : accessType === "specific" ? "specific" : cur.accessType;

  await db.update(recipientsTable).set({
    fullName: fullName ?? cur.fullName,
    email: email ?? cur.email,
    phone: phone !== undefined ? phone : cur.phone,
    relationship: relationship ?? cur.relationship,
    accessType: type,
    updatedAt: new Date(),
  }).where(eq(recipientsTable.id, req.params.id));

  if (type === "specific" && Array.isArray(legacyItemIds)) {
    await syncItemLinks(req.params.id, legacyItemIds);
  } else if (type === "all") {
    await db.delete(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.recipientId, req.params.id));
  }

  const updated = await db.select().from(recipientsTable).where(eq(recipientsTable.id, req.params.id)).limit(1);
  const linkedIds = type === "specific" ? await getLinkedItemIds(req.params.id) : [];
  res.json(toRecipient(updated[0]!, linkedIds));
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db
    .select()
    .from(recipientsTable)
    .where(and(eq(recipientsTable.id, req.params.id), eq(recipientsTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  await db.delete(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.recipientId, req.params.id));
  await db.delete(recipientsTable).where(eq(recipientsTable.id, req.params.id));
  res.json({ message: "Recipient deleted" });
});

export default router;
