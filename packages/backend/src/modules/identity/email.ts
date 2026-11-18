import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import type { openMailTransport } from "../../mail.js";
import { user, verification } from "./auth-schema.js";
import { identityMail } from "./schema.js";
import { identityAccount, identityIsCurrent } from "./state.js";

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

function seal(key: string, id: string, link: Link) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from(id));
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(link)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString(
    "base64url",
  );
}

function unseal(key: string, id: string, value: string) {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    bytes.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const data = Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString();
  return z
    .object({ url: z.url(), token: z.string().min(1) })
    .parse(JSON.parse(data));
}

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
    ciphertext: seal(key, id, link),
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
            account.restrictedAt ||
            !currentEpoch;
          if (expired) {
            await tx
              .update(identityMail)
              .set({ state: "expired", ciphertext: null })
              .where(eq(identityMail.id, id));
            return;
          }
          const link = unseal(config.key, id, message.ciphertext);
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
        console.error("Identity email delivery failed", id);
        throw new Error("Identity email delivery failed.");
      }
    },
  );
}
