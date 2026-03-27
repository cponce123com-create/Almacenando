import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const inventoryRecordsTable = pgTable("inventory_records", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull().default("General"),
  productId: text("product_id").notNull().references(() => productsTable.id),
  recordDate: date("record_date").notNull(),
  previousBalance: numeric("previous_balance").notNull().default("0"),
  inputs: numeric("inputs").notNull().default("0"),
  outputs: numeric("outputs").notNull().default("0"),
  finalBalance: numeric("final_balance").notNull().default("0"),
  physicalCount: numeric("physical_count"),
  photoUrl: text("photo_url"),
  responsible: text("responsible"),
  notes: text("notes"),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInventoryRecordSchema = createInsertSchema(inventoryRecordsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryRecord = z.infer<typeof insertInventoryRecordSchema>;
export type InventoryRecord = typeof inventoryRecordsTable.$inferSelect;
