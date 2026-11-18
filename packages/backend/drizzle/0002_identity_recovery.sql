CREATE TYPE "kairn_auth"."identity_mail_kind" AS ENUM('verify', 'reset');--> statement-breakpoint
CREATE TYPE "kairn_auth"."identity_mail_state" AS ENUM('queued', 'sent', 'failed', 'expired');--> statement-breakpoint
ALTER TYPE "kairn"."restriction_operation" ADD VALUE 'credentials_changed' BEFORE 'membership_revocation';--> statement-breakpoint
ALTER TYPE "kairn"."restriction_operation" ADD VALUE 'device_session_revoked' BEFORE 'membership_revocation';--> statement-breakpoint
CREATE TABLE "kairn_auth"."identity_mail" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "kairn_auth"."identity_mail_kind" NOT NULL,
	"epoch_digest" text NOT NULL,
	"ciphertext" text,
	"expires_at" timestamp with time zone NOT NULL,
	"state" "kairn_auth"."identity_mail_state" DEFAULT 'queued' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kairn_auth"."identity_recovery" (
	"id" text PRIMARY KEY NOT NULL,
	"epoch_digest" text NOT NULL,
	CONSTRAINT "identity_recovery_singleton" CHECK ("kairn_auth"."identity_recovery"."id" = 'current'),
	CONSTRAINT "identity_recovery_epoch_digest" CHECK ("kairn_auth"."identity_recovery"."epoch_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD COLUMN "affected_session_id" uuid;--> statement-breakpoint
ALTER TABLE "kairn_auth"."identity_mail" ADD CONSTRAINT "identity_mail_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD CONSTRAINT "restriction_events_device_scope" CHECK (("kairn"."restriction_events"."operation"::text = 'device_session_revoked') = ("kairn"."restriction_events"."affected_session_id" IS NOT NULL));
--> statement-breakpoint
INSERT INTO "kairn"."accounts" ("id") SELECT "id" FROM "kairn_auth"."user" ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "kairn_auth"."user", "kairn_auth"."account" TO kairn_runtime;
--> statement-breakpoint
GRANT INSERT ON "kairn_auth"."session" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "kairn_auth"."verification" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON "kairn_auth"."identity_recovery" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "kairn_auth"."identity_mail" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "kairn"."accounts" TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY "runtime_identity_account" ON "kairn"."accounts" TO kairn_runtime
  USING ("id"::text = current_setting('kairn.identity_account', true));
--> statement-breakpoint
GRANT SELECT, INSERT ON "kairn"."audit_events" TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY "runtime_identity_audit" ON "kairn"."audit_events" TO kairn_runtime
  USING ("target_kind" = 'account' AND "action" IN ('credentials_changed', 'device_session_revoked'));
--> statement-breakpoint
GRANT SELECT, INSERT ON "kairn"."restriction_events" TO kairn_runtime;
--> statement-breakpoint
GRANT UPDATE ("journal_sequence", "journal_receipt") ON "kairn"."restriction_events" TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY "runtime_identity_restrictions" ON "kairn"."restriction_events" TO kairn_runtime
  USING ("operation"::text IN ('credentials_changed', 'device_session_revoked'));
