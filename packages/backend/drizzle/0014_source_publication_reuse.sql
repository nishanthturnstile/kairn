ALTER TABLE "kairn"."source_grants" ADD COLUMN "publication_consent" text;--> statement-breakpoint
ALTER TABLE "kairn"."source_grants" ADD CONSTRAINT "source_grants_publication_consent" CHECK ("kairn"."source_grants"."publication_consent" IS NULL OR ("kairn"."source_grants"."scope" = 'publication_reuse' AND "kairn"."source_grants"."withdrawn_at" IS NULL AND "kairn"."source_grants"."publication_consent" = 'members_unlisted_public_v1'));
--> statement-breakpoint
CREATE FUNCTION kairn.invalidate_source_exports(
  target_journey uuid, target_source uuid, source_owner uuid, current_revision integer
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.original_export_grants AS grant_row SET revoked_at = now()
    WHERE grant_row.journey_id = target_journey AND grant_row.owner_id = source_owner
      AND grant_row.revoked_at IS NULL AND EXISTS (
        SELECT 1 FROM kairn.export_grant_assets AS selection
        WHERE selection.grant_id = grant_row.id AND selection.journey_id = target_journey
          AND selection.owner_id = source_owner AND selection.source_id = target_source
          AND selection.source_grant_revision < current_revision
      );
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.apply_source_restriction(
  target_journey uuid, target_source uuid, source_owner uuid, revision_floor integer,
  withdraw boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Serialise with changes to the audience and all grant writes in this journey.
  PERFORM 1 FROM kairn.journeys WHERE id = target_journey FOR UPDATE;
  -- When the backup has no grant, keep a withdrawn row as a revision floor.
  -- Narrowing changes a live grant but cannot restore review access.
  INSERT INTO kairn.source_grants AS grant_row
    (journey_id, source_id, owner_id, scope, revision, withdrawn_at)
    SELECT target_journey, source.id, source.owner_id, 'journey_review', revision_floor, now()
      FROM kairn.sources AS source
      WHERE source.id = target_source AND source.owner_id = source_owner
        AND EXISTS (SELECT 1 FROM kairn.journeys WHERE id = target_journey)
    ON CONFLICT (journey_id, source_id) DO UPDATE
      SET scope = 'journey_review', revision = revision_floor, publication_consent = NULL,
          withdrawn_at = CASE WHEN withdraw THEN coalesce(grant_row.withdrawn_at, now()) ELSE grant_row.withdrawn_at END
      WHERE grant_row.owner_id = source_owner AND (
        grant_row.revision < revision_floor OR (
          grant_row.revision = revision_floor AND (
            grant_row.scope <> 'journey_review' OR (withdraw AND grant_row.withdrawn_at IS NULL)
          )
        )
      );
  IF FOUND THEN
    UPDATE kairn.journeys SET policy_generation = policy_generation + 1
      WHERE id = target_journey;
  END IF;
  -- Earlier releases could record withdrawal without revoking the affected exports.
  PERFORM kairn.invalidate_source_exports(target_journey, target_source, source_owner, revision_floor);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.apply_source_withdrawal(
  target_journey uuid, target_source uuid, source_owner uuid, revision_floor integer
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.apply_source_restriction(target_journey, target_source, source_owner, revision_floor, true);
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.set_source_permission(
  target_journey uuid, target_source uuid, expected_revision integer, action text, consent text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  grant_row kairn.source_grants%ROWTYPE;
  current_revision integer;
  next_revision integer;
  event_id uuid;
  confirmed boolean;
  event_digest text;
  restriction kairn.restriction_operation := CASE action
    WHEN 'withdraw' THEN 'source_withdrawal'::kairn.restriction_operation
    WHEN 'narrow_to_review' THEN 'source_grant_narrowing'::kairn.restriction_operation
  END;
  publication boolean := action = 'allow_publication_reuse';
  next_scope kairn.source_scope := CASE WHEN publication THEN 'publication_reuse' ELSE 'journey_review' END;
  event_version integer;
BEGIN
  IF expected_revision IS NULL OR expected_revision < 0 OR action IS NULL
    OR action NOT IN ('share', 'withdraw', 'narrow_to_review', 'allow_publication_reuse')
    OR (publication AND consent IS DISTINCT FROM 'members_unlisted_public_v1')
    OR (NOT publication AND consent IS NOT NULL)
    THEN RETURN '{"status":409}'; END IF;

  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM kairn.sources WHERE id = target_source AND owner_id = actor AND deleted_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;

  IF NOT (restriction IS NOT NULL AND EXISTS (
    SELECT 1 FROM kairn.source_grants
      WHERE journey_id = target_journey AND source_id = target_source AND owner_id = actor
  )) AND NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
      WHERE journey_id = target_journey AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;

  PERFORM 1 FROM kairn.journeys
    WHERE id = target_journey AND (restriction IS NOT NULL OR archived_at IS NULL) FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  IF restriction IS NULL AND NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
      WHERE journey_id = target_journey AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;
  PERFORM 1 FROM kairn.sources WHERE id = target_source AND owner_id = actor AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;

  SELECT * INTO grant_row FROM kairn.source_grants
    WHERE journey_id = target_journey AND source_id = target_source AND owner_id = actor;
  current_revision := coalesce(grant_row.revision, 0);

  IF restriction IS NOT NULL AND expected_revision = current_revision - 1 AND (
    (action = 'withdraw' AND grant_row.withdrawn_at IS NOT NULL) OR
    (action = 'narrow_to_review' AND grant_row.scope = 'journey_review' AND grant_row.withdrawn_at IS NULL)
  ) THEN
    SELECT event.id, event.journal_sequence IS NOT NULL INTO event_id, confirmed
      FROM kairn.audit_events AS audit
      JOIN kairn.restriction_events AS event ON event.audit_event_id = audit.id
      WHERE audit.target_kind = 'source' AND audit.target_id = target_source
        AND audit.actor_id = actor AND audit.journey_id = target_journey
        AND event.operation = restriction AND event.policy_generation = current_revision;
    IF FOUND THEN RETURN jsonb_build_object(
      'status', 200, 'eventId', event_id, 'confirmed', confirmed, 'revision', current_revision
    ); END IF;
  END IF;

  IF restriction IS NULL AND grant_row.scope = next_scope AND grant_row.withdrawn_at IS NULL
    AND grant_row.publication_consent IS NOT DISTINCT FROM consent
    AND expected_revision IN (current_revision, current_revision - 1)
  THEN RETURN jsonb_build_object(
    'status', 200, 'sourceId', target_source, 'scope', next_scope, 'revision', current_revision
  ); END IF;

  IF current_revision <> expected_revision
    OR (restriction IS NOT NULL AND (grant_row.source_id IS NULL OR grant_row.withdrawn_at IS NOT NULL))
    OR (action = 'narrow_to_review' AND grant_row.scope IS DISTINCT FROM 'publication_reuse')
    OR (action = 'share' AND grant_row.scope = 'publication_reuse' AND grant_row.withdrawn_at IS NULL)
  THEN RETURN '{"status":409}'; END IF;

  next_revision := current_revision + 1;
  event_id := gen_random_uuid();
  IF restriction IS NULL THEN
    INSERT INTO kairn.source_grants (journey_id, source_id, owner_id, scope, publication_consent, revision)
      VALUES (target_journey, target_source, actor, next_scope, consent, next_revision)
      ON CONFLICT (journey_id, source_id) DO UPDATE
      SET scope = next_scope, publication_consent = consent, revision = next_revision, withdrawn_at = NULL;
    UPDATE kairn.journeys SET policy_generation = policy_generation + 1
      WHERE id = target_journey;
    PERFORM kairn.invalidate_source_exports(target_journey, target_source, actor, next_revision);
    INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
      VALUES (event_id, actor, CASE WHEN publication THEN 'source_publication_reuse_allowed_v1' ELSE 'source_shared_for_review' END,
        'source', target_source, target_journey);
    RETURN jsonb_build_object(
      'status', 200, 'sourceId', target_source, 'scope', next_scope, 'revision', next_revision
    );
  END IF;

  PERFORM kairn.apply_source_restriction(target_journey, target_source, actor, next_revision, action = 'withdraw');
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (event_id, actor, restriction::text, 'source', target_source, target_journey);
  -- Match the compact source event tuples in restrictionDigest.
  event_version := CASE WHEN action = 'withdraw' THEN 3 ELSE 5 END;
  event_digest := encode(sha256(convert_to(format(
    '[%s,"%s","%s","%s","%s","%s",%s]',
    event_version, event_id, restriction, actor, target_journey, target_source, next_revision
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.restriction_events (id, audit_event_id, operation, policy_generation, integrity_digest)
    VALUES (event_id, event_id, restriction, next_revision, event_digest);
  RETURN jsonb_build_object(
    'status', 200, 'eventId', event_id, 'confirmed', false, 'revision', next_revision, 'created', true
  );
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.set_source_review(
  target_journey uuid, target_source uuid, expected_revision integer, withdraw boolean
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.set_source_permission(
    target_journey, target_source, expected_revision,
    CASE WHEN withdraw THEN 'withdraw' WHEN NOT withdraw THEN 'share' END, NULL
  );
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_source_narrowing(target_event uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'version', 5, 'id', event.id, 'operation', event.operation, 'accountId', audit.actor_id,
      'journeyId', audit.journey_id, 'sourceId', audit.target_id, 'generation', event.policy_generation
    ),
    'digest', event.integrity_digest,
    'confirmed', event.journal_sequence IS NOT NULL,
    'earlierPending', EXISTS (
      SELECT 1 FROM kairn.audit_events AS earlier_audit
      JOIN kairn.restriction_events AS earlier ON earlier.audit_event_id = earlier_audit.id
      WHERE earlier_audit.target_kind = 'source' AND earlier_audit.target_id = audit.target_id
        AND earlier_audit.actor_id = audit.actor_id AND earlier_audit.journey_id = audit.journey_id
        AND earlier.operation = 'source_withdrawal' AND earlier.policy_generation < event.policy_generation
        AND earlier.journal_sequence IS NULL
    )
  )
  FROM kairn.restriction_events AS event
  JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
  WHERE event.id = target_event AND event.operation = 'source_grant_narrowing' AND audit.target_kind = 'source';
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.confirm_source_narrowing(
  target_event uuid, expected_digest text, sequence_number bigint, receipt text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events SET journal_sequence = sequence_number, journal_receipt = receipt
    WHERE id = target_event AND operation = 'source_grant_narrowing'
      AND integrity_digest = expected_digest AND journal_sequence IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  kairn.invalidate_source_exports(uuid, uuid, uuid, integer),
  kairn.apply_source_restriction(uuid, uuid, uuid, integer, boolean),
  kairn.set_source_permission(uuid, uuid, integer, text, text),
  kairn.read_source_narrowing(uuid),
  kairn.confirm_source_narrowing(uuid, text, bigint, text)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  kairn.set_source_permission(uuid, uuid, integer, text, text),
  kairn.read_source_narrowing(uuid),
  kairn.confirm_source_narrowing(uuid, text, bigint, text)
TO kairn_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.read_source_review(target_journey uuid, target_source uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'sourceId', source.id,
    'scope', CASE
      WHEN grant_row.withdrawn_at IS NOT NULL THEN 'only_me'
      WHEN grant_row.scope = 'publication_reuse' AND grant_row.publication_consent IS NULL THEN 'journey_review'
      ELSE coalesce(grant_row.scope::text, 'only_me')
    END,
    'revision', coalesce(grant_row.revision, 0)
  )
  FROM kairn.sources AS source
  CROSS JOIN kairn.invitation_actor() AS actor(id)
  LEFT JOIN kairn.source_grants AS grant_row
    ON grant_row.source_id = source.id AND grant_row.journey_id = target_journey
  LEFT JOIN kairn.journey_memberships AS member
    ON member.journey_id = target_journey AND member.account_id = actor.id
    AND member.revoked_at IS NULL
  WHERE source.id = target_source AND source.deleted_at IS NULL
    AND (
      (source.owner_id = actor.id AND (member.account_id IS NOT NULL OR grant_row.source_id IS NOT NULL))
      OR (
        member.account_id IS NOT NULL AND grant_row.source_id IS NOT NULL
        AND grant_row.withdrawn_at IS NULL
        AND EXISTS (
          SELECT 1 FROM kairn.journey_capabilities AS capability
          WHERE capability.journey_id = member.journey_id AND capability.account_id = member.account_id
            AND capability.capability IN ('coauthor', 'publisher')
        )
      )
    );
$$;
