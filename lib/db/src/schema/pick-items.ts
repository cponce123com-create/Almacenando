import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pickOrdersTable } from "./pick-orders";
import { productsTable } from "./products";
import { locationsTable } from "./locations";

export const pickItemsTable = pgTable("pick_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => pickOrdersTable.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  pickedQuantity: integer("picked_quantity").notNull().default(0),
  locationId: text("location_id").references(() => locationsTable.id),
  pickedAt: timestamp("picked_at"),
});

export const insertPickItemSchema = createInsertSchema(pickItemsTable).omit({
  id: true,
  pickedQuantity: true,
  pickedAt: true,
});

export type InsertPickItem = z.infer<typeof insertPickItemSchema>;
export type PickItem = typeof pickItemsTable.$inferSelect;
