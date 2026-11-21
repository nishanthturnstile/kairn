export interface IdentityDevices {
  currentDeviceId: string;
  devices: { id: string; createdAt: string; expiresAt: string }[];
  pendingRestrictions: number;
}

export interface RestrictionConfirmation {
  status: true;
  eventId: string;
  confirmation: "pending" | "confirmed";
}

import { z } from "zod";
import { invitableJourney } from "./journeys.js";

export const onboardingIntent = z.enum(["plan", "record"]);
export type OnboardingIntent = z.infer<typeof onboardingIntent>;

export const advanceOnboarding = z
  .discriminatedUnion("step", [
    z.strictObject({ step: z.literal(1) }),
    z.strictObject({ step: z.literal(2), intent: onboardingIntent.optional() }),
    z.strictObject({ step: z.literal(3) }),
  ])
  .meta({ id: "AdvanceOnboardingV1" });
export type AdvanceOnboarding = z.infer<typeof advanceOnboarding>;

export const onboardingProgress = z
  .discriminatedUnion("state", [
    z.object({
      state: z.literal("pending"),
      step: z.union([z.literal(1), z.literal(2)]),
    }),
    z.object({
      state: z.literal("completed"),
      intent: onboardingIntent.optional(),
    }),
    z.object({ state: z.literal("exempt") }),
  ])
  .meta({ id: "OnboardingProgressV1" });
export type OnboardingProgress = z.infer<typeof onboardingProgress>;

export const advanceCompanionSetup = z
  .discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("complete"),
      intent: onboardingIntent.optional(),
    }),
    z.strictObject({ action: z.literal("select"), journeyId: z.uuid() }),
    z.strictObject({ action: z.literal("skip") }),
    z.strictObject({ action: z.literal("done") }),
  ])
  .meta({ id: "AdvanceCompanionSetupV1" });
export type AdvanceCompanionSetup = z.infer<typeof advanceCompanionSetup>;

export const companionSetup = z
  .object({
    progress: onboardingProgress,
    checkpoint: z.discriminatedUnion("state", [
      z.object({
        state: z.literal("open"),
        journey: z.union([invitableJourney, z.null()]),
      }),
      z.object({
        state: z.enum(["unavailable", "skipped", "done", "expired"]),
      }),
    ]),
  })
  .meta({ id: "CompanionSetupV1" });
export type CompanionSetup = z.infer<typeof companionSetup>;

export const accountProfile = z
  .object({
    displayName: z.string(),
    inviteDiscoverable: z.boolean().optional(),
  })
  .meta({ id: "AccountProfileV1" });

export const updateProfile = z
  .strictObject({
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(
        (name) =>
          !name.includes("\u0000") &&
          !name.includes("\r") &&
          !name.includes("\n"),
      )
      .optional(),
    inviteDiscoverable: z.boolean().optional(),
  })
  .refine(
    ({ displayName, inviteDiscoverable }) =>
      displayName !== undefined || inviteDiscoverable !== undefined,
  )
  .meta({ id: "UpdateProfileV1" });
