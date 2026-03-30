import { pgTable, text, timestamp, numeric, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const immobilizedProductsTable = pgTable("immobilized_products", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productsTable.id),
  quantity: numeric("quantity").notNull(),
  reason: text("reason").notNull(),
  immobilizedDate: date("immobilized_date").notNull(),
  status: text("status").notNull().default("immobilized"),
  releasedAt: timestamp("released_at"),
  releasedBy: text("released_by").references(() => usersTable.id),
  notes: text("notes"),
  photos: jsonb("photos").$type<string[]>().default([]),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertImmobilizedProductSchema = createInsertSchema(immobilizedProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertImmobilizedProduct = z.infer<typeof insertImmobilizedProductSchema>;
export type ImmobilizedProduct = typeof immobilizedProductsTable.$inferSelect;
