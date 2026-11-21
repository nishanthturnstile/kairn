import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { logger } from "../../logger.js";
import type { openMailTransport } from "../../mail.js";
import { sealPayload, unsealPayload } from "../../sealed-payload.js";
import { user, verification } from "./auth-schema.js";
import { identityMail } from "./schema.js";
import {
  canResetCredentials,
  identityAccount,
  identityIsCurrent,
} from "./state.js";

export const identityMailQueue = "identity.email";
export const authLinkAge = 30 * 60;
const retryLimit = 4;
const jobPayload = z.object({ id: z.uuid() });
const accountData = {
  id: user.id,
  email: user.email,
  emailVerified: user.emailVerified,
};
type Link = { url: string; token: string };
type MailKind = typeof identityMail.$inferSelect.kind;

const mailLink = z.object({ url: z.url(), token: z.string().min(1) });

export async function enqueueIdentityMail(
  tx: DatabaseTransaction,
  boss: PgBoss,
  key: string,
  epochDigest: string,
  kind: MailKind,
  accountId: string,
  link: Link,
) {
  const id = randomUUID();
  await tx.insert(identityMail).values({
    id,
    kind,
    accountId,
    epochDigest,
    ciphertext: sealPayload(Buffer.from(key, "hex"), id, link),
    expiresAt: new Date(Date.now() + authLinkAge * 1000),
  });
  const jobId = await boss.send(
    identityMailQueue,
    { id },
    {
      id,
      db: fromDrizzle(tx, sql),
      retryLimit,
      retryDelay: 10,
      retryBackoff: true,
    },
  );
  if (!jobId) throw new Error("Identity email was not enqueued.");
}

export async function registerIdentityMail(
  boss: PgBoss,
  db: Database,
  config: {
    key: string;
    from: string;
    transport: ReturnType<typeof openMailTransport>;
  },
) {
  await boss.work(
    identityMailQueue,
    { localConcurrency: 1, includeMetadata: true },
    async ([job]) => {
      const { id } = jobPayload.parse(job.data);
      try {
        await db.transaction(async (tx) => {
          const [candidate] = await tx
            .select({ epochDigest: identityMail.epochDigest })
            .from(identityMail)
            .where(eq(identityMail.id, id));
          if (!candidate) return;
          const currentEpoch = await identityIsCurrent(
            tx,
            candidate.epochDigest,
          );
          const [message] = await tx
            .select()
            .from(identityMail)
            .where(eq(identityMail.id, id))
            .for("update");
          if (message?.state !== "queued" || !message.ciphertext) return;
          const [recipient] = await tx
            .select(accountData)
            .from(user)
            .where(eq(user.id, message.accountId));
          const account = await identityAccount(tx, message.accountId);
          const expired =
            message.expiresAt <= new Date() ||
            !recipient ||
            !account ||
            (message.kind === "reset"
              ? !canResetCredentials(account)
              : account.restrictedAt !== null) ||
            !currentEpoch;
          if (expired) {
            await tx
              .update(identityMail)
              .set({ state: "expired", ciphertext: null })
              .where(eq(identityMail.id, id));
            return;
          }
          const link = mailLink.parse(
            unsealPayload(
              Buffer.from(config.key, "hex"),
              id,
              message.ciphertext,
            ),
          );
          const reset = message.kind === "reset";
          const token =
            reset &&
            (await tx
              .select({ id: verification.id })
              .from(verification)
              .where(
                and(
                  eq(verification.identifier, `reset-password:${link.token}`),
                  eq(verification.value, message.accountId),
                  gt(verification.expiresAt, new Date()),
                ),
              )
              .limit(1));
          if (
            reset
              ? !recipient.emailVerified || !token || token.length === 0
              : recipient.emailVerified
          ) {
            await tx
              .update(identityMail)
              .set({ state: "expired", ciphertext: null })
              .where(eq(identityMail.id, id));
            return;
          }
          await config.transport.send({
            from: config.from,
            to: recipient.email,
            subject: reset
              ? "Reset your Kairn password"
              : "Verify your Kairn email",
            text: `${reset ? "Set a new password" : "Verify your email"} using this link. It expires in 30 minutes.\n\n${link.url}`,
            messageId: `<${id}@${config.from.split("@").at(-1)}>`,
            idempotencyKey: `identity-mail/${id}`,
          });
          await tx
            .update(identityMail)
            .set({ state: "sent", ciphertext: null })
            .where(eq(identityMail.id, id));
        });
      } catch {
        if (job.retryCount >= job.retryLimit) {
          await db
            .update(identityMail)
            .set({ state: "failed", ciphertext: null })
            .where(
              and(eq(identityMail.id, id), eq(identityMail.state, "queued")),
            );
        }
        logger.warn(
          { jobId: job.id, mailEventId: id },
          "Identity email delivery failed",
        );
        throw new Error("Identity email delivery failed.");
      }
    },
  );
}
