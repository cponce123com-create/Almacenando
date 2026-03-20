import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  displayName: text("display_name"),
  birthDate: text("birth_date"),
  country: text("country"),
  city: text("city"),
  avatarUrl: text("avatar_url"),
  introMessage: text("intro_message"),
  dni: text("dni"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
