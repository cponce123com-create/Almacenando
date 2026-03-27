ALTER TABLE "inventory_records" ADD COLUMN IF NOT EXISTS "physical_count" numeric;
--> statement-breakpoint
ALTER TABLE "inventory_records" ADD COLUMN IF NOT EXISTS "photo_url" text;
