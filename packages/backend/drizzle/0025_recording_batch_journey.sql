ALTER TABLE "kairn"."recording_batches" ADD COLUMN "journey_id" uuid;--> statement-breakpoint
ALTER TABLE "kairn"."recording_batches" ADD COLUMN "save_digest" text;--> statement-breakpoint
ALTER TABLE "kairn"."recording_originals" ADD COLUMN "document_name" text;--> statement-breakpoint
ALTER TABLE "kairn"."recording_batches" ADD CONSTRAINT "recording_batches_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.create_private_journey(
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
  IF num_nonnulls(journey_zone, start_local, start_instant, journey_start_offset,
                   end_local, end_instant, journey_end_offset) <> 0
    AND (journey_zone IS NULL OR start_instant IS NULL OR NOT isfinite(start_instant)
      OR (end_instant IS NOT NULL AND NOT isfinite(end_instant))) THEN
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
