import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Ensures that schema-level columns added in the TypeScript schema
 * but missing from the actual PostgreSQL table are created.
 *
 * This is a safety net for cases where Drizzle migrations were not
 * properly applied (e.g. migration 0010 was never registered in the journal).
 */
export async function ensureMissingColumns(): Promise<void> {
  const statements = [
    { label: "products.barcode", sql: sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT` },
    { label: "products.location_id", sql: sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS location_id TEXT` },
    { label: "products.stock", sql: sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock DOUBLE PRECISION NOT NULL DEFAULT 0` },
    { label: "inventory_records.location_id", sql: sql`ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS location_id TEXT` },
  ];

  for (const stmt of statements) {
    try {
      await db.execute(stmt.sql);
      logger.info({ column: stmt.label }, "Column ensured");
    } catch (err) {
      // If column already exists, PG throws duplicate_column — ignore it.
      const pgErr = err as { code?: string; message?: string } | undefined;
      if (pgErr?.code === "42701") {
        // duplicate_column — already exists, all good
        continue;
      }
      // Other errors (e.g., dependent table missing) — log but don't crash
      logger.warn({ err, column: stmt.label }, "Could not ensure column (non-critical)");
    }
  }
}
