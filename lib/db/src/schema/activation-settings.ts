import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activationSettingsTable = pgTable("activation_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  minConfirmations: integer("min_confirmations").notNull().default(2),
  adminReviewRequired: boolean("admin_review_required").notNull().default(true),
  status: text("status").notNull().default("inactive"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertActivationSettingsSchema = createInsertSchema(activationSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertActivationSettings = z.infer<typeof insertActivationSettingsSchema>;
export type ActivationSettings = typeof activationSettingsTable.$inferSelect;
