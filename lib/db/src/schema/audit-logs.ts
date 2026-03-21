import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  userId: text("user_id"),
  actorId: text("actor_id"),
  actorType: text("actor_type"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
