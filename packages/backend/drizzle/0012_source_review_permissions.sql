CREATE FUNCTION kairn.read_source_review(target_journey uuid, target_source uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'sourceId', source.id,
    'scope', CASE
      WHEN grant_row.withdrawn_at IS NULL THEN coalesce(grant_row.scope::text, 'only_me')
      ELSE 'only_me'
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
--> statement-breakpoint
CREATE FUNCTION kairn.set_source_review(
  target_journey uuid, target_source uuid, expected_revision integer, withdraw boolean
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
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM kairn.sources WHERE id = target_source AND owner_id = actor AND deleted_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;

  IF expected_revision IS NULL OR expected_revision < 0 OR withdraw IS NULL
    THEN RETURN '{"status":409}'; END IF;

  IF NOT (withdraw AND EXISTS (
    SELECT 1 FROM kairn.source_grants
      WHERE journey_id = target_journey AND source_id = target_source AND owner_id = actor
  )) AND NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
      WHERE journey_id = target_journey AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;

  -- Match the membership lock order. Recheck authorisation after waiting for the journey.
  PERFORM 1 FROM kairn.journeys
    WHERE id = target_journey AND (withdraw OR archived_at IS NULL)
    FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  IF NOT withdraw AND NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
      WHERE journey_id = target_journey AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;
  PERFORM 1 FROM kairn.sources WHERE id = target_source AND owner_id = actor AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;

  SELECT * INTO grant_row FROM kairn.source_grants
    WHERE journey_id = target_journey AND source_id = target_source AND owner_id = actor;
  current_revision := coalesce(grant_row.revision, 0);

  IF withdraw AND grant_row.withdrawn_at IS NOT NULL AND expected_revision = current_revision - 1 THEN
    SELECT event.id, event.journal_sequence IS NOT NULL INTO event_id, confirmed
      FROM kairn.audit_events AS audit
      JOIN kairn.restriction_events AS event ON event.audit_event_id = audit.id
      WHERE audit.target_kind = 'source' AND audit.target_id = target_source
        AND audit.actor_id = actor AND audit.journey_id = target_journey
        AND event.operation = 'source_withdrawal' AND event.policy_generation = current_revision;
    IF FOUND THEN RETURN jsonb_build_object(
      'status', 200, 'eventId', event_id, 'confirmed', confirmed, 'revision', current_revision
    ); END IF;
  END IF;

  IF NOT withdraw AND grant_row.scope = 'journey_review' AND grant_row.withdrawn_at IS NULL
    AND expected_revision IN (current_revision, current_revision - 1)
  THEN RETURN jsonb_build_object(
    'status', 200, 'sourceId', target_source, 'scope', 'journey_review', 'revision', current_revision
  ); END IF;

  IF current_revision <> expected_revision OR (withdraw AND (
    grant_row.source_id IS NULL OR grant_row.withdrawn_at IS NOT NULL
  )) OR (grant_row.scope = 'publication_reuse' AND grant_row.withdrawn_at IS NULL)
  THEN RETURN '{"status":409}'; END IF;

  next_revision := current_revision + 1;
  event_id := gen_random_uuid();
  IF NOT withdraw THEN
    INSERT INTO kairn.source_grants (journey_id, source_id, owner_id, scope, revision)
      VALUES (target_journey, target_source, actor, 'journey_review', next_revision)
      ON CONFLICT (journey_id, source_id) DO UPDATE
      SET scope = 'journey_review', revision = next_revision, withdrawn_at = NULL;
    INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
      VALUES (event_id, actor, 'source_shared_for_review', 'source', target_source, target_journey);
    RETURN jsonb_build_object(
      'status', 200, 'sourceId', target_source, 'scope', 'journey_review', 'revision', next_revision
    );
  END IF;

  UPDATE kairn.source_grants SET revision = next_revision, withdrawn_at = now()
    WHERE journey_id = target_journey AND source_id = target_source AND owner_id = actor;
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (event_id, actor, 'source_withdrawal', 'source', target_source, target_journey);
  -- Match the compact v3 tuple in restrictionDigest.
  event_digest := encode(sha256(convert_to(format(
    '[3,"%s","source_withdrawal","%s","%s","%s",%s]',
    event_id, actor, target_journey, target_source, next_revision
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.restriction_events (id, audit_event_id, operation, policy_generation, integrity_digest)
    VALUES (event_id, event_id, 'source_withdrawal', next_revision, event_digest);
  RETURN jsonb_build_object(
    'status', 200, 'eventId', event_id, 'confirmed', false, 'revision', next_revision, 'created', true
  );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_source_withdrawal(target_event uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'version', 3, 'id', event.id, 'operation', event.operation, 'accountId', audit.actor_id,
      'journeyId', audit.journey_id, 'sourceId', audit.target_id, 'generation', event.policy_generation
    ),
    'digest', event.integrity_digest,
    'confirmed', event.journal_sequence IS NOT NULL,
    'earlierPending', false
  )
  FROM kairn.restriction_events AS event
  JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
  WHERE event.id = target_event AND event.operation = 'source_withdrawal'
    AND audit.target_kind = 'source';
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.confirm_source_withdrawal(
  target_event uuid, expected_digest text, sequence_number bigint, receipt text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events
    SET journal_sequence = sequence_number, journal_receipt = receipt
    WHERE id = target_event AND operation = 'source_withdrawal'
      AND integrity_digest = expected_digest AND journal_sequence IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.apply_source_withdrawal(
  target_journey uuid, target_source uuid, source_owner uuid, revision_floor integer
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO kairn.source_grants AS grant_row
    (journey_id, source_id, owner_id, scope, revision, withdrawn_at)
    SELECT journey.id, source.id, source.owner_id, 'journey_review', revision_floor, now()
      FROM kairn.sources AS source
      CROSS JOIN kairn.journeys AS journey
      WHERE source.id = target_source AND source.owner_id = source_owner AND journey.id = target_journey
    ON CONFLICT (journey_id, source_id) DO UPDATE
      SET revision = revision_floor, withdrawn_at = coalesce(grant_row.withdrawn_at, now())
      WHERE grant_row.owner_id = source_owner AND (
        grant_row.revision < revision_floor OR
        (grant_row.revision = revision_floor AND grant_row.withdrawn_at IS NULL)
      );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  kairn.read_source_review(uuid, uuid),
  kairn.set_source_review(uuid, uuid, integer, boolean),
  kairn.read_source_withdrawal(uuid),
  kairn.confirm_source_withdrawal(uuid, text, bigint, text),
  kairn.apply_source_withdrawal(uuid, uuid, uuid, integer)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  kairn.read_source_review(uuid, uuid),
  kairn.set_source_review(uuid, uuid, integer, boolean),
  kairn.read_source_withdrawal(uuid),
  kairn.confirm_source_withdrawal(uuid, text, bigint, text)
TO kairn_runtime;
