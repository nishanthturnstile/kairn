CREATE TABLE "kairn"."membership_restriction_attempts" (
	"actor_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "membership_restriction_attempts_actor_id_key_pk" PRIMARY KEY("actor_id","key"),
	CONSTRAINT "membership_restriction_attempts_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."membership_restriction_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD COLUMN "affected_membership_generation" uuid;--> statement-breakpoint
ALTER TABLE "kairn"."membership_restriction_attempts" ADD CONSTRAINT "membership_restriction_attempts_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."membership_restriction_attempts" ADD CONSTRAINT "membership_restriction_attempts_event_id_restriction_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "kairn"."restriction_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD CONSTRAINT "restriction_events_membership_scope" CHECK (("kairn"."restriction_events"."operation"::text = 'membership_revocation') = ("kairn"."restriction_events"."affected_membership_generation" IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION kairn.journey_admin_generation(target_journey uuid, actor uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT member.generation
  FROM kairn.journey_memberships AS member
  JOIN kairn.accounts AS account ON account.id = member.account_id
  JOIN kairn_auth."user" AS profile ON profile.id = account.id
  JOIN kairn.journey_capabilities AS capability
    ON (capability.journey_id, capability.account_id) = (member.journey_id, member.account_id)
    AND capability.capability = 'administrator'
  WHERE member.journey_id = target_journey AND member.account_id = actor
    AND member.revoked_at IS NULL AND account.restricted_at IS NULL AND profile.email_verified;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.invitation_admin_generation(target_journey uuid, actor uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.journey_admin_generation(target_journey, actor)
  FROM kairn.journeys
  WHERE id = target_journey AND archived_at IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.apply_journey_membership_revocation(
  target_journey uuid, target_member uuid, expected_membership uuid, generation_floor integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  removed_at timestamptz;
BEGIN
  -- All changes to invitation decisions and journey membership serialize on this row.
  UPDATE kairn.journeys SET policy_generation = greatest(policy_generation, generation_floor)
    WHERE id = target_journey;
  UPDATE kairn.journey_memberships
    SET revoked_at = coalesce(revoked_at, greatest(clock_timestamp(), joined_at))
    WHERE journey_id = target_journey AND account_id = target_member
      AND generation = expected_membership
    RETURNING revoked_at INTO removed_at;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM kairn.journey_capabilities
    WHERE journey_id = target_journey AND account_id = target_member;

  WITH cancelled AS (
    UPDATE kairn.journey_invitations SET decision = 'cancelled'
    WHERE journey_id = target_journey AND decision = 'pending'
      AND (
        (issued_by = target_member AND issuer_generation = expected_membership)
        OR (created_at <= removed_at AND recipient = (
          SELECT email FROM kairn_auth."user" WHERE id = target_member AND email_verified
        ))
      )
    RETURNING id
  )
  UPDATE kairn.journey_invitation_mail SET ciphertext = NULL, delivery = 'expired'
    WHERE id IN (SELECT id FROM cancelled) AND delivery = 'queued';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.restrict_journey_member(
  target_journey uuid, member_to_remove uuid, expected_membership uuid, attempt uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  target_member uuid := coalesce(member_to_remove, actor);
  action_code text := CASE WHEN member_to_remove IS NULL THEN 'journey_left' ELSE 'journey_member_removed' END;
  prior record;
  membership kairn.journey_memberships%ROWTYPE;
  next_policy integer;
  new_event uuid;
  event_digest text;
BEGIN
  IF actor IS NULL OR member_to_remove = actor THEN RETURN '{"status":404}'; END IF;

  -- The verified session holds the actor account lock before any journey lock.
  SELECT audit.journey_id, audit.target_id, audit.action, event.id,
    event.affected_membership_generation, event.journal_sequence
    INTO prior
    FROM kairn.membership_restriction_attempts AS operation
    JOIN kairn.restriction_events AS event ON event.id = operation.event_id
    JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
    WHERE operation.actor_id = actor AND operation.key = attempt;
  IF FOUND THEN
    IF prior.journey_id IS DISTINCT FROM target_journey
      OR prior.target_id IS DISTINCT FROM target_member
      OR prior.action IS DISTINCT FROM action_code
      OR prior.affected_membership_generation IS DISTINCT FROM expected_membership
      THEN RETURN '{"status":409,"code":"idempotency_conflict"}';
    END IF;
    RETURN jsonb_build_object('status', 200, 'eventId', prior.id, 'confirmed', prior.journal_sequence IS NOT NULL);
  END IF;

  -- Avoid locking a journey for a caller outside its roster. Check again after locking.
  IF NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
    WHERE journey_id = target_journey AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;

  SELECT policy_generation + 1 INTO next_policy
    FROM kairn.journeys WHERE id = target_journey FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
    WHERE journey_id = target_journey AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN '{"status":404}'; END IF;
  IF member_to_remove IS NOT NULL AND kairn.journey_admin_generation(target_journey, actor) IS NULL
    THEN RETURN '{"status":404}'; END IF;

  SELECT * INTO membership FROM kairn.journey_memberships
    WHERE journey_id = target_journey AND account_id = target_member;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  IF membership.revoked_at IS NOT NULL OR membership.generation IS DISTINCT FROM expected_membership
    THEN RETURN '{"status":409,"code":"membership_changed"}'; END IF;

  IF EXISTS (
    SELECT 1 FROM kairn.journey_capabilities
    WHERE journey_id = target_journey AND account_id = target_member AND capability = 'administrator'
  ) AND NOT EXISTS (
    SELECT 1 FROM kairn.journey_capabilities AS capability
    WHERE capability.journey_id = target_journey AND capability.account_id <> target_member
      AND capability.capability = 'administrator'
      AND kairn.journey_admin_generation(target_journey, capability.account_id) IS NOT NULL
  ) THEN RETURN '{"status":409,"code":"last_administrator"}'; END IF;

  PERFORM kairn.apply_journey_membership_revocation(target_journey, target_member, expected_membership, next_policy);
  new_event := gen_random_uuid();
  -- Match the v2 compact JSON tuple in restrictionDigest. All vector fields are UUIDs or constants.
  event_digest := encode(sha256(convert_to(format(
    '[2,"%s","membership_revocation","%s","%s","%s",%s]',
    new_event, target_member, target_journey, expected_membership, next_policy
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (new_event, actor, action_code, 'membership', target_member, target_journey);
  INSERT INTO kairn.restriction_events (
    id, audit_event_id, operation, policy_generation, affected_membership_generation, integrity_digest
  ) VALUES (new_event, new_event, 'membership_revocation', next_policy, expected_membership, event_digest);
  INSERT INTO kairn.membership_restriction_attempts (actor_id, key, event_id)
    VALUES (actor, attempt, new_event);
  RETURN jsonb_build_object('status', 200, 'eventId', new_event, 'confirmed', false, 'created', true);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_membership_restriction(target_event uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'version', 2, 'id', event.id, 'operation', event.operation, 'accountId', audit.target_id,
      'journeyId', audit.journey_id, 'membershipGeneration', event.affected_membership_generation,
      'generation', event.policy_generation
    ),
    'digest', event.integrity_digest,
    'confirmed', event.journal_sequence IS NOT NULL,
    'earlierPending', EXISTS (
      SELECT 1 FROM kairn.audit_events AS earlier_audit
      JOIN kairn.restriction_events AS earlier ON earlier.audit_event_id = earlier_audit.id
      WHERE earlier_audit.target_kind = 'membership' AND earlier_audit.target_id = audit.target_id
        AND earlier_audit.journey_id = audit.journey_id
        AND earlier.operation = 'membership_revocation'
        AND earlier.policy_generation < event.policy_generation AND earlier.journal_sequence IS NULL
    )
  )
  FROM kairn.restriction_events AS event
  JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
  WHERE event.id = target_event AND event.operation = 'membership_revocation'
    AND audit.target_kind = 'membership';
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.confirm_membership_restriction(
  target_event uuid, expected_digest text, sequence_number bigint, receipt text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events
    SET journal_sequence = sequence_number, journal_receipt = receipt
    WHERE id = target_event AND operation = 'membership_revocation'
      AND integrity_digest = expected_digest AND journal_sequence IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  kairn.journey_admin_generation(uuid, uuid),
  kairn.apply_journey_membership_revocation(uuid, uuid, uuid, integer),
  kairn.restrict_journey_member(uuid, uuid, uuid, uuid),
  kairn.read_membership_restriction(uuid),
  kairn.confirm_membership_restriction(uuid, text, bigint, text)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  kairn.restrict_journey_member(uuid, uuid, uuid, uuid),
  kairn.read_membership_restriction(uuid),
  kairn.confirm_membership_restriction(uuid, text, bigint, text)
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
      SELECT member.account_id, member.generation, profile.name AS display_name
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
