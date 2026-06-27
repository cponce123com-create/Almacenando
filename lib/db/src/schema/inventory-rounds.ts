import { pgTable, text, timestamp, integer, doublePrecision, date, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const inventoryRoundsTable = pgTable(
  "inventory_rounds",
  {
    id: text("id").primaryKey(),
    warehouse: text("warehouse").notNull(),
    roundNumber: integer("round_number").notNull(),
    balanceDate: date("balance_date"),
    status: text("status").notNull().default("active"), // "active" | "closed"
    totalSystemBalance: doublePrecision("total_system_balance").default(0),
    totalPhysical: doublePrecision("total_physical").default(0),
    difference: doublePrecision("difference").default(0),
    recordCount: integer("record_count").default(0),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => usersTable.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("inv_rounds_warehouse_idx").on(t.warehouse),
  ]
);

export type InventoryRound = typeof inventoryRoundsTable.$inferSelect;
