ALTER TABLE "kairn"."recording_attachments" DROP CONSTRAINT "recording_attachment_journey_original_key";--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ADD COLUMN "detach_event_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "recording_live_attachment_journey_original_key" ON "kairn"."recording_attachments" USING btree ("journey_id","original_id") WHERE "kairn"."recording_attachments"."detached_at" is null;
--> statement-breakpoint
CREATE FUNCTION kairn.audit_recording_detach(association uuid, affected_draft boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE item kairn.recording_attachments%ROWTYPE;
actor uuid := kairn.invitation_actor();
BEGIN
  SELECT * INTO item FROM kairn.recording_attachments
    WHERE id = association AND owner_id = actor AND detached_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Detached recording is unavailable'; END IF;
  IF affected_draft THEN
    UPDATE kairn.journeys SET draft_generation = draft_generation + 1 WHERE id = item.journey_id;
  END IF;
  INSERT INTO kairn.audit_events(id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (gen_random_uuid(), actor, 'recording_detached', 'source', item.source_id, item.journey_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.audit_recording_detach(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.audit_recording_detach(uuid, boolean) TO kairn_runtime;
--> statement-breakpoint
ALTER POLICY recording_attachment_audience ON kairn.recording_attachments TO kairn_runtime, kairn_migrator;
--> statement-breakpoint
CREATE FUNCTION kairn.remove_recording_placement(target_journey uuid, association uuid, expected_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actor uuid := kairn.invitation_actor();
target jsonb;
item kairn.recording_attachments%ROWTYPE;
BEGIN
  target := kairn.lock_recording_destination(target_journey);
  IF target IS NULL OR (target->>'canPlace')::boolean IS DISTINCT FROM true THEN RETURN 404; END IF;
  PERFORM set_config('kairn.recording_journey', target_journey::text, true);
  SELECT * INTO item FROM kairn.recording_attachments WHERE id = association AND journey_id = target_journey AND detached_at IS NULL;
  IF NOT FOUND OR kairn.recording_attachment_scope(item.journey_id, item.source_id, item.original_id,
    item.owner_id, item.membership_generation) IS DISTINCT FROM 'journey_review' THEN RETURN 404; END IF;
  IF expected_revision IS DISTINCT FROM item.placement_grant_revision OR NOT kairn.recording_placement_visible(
        item.journey_id, item.source_id, item.owner_id, item.placement_grant_revision
     ) THEN RETURN 412; END IF;
  IF NOT item.placed_in_draft THEN RETURN 200; END IF;
  PERFORM set_config('kairn.recording_account', item.owner_id::text, true);
  UPDATE kairn.recording_attachments SET placed_in_draft = false WHERE id = item.id;
  PERFORM set_config('kairn.recording_account', actor::text, true);
  UPDATE kairn.journeys SET draft_generation = draft_generation + 1 WHERE id = target_journey;
  INSERT INTO kairn.audit_events(id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (gen_random_uuid(), actor, 'recording_placement_removed', 'source', item.source_id, target_journey);
  RETURN 200;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.remove_recording_placement(uuid, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.remove_recording_placement(uuid, uuid, integer) TO kairn_runtime;
