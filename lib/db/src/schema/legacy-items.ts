import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const legacyItemsTable = pgTable("legacy_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  contentText: text("content_text"),
  status: text("status").notNull().default("draft"),
  mediaUrl: text("media_url"),
  mediaPublicId: text("media_public_id"),
  mediaResourceType: text("media_resource_type"),
  mediaEncryptionIv: text("media_encryption_iv"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const legacyItemRecipientsTable = pgTable("legacy_item_recipients", {
  id: text("id").primaryKey(),
  legacyItemId: text("legacy_item_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLegacyItemSchema = createInsertSchema(legacyItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLegacyItem = z.infer<typeof insertLegacyItemSchema>;
export type LegacyItem = typeof legacyItemsTable.$inferSelect;
export type LegacyItemRecipient = typeof legacyItemRecipientsTable.$inferSelect;
