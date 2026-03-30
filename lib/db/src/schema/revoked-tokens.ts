import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const revokedTokensTable = pgTable("revoked_tokens", {
  jti: text("jti").primaryKey(),
  revokedAt: timestamp("revoked_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type RevokedToken = typeof revokedTokensTable.$inferSelect;
