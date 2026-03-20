import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const funeralPreferencesTable = pgTable("funeral_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  burialType: text("burial_type"),
  ceremonyType: text("ceremony_type"),
  musicNotes: text("music_notes"),
  dressCode: text("dress_code"),
  guestNotes: text("guest_notes"),
  locationNotes: text("location_notes"),
  additionalNotes: text("additional_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFuneralPreferencesSchema = createInsertSchema(funeralPreferencesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFuneralPreferences = z.infer<typeof insertFuneralPreferencesSchema>;
export type FuneralPreferences = typeof funeralPreferencesTable.$inferSelect;
