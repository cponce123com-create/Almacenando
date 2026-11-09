ALTER TABLE "pick_item_weighings" ADD COLUMN "voided_at" timestamp;
--> statement-breakpoint
ALTER TABLE "pick_item_weighings" ADD COLUMN "voided_by" text REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "pick_item_weighings" ADD COLUMN "void_reason" text;
