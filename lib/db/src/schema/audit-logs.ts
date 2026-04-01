import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("audit_logs_user_id_idx").on(t.userId),
  index("audit_logs_resource_idx").on(t.resource),
  index("audit_logs_created_at_idx").on(t.createdAt),
]);

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
