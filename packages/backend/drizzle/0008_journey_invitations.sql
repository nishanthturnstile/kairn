CREATE TYPE "kairn"."journey_invitation_decision" AS ENUM('pending', 'accepted', 'cancelled', 'replaced', 'expired');--> statement-breakpoint
CREATE TYPE "kairn"."journey_invitation_delivery" AS ENUM('queued', 'sent', 'failed', 'expired');--> statement-breakpoint
ALTER TYPE "kairn"."audit_target_kind" ADD VALUE 'journey_invitation' BEFORE 'source';--> statement-breakpoint
CREATE TABLE "kairn"."journey_invitation_acceptances" (
	"account_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"membership_generation" uuid NOT NULL,
	CONSTRAINT "journey_invitation_acceptances_account_id_operation_id_pk" PRIMARY KEY("account_id","operation_id"),
	CONSTRAINT "journey_invitation_acceptances_invitation_id_unique" UNIQUE("invitation_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."journey_invitation_attempts" (
	"journey_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"epoch_digest" text NOT NULL,
	"payload_digest" text NOT NULL,
	"result" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_invitation_attempts_journey_id_account_id_key_pk" PRIMARY KEY("journey_id","account_id","key")
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."journey_invitation_mail" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" text,
	"delivery" "kairn"."journey_invitation_delivery" DEFAULT 'queued' NOT NULL,
	CONSTRAINT "journey_invitation_mail_payload" CHECK (("kairn"."journey_invitation_mail"."delivery" = 'queued') = ("kairn"."journey_invitation_mail"."ciphertext" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_mail" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."journey_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journey_id" uuid NOT NULL,
	"issued_by" uuid NOT NULL,
	"issuer_generation" uuid NOT NULL,
	"recipient" text NOT NULL,
	"scope" text DEFAULT 'participant' NOT NULL,
	"token_digest" text,
	"epoch_digest" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decision" "kairn"."journey_invitation_decision" DEFAULT 'pending' NOT NULL,
	"accepted_by" uuid,
	"accepted_generation" uuid,
	CONSTRAINT "journey_invitations_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "journey_invitations_participant" CHECK ("kairn"."journey_invitations"."scope" = 'participant'),
	CONSTRAINT "journey_invitations_revision" CHECK ("kairn"."journey_invitations"."revision" > 0),
	CONSTRAINT "journey_invitations_expiry" CHECK ("kairn"."journey_invitations"."expires_at" > "kairn"."journey_invitations"."created_at"),
	CONSTRAINT "journey_invitations_acceptance" CHECK ((
        ("kairn"."journey_invitations"."decision" = 'accepted' AND "kairn"."journey_invitations"."accepted_by" IS NOT NULL
          AND "kairn"."journey_invitations"."accepted_generation" IS NOT NULL)
        OR ("kairn"."journey_invitations"."decision" <> 'accepted' AND "kairn"."journey_invitations"."accepted_by" IS NULL
          AND "kairn"."journey_invitations"."accepted_generation" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ADD COLUMN "generation" uuid;
--> statement-breakpoint
-- Restoring a backup from before this column existed must recover the same legacy generation.
WITH legacy AS (
  SELECT journey_id, account_id, encode(sha256(convert_to(
    'kairn-legacy-journey-membership:' || journey_id::text || ':' || account_id::text
      || ':' || extract(epoch FROM joined_at)::text,
    'UTF8'
  )), 'hex') AS digest
  FROM kairn.journey_memberships
)
UPDATE kairn.journey_memberships AS member
SET generation = overlay(overlay(substr(legacy.digest, 1, 32) PLACING '8' FROM 13 FOR 1)
  PLACING '8' FROM 17 FOR 1)::uuid
FROM legacy
WHERE (member.journey_id, member.account_id) = (legacy.journey_id, legacy.account_id);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ALTER COLUMN "generation" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "kairn"."journey_memberships" ALTER COLUMN "generation" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_acceptances" ADD CONSTRAINT "journey_invitation_acceptances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_acceptances" ADD CONSTRAINT "journey_invitation_acceptances_invitation_id_journey_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "kairn"."journey_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_attempts" ADD CONSTRAINT "journey_invitation_attempts_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_attempts" ADD CONSTRAINT "journey_invitation_attempts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitation_mail" ADD CONSTRAINT "journey_invitation_mail_id_journey_invitations_id_fk" FOREIGN KEY ("id") REFERENCES "kairn"."journey_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitations" ADD CONSTRAINT "journey_invitations_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitations" ADD CONSTRAINT "journey_invitations_issued_by_accounts_id_fk" FOREIGN KEY ("issued_by") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitations" ADD CONSTRAINT "journey_invitations_accepted_by_accounts_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_invitation_attempts_actor_rate_idx" ON "kairn"."journey_invitation_attempts" USING btree ("account_id","recorded_at");--> statement-breakpoint
CREATE INDEX "journey_invitation_attempts_retention_idx" ON "kairn"."journey_invitation_attempts" USING btree ("recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_invitations_pending_recipient_idx" ON "kairn"."journey_invitations" USING btree ("journey_id","recipient") WHERE "kairn"."journey_invitations"."decision" = 'pending';--> statement-breakpoint
CREATE INDEX "journey_invitations_journey_idx" ON "kairn"."journey_invitations" USING btree ("journey_id","id");--> statement-breakpoint
CREATE INDEX "journey_invitations_issuer_rate_idx" ON "kairn"."journey_invitations" USING btree ("issued_by","created_at");--> statement-breakpoint
CREATE INDEX "journey_invitations_journey_rate_idx" ON "kairn"."journey_invitations" USING btree ("journey_id","created_at");--> statement-breakpoint
CREATE INDEX "journey_invitations_recipient_rate_idx" ON "kairn"."journey_invitations" USING btree ("recipient","created_at");

--> statement-breakpoint
CREATE FUNCTION kairn.invitation_actor()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT account.id
  FROM kairn.accounts AS account
  JOIN kairn_auth."user" AS profile ON profile.id = account.id
  WHERE account.id = nullif(current_setting('kairn.identity_account', true), '')::uuid
    AND account.restricted_at IS NULL AND profile.email_verified;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.invitation_admin_generation(target_journey uuid, actor uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT member.generation
  FROM kairn.journey_memberships AS member
  JOIN kairn.journeys AS journey ON journey.id = member.journey_id
  JOIN kairn.accounts AS account ON account.id = member.account_id
  JOIN kairn_auth."user" AS profile ON profile.id = account.id
  JOIN kairn.journey_capabilities AS capability
    ON (capability.journey_id, capability.account_id) = (member.journey_id, member.account_id)
    AND capability.capability = 'administrator'
  WHERE member.journey_id = target_journey AND member.account_id = actor
    AND member.revoked_at IS NULL AND journey.archived_at IS NULL
    AND account.restricted_at IS NULL AND profile.email_verified;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.invitation_epoch_is_current(epoch text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kairn_auth.identity_recovery AS recovery
    WHERE recovery.id = 'current' AND recovery.epoch_digest = epoch
  );
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.close_journey_invitation(target uuid, final_decision kairn.journey_invitation_decision)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE kairn.journey_invitations SET decision = final_decision
    WHERE id = target AND decision = 'pending';
  UPDATE kairn.journey_invitation_mail SET delivery = 'expired', ciphertext = NULL
    WHERE id = target AND delivery = 'queued';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.invitation_timestamp(value timestamptz)
RETURNS text
LANGUAGE sql STABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_journey_invitations(target uuid, after_invitation uuid, epoch text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', item.id, 'email', item.recipient, 'expiresAt', kairn.invitation_timestamp(item.expires_at),
      'decision', CASE WHEN item.decision = 'expired' OR item.expires_at <= statement_timestamp()
        THEN 'expired' ELSE 'pending' END,
      'delivery', CASE WHEN item.delivery = 'queued' AND item.expires_at <= statement_timestamp()
        THEN 'expired'::kairn.journey_invitation_delivery ELSE item.delivery END
    ) ORDER BY item.id)
    FROM (
      SELECT invitation.*, mail.delivery
      FROM kairn.journey_invitations AS invitation
      JOIN kairn.journey_invitation_mail AS mail ON mail.id = invitation.id
      WHERE invitation.journey_id = target AND invitation.epoch_digest = epoch
        AND invitation.decision IN ('pending', 'expired')
        AND invitation.recipient <> ''
        AND (after_invitation IS NULL OR invitation.id > after_invitation)
      ORDER BY invitation.id LIMIT 26
    ) AS item
  ), '[]'::jsonb)
  WHERE kairn.invitation_epoch_is_current(epoch)
    AND kairn.invitation_admin_generation(target, kairn.invitation_actor()) IS NOT NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.manage_journey_invitations(
  target uuid, existing_id uuid, command text, attempt_key uuid, fingerprint text, epoch text, candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  actor_generation uuid;
  attempted kairn.journey_invitation_attempts%ROWTYPE;
  existing kairn.journey_invitations%ROWTYPE;
  current_pending kairn.journey_invitations%ROWTYPE;
  candidate jsonb;
  address text;
  seen text[] := '{}';
  row_status text;
  new_id uuid;
  row_id uuid;
  issued_at timestamptz;
  recipient_lock integer;
  items jsonb := '[]'::jsonb;
  jobs jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  IF NOT kairn.invitation_epoch_is_current(epoch) THEN RETURN '{"status":503}'; END IF;
  IF kairn.invitation_admin_generation(target, actor) IS NULL THEN RETURN '{"status":404}'; END IF;

  -- Mutations take the verified actor lock first, then the canonical journey lock.
  PERFORM 1 FROM kairn.journeys WHERE id = target FOR UPDATE;
  actor_generation := kairn.invitation_admin_generation(target, actor);
  IF actor_generation IS NULL THEN RETURN '{"status":404}'; END IF;

  SELECT * INTO attempted FROM kairn.journey_invitation_attempts
    WHERE journey_id = target AND account_id = actor AND key = attempt_key;
  IF FOUND THEN
    IF attempted.epoch_digest <> epoch OR attempted.payload_digest <> fingerprint
      THEN RETURN '{"status":409}'; END IF;
    RETURN jsonb_build_object('status', 200, 'result', attempted.result, 'jobs', jobs);
  END IF;

  IF (SELECT count(*) FROM kairn.journey_invitation_attempts
      WHERE account_id = actor AND recorded_at > clock_timestamp() - INTERVAL '1 hour') >= 120
    THEN RETURN '{"status":429}'; END IF;

  IF command IN ('cancel', 'resend') THEN
    SELECT * INTO existing FROM kairn.journey_invitations
      WHERE id = existing_id AND journey_id = target AND epoch_digest = epoch;
    IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
    IF existing.decision = 'accepted' THEN RETURN '{"status":409,"code":"invitation_accepted"}'; END IF;
  END IF;

  IF command = 'cancel' THEN
    IF existing.decision NOT IN ('pending', 'cancelled', 'expired') THEN RETURN '{"status":404}'; END IF;
    PERFORM kairn.close_journey_invitation(existing.id, 'cancelled');
    UPDATE kairn.journey_invitations SET decision = 'cancelled'
      WHERE id = existing.id;
    IF existing.decision <> 'cancelled' THEN
      INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
      VALUES (gen_random_uuid(), actor, 'journey_invitation_cancelled', 'journey_invitation', existing.id, target);
    END IF;
    result := jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('status', 'cancelled', 'invitationId', existing.id)
    ));
  ELSE
    IF command = 'resend' AND (existing.decision NOT IN ('pending', 'expired') OR existing.recipient = '')
      THEN RETURN '{"status":404}'; END IF;
    IF command NOT IN ('issue', 'resend') OR jsonb_typeof(candidates) IS DISTINCT FROM 'array'
      OR jsonb_array_length(candidates) NOT BETWEEN 1 AND 10
      OR (command = 'resend' AND jsonb_array_length(candidates) <> 1) THEN RETURN '{"status":400}'; END IF;

    -- Order mailbox locks across batches so separate journeys share a quota without deadlocking.
    FOR recipient_lock IN
      SELECT DISTINCT hashtext(addresses.email)
      FROM (
        SELECT CASE WHEN command = 'resend' THEN existing.recipient ELSE entry->>'email' END AS email
        FROM jsonb_array_elements(candidates) AS entry
      ) AS addresses
      WHERE addresses.email IS NOT NULL
      ORDER BY 1
    LOOP
      PERFORM pg_advisory_xact_lock(630008, recipient_lock);
    END LOOP;
    issued_at := clock_timestamp();

    FOR candidate IN SELECT value FROM jsonb_array_elements(candidates) LOOP
      address := CASE WHEN command = 'resend' THEN existing.recipient ELSE candidate->>'email' END;
      row_id := NULL;
      IF address IS NULL OR length(address) NOT BETWEEN 3 AND 254
        OR address !~ '^[!-~]+@[!-~]+$' OR address <> lower(address) THEN
        row_status := 'invalid_email';
      ELSIF address = ANY(seen) THEN
        row_status := 'duplicate';
      ELSE
        seen := array_append(seen, address);
        SELECT invitation.* INTO current_pending
          FROM kairn.journey_invitations AS invitation
          WHERE invitation.journey_id = target AND invitation.recipient = address
            AND invitation.decision = 'pending';
        IF FOUND AND (
          current_pending.expires_at <= issued_at OR current_pending.epoch_digest <> epoch
          OR kairn.invitation_admin_generation(target, current_pending.issued_by)
             IS DISTINCT FROM current_pending.issuer_generation
        ) THEN
          PERFORM kairn.close_journey_invitation(current_pending.id, 'expired');
          current_pending := NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM kairn.journey_memberships AS member
          JOIN kairn_auth."user" AS profile ON profile.id = member.account_id
          WHERE member.journey_id = target AND member.revoked_at IS NULL
            AND profile.email_verified AND profile.email = address
        ) THEN
          row_status := 'already_member';
        ELSIF current_pending.id IS NOT NULL AND current_pending.id IS DISTINCT FROM existing.id THEN
          row_status := 'already_pending';
          row_id := current_pending.id;
        ELSIF EXISTS (
          SELECT 1 FROM kairn.journey_invitations AS recent
          WHERE recent.journey_id = target AND recent.recipient = address
            AND recent.created_at > issued_at - INTERVAL '1 minute'
        ) OR (SELECT count(*) FROM kairn.journey_invitations AS recent
          WHERE recent.issued_by = actor AND recent.recipient = address
            AND recent.created_at > issued_at - INTERVAL '1 hour') >= 3
        OR (SELECT count(*) FROM kairn.journey_invitations AS recent
          WHERE recent.recipient = address AND recent.created_at > issued_at - INTERVAL '1 hour') >= 12
        OR (SELECT count(*) FROM kairn.journey_invitations AS recent
          WHERE recent.journey_id = target AND recent.created_at > issued_at - INTERVAL '1 hour') >= 20
        OR (SELECT count(*) FROM kairn.journey_invitations AS recent
          WHERE recent.issued_by = actor AND recent.created_at > issued_at - INTERVAL '1 hour') >= 30 THEN
          row_status := 'rate_limited';
        ELSE
          new_id := (candidate->>'id')::uuid;
          IF command = 'resend' THEN
            PERFORM kairn.close_journey_invitation(existing.id, 'replaced');
          END IF;
          INSERT INTO kairn.journey_invitations (
            id, journey_id, issued_by, issuer_generation, recipient, token_digest, epoch_digest,
            revision, created_at, expires_at
          ) VALUES (
            new_id, target, actor, actor_generation, address, candidate->>'digest', epoch,
            coalesce(existing.revision + 1, 1), issued_at, issued_at + INTERVAL '168 hours'
          );
          INSERT INTO kairn.journey_invitation_mail (id, ciphertext)
            VALUES (new_id, candidate->>'ciphertext');
          INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
          VALUES (gen_random_uuid(), actor,
            CASE WHEN command = 'resend' THEN 'journey_invitation_resent' ELSE 'journey_invitation_issued' END,
            'journey_invitation', new_id, target);
          row_status := 'queued';
          row_id := new_id;
          jobs := jobs || to_jsonb(new_id);
        END IF;
      END IF;

      items := items || jsonb_strip_nulls(jsonb_build_object('status', row_status, 'invitationId', row_id));
    END LOOP;
    result := jsonb_build_object('items', items);
  END IF;

  INSERT INTO kairn.journey_invitation_attempts (journey_id, account_id, key, epoch_digest, payload_digest, result, recorded_at)
    VALUES (target, actor, attempt_key, epoch, fingerprint, result, clock_timestamp());
  RETURN jsonb_build_object('status', 200, 'result', result, 'jobs', jobs);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.resolve_journey_invitation(link_digest text, epoch text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object('id', invitation.id, 'expiresAt', kairn.invitation_timestamp(invitation.expires_at))
  FROM kairn.journey_invitations AS invitation
  WHERE kairn.invitation_epoch_is_current(epoch)
    AND invitation.epoch_digest = epoch AND invitation.token_digest = link_digest
    AND invitation.decision IN ('pending', 'accepted') AND invitation.expires_at > statement_timestamp();
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.inspect_journey_invitation(target uuid, epoch text, actor uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  invitation kairn.journey_invitations%ROWTYPE;
  journey kairn.journeys%ROWTYPE;
  profile kairn_auth."user"%ROWTYPE;
  membership kairn.journey_memberships%ROWTYPE;
BEGIN
  IF NOT kairn.invitation_epoch_is_current(epoch) THEN RETURN '{"state":"unavailable"}'; END IF;
  SELECT * INTO invitation FROM kairn.journey_invitations WHERE id = target AND epoch_digest = epoch;
  IF NOT FOUND OR invitation.recipient = '' THEN RETURN '{"state":"unavailable"}'; END IF;
  SELECT * INTO profile FROM kairn_auth."user" WHERE id = actor AND email_verified;
  IF NOT FOUND OR profile.email <> invitation.recipient THEN RETURN '{"state":"wrong_account"}'; END IF;

  IF invitation.decision = 'cancelled' THEN RETURN '{"state":"cancelled"}'; END IF;
  IF invitation.expires_at <= statement_timestamp() OR invitation.decision = 'expired'
    THEN RETURN '{"state":"expired"}'; END IF;
  IF invitation.decision = 'replaced' THEN RETURN '{"state":"unavailable"}'; END IF;

  SELECT * INTO membership FROM kairn.journey_memberships
    WHERE journey_id = invitation.journey_id AND account_id = actor;
  IF invitation.decision = 'accepted' THEN
    IF invitation.accepted_by = actor AND membership.generation = invitation.accepted_generation
      AND membership.revoked_at IS NULL THEN
      RETURN jsonb_build_object('state', 'joined', 'journeyId', invitation.journey_id);
    END IF;
    RETURN '{"state":"unavailable"}';
  END IF;

  IF kairn.invitation_admin_generation(invitation.journey_id, invitation.issued_by)
       IS DISTINCT FROM invitation.issuer_generation
    OR membership.revoked_at >= invitation.created_at THEN RETURN '{"state":"unavailable"}'; END IF;

  SELECT * INTO STRICT journey FROM kairn.journeys WHERE id = invitation.journey_id;
  RETURN jsonb_build_object(
    'state', 'ready',
    'title', journey.title,
    'inviter', (SELECT name FROM kairn_auth."user" WHERE id = invitation.issued_by),
    'expiresAt', kairn.invitation_timestamp(invitation.expires_at),
    'scope', invitation.scope,
    'schedule', CASE WHEN journey.time_zone IS NULL THEN NULL ELSE jsonb_build_object(
      'timeZone', journey.time_zone,
      'intendedStart', jsonb_build_object('local', journey.intended_start_local,
        'instant', kairn.invitation_timestamp(journey.intended_start_at), 'offset', journey.start_offset),
      'intendedEnd', CASE WHEN journey.intended_end_at IS NULL THEN NULL ELSE jsonb_build_object(
        'local', journey.intended_end_local, 'instant', kairn.invitation_timestamp(journey.intended_end_at),
        'offset', journey.end_offset) END
    ) END
  );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.review_journey_invitation(target uuid, epoch text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.inspect_journey_invitation(target, epoch, kairn.invitation_actor());
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_journey_invitation_acceptance(
  attempt uuid, epoch text
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT invitation.journey_id
  FROM kairn.journey_invitation_acceptances AS receipt
  JOIN kairn.journey_invitations AS invitation ON invitation.id = receipt.invitation_id
  JOIN kairn.journey_memberships AS member
    ON (member.journey_id, member.account_id) = (invitation.journey_id, receipt.account_id)
    AND member.generation = receipt.membership_generation AND member.revoked_at IS NULL
  WHERE kairn.invitation_epoch_is_current(epoch)
    AND invitation.epoch_digest = epoch AND receipt.account_id = kairn.invitation_actor()
    AND receipt.operation_id = attempt;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.accept_journey_invitation(target uuid, attempt uuid, epoch text, handle_expires timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  invitation kairn.journey_invitations%ROWTYPE;
  accepted_member kairn.journey_memberships%ROWTYPE;
  receipt kairn.journey_invitation_acceptances%ROWTYPE;
  review jsonb;
  accepted_at timestamptz;
BEGIN
  IF actor IS NULL OR NOT kairn.invitation_epoch_is_current(epoch) THEN RETURN '{"status":404}'; END IF;
  SELECT * INTO invitation FROM kairn.journey_invitations WHERE id = target AND epoch_digest = epoch;
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = invitation.journey_id FOR UPDATE;

  SELECT * INTO receipt FROM kairn.journey_invitation_acceptances
    WHERE account_id = actor AND operation_id = attempt;
  IF FOUND THEN
    IF receipt.invitation_id <> target THEN RETURN '{"status":409}'; END IF;
    IF kairn.read_journey_invitation_acceptance(attempt, epoch) IS NULL THEN RETURN '{"status":404}'; END IF;
    RETURN jsonb_build_object('status', 200, 'id', invitation.journey_id);
  END IF;

  SELECT * INTO STRICT invitation FROM kairn.journey_invitations WHERE id = target;
  accepted_at := clock_timestamp();
  IF invitation.expires_at <= accepted_at OR handle_expires <= accepted_at THEN RETURN '{"status":404}'; END IF;
  review := kairn.inspect_journey_invitation(target, epoch, actor);
  IF review->>'state' = 'joined' THEN RETURN '{"status":409,"code":"invitation_accepted"}'; END IF;
  IF review->>'state' <> 'ready' THEN RETURN '{"status":404}'; END IF;

  SELECT * INTO accepted_member FROM kairn.journey_memberships
    WHERE journey_id = invitation.journey_id AND account_id = actor;
  IF NOT FOUND THEN
    INSERT INTO kairn.journey_memberships (journey_id, account_id, joined_at)
    VALUES (invitation.journey_id, actor, accepted_at) RETURNING * INTO accepted_member;
  ELSIF accepted_member.revoked_at IS NOT NULL THEN
    DELETE FROM kairn.journey_capabilities WHERE journey_id = invitation.journey_id AND account_id = actor;
    UPDATE kairn.journey_memberships
      SET joined_at = accepted_at, revoked_at = NULL, generation = gen_random_uuid()
      WHERE journey_id = invitation.journey_id AND account_id = actor
      RETURNING * INTO accepted_member;
  END IF;
  UPDATE kairn.journey_invitations
    SET decision = 'accepted', accepted_by = actor, accepted_generation = accepted_member.generation
    WHERE id = target;
  UPDATE kairn.journey_invitation_mail SET delivery = 'expired', ciphertext = NULL
    WHERE id = target AND delivery = 'queued';
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
  VALUES (gen_random_uuid(), actor, 'journey_invitation_accepted', 'journey_invitation', target, invitation.journey_id);

  INSERT INTO kairn.journey_invitation_acceptances (account_id, operation_id, invitation_id, membership_generation)
    VALUES (actor, attempt, target, accepted_member.generation);
  RETURN jsonb_build_object('status', 200, 'id', invitation.journey_id);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.claim_journey_invitation_mail(target uuid, epoch text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  invitation kairn.journey_invitations%ROWTYPE;
  queued_ciphertext text;
BEGIN
  IF NOT kairn.invitation_epoch_is_current(epoch) THEN RETURN NULL; END IF;
  SELECT * INTO invitation FROM kairn.journey_invitations WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = invitation.journey_id FOR UPDATE;
  SELECT * INTO STRICT invitation FROM kairn.journey_invitations WHERE id = target;
  SELECT ciphertext INTO queued_ciphertext FROM kairn.journey_invitation_mail
    WHERE id = target AND delivery = 'queued' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF invitation.decision <> 'pending' OR invitation.epoch_digest <> epoch
    OR invitation.expires_at <= clock_timestamp()
    OR kairn.invitation_admin_generation(invitation.journey_id, invitation.issued_by)
       IS DISTINCT FROM invitation.issuer_generation THEN
    PERFORM kairn.close_journey_invitation(target, 'expired');
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'email', invitation.recipient,
    'ciphertext', queued_ciphertext,
    'expiresAt', kairn.invitation_timestamp(invitation.expires_at)
  );
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.finish_journey_invitation_mail(target uuid, epoch text, outcome kairn.journey_invitation_delivery)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.journey_invitation_mail AS mail
  SET delivery = outcome, ciphertext = NULL
  FROM kairn.journey_invitations AS invitation
  WHERE kairn.invitation_epoch_is_current(epoch) AND invitation.epoch_digest = epoch
    AND invitation.id = target AND mail.id = invitation.id
    AND outcome IN ('sent', 'failed') AND mail.delivery = 'queued';
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.purge_journey_invitation_data(epoch text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT kairn.invitation_epoch_is_current(epoch) THEN RETURN; END IF;
  UPDATE kairn.journey_invitation_mail
  SET ciphertext = NULL, delivery = 'expired'
  WHERE id IN (
    SELECT mail.id FROM kairn.journey_invitation_mail AS mail
    JOIN kairn.journey_invitations AS invitation ON invitation.id = mail.id
    WHERE mail.delivery = 'queued'
      AND (invitation.expires_at <= statement_timestamp() OR invitation.epoch_digest <> epoch)
    ORDER BY mail.id LIMIT 100 FOR UPDATE OF mail SKIP LOCKED
  );
  UPDATE kairn.journey_invitations SET recipient = '', token_digest = NULL,
    decision = CASE WHEN decision = 'pending' THEN 'expired' ELSE decision END
  WHERE id IN (
    SELECT invitation.id FROM kairn.journey_invitations AS invitation
    WHERE invitation.recipient <> '' AND invitation.expires_at <= statement_timestamp() - INTERVAL '7 days'
    ORDER BY invitation.expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  DELETE FROM kairn.journey_invitation_attempts AS attempt
  WHERE (attempt.journey_id, attempt.account_id, attempt.key) IN (
    SELECT old.journey_id, old.account_id, old.key FROM kairn.journey_invitation_attempts AS old
    WHERE old.recorded_at <= statement_timestamp() - INTERVAL '14 days'
    ORDER BY old.recorded_at LIMIT 1000 FOR UPDATE SKIP LOCKED
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  kairn.invitation_actor(),
  kairn.invitation_admin_generation(uuid, uuid),
  kairn.invitation_epoch_is_current(text),
  kairn.close_journey_invitation(uuid, kairn.journey_invitation_decision),
  kairn.invitation_timestamp(timestamptz),
  kairn.inspect_journey_invitation(uuid, text, uuid),
  kairn.read_journey_invitations(uuid, uuid, text),
  kairn.manage_journey_invitations(uuid, uuid, text, uuid, text, text, jsonb),
  kairn.resolve_journey_invitation(text, text),
  kairn.review_journey_invitation(uuid, text),
  kairn.read_journey_invitation_acceptance(uuid, text),
  kairn.accept_journey_invitation(uuid, uuid, text, timestamptz),
  kairn.claim_journey_invitation_mail(uuid, text),
  kairn.finish_journey_invitation_mail(uuid, text, kairn.journey_invitation_delivery),
  kairn.purge_journey_invitation_data(text)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  kairn.read_journey_invitations(uuid, uuid, text),
  kairn.manage_journey_invitations(uuid, uuid, text, uuid, text, text, jsonb),
  kairn.resolve_journey_invitation(text, text),
  kairn.review_journey_invitation(uuid, text),
  kairn.read_journey_invitation_acceptance(uuid, text),
  kairn.accept_journey_invitation(uuid, uuid, text, timestamptz),
  kairn.claim_journey_invitation_mail(uuid, text),
  kairn.finish_journey_invitation_mail(uuid, text, kairn.journey_invitation_delivery),
  kairn.purge_journey_invitation_data(text)
TO kairn_runtime;
