ALTER TABLE "pick_items" ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision;
--> statement-breakpoint
ALTER TABLE "pick_items" ALTER COLUMN "picked_quantity" TYPE double precision USING "picked_quantity"::double precision;
--> statement-breakpoint
CREATE TABLE "pick_item_weighings" (
  "id" text PRIMARY KEY NOT NULL,
  "item_id" text NOT NULL REFERENCES "pick_items"("id") ON DELETE CASCADE,
  "quantity" double precision NOT NULL CHECK ("quantity" > 0),
  "lot" text NOT NULL CHECK (length(trim("lot")) > 0),
  "recorded_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "pick_item_weighings_item_id_idx" ON "pick_item_weighings" ("item_id");
