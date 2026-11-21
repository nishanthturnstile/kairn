CREATE TYPE "kairn"."companion_setup_state" AS ENUM('open', 'skipped', 'done', 'expired');--> statement-breakpoint
CREATE TABLE "kairn"."companion_setups" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"state" "kairn"."companion_setup_state" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"selected_journey_id" uuid
);
--> statement-breakpoint
ALTER TABLE "kairn"."companion_setups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kairn"."companion_setups" ADD CONSTRAINT "companion_setups_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "kairn"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kairn"."companion_setups" ADD CONSTRAINT "companion_setups_selected_journey_id_journeys_id_fk" FOREIGN KEY ("selected_journey_id") REFERENCES "kairn"."journeys"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON kairn.companion_setups TO kairn_runtime;
--> statement-breakpoint
CREATE POLICY runtime_companion_setup ON kairn.companion_setups
  TO kairn_runtime
  USING (account_id::text = current_setting('kairn.identity_account', true))
  WITH CHECK (account_id::text = current_setting('kairn.identity_account', true));
