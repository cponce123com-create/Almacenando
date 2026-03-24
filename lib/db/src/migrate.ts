/**
 * migrate.ts
 *
 * Applies all pending Drizzle migrations to the database.
 * Run this script before starting the server in production:
 *
 *   node -e "require('./dist/migrate.cjs')"
 *   — or via the workspace script —
 *   pnpm --filter @workspace/db migrate
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set before running migrations.",
  );
}

const isNeon = process.env.DATABASE_URL.includes("neon.tech");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon || isProduction ? { rejectUnauthorized: false } : undefined,
});

const db = drizzle(pool);

async function runMigrations() {
  console.log("⏳ Running database migrations...");

  const migrationsFolder = path.join(__dirname, "../drizzle");

  await migrate(db, { migrationsFolder });

  console.log("✅ Migrations applied successfully.");
  await pool.end();
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
