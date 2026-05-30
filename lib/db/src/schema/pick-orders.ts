import { pgTable, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const pickOrderStatusEnum = pgEnum("pick_order_status", [
  "pending", "in_progress", "completed", "cancelled",
]);

export const pickOrdersTable = pgTable("pick_orders", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  status: pickOrderStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertPickOrderSchema = createInsertSchema(pickOrdersTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertPickOrder = z.infer<typeof insertPickOrderSchema>;
export type PickOrder = typeof pickOrdersTable.$inferSelect;
