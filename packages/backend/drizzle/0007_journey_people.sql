CREATE FUNCTION kairn.read_journey_people(target_journey uuid, after_account uuid)
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
      SELECT member.account_id, profile.name AS display_name
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.read_journey_people(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.read_journey_people(uuid, uuid) TO kairn_runtime;
