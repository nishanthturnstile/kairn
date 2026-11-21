ALTER TABLE "kairn"."restriction_events" DROP CONSTRAINT "restriction_events_membership_scope";--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ADD COLUMN "coauthor_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ADD COLUMN "publisher_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD COLUMN "affected_capability" "kairn"."journey_capability";--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ADD CONSTRAINT "journey_memberships_editorial_revisions" CHECK ("kairn"."journey_memberships"."coauthor_revision" >= 0 AND "kairn"."journey_memberships"."publisher_revision" >= 0);--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD CONSTRAINT "restriction_events_editorial_scope" CHECK (("kairn"."restriction_events"."operation"::text = 'capability_removal') = ("kairn"."restriction_events"."affected_capability" IS NOT NULL) AND ("kairn"."restriction_events"."affected_capability" IS NULL OR "kairn"."restriction_events"."affected_capability" IN ('coauthor', 'publisher')));--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD CONSTRAINT "restriction_events_membership_scope" CHECK (("kairn"."restriction_events"."operation"::text IN ('membership_revocation', 'capability_removal')) = ("kairn"."restriction_events"."affected_membership_generation" IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION kairn.apply_editorial_capability_removal(
  target_journey uuid, target_member uuid, expected_membership uuid,
  role kairn.journey_capability, revision_floor integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF role IS NULL OR role NOT IN ('coauthor', 'publisher') THEN
    RAISE EXCEPTION 'Expected an editorial capability';
  END IF;
  -- Role changes, membership changes and rejoin all lock the journey first.
  PERFORM 1 FROM kairn.journeys WHERE id = target_journey FOR UPDATE;
  UPDATE kairn.journey_memberships AS member
    SET coauthor_revision = CASE WHEN role = 'coauthor' THEN revision_floor ELSE member.coauthor_revision END,
        publisher_revision = CASE WHEN role = 'publisher' THEN revision_floor ELSE member.publisher_revision END
    WHERE member.journey_id = target_journey AND member.account_id = target_member
      AND member.generation = expected_membership AND member.revoked_at IS NULL
      AND CASE WHEN role = 'coauthor' THEN member.coauthor_revision ELSE member.publisher_revision END <= revision_floor
      AND (
        CASE WHEN role = 'coauthor' THEN member.coauthor_revision ELSE member.publisher_revision END < revision_floor
        OR EXISTS (
          SELECT 1 FROM kairn.journey_capabilities
          WHERE journey_id = target_journey AND account_id = target_member AND capability = role
        )
      );
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM kairn.journey_capabilities
    WHERE journey_id = target_journey AND account_id = target_member AND capability = role;
  UPDATE kairn.journeys SET policy_generation = policy_generation + 1 WHERE id = target_journey;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.set_editorial_capability(
  target_journey uuid, target_member uuid, expected_membership uuid,
  role kairn.journey_capability, expected_revision integer, enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  member kairn.journey_memberships%ROWTYPE;
  current_revision integer;
  next_revision integer;
  assigned boolean;
  new_event uuid;
  confirmed boolean;
  event_digest text;
BEGIN
  IF role IS NULL OR role NOT IN ('coauthor', 'publisher')
    OR enabled IS NULL OR expected_revision IS NULL OR expected_revision < 0
    OR kairn.journey_admin_generation(target_journey, actor) IS NULL
  THEN RETURN '{"status":404}'; END IF;

  PERFORM 1 FROM kairn.journeys
    WHERE id = target_journey AND (NOT enabled OR archived_at IS NULL) FOR UPDATE;
  IF NOT FOUND OR kairn.journey_admin_generation(target_journey, actor) IS NULL
    THEN RETURN '{"status":404}'; END IF;
  SELECT * INTO member FROM kairn.journey_memberships
    WHERE journey_id = target_journey AND account_id = target_member;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  IF member.revoked_at IS NOT NULL OR member.generation IS DISTINCT FROM expected_membership
    THEN RETURN '{"status":409,"code":"membership_changed"}'; END IF;

  current_revision := CASE WHEN role = 'coauthor' THEN member.coauthor_revision ELSE member.publisher_revision END;
  SELECT EXISTS (
    SELECT 1 FROM kairn.journey_capabilities
    WHERE journey_id = target_journey AND account_id = target_member AND capability = role
  ) INTO assigned;

  IF NOT enabled AND NOT assigned AND expected_revision = current_revision - 1 THEN
    SELECT event.id, event.journal_sequence IS NOT NULL INTO new_event, confirmed
      FROM kairn.audit_events AS audit
      JOIN kairn.restriction_events AS event ON event.audit_event_id = audit.id
      WHERE audit.target_kind = 'membership' AND audit.target_id = target_member
        AND audit.journey_id = target_journey AND event.operation = 'capability_removal'
        AND event.affected_membership_generation = expected_membership AND event.affected_capability = role
        AND event.policy_generation = current_revision;
    IF FOUND THEN RETURN jsonb_build_object('status', 200, 'eventId', new_event, 'confirmed', confirmed, 'revision', current_revision); END IF;
  END IF;
  IF enabled AND assigned AND expected_revision IN (current_revision, current_revision - 1)
    THEN RETURN jsonb_build_object('status', 200, 'revision', current_revision); END IF;
  IF current_revision <> expected_revision OR NOT (assigned OR enabled)
    THEN RETURN '{"status":409,"code":"capability_changed"}'; END IF;

  next_revision := current_revision + 1;
  new_event := gen_random_uuid();
  IF enabled THEN
    INSERT INTO kairn.journey_capabilities (journey_id, account_id, capability)
      VALUES (target_journey, target_member, role);
    UPDATE kairn.journey_memberships AS target
      SET coauthor_revision = CASE WHEN role = 'coauthor' THEN next_revision ELSE target.coauthor_revision END,
          publisher_revision = CASE WHEN role = 'publisher' THEN next_revision ELSE target.publisher_revision END
      WHERE target.journey_id = target_journey AND target.account_id = target_member;
    UPDATE kairn.journeys SET policy_generation = policy_generation + 1 WHERE id = target_journey;
    INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
      VALUES (new_event, actor, role::text || '_assigned', 'membership', target_member, target_journey);
    RETURN jsonb_build_object('status', 200, 'revision', next_revision);
  END IF;

  PERFORM kairn.apply_editorial_capability_removal(target_journey, target_member, expected_membership, role, next_revision);
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (new_event, actor, role::text || '_revoked', 'membership', target_member, target_journey);
  -- Match the compact v4 tuple in restrictionDigest.
  event_digest := encode(sha256(convert_to(format(
    '[4,"%s","capability_removal","%s","%s","%s","%s",%s]',
    new_event, target_member, target_journey, expected_membership, role, next_revision
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.restriction_events (
    id, audit_event_id, operation, policy_generation, affected_membership_generation, affected_capability, integrity_digest
  ) VALUES (new_event, new_event, 'capability_removal', next_revision, expected_membership, role, event_digest);
  RETURN jsonb_build_object(
    'status', 200, 'eventId', new_event, 'confirmed', false, 'revision', next_revision, 'created', true
  );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_editorial_capability_removal(target_event uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'version', 4, 'id', event.id, 'operation', event.operation, 'accountId', audit.target_id,
      'journeyId', audit.journey_id, 'membershipGeneration', event.affected_membership_generation,
      'capability', event.affected_capability, 'generation', event.policy_generation
    ),
    'digest', event.integrity_digest,
    'confirmed', event.journal_sequence IS NOT NULL,
    'earlierPending', EXISTS (
      SELECT 1 FROM kairn.audit_events AS membership_audit
      JOIN kairn.restriction_events AS membership_event ON membership_event.audit_event_id = membership_audit.id
      WHERE membership_audit.target_kind = 'membership'
        AND membership_audit.target_id = audit.target_id
        AND membership_audit.journey_id = audit.journey_id
        AND membership_event.operation = 'membership_revocation'
        AND membership_event.affected_membership_generation <> event.affected_membership_generation
        AND membership_event.journal_sequence IS NULL
    )
  )
  FROM kairn.restriction_events AS event
  JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
  WHERE event.id = target_event AND event.operation = 'capability_removal' AND audit.target_kind = 'membership';
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.confirm_editorial_capability_removal(
  target_event uuid, expected_digest text, sequence_number bigint, receipt text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events SET journal_sequence = sequence_number, journal_receipt = receipt
    WHERE id = target_event AND operation = 'capability_removal'
      AND integrity_digest = expected_digest AND journal_sequence IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  kairn.apply_editorial_capability_removal(uuid, uuid, uuid, kairn.journey_capability, integer),
  kairn.set_editorial_capability(uuid, uuid, uuid, kairn.journey_capability, integer, boolean),
  kairn.read_editorial_capability_removal(uuid),
  kairn.confirm_editorial_capability_removal(uuid, text, bigint, text)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  kairn.set_editorial_capability(uuid, uuid, uuid, kairn.journey_capability, integer, boolean),
  kairn.read_editorial_capability_removal(uuid),
  kairn.confirm_editorial_capability_removal(uuid, text, bigint, text)
TO kairn_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.read_journey_people(target_journey uuid, after_account uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  -- No caller row yields NULL. An authorised page with no remaining members yields [].
  SELECT (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'accountId', person.account_id,
      'membershipGeneration', person.generation,
      'editorialRevisions', jsonb_build_object('coauthor', person.coauthor_revision, 'publisher', person.publisher_revision),
      'displayName', person.display_name,
      'capabilities', ARRAY(
        SELECT capability.capability::text
        FROM kairn.journey_capabilities AS capability
        WHERE capability.journey_id = target_journey
          AND capability.account_id = person.account_id
        ORDER BY capability.capability
      )
    ) ORDER BY person.account_id), '[]'::jsonb)
    FROM (
      SELECT member.account_id, member.generation, member.coauthor_revision, member.publisher_revision, profile.name AS display_name
      FROM kairn.journey_memberships AS member
      JOIN kairn_auth."user" AS profile ON profile.id = member.account_id
      WHERE member.journey_id = target_journey
        AND member.revoked_at IS NULL
        AND (after_account IS NULL OR member.account_id > after_account)
      ORDER BY member.account_id
      LIMIT 26 -- 25 people and one row to detect the next page
    ) AS person
  )
  FROM kairn.journey_memberships AS caller
  JOIN kairn.accounts AS account ON account.id = caller.account_id
  WHERE caller.journey_id = target_journey
    AND caller.account_id = nullif(current_setting('kairn.journey_account', true), '')::uuid
    AND caller.account_id::text = current_setting('kairn.identity_account', true)
    AND caller.revoked_at IS NULL
    AND account.restricted_at IS NULL;
$$;
