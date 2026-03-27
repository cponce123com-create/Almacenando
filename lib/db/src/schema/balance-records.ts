import { pgTable, text, timestamp, numeric, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const balanceRecordsTable = pgTable("balance_records", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull(),
  type: text("type"),
  code: text("code").notNull(),
  productDescription: text("product_description").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity").notNull().default("0"),
  balanceDate: date("balance_date").notNull(),
  ultimoConsumo: date("ultimo_consumo"),
  batchId: text("batch_id"),
  notes: text("notes"),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("balance_records_warehouse_date_idx").on(table.warehouse, table.balanceDate),
  index("balance_records_warehouse_code_idx").on(table.warehouse, table.code),
]);

export const insertBalanceRecordSchema = createInsertSchema(balanceRecordsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBalanceRecord = z.infer<typeof insertBalanceRecordSchema>;
export type BalanceRecord = typeof balanceRecordsTable.$inferSelect;
