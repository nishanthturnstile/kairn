import { sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { logger } from "../../logger.js";
import type { openMailTransport } from "../../mail.js";
import { sealPayload, unsealPayload } from "../../sealed-payload.js";
import { identityEpoch, identityIsCurrent } from "../identity/state.js";

export const journeyInvitationMailQueue = "journeys.invitation_email";
const payload = z.object({ id: z.uuid() });
const mailPayload = z.object({
  url: z.url({ protocol: /^https?$/ }),
  inviter: z.string(),
});

export function sealInvitationMail(
  key: string,
  id: string,
  message: z.infer<typeof mailPayload>,
) {
  const inviter = Array.from(
    message.inviter
      .replace(/\s+/gu, " ")
      .replace(/[\p{Cc}\p{Bidi_Control}]/gu, "")
      .trim(),
  )
    .slice(0, 80)
    .join("")
    .trim();
  return sealPayload(Buffer.from(key, "hex"), `journey-invitation-mail:${id}`, {
    ...message,
    inviter: inviter || "A Kairn member",
  });
}

export async function enqueueInvitationMail(
  tx: DatabaseTransaction,
  boss: PgBoss,
  id: string,
) {
  const job = await boss.send(
    journeyInvitationMailQueue,
    { id },
    {
      id,
      db: fromDrizzle(tx, sql),
      retryLimit: 4,
      retryDelay: 10,
      retryBackoff: true,
    },
  );
  if (!job) throw new Error("Journey invitation email was not enqueued.");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInvitation(inviter: string, url: string, expiresAt: string) {
  const expiry = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(expiresAt));
  const intro = `${inviter} invited you to join a private journey on Kairn as a Participant.`;
  const expires = `This invitation expires on ${expiry} UTC.`;
  return {
    subject: "Join a journey on Kairn",
    text: `${intro}\n\nReview invitation: ${url}\n\n${expires}`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">Review invitation</a></p><p>${expires}</p>`,
  };
}

export async function registerJourneyInvitationMail(
  boss: PgBoss,
  db: Database,
  config: {
    key: string;
    from: string;
    epoch: string;
    transport: ReturnType<typeof openMailTransport>;
  },
) {
  const epoch = identityEpoch(config.epoch);
  await boss.work(
    journeyInvitationMailQueue,
    {
      localConcurrency: 1,
      includeMetadata: true,
    },
    async ([job]) => {
      const { id } = payload.parse(job.data);
      try {
        await db.transaction(async (tx) => {
          if (!(await identityIsCurrent(tx, epoch))) {
            throw new Error(
              "The invitation worker recovery epoch is not current.",
            );
          }
          const { rows } = await tx.execute<{
            message: {
              email: string;
              ciphertext: string;
              expiresAt: string;
            } | null;
          }>(
            sql`select kairn.claim_journey_invitation_mail(${id}::uuid, ${epoch}) as message`,
          );
          const message = rows[0]?.message;
          if (!message) return;
          const { url, inviter } = mailPayload.parse(
            unsealPayload(
              Buffer.from(config.key, "hex"),
              `journey-invitation-mail:${id}`,
              message.ciphertext,
            ),
          );
          await config.transport.send({
            ...renderInvitation(inviter, url, message.expiresAt),
            from: config.from,
            to: message.email,
            messageId: `<${id}@${config.from.split("@").at(-1)}>`,
            idempotencyKey: `journey-invitation-mail/${id}`,
          });
          await tx.execute(
            sql`select kairn.finish_journey_invitation_mail(${id}::uuid, ${epoch}, 'sent')`,
          );
        });
      } catch {
        if (job.retryCount >= job.retryLimit) {
          await db.transaction(async (tx) => {
            if (await identityIsCurrent(tx, epoch)) {
              await tx.execute(
                sql`select kairn.finish_journey_invitation_mail(${id}::uuid, ${epoch}, 'failed')`,
              );
            }
          });
        }
        logger.warn(
          { jobId: job.id },
          "Journey invitation email delivery failed",
        );
        throw new Error("Journey invitation email delivery failed.");
      }
    },
  );

  async function purge() {
    try {
      await db.transaction(async (tx) => {
        if (await identityIsCurrent(tx, epoch)) {
          await tx.execute(
            sql`select kairn.purge_journey_invitation_data(${epoch})`,
          );
        }
      });
    } catch {
      logger.warn("Journey invitation mail retention cleanup failed");
    }
  }

  await purge();
  const timer = setInterval(() => void purge(), 300_000);
  timer.unref();
  return () => clearInterval(timer);
}
