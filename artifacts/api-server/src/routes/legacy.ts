import { Router } from "express";
import { db } from "@workspace/db";
import { legacyItemsTable, legacyItemRecipientsTable, recipientsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

const toItem = (item: typeof legacyItemsTable.$inferSelect) => ({
  id: item.id,
  userId: item.userId,
  type: item.type,
  title: item.title,
  description: item.description,
  contentText: item.contentText,
  status: item.status,
  mediaUrl: item.mediaUrl,
  mediaPublicId: item.mediaPublicId,
  mediaResourceType: item.mediaResourceType,
  mediaEncryptionIv: item.mediaEncryptionIv,
  originalMimeType: item.originalMimeType,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(legacyItemsTable).where(eq(legacyItemsTable.userId, userId));
  res.json(items.map(toItem));
});

router.post("/", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const { type, title, description, contentText, status, mediaUrl, mediaPublicId, mediaResourceType, mediaEncryptionIv, originalMimeType } = req.body;

  if (!type || !title) {
    res.status(400).json({ error: "type and title are required" });
    return;
  }

  const id = generateId();
  await db.insert(legacyItemsTable).values({
    id,
    userId,
    type,
    title,
    description,
    contentText,
    status: status || "draft",
    mediaUrl,
    mediaPublicId,
    mediaResourceType,
    mediaEncryptionIv,
    originalMimeType,
  });

  const items = await db.select().from(legacyItemsTable).where(eq(legacyItemsTable.id, id)).limit(1);
  res.status(201).json(toItem(items[0]!));
});

router.get("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const items = await db.select().from(legacyItemsTable).where(and(eq(legacyItemsTable.id, req.params.id), eq(legacyItemsTable.userId, userId))).limit(1);
  if (items.length === 0) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(toItem(items[0]!));
});

router.put("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(legacyItemsTable).where(and(eq(legacyItemsTable.id, req.params.id), eq(legacyItemsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const { title, description, contentText, status, mediaUrl, mediaPublicId, mediaResourceType, mediaEncryptionIv, originalMimeType } = req.body;
  await db.update(legacyItemsTable).set({
    title: title ?? existing[0]!.title,
    description: description !== undefined ? description : existing[0]!.description,
    contentText: contentText !== undefined ? contentText : existing[0]!.contentText,
    status: status ?? existing[0]!.status,
    mediaUrl: mediaUrl !== undefined ? mediaUrl : existing[0]!.mediaUrl,
    mediaPublicId: mediaPublicId !== undefined ? mediaPublicId : existing[0]!.mediaPublicId,
    mediaResourceType: mediaResourceType !== undefined ? mediaResourceType : existing[0]!.mediaResourceType,
    mediaEncryptionIv: mediaEncryptionIv !== undefined ? mediaEncryptionIv : existing[0]!.mediaEncryptionIv,
    originalMimeType: originalMimeType !== undefined ? originalMimeType : existing[0]!.originalMimeType,
    updatedAt: new Date(),
  }).where(eq(legacyItemsTable.id, req.params.id));

  const updated = await db.select().from(legacyItemsTable).where(eq(legacyItemsTable.id, req.params.id)).limit(1);
  res.json(toItem(updated[0]!));
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(legacyItemsTable).where(and(eq(legacyItemsTable.id, req.params.id), eq(legacyItemsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  await db.delete(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.legacyItemId, req.params.id));
  await db.delete(legacyItemsTable).where(eq(legacyItemsTable.id, req.params.id));
  res.json({ message: "Item deleted" });
});

router.get("/:id/recipients", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(legacyItemsTable).where(and(eq(legacyItemsTable.id, req.params.id), eq(legacyItemsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const links = await db.select().from(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.legacyItemId, req.params.id));
  res.json(links.map((l) => l.recipientId));
});

router.put("/:id/recipients", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const existing = await db.select().from(legacyItemsTable).where(and(eq(legacyItemsTable.id, req.params.id), eq(legacyItemsTable.userId, userId))).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const { recipientIds } = req.body;
  if (!Array.isArray(recipientIds)) {
    res.status(400).json({ error: "recipientIds must be an array" });
    return;
  }

  if (recipientIds.length > 0) {
    const ownedRecipients = await db
      .select({ id: recipientsTable.id })
      .from(recipientsTable)
      .where(
        and(
          inArray(recipientsTable.id, recipientIds),
          eq(recipientsTable.userId, userId)
        )
      );
    const ownedIds = new Set(ownedRecipients.map((r) => r.id));
    const unauthorized = recipientIds.filter((id: string) => !ownedIds.has(id));
    if (unauthorized.length > 0) {
      res.status(403).json({ error: "Uno o más destinatarios no pertenecen a tu cuenta" });
      return;
    }
  }

  await db.delete(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.legacyItemId, req.params.id));
  if (recipientIds.length > 0) {
    await db.insert(legacyItemRecipientsTable).values(recipientIds.map((rId: string) => ({
      id: generateId(),
      legacyItemId: req.params.id,
      recipientId: rId,
    })));
  }
  res.json({ message: "Recipients updated" });
});

export default router;
