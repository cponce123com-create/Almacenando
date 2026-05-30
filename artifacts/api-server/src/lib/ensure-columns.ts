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
  // ── Tables created in migration 0010 ──────────────────────────────────
  // The locations, pick_orders, pick_items, notifications tables were
  // defined in the 0010 migration file which was never applied.
  // We create them here if they don't exist yet.
  const ensureTable = async (name: string, ddl: ReturnType<typeof sql>) => {
    try {
      await db.execute(ddl);
      logger.info({ table: name }, "Table ensured");
    } catch (err) {
      const pgErr = err as { code?: string } | undefined;
      if (pgErr?.code === "42P07") {
        // duplicate_table — already exists
        return;
      }
      logger.warn({ err, table: name }, "Could not ensure table (non-critical)");
    }
  };

  await ensureTable("locations", sql`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      warehouse TEXT NOT NULL,
      zone TEXT,
      rack TEXT,
      shelf TEXT,
      position TEXT,
      barcode TEXT,
      type TEXT NOT NULL DEFAULT 'rack',
      parent_location_id TEXT REFERENCES locations(id),
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_near_scale BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await ensureTable("pick_orders", sql`
    CREATE TABLE IF NOT EXISTS pick_orders (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `);

  await ensureTable("pick_items", sql`
    CREATE TABLE IF NOT EXISTS pick_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES pick_orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      picked_quantity INTEGER NOT NULL DEFAULT 0,
      location_id TEXT,
      picked_at TIMESTAMP
    )
  `);

  await ensureTable("notifications", sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read BOOLEAN NOT NULL DEFAULT false,
      link TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ── Columns added in migration 0010 ───────────────────────────────────
  const ensureColumn = async (label: string, ddl: ReturnType<typeof sql>) => {
    try {
      await db.execute(ddl);
      logger.info({ column: label }, "Column ensured");
    } catch (err) {
      const pgErr = err as { code?: string; message?: string } | undefined;
      if (pgErr?.code === "42701") {
        // duplicate_column — already exists
        return;
      }
      logger.warn({ err, column: label }, "Could not ensure column (non-critical)");
    }
  };

  await ensureColumn("products.barcode", sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT`);
  await ensureColumn("products.location_id", sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS location_id TEXT`);
  await ensureColumn("products.stock", sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock DOUBLE PRECISION NOT NULL DEFAULT 0`);
  await ensureColumn("inventory_records.location_id", sql`ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS location_id TEXT`);
}
