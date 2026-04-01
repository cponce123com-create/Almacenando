import { pgTable, text, timestamp, doublePrecision, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const surplusProductsTable = pgTable("surplus_products", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => productsTable.id),
  productName: text("product_name"),
  surplusCode: text("surplus_code").notNull().unique(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").notNull(),
  surplusDate: date("surplus_date").notNull(),
  origin: text("origin"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  photos: jsonb("photos").$type<string[]>().default([]),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSurplusSchema = createInsertSchema(surplusProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSurplus = z.infer<typeof insertSurplusSchema>;
export type SurplusProduct = typeof surplusProductsTable.$inferSelect;
