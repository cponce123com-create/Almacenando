import { Router } from "express";
import { db } from "@workspace/db";
import {
  recipientAccessTokensTable,
  recipientsTable,
  legacyItemsTable,
  legacyItemRecipientsTable,
  profilesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

router.get("/:token", async (req, res) => {
  const tokenRecords = await db.select().from(recipientAccessTokensTable).where(eq(recipientAccessTokensTable.token, req.params.token)).limit(1);
  if (tokenRecords.length === 0) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  const tokenRecord = tokenRecords[0]!;

  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
    res.status(401).json({ error: "Token expired" });
    return;
  }

  const recipients = await db.select().from(recipientsTable).where(eq(recipientsTable.id, tokenRecord.recipientId)).limit(1);
  if (recipients.length === 0) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  const recipient = recipients[0]!;

  const itemLinks = await db.select().from(legacyItemRecipientsTable).where(eq(legacyItemRecipientsTable.recipientId, recipient.id));
  const itemIds = itemLinks.map((l) => l.legacyItemId);

  let items: typeof legacyItemsTable.$inferSelect[] = [];
  if (itemIds.length > 0) {
    items = await db.select().from(legacyItemsTable).where(inArray(legacyItemsTable.id, itemIds));
  }

  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, recipient.userId)).limit(1);
  const profile = profiles[0];

  await db.update(recipientAccessTokensTable).set({ usedAt: new Date() }).where(eq(recipientAccessTokensTable.token, req.params.token));

  res.json({
    recipient: {
      id: recipient.id,
      userId: recipient.userId,
      fullName: recipient.fullName,
      email: recipient.email,
      phone: recipient.phone,
      relationship: recipient.relationship,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString(),
    },
    items: items.map((item) => ({
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
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    deceasedName: profile?.fullName ?? "Unknown",
    deceasedIntroMessage: profile?.introMessage ?? null,
  });
});

export default router;
