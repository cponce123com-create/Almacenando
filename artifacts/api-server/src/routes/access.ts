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
  const tokenRecords = await db
    .select()
    .from(recipientAccessTokensTable)
    .where(eq(recipientAccessTokensTable.token, req.params.token))
    .limit(1);

  if (tokenRecords.length === 0) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  const tokenRecord = tokenRecords[0]!;

  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
    res.status(401).json({ error: "Token expired" });
    return;
  }

  const recipients = await db
    .select()
    .from(recipientsTable)
    .where(eq(recipientsTable.id, tokenRecord.recipientId))
    .limit(1);

  if (recipients.length === 0) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  const recipient = recipients[0]!;

  let items: typeof legacyItemsTable.$inferSelect[] = [];

  if (recipient.accessType === "all") {
    // Full access — return every published item for this user
    items = await db
      .select()
      .from(legacyItemsTable)
      .where(eq(legacyItemsTable.userId, recipient.userId));
  } else {
    // Specific access — return only linked items
    const itemLinks = await db
      .select()
      .from(legacyItemRecipientsTable)
      .where(eq(legacyItemRecipientsTable.recipientId, recipient.id));

    const itemIds = itemLinks.map((l) => l.legacyItemId);
    if (itemIds.length > 0) {
      items = await db
        .select()
        .from(legacyItemsTable)
        .where(inArray(legacyItemsTable.id, itemIds));
    }
  }

  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, recipient.userId))
    .limit(1);

  await db
    .update(recipientAccessTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(recipientAccessTokensTable.token, req.params.token));

  res.json({
    recipient: {
      id: recipient.id,
      userId: recipient.userId,
      fullName: recipient.fullName,
      email: recipient.email,
      phone: recipient.phone,
      relationship: recipient.relationship,
      accessType: recipient.accessType,
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
      mediaEncryptionIv: item.mediaEncryptionIv,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    deceasedName: profiles[0]?.fullName ?? "Tu ser querido",
    deceasedAvatarUrl: profiles[0]?.avatarUrl ?? null,
    deceasedIntroMessage: profiles[0]?.introMessage ?? null,
  });
});

export default router;
