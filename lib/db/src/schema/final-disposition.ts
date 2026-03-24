import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const finalDispositionTable = pgTable("final_disposition", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productsTable.id),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  dispositionType: text("disposition_type").notNull(),
  dispositionDate: date("disposition_date").notNull(),
  contractor: text("contractor"),
  manifestNumber: text("manifest_number"),
  certificateNumber: text("certificate_number"),
  cost: numeric("cost"),
  status: text("status").notNull().default("pending"),
  approvedBy: text("approved_by").references(() => usersTable.id),
  notes: text("notes"),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFinalDispositionSchema = createInsertSchema(finalDispositionTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFinalDisposition = z.infer<typeof insertFinalDispositionSchema>;
export type FinalDisposition = typeof finalDispositionTable.$inferSelect;
