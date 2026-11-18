CREATE SCHEMA "kairn";
--> statement-breakpoint
CREATE TABLE "kairn"."worker_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
GRANT USAGE ON SCHEMA "kairn" TO kairn_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "kairn"."worker_checks" TO kairn_runtime;
