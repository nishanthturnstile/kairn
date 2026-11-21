ALTER TABLE "kairn"."accounts" ADD COLUMN "first_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kairn"."accounts" ADD COLUMN "onboarding_step" integer;--> statement-breakpoint
ALTER TABLE "kairn"."accounts" ADD CONSTRAINT "accounts_onboarding_step_range" CHECK ("kairn"."accounts"."onboarding_step" between 0 and 4);