import { pgTable, text, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pickOrdersTable } from "./pick-orders";
import { productsTable } from "./products";
import { locationsTable } from "./locations";
import { usersTable } from "./users";

export const pickItemsTable = pgTable("pick_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => pickOrdersTable.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => productsTable.id),
  quantity: doublePrecision("quantity").notNull(),
  pickedQuantity: doublePrecision("picked_quantity").notNull().default(0),
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

// Each row records one physical weighing, including partial lots and operator.
export const pickItemWeighingsTable = pgTable("pick_item_weighings", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => pickItemsTable.id, { onDelete: "cascade" }),
  quantity: doublePrecision("quantity").notNull(),
  lot: text("lot").notNull(),
  recordedBy: text("recorded_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [index("pick_item_weighings_item_id_idx").on(table.itemId)]);
