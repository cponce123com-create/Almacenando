import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const timeCapsulesTable = pgTable("time_capsules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  openDate: timestamp("open_date").notNull(),
  status: text("status").notNull().default("draft"),
  videoUrl: text("video_url"),
  videoPublicId: text("video_public_id"),
  videoDurationSeconds: integer("video_duration_seconds"),
  letterText: text("letter_text"),
  accessToken: text("access_token").unique(),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTimeCapsuleSchema = createInsertSchema(timeCapsulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TimeCapsule = typeof timeCapsulesTable.$inferSelect;
export type InsertTimeCapsule = z.infer<typeof insertTimeCapsuleSchema>;
