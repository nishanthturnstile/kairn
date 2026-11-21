CREATE TYPE "kairn"."onboarding_intent" AS ENUM('plan', 'record');--> statement-breakpoint
ALTER TABLE "kairn"."accounts" ADD COLUMN "onboarding_intent" "kairn"."onboarding_intent";