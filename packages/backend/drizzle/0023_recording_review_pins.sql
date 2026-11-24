ALTER TABLE "kairn"."recording_attachments" ADD COLUMN "review_pinned_at" timestamp with time zone DEFAULT now() NOT NULL;
