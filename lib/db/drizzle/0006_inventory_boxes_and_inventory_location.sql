ALTER TABLE "inventory_records"
ADD COLUMN IF NOT EXISTS "location" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inventory_boxes" (
  "id" text PRIMARY KEY NOT NULL,
  "inventory_record_id" text NOT NULL REFERENCES "inventory_records"("id") ON DELETE CASCADE,
  "box_number" integer NOT NULL,
  "weight" numeric,
  "lot" text,
  "photo_url" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inventory_boxes_record_idx"
ON "inventory_boxes" ("inventory_record_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inventory_boxes_record_box_idx"
ON "inventory_boxes" ("inventory_record_id", "box_number");
