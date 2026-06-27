CREATE TABLE IF NOT EXISTS "inventory_rounds" (
  "id" text PRIMARY KEY,
  "warehouse" text NOT NULL,
  "round_number" integer NOT NULL,
  "balance_date" date,
  "status" text NOT NULL DEFAULT 'active',
  "total_system_balance" double precision DEFAULT 0,
  "total_physical" double precision DEFAULT 0,
  "difference" double precision DEFAULT 0,
  "record_count" integer DEFAULT 0,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "closed_at" timestamp,
  "closed_by" text REFERENCES "users"("id"),
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inv_rounds_warehouse_idx" ON "inventory_rounds" ("warehouse");

ALTER TABLE "inventory_records" ADD COLUMN "round_id" text;
CREATE INDEX IF NOT EXISTS "inv_records_round_idx" ON "inventory_records" ("round_id");
