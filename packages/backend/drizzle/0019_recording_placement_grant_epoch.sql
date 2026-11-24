ALTER TABLE "kairn"."recording_attachments" ADD COLUMN "placement_grant_revision" integer;--> statement-breakpoint
ALTER TABLE "kairn"."recording_reviews" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_placement_visible(
  target_journey uuid, target_source uuid, source_owner uuid, grant_revision integer
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kairn.source_grants AS grant_row
    WHERE grant_row.journey_id = target_journey AND grant_row.source_id = target_source
      AND grant_row.owner_id = source_owner AND grant_row.revision = grant_revision AND grant_row.withdrawn_at IS NULL
      AND EXISTS (
        SELECT 1 FROM kairn.journey_memberships
        WHERE journey_id = target_journey AND account_id = kairn.invitation_actor() AND revoked_at IS NULL
      )
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.recording_placement_visible(uuid,uuid,uuid,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.recording_placement_visible(uuid,uuid,uuid,integer) TO kairn_runtime;
