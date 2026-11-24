import { z } from "zod";

export {
  checkDatabaseReadiness,
  checkJourneyReadiness,
  openDatabase,
} from "./db/index.js";
export {
  enqueueWorkerCheck,
  openJobQueue,
  registerWorkerChecks,
} from "./jobs.js";
export { logger } from "./logger.js";
export { openMailTransport } from "./mail.js";
export { createAuth, type VerifiedSession } from "./modules/identity/auth.js";
export { registerIdentityMail } from "./modules/identity/email.js";
export {
  createCompanionSetupService,
  createOnboardingService,
  createProfileService,
} from "./modules/identity/onboarding.js";
export {
  initializeLocalIdentity,
  localRecoveryEpoch,
} from "./modules/identity/state.js";
export { createJourneyDeletionService } from "./modules/journeys/deletion.js";
export { createJourneyEditorialService } from "./modules/journeys/editorial.js";
export { registerJourneyInvitationMail } from "./modules/journeys/invitation-mail.js";
export { createJourneyInvitationService } from "./modules/journeys/invitations.js";
export { createJourneyMembershipService } from "./modules/journeys/membership.js";
export { createJourneyService } from "./modules/journeys/service.js";
export {
  registerIdentityRestrictions,
  replayIdentityRestrictions,
} from "./modules/lifecycle/identity-restrictions.js";
export {
  journalCheckpoint,
  openRestrictionJournal,
} from "./modules/lifecycle/restriction-journal.js";
export { createOriginalExportService } from "./modules/sources/original-export.js";
export { createSourceReviewService } from "./modules/sources/review.js";
export { openObjectStore } from "./storage.js";

const databaseUrl = z.url({ protocol: /^postgres(?:ql)?$/ });
const identityConfiguration = {
  AUTH_RECOVERY_EPOCH: z.string().min(32).optional(),
  AUTH_MAIL_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  AUTH_JOURNAL_URL: z.url({ protocol: /^https$/ }).optional(),
  AUTH_JOURNAL_CREDENTIAL: z.string().min(24).optional(),
};
const authOrigin = z
  .url({ protocol: /^https?$/ })
  .refine((value) => value.replace(/\/$/, "") === URL.parse(value)?.origin, {
    error: "Expected an HTTP origin without a path or credentials",
  });
const serverEnvironment = z
  .object({
    ...identityConfiguration,
    HOST: z.string().trim().min(1).default("127.0.0.1"),
    PORT: z
      .string()
      .regex(/^\d+$/, "Expected a port number")
      .transform(Number)
      .pipe(z.int().min(1).max(65535))
      .default(3000),
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: authOrigin,
    BETTER_AUTH_SECRET: z.string().min(32),
    ONBOARDING_STARTS_AT: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    READER_BUILD_DIR: z.string().min(1).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .refine(
    (environment) =>
      environment.NODE_ENV !== "production" ||
      environment.BETTER_AUTH_URL.startsWith("https://"),
    { path: ["BETTER_AUTH_URL"], error: "Expected HTTPS in production" },
  );

const workerEnvironment = z
  .object({
    ...identityConfiguration,
    DATABASE_URL: databaseUrl,
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    AUTH_FROM_EMAIL: z.email().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;
    for (const key of [
      "SMTP_URL",
      "AUTH_FROM_EMAIL",
      "AUTH_MAIL_KEY",
      "AUTH_RECOVERY_EPOCH",
      "AUTH_JOURNAL_URL",
      "AUTH_JOURNAL_CREDENTIAL",
    ] as const) {
      if (!environment[key])
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Required for the production identity worker",
        });
    }
  });

export function parseServerEnvironment(input: NodeJS.ProcessEnv) {
  return serverEnvironment.parse(input);
}

export function parseWorkerEnvironment(input: NodeJS.ProcessEnv) {
  return workerEnvironment.parse(input);
}

export { createRecordingAttachmentService } from "./modules/recordings/attachments.js";
export { createRecordingImportService } from "./modules/recordings/imports.js";
export { createOwnerRecordingService } from "./modules/recordings/owner.js";
export { openRecordingStore } from "./modules/recordings/storage.js";
export { createRecordingUploadService } from "./modules/recordings/uploads.js";
export { registerRecordingWorkers } from "./modules/recordings/worker.js";
