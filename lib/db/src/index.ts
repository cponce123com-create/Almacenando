import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isNeon = process.env.DATABASE_URL.includes("neon.tech");
const isProduction = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon || isProduction ? { rejectUnauthorized: true } : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
