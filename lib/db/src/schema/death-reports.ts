import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deathReportsTable = pgTable("death_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  reportedByContactId: text("reported_by_contact_id").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deathConfirmationsTable = pgTable("death_confirmations", {
  id: text("id").primaryKey(),
  deathReportId: text("death_report_id").notNull(),
  trustedContactId: text("trusted_contact_id").notNull(),
  decision: text("decision").notNull(),
  comments: text("comments"),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
});

export const releaseEventsTable = pgTable("release_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  deathReportId: text("death_report_id").notNull(),
  releasedAt: timestamp("released_at").notNull().defaultNow(),
  releasedByAdminId: text("released_by_admin_id"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const recipientAccessTokensTable = pgTable("recipient_access_tokens", {
  id: text("id").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  releaseEventId: text("release_event_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeathReportSchema = createInsertSchema(deathReportsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeathReport = z.infer<typeof insertDeathReportSchema>;
export type DeathReport = typeof deathReportsTable.$inferSelect;
export type DeathConfirmation = typeof deathConfirmationsTable.$inferSelect;
export type ReleaseEvent = typeof releaseEventsTable.$inferSelect;
export type RecipientAccessToken = typeof recipientAccessTokensTable.$inferSelect;
