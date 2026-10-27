ALTER TABLE "balance_records"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'EXCEL',
  ADD COLUMN IF NOT EXISTS "short_description" text,
  ADD COLUMN IF NOT EXISTS "source_run_id" text,
  ADD COLUMN IF NOT EXISTS "location_summary" text,
  ADD COLUMN IF NOT EXISTS "zone_summary" text;

CREATE TABLE IF NOT EXISTS "balance_sync_runs" (
  "id" text PRIMARY KEY,
  "status" text NOT NULL DEFAULT 'requested',
  "requested_by" text NOT NULL REFERENCES "users"("id"),
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "extracted_at" timestamp,
  "completed_at" timestamp,
  "record_count" integer NOT NULL DEFAULT 0,
  "payload" jsonb,
  "summary" jsonb,
  "error_message" text
);

CREATE INDEX IF NOT EXISTS "balance_sync_runs_status_requested_idx"
  ON "balance_sync_runs" ("status", "requested_at");
CREATE INDEX IF NOT EXISTS "balance_sync_runs_requested_by_idx"
  ON "balance_sync_runs" ("requested_by", "requested_at");

ALTER TABLE "balance_sync_runs" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp;

CREATE TABLE IF NOT EXISTS "balance_connector_state" (
  "id" text PRIMARY KEY,
  "last_seen_at" timestamp,
  "last_error" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
