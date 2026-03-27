import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const cuadreRecordsTable = pgTable("cuadre_records", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull(),
  cuadreDate: date("cuadre_date").notNull(),
  responsible: text("responsible").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cuadreItemsTable = pgTable("cuadre_items", {
  id: text("id").primaryKey(),
  cuadreId: text("cuadre_id").notNull().references(() => cuadreRecordsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  productDescription: text("product_description").notNull(),
  unit: text("unit").notNull(),
  systemBalance: numeric("system_balance").notNull().default("0"),
  physicalCount: numeric("physical_count").notNull().default("0"),
  difference: numeric("difference").notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCuadreRecordSchema = createInsertSchema(cuadreRecordsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuadreItemSchema = createInsertSchema(cuadreItemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCuadreRecord = z.infer<typeof insertCuadreRecordSchema>;
export type CuadreRecord = typeof cuadreRecordsTable.$inferSelect;
export type CuadreItem = typeof cuadreItemsTable.$inferSelect;
