import { sql } from "drizzle-orm";
import { check, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { kairn, kairnAuth } from "../../db/namespaces.js";
import { user } from "./auth-schema.js";

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
      securityGeneration: integer("security_generation").default(1).notNull(),
    },
    (account) => [
      check(
        "accounts_security_generation_positive",
        sql`${account.securityGeneration} > 0`,
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
