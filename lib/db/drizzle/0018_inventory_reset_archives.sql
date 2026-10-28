CREATE TABLE IF NOT EXISTS "inventory_reset_archives" (
  "id" text PRIMARY KEY NOT NULL,
  "warehouse" text NOT NULL,
  "payload" jsonb NOT NULL,
  "inventory_record_count" integer DEFAULT 0 NOT NULL,
  "inventory_cycle_count" integer DEFAULT 0 NOT NULL,
  "inventory_round_count" integer DEFAULT 0 NOT NULL,
  "archived_by" text NOT NULL REFERENCES "users"("id"),
  "archived_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "inventory_reset_archives_warehouse_idx"
  ON "inventory_reset_archives" ("warehouse", "archived_at");
