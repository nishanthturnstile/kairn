CREATE FUNCTION kairn.audit_recording_review_acceptance(target_journey uuid, association uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actor uuid := kairn.invitation_actor();
target jsonb := kairn.lock_recording_destination(target_journey);
item kairn.recording_attachments%ROWTYPE;
BEGIN
  IF target IS NULL OR (target->>'canPlace')::boolean IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Recording placement is unavailable'; END IF;
  SELECT * INTO item FROM kairn.recording_attachments
    WHERE id = association AND journey_id = target_journey AND detached_at IS NULL AND placed_in_draft;
  IF NOT FOUND OR kairn.recording_attachment_scope(item.journey_id, item.source_id, item.original_id,
    item.owner_id, item.membership_generation) IS DISTINCT FROM 'journey_review'
    OR NOT kairn.recording_placement_visible(item.journey_id, item.source_id, item.owner_id, item.placement_grant_revision)
    THEN RAISE EXCEPTION 'Recording placement is unavailable'; END IF;
  UPDATE kairn.journeys SET draft_generation = draft_generation + 1 WHERE id = target_journey;
  INSERT INTO kairn.audit_events(id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (gen_random_uuid(), actor, 'recording_review_accepted', 'source', item.source_id, target_journey);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.audit_recording_review_acceptance(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.audit_recording_review_acceptance(uuid, uuid) TO kairn_runtime;
