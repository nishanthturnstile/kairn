CREATE TABLE "kairn"."journey_invitee_search_windows" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitee_search_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."accounts" ADD COLUMN "invite_discoverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitations" ADD COLUMN "recipient_label" text;--> statement-breakpoint
ALTER TABLE "kairn"."journey_invitee_search_windows" ADD CONSTRAINT "journey_invitee_search_windows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION kairn.find_journey_invitees(target uuid, search_value text, exact_email boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  current_minute timestamptz := date_trunc('minute', clock_timestamp());
  matches jsonb;
BEGIN
  IF kairn.invitation_admin_generation(target, actor) IS NULL THEN RETURN '{"status":404}'; END IF;
  INSERT INTO kairn.journey_invitee_search_windows AS budget (account_id, minute, count)
    VALUES (actor, current_minute, 1)
    ON CONFLICT (account_id) DO UPDATE
    SET minute = current_minute, count = CASE WHEN budget.minute = current_minute THEN budget.count + 1 ELSE 1 END
    WHERE budget.minute <> current_minute OR budget.count < 20;
  IF NOT FOUND THEN RETURN '{"status":429}'; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(person) ORDER BY person."displayName", person.id), '[]'::jsonb)
  INTO matches
  FROM (
    SELECT profile.id, btrim(left(profile.name, 120)) AS "displayName", profile.email,
      NOT exact_email AND count(*) OVER (PARTITION BY lower(btrim(left(profile.name, 120)))) > 1 AS ambiguous
    FROM kairn.accounts AS account
    JOIN kairn_auth."user" AS profile ON profile.id = account.id
    WHERE account.invite_discoverable AND account.restricted_at IS NULL AND profile.email_verified
      AND account.id <> actor
      AND (CASE WHEN exact_email THEN profile.email = search_value
        ELSE length(search_value) >= 3 AND starts_with(lower(btrim(profile.name)), search_value) END)
      AND NOT EXISTS (SELECT 1 FROM kairn.journey_memberships AS member
        WHERE member.journey_id = target AND member.account_id = profile.id AND member.revoked_at IS NULL)
    ORDER BY "displayName", profile.id LIMIT 8
  ) AS person;
  RETURN jsonb_build_object('status', 200, 'matches', matches);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.manage_journey_invitees(
  target uuid, existing_id uuid, command text, attempt_key uuid, fingerprint text, epoch text, candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  candidate jsonb;
  normalized jsonb := '[]'::jsonb;
  labels text[] := '{}';
  result jsonb;
  label text;
  item jsonb;
  position integer := 0;
  recipient_lock integer;
  safe_items jsonb;
BEGIN
  IF command = 'issue' THEN
    IF jsonb_typeof(candidates) IS DISTINCT FROM 'array' OR jsonb_array_length(candidates) NOT BETWEEN 1 AND 10
      THEN RETURN '{"status":400}'; END IF;
    IF kairn.invitation_admin_generation(target, kairn.invitation_actor()) IS NULL
      THEN RETURN '{"status":404}'; END IF;
    -- Resolve selections after the same journey and mailbox locks used by issuance.
    PERFORM 1 FROM kairn.journeys WHERE id = target FOR UPDATE;
    FOR recipient_lock IN
      SELECT DISTINCT hashtext(entry->>'email') FROM jsonb_array_elements(candidates) AS entry
      WHERE entry->>'email' IS NOT NULL ORDER BY 1
    LOOP
      PERFORM pg_advisory_xact_lock(630008, recipient_lock);
    END LOOP;
    FOR candidate IN SELECT value FROM jsonb_array_elements(candidates) LOOP
      label := NULL;
      IF candidate ? 'accountId' THEN
        SELECT left(profile.name, 120) INTO label FROM kairn.accounts AS account
        JOIN kairn_auth."user" AS profile ON profile.id = account.id
        WHERE profile.id = (candidate->>'accountId')::uuid
          AND profile.email = candidate->>'email' AND profile.email_verified
          AND account.invite_discoverable AND account.restricted_at IS NULL
          AND to_timestamp((candidate->>'selectionExpiresAt')::double precision / 1000) > clock_timestamp();
        IF NOT FOUND THEN candidate := '{}'::jsonb; END IF;
      END IF;
      labels := array_append(labels, label);
      normalized := normalized || candidate;
    END LOOP;
  ELSE
    normalized := candidates;
  END IF;

  result := kairn.manage_journey_invitations(target, existing_id, command, attempt_key, fingerprint, epoch, normalized);
  IF result->>'status' <> '200' THEN RETURN result; END IF;
  -- A pending row ID can link a name selection to a direct-email invitation.
  SELECT jsonb_agg(
    CASE WHEN entry.value->>'status' = 'already_pending' THEN entry.value - 'invitationId'
      ELSE entry.value END ORDER BY entry.ordinality
  ) INTO safe_items
  FROM jsonb_array_elements(result->'result'->'items') WITH ORDINALITY AS entry;
  result := jsonb_set(result, '{result,items}', safe_items);
  IF jsonb_array_length(result->'jobs') = 0 THEN RETURN result; END IF;
  IF command = 'resend' THEN
    SELECT recipient_label INTO label FROM kairn.journey_invitations WHERE id = existing_id;
    IF label IS NOT NULL THEN
      UPDATE kairn.journey_invitations SET recipient_label = label
      WHERE id = (result->'jobs'->>0)::uuid;
    END IF;
  ELSIF command = 'issue' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(result->'result'->'items') LOOP
      position := position + 1;
      IF item->>'status' = 'queued' AND labels[position] IS NOT NULL THEN
        UPDATE kairn.journey_invitations SET recipient_label = labels[position]
        WHERE id = (item->>'invitationId')::uuid;
      END IF;
    END LOOP;
  END IF;
  RETURN result;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.find_journey_invitees(uuid,text,boolean),
  kairn.manage_journey_invitees(uuid,uuid,text,uuid,text,text,jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION kairn.manage_journey_invitations(uuid,uuid,text,uuid,text,text,jsonb) FROM kairn_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.find_journey_invitees(uuid,text,boolean),
  kairn.manage_journey_invitees(uuid,uuid,text,uuid,text,text,jsonb) TO kairn_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.read_journey_invitations(target uuid, after_invitation uuid, epoch text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', item.id, 'expiresAt', kairn.invitation_timestamp(item.expires_at),
      'decision', CASE WHEN item.decision = 'expired' OR item.expires_at <= statement_timestamp()
        THEN 'expired' ELSE 'pending' END,
      'delivery', CASE WHEN item.delivery = 'queued' AND item.expires_at <= statement_timestamp()
        THEN 'expired'::kairn.journey_invitation_delivery ELSE item.delivery END
    ) || CASE WHEN item.recipient_label IS NULL THEN jsonb_build_object('email', item.recipient)
        ELSE jsonb_build_object('displayName', item.recipient_label) END ORDER BY item.id)
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
CREATE OR REPLACE FUNCTION kairn.purge_journey_invitation_data(epoch text)
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
  UPDATE kairn.journey_invitations SET recipient = '', recipient_label = NULL, token_digest = NULL,
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
