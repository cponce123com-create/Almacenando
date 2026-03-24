import { pgTable, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  casNumber: text("cas_number"),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  minimumStock: numeric("minimum_stock").notNull().default("0"),
  maximumStock: numeric("maximum_stock"),
  location: text("location"),
  supplier: text("supplier"),
  hazardClass: text("hazard_class"),
  storageConditions: text("storage_conditions"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
