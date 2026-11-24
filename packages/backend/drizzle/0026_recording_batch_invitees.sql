CREATE FUNCTION kairn.find_invitees(target uuid, search_value text, exact_email boolean, recording_batch boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := kairn.invitation_actor();
  current_minute timestamptz := date_trunc('minute', clock_timestamp());
  matches jsonb;
BEGIN
  IF actor IS NULL THEN RETURN '{"status":404}'; END IF;
  IF recording_batch THEN
    PERFORM set_config('kairn.recording_account', actor::text, true);
    IF NOT EXISTS (
      SELECT 1 FROM kairn.recording_batches
      WHERE id = target AND owner_id = actor AND saved_at IS NULL AND expires_at > now()
    ) THEN RETURN '{"status":404}'; END IF;
  ELSIF kairn.invitation_admin_generation(target, actor) IS NULL THEN
    RETURN '{"status":404}';
  END IF;
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
      AND (recording_batch OR NOT EXISTS (SELECT 1 FROM kairn.journey_memberships AS member
        WHERE member.journey_id = target AND member.account_id = profile.id AND member.revoked_at IS NULL))
    ORDER BY "displayName", profile.id LIMIT 8
  ) AS person;
  RETURN jsonb_build_object('status', 200, 'matches', matches);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.find_invitees(uuid,text,boolean,boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.find_journey_invitees(target uuid, search_value text, exact_email boolean)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.find_invitees(target, search_value, exact_email, false);
$$;
--> statement-breakpoint
CREATE FUNCTION kairn.find_recording_batch_invitees(target uuid, search_value text, exact_email boolean)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT kairn.find_invitees(target, search_value, exact_email, true);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.find_recording_batch_invitees(uuid,text,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.find_recording_batch_invitees(uuid,text,boolean) TO kairn_runtime;
