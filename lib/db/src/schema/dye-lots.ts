import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const dyeLotsTable = pgTable("dye_lots", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productsTable.id),
  lotNumber: text("lot_number").notNull(),
  quantity: numeric("quantity").notNull(),
  expirationDate: date("expiration_date"),
  receiptDate: date("receipt_date").notNull(),
  supplier: text("supplier"),
  certificateNumber: text("certificate_number"),
  qualityStatus: text("quality_status").notNull().default("pending"),
  approvedBy: text("approved_by").references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  registeredBy: text("registered_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDyeLotSchema = createInsertSchema(dyeLotsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDyeLot = z.infer<typeof insertDyeLotSchema>;
export type DyeLot = typeof dyeLotsTable.$inferSelect;
