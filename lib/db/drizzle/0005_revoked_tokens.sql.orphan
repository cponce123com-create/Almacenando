CREATE TABLE IF NOT EXISTS "revoked_tokens" (
	"jti" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
