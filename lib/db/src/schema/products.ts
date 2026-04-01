import { pgTable, text, timestamp, doublePrecision, boolean, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull().default("General"),
  type: text("type"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  casNumber: text("cas_number"),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  minimumStock: doublePrecision("minimum_stock").notNull().default(0),
  maximumStock: doublePrecision("maximum_stock"),
  msds: boolean("msds").notNull().default(false),
  msdsUrl: text("msds_url"),
  controlled: boolean("controlled").notNull().default(false),
  location: text("location"),
  supplier: text("supplier"),
  hazardClass: text("hazard_class"),
  storageConditions: text("storage_conditions"),
  notes: text("notes"),
  hazardLevel: text("hazard_level").default("precaucion"),
  hazardPictograms: text("hazard_pictograms").default("[]"),
  firstAid: text("first_aid").default("Lavar con agua 15 min · Usar guantes · Avisar supervisor"),
  status: text("status").notNull().default("active"),
  // ── MSDS Smart Matching fields ──────────────────────────────────────────
  msdsStatus: text("msds_status").default("NONE"),
  msdsScore: integer("msds_score").default(0),
  msdsFileId: text("msds_file_id"),
  msdsFileName: text("msds_file_name"),
  msdsMatchReason: text("msds_match_reason"),
  msdsMatchedBy: text("msds_matched_by"),
  msdsLastCheckedAt: timestamp("msds_last_checked_at"),
  // ───────────────────────────────────────────────────────────────────────
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("products_warehouse_code_uniq").on(table.warehouse, table.code),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
