ALTER TABLE "kairn"."recording_originals" ADD COLUMN "inspection_job_id" uuid NOT NULL;
--> statement-breakpoint
CREATE POLICY recording_overdue_reclaim ON kairn.recording_uploads FOR SELECT TO kairn_migrator
  USING (cleaned_at IS NULL AND expires_at <= now());
--> statement-breakpoint
CREATE FUNCTION kairn.recording_reclaim_due()
RETURNS TABLE(id uuid, "ownerId" uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT upload.id, upload.owner_id FROM kairn.recording_uploads AS upload
  WHERE upload.cleaned_at IS NULL AND upload.expires_at <= now()
  ORDER BY upload.expires_at, upload.id LIMIT 25
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.recording_reclaim_due() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.recording_reclaim_due() TO kairn_runtime;
