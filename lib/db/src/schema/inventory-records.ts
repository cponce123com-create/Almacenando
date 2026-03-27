import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const inventoryRecordsTable = pgTable("inventory_records", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productsTable.id),
  recordDate: date("record_date").notNull(),
  previousBalance: numeric("previous_balance").notNull().default("0"),
  inputs: numeric("inputs").notNull().default("0"),
  outputs: numeric("outputs").notNull().default("0"),
  finalBalance: numeric("final_balance").notNull().default("0"),
  // ── NUEVOS CAMPOS ──────────────────────────────────────────────
  physicalCount: numeric("physical_count"),   // Cantidad encontrada en físico
  photoUrl: text("photo_url"),                // URL de la foto de la etiqueta (Cloudinary)
  // ───────────────────────────────────────────────────────────────
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
