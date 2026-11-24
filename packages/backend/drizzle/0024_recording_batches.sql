CREATE TABLE "kairn"."recording_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"saved_at" timestamp with time zone,
	CONSTRAINT "recording_batch_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."recording_originals" ADD COLUMN "retained" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "kairn"."recording_uploads" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "kairn"."recording_uploads" ADD COLUMN "batch_position" integer;--> statement-breakpoint
ALTER TABLE "kairn"."recording_batches" ADD CONSTRAINT "recording_batches_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_batch_expiry_idx" ON "kairn"."recording_batches" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "kairn"."recording_uploads" ADD CONSTRAINT "recording_upload_batch_owner_fk" FOREIGN KEY ("batch_id","owner_id") REFERENCES "kairn"."recording_batches"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_upload_batch_idx" ON "kairn"."recording_uploads" USING btree ("batch_id","batch_position");
--> statement-breakpoint
ALTER TABLE kairn.recording_batches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON kairn.recording_batches TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY recording_batch_owner ON kairn.recording_batches TO kairn_runtime, kairn_migrator
  USING (owner_id = nullif(current_setting('kairn.recording_account', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('kairn.recording_account', true), '')::uuid);
--> statement-breakpoint
GRANT DELETE ON kairn.recording_reviews TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY recording_discard_batch_review ON kairn.recording_reviews AS RESTRICTIVE FOR DELETE TO kairn_runtime
  USING (EXISTS (
    SELECT 1 FROM kairn.recording_uploads AS upload
    JOIN kairn.recording_batches AS batch ON batch.id = upload.batch_id
    WHERE upload.id = recording_reviews.import_id AND batch.saved_at IS NULL
  ));
--> statement-breakpoint
CREATE POLICY recording_expired_batches ON kairn.recording_batches FOR SELECT TO kairn_migrator
  USING (saved_at IS NULL AND expires_at <= now());
--> statement-breakpoint
CREATE POLICY recording_batch_expired_uploads ON kairn.recording_uploads FOR SELECT TO kairn_migrator
  USING (batch_id IS NOT NULL AND expires_at <= now() AND state <> 'aborted');
--> statement-breakpoint
CREATE FUNCTION kairn.recording_batch_expired_files()
RETURNS TABLE(id uuid, "ownerId" uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT upload.id, upload.owner_id
  FROM kairn.recording_uploads AS upload
  JOIN kairn.recording_batches AS batch ON batch.id = upload.batch_id
  WHERE batch.saved_at IS NULL AND batch.expires_at <= now() AND upload.state <> 'aborted'
  ORDER BY batch.expires_at, upload.id LIMIT 25
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.recording_batch_expired_files() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.recording_batch_expired_files() TO kairn_runtime;
--> statement-breakpoint
ALTER POLICY recording_overdue_reclaim ON kairn.recording_uploads
  USING (cleaned_at IS NULL AND (state <> 'uploading' OR expires_at <= now()));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.recording_reclaim_due()
RETURNS TABLE(id uuid, "ownerId" uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT upload.id, upload.owner_id FROM kairn.recording_uploads AS upload
  WHERE upload.cleaned_at IS NULL AND (upload.state <> 'uploading' OR upload.expires_at <= now())
  ORDER BY upload.expires_at, upload.id LIMIT 25
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kairn.register_recording_source(source_id uuid, asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, kairn
AS $$
DECLARE actor uuid := nullif(current_setting('kairn.recording_account', true), '')::uuid;
BEGIN
  IF actor IS NULL OR actor::text IS DISTINCT FROM current_setting('kairn.identity_account', true) THEN
    RAISE EXCEPTION 'Recording owner context is unavailable';
  END IF;
  INSERT INTO kairn.sources (id, owner_id) VALUES (source_id, actor) ON CONFLICT (id) DO NOTHING;
  INSERT INTO kairn.source_assets (id, source_id) VALUES (asset_id, source_id) ON CONFLICT (id) DO NOTHING;
  IF NOT kairn.recording_source_active(source_id, asset_id) THEN
    RAISE EXCEPTION 'Recording source is unavailable';
  END IF;
END $$;
