import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { kairn, kairnAuth } from "../../db/namespaces.js";
import { user } from "./auth-schema.js";

export const credentialRecoveryState = kairn.enum("credential_recovery_state", [
  "required",
  "approved",
]);

export const onboardingIntent = kairn.enum("onboarding_intent", [
  "plan",
  "record",
]);

export const accounts = kairn
  .table(
    "accounts",
    {
      id: uuid("id")
        .primaryKey()
        .references(() => user.id),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      restrictedAt: timestamp("restricted_at", { withTimezone: true }),
      inviteDiscoverable: boolean("invite_discoverable")
        .notNull()
        .default(false),
      credentialRecovery: credentialRecoveryState("credential_recovery"),
      securityGeneration: integer("security_generation").default(1).notNull(),
      firstVerifiedAt: timestamp("first_verified_at", { withTimezone: true }),
      onboardingStep: integer("onboarding_step"),
      onboardingIntent: onboardingIntent("onboarding_intent"),
    },
    (account) => [
      check(
        "accounts_security_generation_positive",
        sql`${account.securityGeneration} > 0`,
      ),
      check(
        "accounts_onboarding_step_range",
        sql`${account.onboardingStep} between 0 and 4`,
      ),
      check(
        "accounts_credential_recovery_restricted",
        sql`${account.credentialRecovery} IS NULL OR ${account.restrictedAt} IS NOT NULL`,
      ),
    ],
  )
  .enableRLS();

export const identityRecovery = kairnAuth.table(
  "identity_recovery",
  {
    id: text("id").primaryKey(),
    epochDigest: text("epoch_digest").notNull(),
  },
  (row) => [
    check("identity_recovery_singleton", sql`${row.id} = 'current'`),
    check(
      "identity_recovery_epoch_digest",
      sql`${row.epochDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const identityMailKind = kairnAuth.enum("identity_mail_kind", [
  "verify",
  "reset",
]);
export const identityMailState = kairnAuth.enum("identity_mail_state", [
  "queued",
  "sent",
  "failed",
  "expired",
]);

export const identityMail = kairnAuth.table("identity_mail", {
  id: uuid("id").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: identityMailKind("kind").notNull(),
  epochDigest: text("epoch_digest").notNull(),
  ciphertext: text("ciphertext"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  state: identityMailState("state").default("queued").notNull(),
});
