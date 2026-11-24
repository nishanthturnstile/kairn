ALTER TYPE "kairn"."restriction_operation" ADD VALUE 'journey_deletion';--> statement-breakpoint
ALTER TABLE "kairn"."journey_creation_receipts" DROP CONSTRAINT "journey_creation_receipts_journey_id_journeys_id_fk";
--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" DROP CONSTRAINT "recording_attachments_journey_id_journeys_id_fk";
--> statement-breakpoint
ALTER TABLE "kairn"."recording_batches" DROP CONSTRAINT "recording_batches_journey_id_journeys_id_fk";
--> statement-breakpoint
ALTER TABLE "kairn"."recording_commits" DROP CONSTRAINT "recording_commit_attachment_owner_fk";
--> statement-breakpoint
ALTER TABLE "kairn"."journey_creation_receipts" ALTER COLUMN "journey_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."recording_commits" ALTER COLUMN "association_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."restriction_events" ADD COLUMN "journey_creation" jsonb;--> statement-breakpoint
ALTER TABLE "kairn"."journey_creation_receipts" ADD CONSTRAINT "journey_creation_receipts_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ADD CONSTRAINT "recording_attachments_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_batches" ADD CONSTRAINT "recording_batches_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_commits" ADD CONSTRAINT "recording_commit_attachment_owner_fk" FOREIGN KEY ("association_id","owner_id") REFERENCES "kairn"."recording_attachments"("id","owner_id") ON DELETE set null ("association_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_batch_journey_idx" ON "kairn"."recording_batches" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "recording_commit_association_idx" ON "kairn"."recording_commits" USING btree ("association_id");
--> statement-breakpoint
CREATE FUNCTION kairn.apply_journey_deletion(target uuid)
RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Export assets and invitation mail follow their parent rows. Creation and
  -- recording command receipts retain their keys to prevent stale saves.
  DELETE FROM kairn.original_export_grants WHERE journey_id = target;
  DELETE FROM kairn.source_grants WHERE journey_id = target;
  DELETE FROM kairn.journey_invitation_acceptances AS acceptance
    USING kairn.journey_invitations AS invitation
    WHERE invitation.journey_id = target AND acceptance.invitation_id = invitation.id;
  DELETE FROM kairn.journey_invitation_attempts WHERE journey_id = target;
  DELETE FROM kairn.journey_invitations WHERE journey_id = target;
  DELETE FROM kairn.journey_memberships WHERE journey_id = target;
  DELETE FROM kairn.journeys WHERE id = target;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.can_delete_journey(target uuid, actor uuid)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.journey_admin_generation(target, actor) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM kairn.journey_capabilities
      WHERE journey_id = target AND account_id = actor AND capability = 'publisher'
    );
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.begin_journey_deletion(target uuid, device_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  event_id uuid;
  next_policy integer;
  digest text;
  pending boolean;
  recipients jsonb;
  creation jsonb := 'null'::jsonb;
  creator uuid;
  creation_key uuid;
BEGIN
  IF actor IS NULL THEN RETURN '{"status":404}'; END IF;

  SELECT event.id, event.journal_sequence IS NULL INTO event_id, pending
    FROM kairn.audit_events AS audit
    JOIN kairn.restriction_events AS event ON event.audit_event_id = audit.id
    WHERE audit.target_kind = 'journey' AND audit.target_id = target
      AND audit.actor_id = actor AND audit.action = 'journey_deletion';
  IF FOUND THEN
    RETURN jsonb_build_object('status', 200, 'eventId', event_id, 'confirmed', NOT pending);
  END IF;

  IF NOT kairn.can_delete_journey(target, actor) THEN RETURN '{"status":404}'; END IF;
  SELECT policy_generation + 1 INTO next_policy
    FROM kairn.journeys WHERE id = target FOR UPDATE;
  IF NOT FOUND OR NOT kairn.can_delete_journey(target, actor)
    THEN RETURN '{"status":404}'; END IF;

  -- Match the fresh session window used by the identity service.
  IF NOT EXISTS (
    SELECT 1 FROM kairn_auth.session
    WHERE id = device_session AND user_id = actor
      AND expires_at > clock_timestamp()
      AND created_at >= clock_timestamp() - interval '10 minutes'
  ) THEN RETURN '{"status":409}'; END IF;

  SELECT coalesce(jsonb_agg(profile.email), '[]'::jsonb) INTO recipients
    FROM kairn.journey_memberships AS member
    JOIN kairn.accounts AS account ON account.id = member.account_id
    JOIN kairn_auth."user" AS profile ON profile.id = member.account_id
    WHERE member.journey_id = target AND member.revoked_at IS NULL
      AND member.account_id <> actor AND account.restricted_at IS NULL AND profile.email_verified;

  SELECT account_id, key INTO creator, creation_key
    FROM kairn.journey_creation_receipts WHERE journey_id = target;
  IF FOUND THEN
    -- Record opaque command keys so a backup from before the save cannot
    -- recreate this journey when an old client resubmits a pending command.
    PERFORM set_config('kairn.recording_account', creator::text, true);
    SELECT jsonb_build_array(creator, creation_key,
      coalesce((SELECT jsonb_agg(batch.id ORDER BY batch.id)
        FROM kairn.recording_batches AS batch WHERE batch.journey_id = target), '[]'::jsonb),
      coalesce((SELECT jsonb_agg(jsonb_build_array(command.import_id, command.device_id, command.command_id)
        ORDER BY command.import_id)
        FROM kairn.recording_commits AS command
        JOIN kairn.recording_attachments AS attachment ON attachment.id = command.association_id
        JOIN kairn.recording_uploads AS upload ON upload.id = command.import_id
        WHERE attachment.journey_id = target AND command.outcome = 'created'
          AND upload.batch_id IS NULL), '[]'::jsonb)
    ) INTO creation;
  END IF;

  PERFORM kairn.apply_journey_deletion(target);
  event_id := gen_random_uuid();
  digest := encode(sha256(convert_to(format(
    '[8,"%s","journey_deletion","%s","%s",%s,%s]',
    event_id, actor, target, replace(creation::text, ' ', ''), next_policy
  ), 'UTF8')), 'hex');
  INSERT INTO kairn.audit_events (id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (event_id, actor, 'journey_deletion', 'journey', target, target);
  INSERT INTO kairn.restriction_events (id, audit_event_id, operation, policy_generation, integrity_digest, journey_creation)
    VALUES (event_id, event_id, 'journey_deletion', next_policy, digest, creation);
  RETURN jsonb_build_object('status', 200, 'eventId', event_id, 'confirmed', false, 'recipients', recipients);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.read_journey_deletion(target_event uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'event', jsonb_build_object('version', 8, 'id', event.id, 'operation', event.operation,
      'accountId', audit.actor_id, 'journeyId', audit.target_id, 'generation', event.policy_generation,
      'creation', event.journey_creation),
    'digest', event.integrity_digest, 'confirmed', event.journal_sequence IS NOT NULL,
    'earlierPending', false)
  FROM kairn.restriction_events AS event
  JOIN kairn.audit_events AS audit ON audit.id = event.audit_event_id
  WHERE event.id = target_event AND event.operation::text = 'journey_deletion';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.apply_journey_deletion(uuid), kairn.can_delete_journey(uuid,uuid),
  kairn.begin_journey_deletion(uuid,uuid), kairn.read_journey_deletion(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.begin_journey_deletion(uuid,uuid), kairn.read_journey_deletion(uuid) TO kairn_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.accept_journey_invitation(target uuid, attempt uuid, epoch text, handle_expires timestamptz)
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
  IF NOT FOUND THEN RETURN '{"status":404}'; END IF;

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
CREATE OR REPLACE FUNCTION kairn.claim_journey_invitation_mail(target uuid, epoch text)
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
  IF NOT FOUND THEN RETURN NULL; END IF;
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
CREATE FUNCTION kairn.confirm_journey_deletion(
  target_event uuid, expected_digest text, sequence_number bigint, receipt text
)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE kairn.restriction_events
    SET journal_sequence = sequence_number, journal_receipt = receipt
    WHERE id = target_event AND operation::text = 'journey_deletion'
      AND integrity_digest = expected_digest AND journal_sequence IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.confirm_journey_deletion(uuid,text,bigint,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.confirm_journey_deletion(uuid,text,bigint,text) TO kairn_runtime;
--> statement-breakpoint
CREATE FUNCTION kairn.restore_deleted_journey_commands(creation jsonb)
RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  creator uuid := (creation->>0)::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kairn.accounts WHERE id = creator) THEN RETURN; END IF;
  INSERT INTO kairn.journey_creation_receipts (account_id, key, payload_digest)
    VALUES (creator, (creation->>1)::uuid, repeat('0', 64))
    ON CONFLICT DO NOTHING;

  PERFORM set_config('kairn.recording_account', creator::text, true);
  INSERT INTO kairn.recording_batches AS batch (id, owner_id, expires_at)
    SELECT id::uuid, creator, now() FROM jsonb_array_elements_text(creation->2) AS id
    ON CONFLICT (id) DO UPDATE SET expires_at = least(batch.expires_at, EXCLUDED.expires_at)
    WHERE batch.owner_id = creator AND batch.journey_id IS NULL AND batch.saved_at IS NULL;

  INSERT INTO kairn.recording_commits (import_id, owner_id, device_id, command_id, fingerprint, outcome)
    SELECT entry.id, creator, (command->>1)::uuid, (command->>2)::uuid, repeat('0', 64), 'created'
    FROM jsonb_array_elements(creation->3) AS command
    JOIN kairn.recording_imports AS entry ON entry.id = (command->>0)::uuid AND entry.owner_id = creator
    ON CONFLICT DO NOTHING;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.restore_deleted_journey_commands(jsonb) FROM PUBLIC;
