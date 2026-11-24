ALTER TYPE "kairn"."restriction_operation" ADD VALUE 'source_deletion';--> statement-breakpoint
CREATE TABLE "kairn"."recording_deletions" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"deleted_at_epoch" bigint NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	CONSTRAINT "recording_deletions_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "recording_deletions_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_deletions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_upload_denied(target_source uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kairn.recording_deletions
    WHERE source_id = target_source
      AND owner_id = nullif(current_setting('kairn.recording_account', true), '')::uuid
  )
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_retains_storage(target_asset uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM kairn.recording_deletions WHERE asset_id = target_asset AND purged_at IS NOT NULL
      AND owner_id = nullif(current_setting('kairn.recording_account', true), '')::uuid
  )
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.apply_recording_deletion(
  target_source uuid, target_asset uuid, canonical_upload uuid, source_owner uuid, deletion_event uuid, deletion_time bigint
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE grant_row record;
BEGIN
  INSERT INTO kairn.recording_deletions (source_id, asset_id, upload_id, owner_id, event_id, deleted_at_epoch, purge_after)
    VALUES (target_source, target_asset, canonical_upload, source_owner, deletion_event, deletion_time, to_timestamp(deletion_time + 604800))
    ON CONFLICT (source_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM kairn.recording_deletions WHERE source_id = target_source
    AND asset_id = target_asset AND upload_id = canonical_upload AND owner_id = source_owner
    AND event_id = deletion_event AND deleted_at_epoch = deletion_time)
  THEN RAISE EXCEPTION 'Recording deletion identity changed'; END IF;

  -- Stabilize the grant set before invalidating it. A concurrent grant writer
  -- must hold a source share lock and recheck that the source is still active.
  UPDATE kairn.sources SET deleted_at = coalesce(deleted_at, now())
    WHERE id = target_source AND owner_id = source_owner;
  UPDATE kairn.source_assets AS asset SET deleted_at = coalesce(asset.deleted_at, now())
    FROM kairn.sources AS source WHERE asset.id = target_asset AND asset.source_id = target_source
      AND source.id = target_source AND source.owner_id = source_owner;
  FOR grant_row IN
    SELECT journey_id, revision FROM kairn.source_grants
    WHERE source_id = target_source AND owner_id = source_owner AND withdrawn_at IS NULL
    ORDER BY journey_id
  LOOP
    PERFORM kairn.apply_source_withdrawal(grant_row.journey_id, target_source, source_owner, grant_row.revision + 1);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION kairn.begin_recording_deletion(target_asset uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actor uuid := kairn.invitation_actor();
target_source uuid;
canonical_upload uuid;
operation_id uuid;
deletion_time bigint;
confirmed boolean;
digest text;
BEGIN
  IF actor IS NULL OR actor::text IS DISTINCT FROM current_setting('kairn.recording_account', true)
  THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 13466));
  SELECT deletion.event_id, restriction.journal_sequence IS NOT NULL INTO operation_id, confirmed
    FROM kairn.recording_deletions AS deletion
    JOIN kairn.restriction_events AS restriction ON restriction.id = deletion.event_id
    WHERE deletion.asset_id = target_asset AND deletion.owner_id = actor;
  IF FOUND THEN RETURN jsonb_build_object('eventId', operation_id, 'confirmed', confirmed); END IF;

  SELECT source_id, upload_id INTO target_source, canonical_upload FROM kairn.recording_originals
    WHERE id = target_asset AND owner_id = actor FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  operation_id := gen_random_uuid();
  deletion_time := extract(epoch FROM now())::bigint;
  -- A grant mutation takes a journey lock before the source share lock.
  -- Retry if it crosses this source-wide operation during journey invalidation.
  FOR attempt IN 1..3 LOOP
    BEGIN
      PERFORM kairn.apply_recording_deletion(target_source, target_asset, canonical_upload, actor, operation_id, deletion_time);
      EXIT;
    EXCEPTION WHEN deadlock_detected THEN
      IF attempt = 3 THEN RAISE; END IF;
    END;
  END LOOP;
  digest := encode(sha256(convert_to(format(
    '[7,"%s","source_deletion","%s","%s","%s","%s",%s,1]',
    operation_id, actor, target_source, target_asset, canonical_upload, deletion_time
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id)
    VALUES (operation_id, actor, 'source_deletion', 'source', target_source);
  INSERT INTO kairn.restriction_events (id, audit_event_id, operation, policy_generation, integrity_digest)
    VALUES (operation_id, operation_id, 'source_deletion', 1, digest);
  RETURN jsonb_build_object('eventId', operation_id, 'confirmed', false, 'created', true);
END $$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_recording_deletion(target_event uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'version', 7, 'id', restriction.id, 'operation', restriction.operation,
      'accountId', deletion.owner_id, 'sourceId', deletion.source_id, 'assetId', deletion.asset_id,
      'uploadId', deletion.upload_id, 'deletedAtEpoch', deletion.deleted_at_epoch, 'generation', 1
    ),
    'digest', restriction.integrity_digest, 'confirmed', restriction.journal_sequence IS NOT NULL, 'earlierPending', false
  ) FROM kairn.recording_deletions AS deletion
  JOIN kairn.restriction_events AS restriction ON restriction.id = deletion.event_id
  WHERE deletion.event_id = target_event AND restriction.operation::text = 'source_deletion'
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.confirm_recording_deletion(target_event uuid, expected_digest text, sequence_number bigint, receipt text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events SET journal_sequence = sequence_number, journal_receipt = receipt
  WHERE id = target_event AND operation::text = 'source_deletion'
    AND integrity_digest = expected_digest AND journal_sequence IS NULL
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.restore_recording_deletion(
  target_source uuid, target_asset uuid, canonical_upload uuid, source_owner uuid, deletion_event uuid,
  deletion_time bigint, digest text, sequence_number bigint, receipt text
)
RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM kairn.apply_recording_deletion(target_source, target_asset, canonical_upload, source_owner, deletion_event, deletion_time);
  IF EXISTS (SELECT 1 FROM kairn.restriction_events WHERE id = deletion_event) THEN RETURN; END IF;
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id)
    VALUES (deletion_event, (SELECT id FROM kairn.accounts WHERE id = source_owner), 'source_deletion', 'source', target_source);
  INSERT INTO kairn.restriction_events (id, audit_event_id, operation, policy_generation, integrity_digest, journal_sequence, journal_receipt)
    VALUES (deletion_event, deletion_event, 'source_deletion', 1, digest, sequence_number, receipt);
END $$;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_purge_due()
RETURNS TABLE("ownerId" uuid, "originalId" uuid, "uploadId" uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT deletion.owner_id, deletion.asset_id, deletion.upload_id
  FROM kairn.recording_deletions AS deletion
  JOIN kairn.restriction_events AS restriction ON restriction.id = deletion.event_id AND restriction.journal_sequence IS NOT NULL
  WHERE deletion.purged_at IS NULL AND deletion.purge_after <= now()
  ORDER BY deletion.purge_after, deletion.asset_id LIMIT 25
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_purge_result(target_asset uuid, success boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.recording_deletions AS deletion
  SET purged_at = CASE WHEN success THEN now() ELSE NULL END,
      purge_after = CASE WHEN success THEN purge_after ELSE now() + interval '5 minutes' END
  WHERE deletion.asset_id = target_asset AND deletion.purge_after <= now() AND deletion.purged_at IS NULL
    AND EXISTS (SELECT 1 FROM kairn.restriction_events AS restriction
      WHERE restriction.id = deletion.event_id AND restriction.journal_sequence IS NOT NULL)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.recording_upload_denied(uuid), kairn.recording_retains_storage(uuid), kairn.apply_recording_deletion(uuid,uuid,uuid,uuid,uuid,bigint),
  kairn.begin_recording_deletion(uuid), kairn.read_recording_deletion(uuid), kairn.confirm_recording_deletion(uuid,text,bigint,text),
  kairn.restore_recording_deletion(uuid,uuid,uuid,uuid,uuid,bigint,text,bigint,text),
  kairn.recording_purge_due(), kairn.recording_purge_result(uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.recording_upload_denied(uuid), kairn.recording_retains_storage(uuid), kairn.begin_recording_deletion(uuid),
  kairn.read_recording_deletion(uuid), kairn.confirm_recording_deletion(uuid,text,bigint,text),
  kairn.recording_purge_due(), kairn.recording_purge_result(uuid,boolean) TO kairn_runtime;
