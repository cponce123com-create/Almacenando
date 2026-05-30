import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationTypeEnum = pgEnum("location_type", [
  "warehouse", "zone", "rack", "shelf", "position", "pallet",
]);

export const locationsTable = pgTable("locations", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull(), // 'Principal', 'Secundario'
  zone: text("zone"),
  rack: text("rack"),
  shelf: text("shelf"),
  position: text("position"),
  barcode: text("barcode").unique(),
  type: locationTypeEnum("type").notNull().default("rack"),
  parentLocationId: text("parent_location_id"),
  isActive: boolean("is_active").notNull().default(true),
  isNearScale: boolean("is_near_scale").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locationsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
