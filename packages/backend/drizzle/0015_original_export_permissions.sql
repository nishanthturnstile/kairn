CREATE TYPE "kairn"."original_export_decision" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD COLUMN "recipient_membership_generation" uuid;--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD COLUMN "request_key" uuid;--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD COLUMN "decision" "kairn"."original_export_decision" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD CONSTRAINT "original_export_grants_request_key_unique" UNIQUE("journey_id","recipient_id","request_key");--> statement-breakpoint
ALTER TABLE "kairn"."original_export_grants" ADD CONSTRAINT "original_export_grants_request_scope" CHECK (("kairn"."original_export_grants"."request_key" IS NULL) = ("kairn"."original_export_grants"."recipient_membership_generation" IS NULL) AND ("kairn"."original_export_grants"."request_key" IS NOT NULL OR "kairn"."original_export_grants"."decision" = 'approved'));
--> statement-breakpoint
CREATE FUNCTION kairn.original_export_recipient_generation(target_journey uuid, recipient uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT member.generation
  FROM kairn.journey_memberships AS member
  JOIN kairn.accounts AS account ON account.id = member.account_id
  JOIN kairn_auth."user" AS profile ON profile.id = account.id
  WHERE member.journey_id = target_journey AND member.account_id = recipient
    AND member.revoked_at IS NULL AND account.restricted_at IS NULL AND profile.email_verified;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.original_export_available_assets(target_journey uuid, source_owner uuid, wanted uuid[])
RETURNS TABLE (asset_id uuid, source_id uuid, revision integer)
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT asset.id, asset.source_id, contribution.revision
  FROM kairn.source_assets AS asset
  JOIN kairn.sources AS source ON source.id = asset.source_id
  JOIN kairn.source_grants AS contribution ON contribution.source_id = source.id
    AND contribution.owner_id = source.owner_id AND contribution.journey_id = target_journey
  WHERE asset.id = ANY(wanted) AND asset.deleted_at IS NULL AND source.deleted_at IS NULL
    AND source.owner_id = source_owner AND contribution.withdrawn_at IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.original_export_is_current(grant_row kairn.original_export_grants, checked_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT grant_row.revoked_at IS NULL AND grant_row.created_at <= checked_at AND grant_row.expires_at > checked_at
    AND grant_row.recipient_membership_generation IS NOT NULL
    AND grant_row.recipient_membership_generation IS NOT DISTINCT FROM
      kairn.original_export_recipient_generation(grant_row.journey_id, grant_row.recipient_id)
    AND (
      WITH selected AS (
        SELECT asset_id, source_grant_revision FROM kairn.export_grant_assets WHERE grant_id = grant_row.id
      )
      SELECT count(*) > 0 AND count(*) = count(available.asset_id)
      FROM selected
      LEFT JOIN kairn.original_export_available_assets(
        grant_row.journey_id, grant_row.owner_id, ARRAY(SELECT asset_id FROM selected)
      ) AS available ON available.asset_id = selected.asset_id AND available.revision = selected.source_grant_revision
    );
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.original_export_details(grant_row kairn.original_export_grants, checked_at timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'grantId', grant_row.id,
    'ownerId', grant_row.owner_id,
    'recipient', jsonb_build_object('accountId', grant_row.recipient_id, 'displayName', profile.name),
    'assetIds', ARRAY(SELECT asset_id FROM kairn.export_grant_assets WHERE grant_id = grant_row.id ORDER BY asset_id),
    'expiresAt', to_char(grant_row.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'state', CASE
      WHEN grant_row.decision = 'declined' THEN 'declined'
      WHEN grant_row.revoked_at IS NOT NULL THEN 'revoked'
      WHEN grant_row.expires_at <= checked_at THEN 'expired'
      WHEN NOT kairn.original_export_is_current(grant_row, checked_at) THEN 'unavailable'
      ELSE grant_row.decision::text
    END
  ) FROM kairn_auth."user" AS profile WHERE profile.id = grant_row.recipient_id;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.request_original_export(
  target_journey uuid, source_owner uuid, wanted uuid[], expiry timestamptz, attempt uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  recipient uuid := kairn.invitation_actor();
  member_generation uuid;
  grant_row kairn.original_export_grants%ROWTYPE;
  selected_count integer;
  checked_at timestamptz;
BEGIN
  IF recipient IS NULL OR recipient = source_owner THEN RETURN '{"status":404}'; END IF;
  IF attempt IS NULL OR expiry IS NULL OR expiry >= timestamptz '10000-01-01 00:00:00+00'
    OR coalesce(cardinality(wanted), 0) NOT BETWEEN 1 AND 50
    OR cardinality(wanted) <> (SELECT count(DISTINCT id) FROM unnest(wanted) AS asset(id))
    THEN RETURN '{"status":400}'; END IF;
  -- Serialize with decisions, source grant changes and membership removal.
  IF kairn.original_export_recipient_generation(target_journey, recipient) IS NULL
    THEN RETURN '{"status":404}'; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = target_journey FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  member_generation := kairn.original_export_recipient_generation(target_journey, recipient);
  IF member_generation IS NULL THEN RETURN '{"status":404}'; END IF;
  checked_at := clock_timestamp();

  SELECT * INTO grant_row FROM kairn.original_export_grants
    WHERE journey_id = target_journey AND recipient_id = recipient AND request_key = attempt;
  IF FOUND THEN
    IF grant_row.owner_id <> source_owner OR grant_row.expires_at <> expiry
      OR grant_row.recipient_membership_generation <> member_generation
      OR ARRAY(SELECT asset_id FROM kairn.export_grant_assets WHERE grant_id = grant_row.id ORDER BY asset_id)
        <> ARRAY(SELECT id FROM unnest(wanted) AS asset(id) ORDER BY id)
      THEN RETURN '{"status":409}'; END IF;
    RETURN jsonb_build_object('status', 200, 'request', kairn.original_export_details(grant_row, checked_at));
  END IF;

  IF expiry <= checked_at THEN RETURN '{"status":400}'; END IF;
  -- Count new requests while the journey is locked. Same-key retries use the existing row.
  IF EXISTS (SELECT 1 FROM kairn.audit_events
    WHERE actor_id = recipient AND journey_id = target_journey
      AND action = 'original_export_requested' AND occurred_at > checked_at - interval '1 hour'
    OFFSET 19) THEN RETURN '{"status":429}'; END IF;
  SELECT count(*) INTO selected_count FROM kairn.original_export_available_assets(target_journey, source_owner, wanted);
  IF selected_count <> cardinality(wanted) THEN RETURN '{"status":404}'; END IF;
  INSERT INTO kairn.original_export_grants
    (id, journey_id, owner_id, recipient_id, recipient_membership_generation, request_key, decision, created_at, expires_at)
    VALUES (gen_random_uuid(), target_journey, source_owner, recipient, member_generation, attempt, 'pending', checked_at, expiry)
    RETURNING * INTO grant_row;
  INSERT INTO kairn.export_grant_assets (grant_id, asset_id, journey_id, source_id, owner_id, source_grant_revision)
    SELECT grant_row.id, asset_id, target_journey, source_id, source_owner, revision
    FROM kairn.original_export_available_assets(target_journey, source_owner, wanted);
  GET DIAGNOSTICS selected_count = ROW_COUNT;
  IF selected_count <> cardinality(wanted) THEN
    -- An asset changed during the request. Discard the entire selection.
    DELETE FROM kairn.original_export_grants WHERE id = grant_row.id;
    RETURN '{"status":404}';
  END IF;
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id, occurred_at)
    VALUES (gen_random_uuid(), recipient, 'original_export_requested', 'original_export_grant', grant_row.id, target_journey, checked_at);
  RETURN jsonb_build_object('status', 201, 'request', kairn.original_export_details(grant_row, checked_at));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_original_export(target_journey uuid, target_grant uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.original_export_details(grant_row, clock_timestamp())
  FROM kairn.original_export_grants AS grant_row
  CROSS JOIN kairn.invitation_actor() AS actor(id)
  WHERE grant_row.id = target_grant AND grant_row.journey_id = target_journey AND grant_row.request_key IS NOT NULL AND (
    grant_row.owner_id = actor.id OR (
      grant_row.recipient_id = actor.id AND grant_row.recipient_membership_generation =
        kairn.original_export_recipient_generation(target_journey, actor.id)
    )
  );
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.list_original_exports(target_journey uuid, after_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH actor AS (SELECT kairn.invitation_actor() AS id), member AS (
    SELECT id, kairn.original_export_recipient_generation(target_journey, id) AS generation FROM actor
  ), candidates AS (
    SELECT grant_row
    FROM kairn.original_export_grants AS grant_row CROSS JOIN member
    WHERE grant_row.journey_id = target_journey AND grant_row.request_key IS NOT NULL
      AND (after_id IS NULL OR grant_row.id > after_id)
      AND (grant_row.owner_id = member.id OR (
        grant_row.recipient_id = member.id AND grant_row.recipient_membership_generation = member.generation
      ))
    ORDER BY grant_row.id LIMIT 26
  ), page AS (
    SELECT grant_row FROM candidates ORDER BY (grant_row).id LIMIT 25
  )
  SELECT jsonb_build_object(
    'items', coalesce(jsonb_agg(kairn.original_export_details(grant_row, statement_timestamp()) ORDER BY (grant_row).id), '[]'::jsonb),
    'nextCursor', CASE WHEN (SELECT count(*) FROM candidates) > 25
      THEN (SELECT (grant_row).id FROM page ORDER BY (grant_row).id DESC LIMIT 1) END
  ) FROM page;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.decide_original_export(
  target_journey uuid, target_grant uuid, approve boolean, acknowledged boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  grant_row kairn.original_export_grants%ROWTYPE;
  next_decision kairn.original_export_decision := CASE WHEN approve THEN 'approved' ELSE 'declined' END;
  checked_at timestamptz;
BEGIN
  IF approve IS NULL OR (approve AND acknowledged IS DISTINCT FROM true)
    THEN RETURN '{"status":400}'; END IF;
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM kairn.original_export_grants
    WHERE id = target_grant AND journey_id = target_journey AND owner_id = actor)
    THEN RETURN '{"status":404}'; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = target_journey FOR UPDATE;
  SELECT * INTO grant_row FROM kairn.original_export_grants
    WHERE id = target_grant AND journey_id = target_journey AND owner_id = actor;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  IF grant_row.request_key IS NULL THEN RETURN '{"status":409}'; END IF;
  checked_at := clock_timestamp();
  IF grant_row.decision = next_decision AND (NOT approve OR grant_row.revoked_at IS NULL) THEN
    RETURN jsonb_build_object('status', 200, 'request', kairn.original_export_details(grant_row, checked_at));
  END IF;
  IF grant_row.revoked_at IS NOT NULL OR grant_row.decision <> 'pending'
    OR (approve AND NOT kairn.original_export_is_current(grant_row, checked_at))
    THEN RETURN '{"status":409}'; END IF;

  UPDATE kairn.original_export_grants SET decision = next_decision,
    created_at = CASE WHEN approve THEN checked_at ELSE created_at END
    WHERE id = grant_row.id RETURNING * INTO grant_row;
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (gen_random_uuid(), actor, CASE WHEN approve THEN 'original_export_approved' ELSE 'original_export_declined' END,
      'original_export_grant', target_grant, target_journey);
  RETURN jsonb_build_object('status', 200, 'request', kairn.original_export_details(grant_row, checked_at));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.authorize_original_export(target_journey uuid, target_grant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  grant_row kairn.original_export_grants%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM kairn.original_export_grants
    WHERE id = target_grant AND journey_id = target_journey AND recipient_id = actor)
    THEN RETURN NULL; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = target_journey FOR SHARE;
  SELECT * INTO grant_row FROM kairn.original_export_grants
    WHERE id = target_grant AND journey_id = target_journey AND recipient_id = actor;
  IF NOT FOUND OR grant_row.decision <> 'approved'
    OR NOT kairn.original_export_is_current(grant_row, clock_timestamp())
    THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'grantId', target_grant,
    'assetIds', ARRAY(SELECT asset_id FROM kairn.export_grant_assets WHERE grant_id = target_grant ORDER BY asset_id),
    'expiresAt', to_char(grant_row.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.apply_original_export_revocation(target_journey uuid, target_grant uuid, source_owner uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.original_export_grants SET revoked_at = clock_timestamp()
    WHERE id = target_grant AND journey_id = target_journey AND owner_id = source_owner AND revoked_at IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.revoke_original_export(target_journey uuid, target_grant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  grant_decision kairn.original_export_decision;
  event_id uuid;
  confirmed boolean;
  event_digest text;
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM kairn.original_export_grants
    WHERE id = target_grant AND journey_id = target_journey AND owner_id = actor)
    THEN RETURN '{"status":404}'; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = target_journey FOR UPDATE;
  SELECT decision INTO grant_decision FROM kairn.original_export_grants
    WHERE id = target_grant AND journey_id = target_journey AND owner_id = actor;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;

  SELECT event.id, event.journal_sequence IS NOT NULL INTO event_id, confirmed
  FROM kairn.audit_events AS audit
  JOIN kairn.restriction_events AS event ON event.audit_event_id = audit.id
  WHERE audit.target_kind = 'original_export_grant' AND audit.target_id = target_grant AND audit.journey_id = target_journey
    AND audit.actor_id = actor AND event.operation = 'original_export_revocation';
  IF FOUND THEN RETURN jsonb_build_object('status', 200, 'eventId', event_id, 'confirmed', confirmed); END IF;
  IF grant_decision <> 'approved' THEN RETURN '{"status":409}'; END IF;

  PERFORM kairn.apply_original_export_revocation(target_journey, target_grant, actor);
  event_id := gen_random_uuid();
  event_digest := encode(sha256(convert_to(format(
    '[6,"%s","original_export_revocation","%s","%s","%s",1]', event_id, actor, target_journey, target_grant
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (event_id, actor, 'original_export_revocation', 'original_export_grant', target_grant, target_journey);
  INSERT INTO kairn.restriction_events (id, audit_event_id, operation, policy_generation, integrity_digest)
    VALUES (event_id, event_id, 'original_export_revocation', 1, event_digest);
  RETURN jsonb_build_object('status', 200, 'eventId', event_id, 'confirmed', false, 'created', true);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_original_export_revocation(target_event uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'version', 6, 'id', event.id, 'operation', event.operation, 'accountId', audit.actor_id,
      'journeyId', audit.journey_id, 'grantId', audit.target_id, 'generation', event.policy_generation
    ),
    'digest', event.integrity_digest, 'confirmed', event.journal_sequence IS NOT NULL, 'earlierPending', false
  )
  FROM kairn.restriction_events AS event
  JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
  WHERE event.id = target_event AND event.operation = 'original_export_revocation'
    AND audit.target_kind = 'original_export_grant';
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.confirm_original_export_revocation(target_event uuid, expected_digest text, sequence_number bigint, receipt text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events SET journal_sequence = sequence_number, journal_receipt = receipt
    WHERE id = target_event AND operation = 'original_export_revocation'
      AND integrity_digest = expected_digest AND journal_sequence IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  kairn.original_export_recipient_generation(uuid, uuid),
  kairn.original_export_available_assets(uuid, uuid, uuid[]),
  kairn.original_export_is_current(kairn.original_export_grants, timestamptz),
  kairn.original_export_details(kairn.original_export_grants, timestamptz),
  kairn.request_original_export(uuid, uuid, uuid[], timestamptz, uuid),
  kairn.read_original_export(uuid, uuid),
  kairn.list_original_exports(uuid, uuid),
  kairn.decide_original_export(uuid, uuid, boolean, boolean),
  kairn.authorize_original_export(uuid, uuid),
  kairn.apply_original_export_revocation(uuid, uuid, uuid),
  kairn.revoke_original_export(uuid, uuid),
  kairn.read_original_export_revocation(uuid),
  kairn.confirm_original_export_revocation(uuid, text, bigint, text)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  kairn.request_original_export(uuid, uuid, uuid[], timestamptz, uuid),
  kairn.read_original_export(uuid, uuid),
  kairn.list_original_exports(uuid, uuid),
  kairn.decide_original_export(uuid, uuid, boolean, boolean),
  kairn.authorize_original_export(uuid, uuid),
  kairn.revoke_original_export(uuid, uuid),
  kairn.read_original_export_revocation(uuid),
  kairn.confirm_original_export_revocation(uuid, text, bigint, text)
TO kairn_runtime;
