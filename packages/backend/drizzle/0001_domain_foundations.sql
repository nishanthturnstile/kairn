CREATE SCHEMA "kairn_auth";
--> statement-breakpoint
CREATE TYPE "kairn"."journey_capability" AS ENUM('administrator', 'coauthor', 'publisher');--> statement-breakpoint
CREATE TYPE "kairn"."audit_target_kind" AS ENUM('account', 'journey', 'membership', 'source', 'original_export_grant');--> statement-breakpoint
CREATE TYPE "kairn"."restriction_operation" AS ENUM('account_restriction', 'membership_revocation', 'capability_removal', 'source_grant_narrowing', 'source_withdrawal', 'original_export_revocation');--> statement-breakpoint
CREATE TYPE "kairn"."source_scope" AS ENUM('journey_review', 'publication_reuse');--> statement-breakpoint
CREATE TABLE "kairn_auth"."account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kairn_auth"."session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "kairn_auth"."user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "kairn_auth"."verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kairn"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restricted_at" timestamp with time zone,
	"security_generation" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "accounts_security_generation_positive" CHECK ("kairn"."accounts"."security_generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "kairn"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."journey_capabilities" (
	"journey_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"capability" "kairn"."journey_capability" NOT NULL,
	CONSTRAINT "journey_capabilities_journey_id_account_id_capability_pk" PRIMARY KEY("journey_id","account_id","capability")
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_capabilities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."journey_memberships" (
	"journey_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "journey_memberships_journey_id_account_id_pk" PRIMARY KEY("journey_id","account_id"),
	CONSTRAINT "journey_memberships_revocation_order" CHECK ("kairn"."journey_memberships"."revoked_at" >= "kairn"."journey_memberships"."joined_at")
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."journeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"draft_generation" integer DEFAULT 1 NOT NULL,
	"policy_generation" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "journeys_title_present" CHECK (length(btrim("kairn"."journeys"."title")) > 0),
	CONSTRAINT "journeys_generations_positive" CHECK ("kairn"."journeys"."draft_generation" > 0 AND "kairn"."journeys"."policy_generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_kind" "kairn"."audit_target_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"journey_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_action_code" CHECK ("kairn"."audit_events"."action" ~ '^[a-z][a-z0-9_]{0,63}$')
);
--> statement-breakpoint
ALTER TABLE "kairn"."audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."restriction_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"operation" "kairn"."restriction_operation" NOT NULL,
	"policy_generation" integer NOT NULL,
	"integrity_digest" text NOT NULL,
	"journal_sequence" bigint,
	"journal_receipt" text,
	CONSTRAINT "restriction_events_audit_event_id_unique" UNIQUE("audit_event_id"),
	CONSTRAINT "restriction_events_journal_sequence_unique" UNIQUE("journal_sequence"),
	CONSTRAINT "restriction_events_generation_positive" CHECK ("kairn"."restriction_events"."policy_generation" > 0),
	CONSTRAINT "restriction_events_digest_sha256" CHECK ("kairn"."restriction_events"."integrity_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "restriction_events_receipt_pair" CHECK (("kairn"."restriction_events"."journal_sequence" IS NULL) = ("kairn"."restriction_events"."journal_receipt" IS NULL)),
	CONSTRAINT "restriction_events_sequence_positive" CHECK ("kairn"."restriction_events"."journal_sequence" > 0),
	CONSTRAINT "restriction_events_receipt_length" CHECK (length("kairn"."restriction_events"."journal_receipt") BETWEEN 1 AND 2048)
);
--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."export_grant_assets" (
	"grant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"journey_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_grant_revision" integer NOT NULL,
	CONSTRAINT "export_grant_assets_grant_id_asset_id_pk" PRIMARY KEY("grant_id","asset_id"),
	CONSTRAINT "export_grant_assets_revision_positive" CHECK ("kairn"."export_grant_assets"."source_grant_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "kairn"."export_grant_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."original_export_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journey_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "original_export_grants_id_journey_owner_unique" UNIQUE("id","journey_id","owner_id"),
	CONSTRAINT "original_export_grants_distinct_recipient" CHECK ("kairn"."original_export_grants"."owner_id" <> "kairn"."original_export_grants"."recipient_id"),
	CONSTRAINT "original_export_grants_expiry_order" CHECK ("kairn"."original_export_grants"."expires_at" > "kairn"."original_export_grants"."created_at")
);
--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."source_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "source_assets_source_id_unique" UNIQUE("source_id","id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."source_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."source_grants" (
	"journey_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"scope" "kairn"."source_scope" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "source_grants_journey_id_source_id_pk" PRIMARY KEY("journey_id","source_id"),
	CONSTRAINT "source_grants_journey_source_owner_unique" UNIQUE("journey_id","source_id","owner_id"),
	CONSTRAINT "source_grants_revision_positive" CHECK ("kairn"."source_grants"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "kairn"."source_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sources_id_owner_unique" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn_auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "kairn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn_auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "kairn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."accounts" ADD CONSTRAINT "accounts_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "kairn_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_capabilities" ADD CONSTRAINT "journey_capabilities_membership_fk" FOREIGN KEY ("journey_id","account_id") REFERENCES "kairn"."journey_memberships"("journey_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ADD CONSTRAINT "journey_memberships_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ADD CONSTRAINT "journey_memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD CONSTRAINT "journeys_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "kairn"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."audit_events" ADD CONSTRAINT "audit_events_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "kairn"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD CONSTRAINT "restriction_events_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "kairn"."audit_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."export_grant_assets" ADD CONSTRAINT "export_grant_assets_export_grant_fk" FOREIGN KEY ("grant_id","journey_id","owner_id") REFERENCES "kairn"."original_export_grants"("id","journey_id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."export_grant_assets" ADD CONSTRAINT "export_grant_assets_source_asset_fk" FOREIGN KEY ("source_id","asset_id") REFERENCES "kairn"."source_assets"("source_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."export_grant_assets" ADD CONSTRAINT "export_grant_assets_source_grant_fk" FOREIGN KEY ("journey_id","source_id","owner_id") REFERENCES "kairn"."source_grants"("journey_id","source_id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD CONSTRAINT "original_export_grants_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD CONSTRAINT "original_export_grants_recipient_fk" FOREIGN KEY ("journey_id","recipient_id") REFERENCES "kairn"."journey_memberships"("journey_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."source_assets" ADD CONSTRAINT "source_assets_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "kairn"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."source_grants" ADD CONSTRAINT "source_grants_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."source_grants" ADD CONSTRAINT "source_grants_owner_fk" FOREIGN KEY ("source_id","owner_id") REFERENCES "kairn"."sources"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."sources" ADD CONSTRAINT "sources_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "kairn_auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "kairn_auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "kairn_auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "journey_memberships_account_idx" ON "kairn"."journey_memberships" USING btree ("account_id","journey_id");--> statement-breakpoint
CREATE INDEX "journeys_creator_idx" ON "kairn"."journeys" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "kairn"."audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "kairn"."audit_events" USING btree ("target_kind","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "export_grant_assets_source_asset_idx" ON "kairn"."export_grant_assets" USING btree ("source_id","asset_id");--> statement-breakpoint
CREATE INDEX "export_grant_assets_source_grant_idx" ON "kairn"."export_grant_assets" USING btree ("journey_id","source_id","owner_id");--> statement-breakpoint
CREATE INDEX "original_export_grants_recipient_idx" ON "kairn"."original_export_grants" USING btree ("journey_id","recipient_id");--> statement-breakpoint
CREATE INDEX "original_export_grants_owner_idx" ON "kairn"."original_export_grants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "source_grants_source_idx" ON "kairn"."source_grants" USING btree ("source_id","owner_id");--> statement-breakpoint
CREATE INDEX "sources_owner_idx" ON "kairn"."sources" USING btree ("owner_id");
--> statement-breakpoint
GRANT USAGE ON SCHEMA "kairn_auth" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT ON "kairn_auth"."user" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT, UPDATE, DELETE ON "kairn_auth"."session" TO kairn_runtime;
