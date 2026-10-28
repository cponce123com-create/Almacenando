-- Tables used by the Supplies and Surplus modules were present in the Drizzle schema
-- but had never been added to the production migration history.
CREATE TABLE IF NOT EXISTS "supplies" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "description" text NOT NULL,
  "unit" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "supplies_code_unique" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "surplus_products" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text REFERENCES "products"("id"),
  "product_name" text,
  "surplus_code" text NOT NULL,
  "quantity" double precision NOT NULL,
  "unit" text NOT NULL,
  "surplus_date" date NOT NULL,
  "origin" text,
  "reason" text,
  "status" text NOT NULL DEFAULT 'pending',
  "notes" text,
  "photos" jsonb DEFAULT '[]'::jsonb,
  "registered_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "surplus_products_surplus_code_unique" UNIQUE ("surplus_code")
);
