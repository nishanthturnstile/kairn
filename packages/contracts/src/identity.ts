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

export const accountProfile = z
  .object({ displayName: z.string() })
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
      ),
  })
  .meta({ id: "UpdateProfileV1" });
