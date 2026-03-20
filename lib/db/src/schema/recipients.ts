import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipientsTable = pgTable("recipients", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  relationship: text("relationship").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRecipientSchema = createInsertSchema(recipientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRecipient = z.infer<typeof insertRecipientSchema>;
export type Recipient = typeof recipientsTable.$inferSelect;
