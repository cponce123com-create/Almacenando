import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const samplesTable = pgTable("samples", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productsTable.id),
  sampleCode: text("sample_code").notNull().unique(),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  sampleDate: date("sample_date").notNull(),
  purpose: text("purpose").notNull(),
  destination: text("destination"),
  labReference: text("lab_reference"),
  status: text("status").notNull().default("pending"),
  result: text("result"),
  notes: text("notes"),
  takenBy: text("taken_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSampleSchema = createInsertSchema(samplesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSample = z.infer<typeof insertSampleSchema>;
export type Sample = typeof samplesTable.$inferSelect;
