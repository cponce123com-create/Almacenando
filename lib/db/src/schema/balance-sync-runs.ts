import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const balanceSyncRunsTable = pgTable("balance_sync_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("requested"),
  requestedBy: text("requested_by").notNull().references(() => usersTable.id),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  extractedAt: timestamp("extracted_at"),
  completedAt: timestamp("completed_at"),
  recordCount: integer("record_count").notNull().default(0),
  payload: jsonb("payload"),
  summary: jsonb("summary"),
  errorMessage: text("error_message"),
}, (table) => [
  index("balance_sync_runs_status_requested_idx").on(table.status, table.requestedAt),
  index("balance_sync_runs_requested_by_idx").on(table.requestedBy, table.requestedAt),
]);

export const balanceConnectorStateTable = pgTable("balance_connector_state", {
  id: text("id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
