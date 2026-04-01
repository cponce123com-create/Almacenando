-- ─── warehouse_role: create enum type ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "warehouse_role" AS ENUM ('supervisor', 'operator', 'quality', 'admin', 'readonly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ─── users: add password reset columns ──────────────────────────────────────
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "password_reset_token" text;
--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamp;
--> statement-breakpoint

-- ─── user_permissions: new table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id"         text PRIMARY KEY NOT NULL,
  "role"       "warehouse_role" NOT NULL,
  "page_id"    text NOT NULL,
  "can_view"   boolean NOT NULL DEFAULT true,
  "can_import" boolean NOT NULL DEFAULT false,
  "can_export" boolean NOT NULL DEFAULT false,
  "can_edit"   boolean NOT NULL DEFAULT false,
  "can_delete" boolean NOT NULL DEFAULT false,
  "updated_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "permissions_role_page_unique" UNIQUE ("role", "page_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "permissions_role_page_idx"
ON "user_permissions" ("role", "page_id");
--> statement-breakpoint

-- ─── audit_logs: add indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx"
ON "audit_logs" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx"
ON "audit_logs" ("resource");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"
ON "audit_logs" ("created_at");
