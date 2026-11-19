CREATE TABLE "kairn"."journey_creation_receipts" (
	"account_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"journey_id" uuid NOT NULL,
	"payload_digest" text NOT NULL,
	CONSTRAINT "journey_creation_receipts_account_id_key_pk" PRIMARY KEY("account_id","key"),
	CONSTRAINT "journey_creation_receipts_journey_id_unique" UNIQUE("journey_id"),
	CONSTRAINT "journey_creation_receipts_digest" CHECK ("kairn"."journey_creation_receipts"."payload_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_creation_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "intended_start_local" text;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "intended_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "start_offset" text;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "intended_end_local" text;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "intended_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD COLUMN "end_offset" text;--> statement-breakpoint
ALTER TABLE "kairn"."journey_creation_receipts" ADD CONSTRAINT "journey_creation_receipts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_creation_receipts" ADD CONSTRAINT "journey_creation_receipts_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journeys_intended_start_idx" ON "kairn"."journeys" USING btree ("intended_start_at","id");--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD CONSTRAINT "journeys_start_schedule_group" CHECK (num_nonnulls("kairn"."journeys"."time_zone", "kairn"."journeys"."intended_start_local", "kairn"."journeys"."intended_start_at", "kairn"."journeys"."start_offset") IN (0, 4));--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD CONSTRAINT "journeys_end_schedule_group" CHECK (num_nonnulls("kairn"."journeys"."intended_end_local", "kairn"."journeys"."intended_end_at", "kairn"."journeys"."end_offset") IN (0, 3));--> statement-breakpoint
ALTER TABLE "kairn"."journeys" ADD CONSTRAINT "journeys_schedule_range" CHECK ("kairn"."journeys"."intended_end_at" IS NULL OR ("kairn"."journeys"."intended_start_at" IS NOT NULL AND "kairn"."journeys"."intended_end_at" >= "kairn"."journeys"."intended_start_at"));
--> statement-breakpoint
GRANT SELECT ON kairn.journeys, kairn.journey_memberships, kairn.journey_capabilities,
  kairn.journey_creation_receipts TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY runtime_journey_membership ON kairn.journey_memberships
  FOR SELECT TO kairn_runtime
  USING (account_id = nullif(current_setting('kairn.journey_account', true), '')::uuid
    AND revoked_at IS NULL);
--> statement-breakpoint
CREATE POLICY runtime_journey ON kairn.journeys
  FOR SELECT TO kairn_runtime
  USING (EXISTS (
    SELECT 1 FROM kairn.journey_memberships AS membership
    WHERE membership.journey_id = journeys.id
      AND membership.account_id = nullif(current_setting('kairn.journey_account', true), '')::uuid
      AND membership.revoked_at IS NULL
  ));
--> statement-breakpoint
CREATE POLICY runtime_journey_capability ON kairn.journey_capabilities
  FOR SELECT TO kairn_runtime
  USING (EXISTS (
    SELECT 1 FROM kairn.journey_memberships AS membership
    WHERE membership.journey_id = journey_capabilities.journey_id
      AND membership.account_id = journey_capabilities.account_id
      AND membership.account_id = nullif(current_setting('kairn.journey_account', true), '')::uuid
      AND membership.revoked_at IS NULL
  ));
--> statement-breakpoint
CREATE POLICY runtime_journey_receipt ON kairn.journey_creation_receipts
  FOR SELECT TO kairn_runtime
  USING (account_id = nullif(current_setting('kairn.journey_account', true), '')::uuid);
--> statement-breakpoint
CREATE FUNCTION kairn.create_private_journey(
  attempt_key uuid,
  attempt_digest text,
  journey_title text,
  journey_zone text,
  start_local text,
  start_instant timestamptz,
  journey_start_offset text,
  end_local text,
  end_instant timestamptz,
  journey_end_offset text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := nullif(current_setting('kairn.journey_account', true), '')::uuid;
  new_journey uuid := gen_random_uuid();
BEGIN
  IF actor IS NULL OR actor::text IS DISTINCT FROM current_setting('kairn.identity_account', true) THEN
    RAISE EXCEPTION 'Journey creation requires a scoped account' USING ERRCODE = '42501';
  END IF;

  -- Use the same row lock as identity checks and receipt lookup.
  PERFORM 1 FROM kairn.accounts WHERE id = actor AND restricted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey creation requires an active account' USING ERRCODE = '42501';
  END IF;
  IF journey_zone IS NULL OR start_instant IS NULL OR NOT isfinite(start_instant)
    OR (end_instant IS NOT NULL AND NOT isfinite(end_instant)) THEN
    RAISE EXCEPTION 'Journey creation requires a valid schedule' USING ERRCODE = '23514';
  END IF;

  INSERT INTO kairn.journeys (
    id, title, created_by, time_zone, intended_start_local, intended_start_at, start_offset,
    intended_end_local, intended_end_at, end_offset
  ) VALUES (
    new_journey, journey_title, actor, journey_zone, start_local, start_instant, journey_start_offset,
    end_local, end_instant, journey_end_offset
  );
  INSERT INTO kairn.journey_creation_receipts (account_id, key, journey_id, payload_digest)
    VALUES (actor, attempt_key, new_journey, attempt_digest);
  INSERT INTO kairn.journey_memberships (journey_id, account_id)
    VALUES (new_journey, actor);
  INSERT INTO kairn.journey_capabilities (journey_id, account_id, capability)
    VALUES (new_journey, actor, 'administrator'), (new_journey, actor, 'coauthor'),
      (new_journey, actor, 'publisher');
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (gen_random_uuid(), actor, 'journey_created', 'journey', new_journey, new_journey);
  RETURN new_journey;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.create_private_journey(uuid, text, text, text, text, timestamptz, text, text, timestamptz, text)
  FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.create_private_journey(uuid, text, text, text, text, timestamptz, text, text, timestamptz, text)
  TO kairn_runtime;
