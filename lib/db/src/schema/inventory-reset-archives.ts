import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Permanent, restorable snapshots taken before an inventory reset. */
export const inventoryResetArchivesTable = pgTable("inventory_reset_archives", {
  id: text("id").primaryKey(),
  warehouse: text("warehouse").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  inventoryRecordCount: integer("inventory_record_count").notNull().default(0),
  inventoryCycleCount: integer("inventory_cycle_count").notNull().default(0),
  inventoryRoundCount: integer("inventory_round_count").notNull().default(0),
  archivedBy: text("archived_by").notNull().references(() => usersTable.id),
  archivedAt: timestamp("archived_at").notNull().defaultNow(),
}, (table) => [
  index("inventory_reset_archives_warehouse_idx").on(table.warehouse, table.archivedAt),
]);
