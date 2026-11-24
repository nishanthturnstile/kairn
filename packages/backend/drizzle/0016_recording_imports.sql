CREATE TYPE "kairn"."recording_processing_stage" AS ENUM('queued', 'ready', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "kairn"."recording_upload_state" AS ENUM('uploading', 'complete', 'aborted', 'expired', 'rejected');--> statement-breakpoint
CREATE TABLE "kairn"."recording_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"original_id" uuid NOT NULL,
	"review_revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_originals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"inspection_version" integer NOT NULL,
	"stage" "kairn"."recording_processing_stage" DEFAULT 'queued' NOT NULL,
	"diagnostics" jsonb,
	"issue" text,
	"section_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recording_original_owner_file_key" UNIQUE("owner_id","sha256","byte_length"),
	CONSTRAINT "recording_original_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_originals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_parts" (
	"upload_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"part_number" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "recording_parts_upload_id_part_number_pk" PRIMARY KEY("upload_id","part_number")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_sample_pages" (
	"original_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"section" integer NOT NULL,
	"page" integer NOT NULL,
	"samples" jsonb NOT NULL,
	CONSTRAINT "recording_sample_pages_original_id_section_page_pk" PRIMARY KEY("original_id","section","page")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_sample_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_sections" (
	"original_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"summary" jsonb NOT NULL,
	CONSTRAINT "recording_sections_original_id_ordinal_pk" PRIMARY KEY("original_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"state" "kairn"."recording_upload_state" DEFAULT 'uploading' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cleaned_at" timestamp with time zone,
	CONSTRAINT "recording_upload_owner_device_command_key" UNIQUE("owner_id","device_id","command_id"),
	CONSTRAINT "recording_upload_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."recording_imports" ADD CONSTRAINT "recording_import_upload_owner_fk" FOREIGN KEY ("id","owner_id") REFERENCES "kairn"."recording_uploads"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_imports" ADD CONSTRAINT "recording_import_original_owner_fk" FOREIGN KEY ("original_id","owner_id") REFERENCES "kairn"."recording_originals"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_originals" ADD CONSTRAINT "recording_original_source_asset_fk" FOREIGN KEY ("source_id","id") REFERENCES "kairn"."source_assets"("source_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_originals" ADD CONSTRAINT "recording_original_source_owner_fk" FOREIGN KEY ("source_id","owner_id") REFERENCES "kairn"."sources"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_originals" ADD CONSTRAINT "recording_original_upload_owner_fk" FOREIGN KEY ("upload_id","owner_id") REFERENCES "kairn"."recording_uploads"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_parts" ADD CONSTRAINT "recording_part_upload_owner_fk" FOREIGN KEY ("upload_id","owner_id") REFERENCES "kairn"."recording_uploads"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_sample_pages" ADD CONSTRAINT "recording_sample_original_owner_fk" FOREIGN KEY ("original_id","owner_id") REFERENCES "kairn"."recording_originals"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_sections" ADD CONSTRAINT "recording_section_original_owner_fk" FOREIGN KEY ("original_id","owner_id") REFERENCES "kairn"."recording_originals"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_uploads" ADD CONSTRAINT "recording_uploads_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "kairn"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_import_owner_idx" ON "kairn"."recording_imports" USING btree ("owner_id","id");--> statement-breakpoint
CREATE INDEX "recording_upload_cleanup_idx" ON "kairn"."recording_uploads" USING btree ("state","expires_at");
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'recording_uploads', 'recording_parts', 'recording_originals',
    'recording_imports', 'recording_sections', 'recording_sample_pages'
  ] LOOP
    EXECUTE format('ALTER TABLE kairn.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON kairn.%I TO kairn_runtime', table_name);
    EXECUTE format(
      'CREATE POLICY recording_owner ON kairn.%I TO kairn_runtime, kairn_migrator
       USING (owner_id = nullif(current_setting(''kairn.recording_account'', true), '''')::uuid)
       WITH CHECK (owner_id = nullif(current_setting(''kairn.recording_account'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION kairn.register_recording_source(source_id uuid, asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, kairn
AS $$
DECLARE actor uuid := nullif(current_setting('kairn.recording_account', true), '')::uuid;
BEGIN
  IF actor IS NULL OR actor::text IS DISTINCT FROM current_setting('kairn.identity_account', true) THEN
    RAISE EXCEPTION 'Recording owner context is unavailable';
  END IF;
  INSERT INTO kairn.sources (id, owner_id) VALUES (source_id, actor);
  INSERT INTO kairn.source_assets (id, source_id) VALUES (asset_id, source_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.register_recording_source(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.register_recording_source(uuid, uuid) TO kairn_runtime;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_source_active(requested_source uuid, requested_asset uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, kairn
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kairn.sources AS source
    JOIN kairn.source_assets AS asset ON asset.source_id = source.id
    WHERE source.id = requested_source AND asset.id = requested_asset
      AND source.owner_id = nullif(current_setting('kairn.recording_account', true), '')::uuid
      AND source.deleted_at IS NULL AND asset.deleted_at IS NULL
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.recording_source_active(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.recording_source_active(uuid, uuid) TO kairn_runtime;
