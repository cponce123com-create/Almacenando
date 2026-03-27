-- ─── products: add new columns ─────────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "warehouse" text NOT NULL DEFAULT 'General';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "type" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "msds" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "controlled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Drop old unique constraint on code alone and replace with composite unique
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_code_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_warehouse_code_uniq" ON "products" ("warehouse", "code");
--> statement-breakpoint

-- ─── inventory_records: add new columns ────────────────────────────────────
ALTER TABLE "inventory_records" ADD COLUMN IF NOT EXISTS "warehouse" text NOT NULL DEFAULT 'General';
--> statement-breakpoint
ALTER TABLE "inventory_records" ADD COLUMN IF NOT EXISTS "responsible" text;
--> statement-breakpoint

-- ─── balance_records: new table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "balance_records" (
  "id" text PRIMARY KEY,
  "warehouse" text NOT NULL,
  "type" text,
  "code" text NOT NULL,
  "product_description" text NOT NULL,
  "unit" text NOT NULL,
  "quantity" numeric NOT NULL DEFAULT '0',
  "balance_date" date NOT NULL,
  "batch_id" text,
  "notes" text,
  "registered_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "balance_records_warehouse_date_idx" ON "balance_records" ("warehouse", "balance_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "balance_records_warehouse_code_idx" ON "balance_records" ("warehouse", "code");
--> statement-breakpoint

-- ─── cuadre_records: new table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "cuadre_records" (
  "id" text PRIMARY KEY,
  "warehouse" text NOT NULL,
  "cuadre_date" date NOT NULL,
  "responsible" text NOT NULL,
  "notes" text,
  "status" text NOT NULL DEFAULT 'pending',
  "registered_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── cuadre_items: new table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "cuadre_items" (
  "id" text PRIMARY KEY,
  "cuadre_id" text NOT NULL REFERENCES "cuadre_records"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "product_description" text NOT NULL,
  "unit" text NOT NULL,
  "system_balance" numeric NOT NULL DEFAULT '0',
  "physical_count" numeric NOT NULL DEFAULT '0',
  "difference" numeric NOT NULL DEFAULT '0',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
