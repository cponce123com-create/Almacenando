-- ─── balance_records: add ultimo_consumo column ──────────────────────────────
ALTER TABLE "balance_records" ADD COLUMN IF NOT EXISTS "ultimo_consumo" date;
--> statement-breakpoint

-- ─── products: add msds_url column ───────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "msds_url" text;
--> statement-breakpoint

-- ─── products: add hazard fields ─────────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hazard_level" text DEFAULT 'precaucion';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hazard_pictograms" text DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "first_aid" text DEFAULT 'Lavar con agua 15 min · Usar guantes · Avisar supervisor';
--> statement-breakpoint

-- ─── revoked_tokens: new table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "revoked_tokens" (
  "jti" text PRIMARY KEY NOT NULL,
  "revoked_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);
