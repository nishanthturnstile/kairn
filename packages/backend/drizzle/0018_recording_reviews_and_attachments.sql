ALTER TABLE "kairn"."recording_imports" ADD CONSTRAINT "recording_import_id_owner_key" UNIQUE("id","owner_id");--> statement-breakpoint
CREATE TABLE "kairn"."recording_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journey_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"original_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"membership_generation" uuid NOT NULL,
	"review_revision" integer NOT NULL,
	"selection" jsonb NOT NULL,
	"file_name" text NOT NULL,
	"section_count" integer NOT NULL,
	"placed_in_draft" boolean DEFAULT false NOT NULL,
	"detached_at" timestamp with time zone,
	CONSTRAINT "recording_attachment_journey_original_key" UNIQUE("journey_id","original_id"),
	CONSTRAINT "recording_attachment_id_owner_key" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_commits" (
	"import_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"association_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	CONSTRAINT "recording_commit_owner_command_key" UNIQUE("owner_id","device_id","command_id")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_commits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kairn"."recording_reviews" (
	"import_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"selection" jsonb NOT NULL,
	CONSTRAINT "recording_reviews_import_id_revision_pk" PRIMARY KEY("import_id","revision")
);
--> statement-breakpoint
ALTER TABLE "kairn"."recording_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ADD CONSTRAINT "recording_attachments_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ADD CONSTRAINT "recording_attachment_import_owner_fk" FOREIGN KEY ("import_id","owner_id") REFERENCES "kairn"."recording_imports"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ADD CONSTRAINT "recording_attachment_original_owner_fk" FOREIGN KEY ("original_id","owner_id") REFERENCES "kairn"."recording_originals"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_attachments" ADD CONSTRAINT "recording_attachment_source_asset_fk" FOREIGN KEY ("source_id","original_id") REFERENCES "kairn"."source_assets"("source_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_commits" ADD CONSTRAINT "recording_commit_import_owner_fk" FOREIGN KEY ("import_id","owner_id") REFERENCES "kairn"."recording_imports"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_commits" ADD CONSTRAINT "recording_commit_attachment_owner_fk" FOREIGN KEY ("association_id","owner_id") REFERENCES "kairn"."recording_attachments"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."recording_reviews" ADD CONSTRAINT "recording_review_import_owner_fk" FOREIGN KEY ("import_id","owner_id") REFERENCES "kairn"."recording_imports"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_attachment_journey_idx" ON "kairn"."recording_attachments" USING btree ("journey_id","id");--> statement-breakpoint
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['recording_reviews', 'recording_attachments', 'recording_commits'] LOOP
    EXECUTE format('ALTER TABLE kairn.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON kairn.%I TO kairn_runtime', table_name);
    EXECUTE format(
      'CREATE POLICY recording_owner ON kairn.%I TO kairn_runtime, kairn_migrator
       USING (owner_id = nullif(current_setting(''kairn.recording_account'', true), '''')::uuid)
       WITH CHECK (owner_id = nullif(current_setting(''kairn.recording_account'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION kairn.lock_recording_destination(target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actor uuid := kairn.invitation_actor();
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM kairn.journey_memberships
    WHERE journey_id = target AND account_id = actor AND revoked_at IS NULL
  ) THEN RETURN NULL; END IF;
  PERFORM 1 FROM kairn.journeys WHERE id = target AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'generation', membership.generation,
      'canPlace', EXISTS (
        SELECT 1 FROM kairn.journey_capabilities
        WHERE journey_id = target AND account_id = actor AND capability = 'coauthor'
      )
    ) FROM kairn.journey_memberships AS membership
    WHERE membership.journey_id = target AND membership.account_id = actor
      AND membership.revoked_at IS NULL
  );
END $$;
--> statement-breakpoint
CREATE FUNCTION kairn.recording_attachment_scope(
  target_journey uuid, target_source uuid, target_asset uuid, source_owner uuid, owner_membership uuid
)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN grant_row.source_id IS NOT NULL AND (
      viewer.account_id = source_owner OR EXISTS (
        SELECT 1 FROM kairn.journey_capabilities
        WHERE journey_id = target_journey AND account_id = viewer.account_id
          AND capability IN ('coauthor','publisher')
      )
    ) THEN 'journey_review'
    WHEN viewer.account_id = source_owner THEN 'only_me'
    ELSE NULL
  END
  FROM kairn.sources AS source
  JOIN kairn.source_assets AS asset ON asset.source_id = source.id
  JOIN kairn.journey_memberships AS contribution
    ON contribution.journey_id = target_journey AND contribution.account_id = source_owner
      AND contribution.revoked_at IS NULL AND contribution.generation = owner_membership
  JOIN kairn.accounts AS owner_account ON owner_account.id = source_owner AND owner_account.restricted_at IS NULL
  JOIN kairn.journey_memberships AS viewer ON viewer.journey_id = target_journey
    AND viewer.account_id = kairn.invitation_actor() AND viewer.revoked_at IS NULL
  LEFT JOIN kairn.source_grants AS grant_row ON grant_row.source_id = source.id
    AND grant_row.journey_id = target_journey AND grant_row.owner_id = source_owner
    AND grant_row.withdrawn_at IS NULL
  WHERE source.id = target_source AND asset.id = target_asset AND source.owner_id = source_owner
    AND source.deleted_at IS NULL AND asset.deleted_at IS NULL
$$;
--> statement-breakpoint
CREATE POLICY recording_attachment_audience ON kairn.recording_attachments FOR SELECT TO kairn_runtime
  USING (
    detached_at IS NULL
    AND journey_id = nullif(current_setting('kairn.recording_journey', true), '')::uuid
    AND kairn.recording_attachment_scope(journey_id, source_id, original_id, owner_id, membership_generation) IS NOT NULL
  );
--> statement-breakpoint
CREATE POLICY recording_section_audience ON kairn.recording_sections FOR SELECT TO kairn_runtime
  USING (EXISTS (
    SELECT 1 FROM kairn.recording_attachments AS item
    WHERE item.id = nullif(current_setting('kairn.recording_attachment', true), '')::uuid
      AND item.original_id = recording_sections.original_id AND item.detached_at IS NULL
      AND kairn.recording_attachment_scope(item.journey_id, item.source_id, item.original_id, item.owner_id, item.membership_generation) IS NOT NULL
  ));
--> statement-breakpoint
CREATE POLICY recording_sample_audience ON kairn.recording_sample_pages FOR SELECT TO kairn_runtime
  USING (EXISTS (
    SELECT 1 FROM kairn.recording_attachments AS item
    WHERE item.id = nullif(current_setting('kairn.recording_attachment', true), '')::uuid
      AND item.original_id = recording_sample_pages.original_id AND item.detached_at IS NULL
      AND kairn.recording_attachment_scope(item.journey_id, item.source_id, item.original_id, item.owner_id, item.membership_generation) IS NOT NULL
  ));
--> statement-breakpoint
CREATE FUNCTION kairn.audit_recording_attachment(association uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE item kairn.recording_attachments%ROWTYPE;
actor uuid := kairn.invitation_actor();
BEGIN
  SELECT * INTO item FROM kairn.recording_attachments WHERE id = association AND owner_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recording association is unavailable'; END IF;
  IF item.placed_in_draft THEN
    UPDATE kairn.journeys SET draft_generation = draft_generation + 1 WHERE id = item.journey_id;
  END IF;
  INSERT INTO kairn.audit_events(id, actor_id, action, target_kind, target_id, journey_id)
    VALUES (gen_random_uuid(), actor, 'recording_attached', 'source', item.source_id, item.journey_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION kairn.lock_recording_destination(uuid),
  kairn.recording_attachment_scope(uuid,uuid,uuid,uuid,uuid), kairn.audit_recording_attachment(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kairn.lock_recording_destination(uuid),
  kairn.recording_attachment_scope(uuid,uuid,uuid,uuid,uuid), kairn.audit_recording_attachment(uuid) TO kairn_runtime;
