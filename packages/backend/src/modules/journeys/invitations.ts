import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq, type SQL, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { z } from "zod";
import type { DatabaseTransaction } from "../../db/index.js";
import { sealPayload, unsealPayload } from "../../sealed-payload.js";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import { user } from "../identity/auth-schema.js";
import { identityEpoch } from "../identity/state.js";
import {
  enqueueInvitationMail,
  sealInvitationMail,
} from "./invitation-mail.js";

const continuationLifetime = 30 * 60 * 1_000;
const continuationContext = "kairn-journey-invitation-continuation-v1";
const invitationContinuation = z.strictObject({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
  accountId: z.uuid().optional(),
});
const email = z.email();
const selectionContext = "kairn-journey-invitee-selection-v1";
const invitee = z.object({
  id: z.uuid(),
  email,
  journeyId: z.uuid(),
  organiserId: z.uuid(),
  expiresAt: z.number(),
});

type Continuation = z.infer<typeof invitationContinuation>;
type Command =
  | ({ type: "issue" } & (
      | { emails: string[] }
      | { recipients: ({ email: string } | { selection: string })[] }
    ))
  | { type: "resend" | "cancel"; invitationId: string };
type Managed =
  | { status: 200; result: unknown; jobs: string[] }
  | { status: 400 | 404 | 409 | 429 | 503; code?: "invitation_accepted" };
type Accepted =
  | { status: 200; id: string }
  | { status: 404 | 409; code?: "invitation_accepted" };
type InvitationListItem = { id: string };
type Review = {
  state:
    | "ready"
    | "joined"
    | "wrong_account"
    | "expired"
    | "cancelled"
    | "unavailable";
};

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function selectResult<T>(tx: DatabaseTransaction, expression: SQL) {
  const { rows } = await tx.execute<{ result: T }>(
    sql`select ${expression} as result`,
  );
  return rows[0].result;
}

export function createJourneyInvitationService(
  auth: Pick<
    ReturnType<typeof createAuth>,
    "withCurrentSession" | "withCurrentRecoveryEpoch"
  >,
  config: {
    baseURL: string;
    secret: string;
    epoch: string;
    boss?: PgBoss;
    mailKey?: string;
  },
) {
  const epoch = identityEpoch(config.epoch);
  const continuationKey = createHmac("sha256", config.secret)
    .update(continuationContext)
    .update(epoch)
    .digest();

  const selectionKey = createHmac("sha256", config.secret)
    .update(selectionContext)
    .update(epoch)
    .digest();

  function readSelection(
    handle: string,
    organiserId: string,
    journeyId: string,
  ) {
    try {
      const value = invitee.parse(
        unsealPayload(selectionKey, selectionContext, handle),
      );
      if (
        value.organiserId === organiserId &&
        value.journeyId === journeyId.toLowerCase() &&
        value.expiresAt > Date.now()
      )
        return value;
    } catch {
      // Invalid selections use the same per-row failure as unavailable recipients.
    }
  }

  function readContinuation(handle: string): Continuation | undefined {
    try {
      const value = invitationContinuation.parse(
        unsealPayload(continuationKey, continuationContext, handle),
      );
      if (Date.parse(value.expiresAt) > Date.now()) return value;
    } catch {
      // Forged or malformed handles share the same unavailable result.
    }
  }

  function candidate(key: string, inviter: string, address?: string) {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const url = new URL("/journey-invitations", config.baseURL);
    url.hash = token;
    return {
      id,
      email: address,
      digest: digest(token),
      ciphertext: sealInvitationMail(key, id, { url: url.href, inviter }),
    };
  }

  return {
    search(session: VerifiedSession, journeyId: string, query: string) {
      return auth.withCurrentSession(session, async (tx) => {
        const normalized = query.toLowerCase();
        const exact = normalized.includes("@");
        if (exact && !email.safeParse(normalized).success)
          return { status: 200, items: [] } as const;
        const result = await selectResult<
          | {
              status: 200;
              matches: {
                id: string;
                email: string;
                displayName: string;
                ambiguous: boolean;
              }[];
            }
          | { status: 404 | 429 }
        >(
          tx,
          sql`kairn.find_journey_invitees(${journeyId}::uuid, ${normalized}, ${exact})`,
        );
        if (result.status !== 200) return result;
        return {
          status: 200,
          items: result.matches.map(
            ({ displayName, ambiguous, ...person }) => ({
              displayName,
              ambiguous,
              selection: sealPayload(selectionKey, selectionContext, {
                ...person,
                organiserId: session.accountId,
                journeyId: journeyId.toLowerCase(),
                expiresAt: Date.now() + 15 * 60_000,
              }),
            }),
          ),
        } as const;
      });
    },
    list(session: VerifiedSession, journeyId: string, cursor?: string) {
      return auth.withCurrentSession(session, async (tx) => {
        const rows = await selectResult<InvitationListItem[] | null>(
          tx,
          sql`
          kairn.read_journey_invitations(${journeyId}::uuid, ${cursor ?? null}::uuid, ${epoch})
        `,
        );
        if (!rows) return { status: 404 } as const;
        const items = rows.slice(0, 25);
        return {
          status: 200,
          page: { items, nextCursor: rows.length > 25 ? items[24].id : null },
        } as const;
      });
    },

    manage(
      session: VerifiedSession,
      journeyId: string,
      key: string,
      command: Command,
    ) {
      return auth.withCurrentSession(session, async (tx) => {
        const { boss, mailKey } = config;
        if (command.type !== "cancel" && (!boss || !mailKey)) {
          return { status: 503 } as const;
        }
        const emails =
          command.type === "issue" && "emails" in command
            ? command.emails.map((address) => address.trim().toLowerCase())
            : undefined;
        const recipients =
          command.type === "issue" && "recipients" in command
            ? command.recipients.map((entry) =>
                "email" in entry
                  ? { email: entry.email.trim().toLowerCase() }
                  : entry,
              )
            : undefined;
        const invitationId =
          command.type === "issue" ? null : command.invitationId.toLowerCase();
        const fingerprint = createHmac("sha256", config.secret)
          .update(
            JSON.stringify([
              "journey-invitation-attempt-v1",
              command.type,
              invitationId,
              recipients ?? emails,
            ]),
          )
          .digest("hex");
        let candidates: (
          | ReturnType<typeof candidate>
          | Record<string, never>
        )[] = [];
        if (command.type !== "cancel" && mailKey) {
          const [profile] = await tx
            .select({ name: user.name })
            .from(user)
            .where(eq(user.id, session.accountId));
          const entries =
            recipients ?? emails?.map((address) => ({ email: address }));
          candidates = entries
            ? entries.map((entry) => {
                if ("email" in entry)
                  return email.safeParse(entry.email).success
                    ? candidate(mailKey, profile.name, entry.email)
                    : {};
                const person = readSelection(
                  entry.selection,
                  session.accountId,
                  journeyId,
                );
                return person
                  ? {
                      ...candidate(mailKey, profile.name, person.email),
                      accountId: person.id,
                      selectionExpiresAt: person.expiresAt,
                    }
                  : {};
              })
            : [candidate(mailKey, profile.name)];
        }
        const result = await selectResult<Managed>(
          tx,
          sql`
          kairn.manage_journey_invitees(
            ${journeyId}::uuid, ${invitationId}::uuid, ${command.type}, ${key}::uuid,
            ${fingerprint}, ${epoch}, ${JSON.stringify(candidates)}::jsonb
          )
        `,
        );
        if (result.status !== 200) return result;
        for (const id of result.jobs) {
          if (!boss)
            throw new Error("The invitation mail queue is unavailable.");
          await enqueueInvitationMail(tx, boss, id);
        }
        return { status: 200, result: result.result } as const;
      });
    },

    exchange(token: string) {
      return auth.withCurrentRecoveryEpoch(async (tx) => {
        const invitation = await selectResult<Pick<
          Continuation,
          "id" | "expiresAt"
        > | null>(
          tx,
          sql`
          kairn.resolve_journey_invitation(${digest(token)}, ${epoch})
        `,
        );
        if (!invitation) return { status: 404 } as const;
        const expiresAt = new Date(
          Math.min(
            Date.parse(invitation.expiresAt),
            Date.now() + continuationLifetime,
          ),
        ).toISOString();
        return {
          status: 200,
          continuation: sealPayload(continuationKey, continuationContext, {
            id: invitation.id,
            expiresAt,
          }),
          expiresAt,
        } as const;
      });
    },

    review(session: VerifiedSession, handle: string) {
      return auth.withCurrentSession(session, async (tx) => {
        const continuation = readContinuation(handle);
        if (!continuation)
          return { status: 200, review: { state: "unavailable" } } as const;
        if (
          continuation.accountId &&
          continuation.accountId !== session.accountId
        )
          return { status: 200, review: { state: "wrong_account" } } as const;
        const review = await selectResult<Review>(
          tx,
          sql`
          kairn.review_journey_invitation(${continuation.id}::uuid, ${epoch})
        `,
        );
        if (review.state !== "ready") return { status: 200, review } as const;
        const bound = { ...continuation, accountId: session.accountId };
        return {
          status: 200,
          review: {
            ...review,
            continuation: sealPayload(
              continuationKey,
              continuationContext,
              bound,
            ),
          },
        } as const;
      });
    },

    accept(session: VerifiedSession, handle: string, operationId: string) {
      return auth.withCurrentSession(session, async (tx) => {
        const continuation = readContinuation(handle);
        if (continuation?.accountId !== session.accountId)
          return { status: 404 } as const;
        return selectResult<Accepted>(
          tx,
          sql`
          kairn.accept_journey_invitation(
            ${continuation.id}::uuid, ${operationId}::uuid, ${epoch}, ${continuation.expiresAt}::timestamptz
          )
        `,
        );
      });
    },

    acceptanceStatus(session: VerifiedSession, operationId: string) {
      return auth.withCurrentSession(session, async (tx) => {
        const id = await selectResult<string | null>(
          tx,
          sql`
          kairn.read_journey_invitation_acceptance(${operationId}::uuid, ${epoch})
        `,
        );
        return id ? ({ status: 200, id } as const) : ({ status: 404 } as const);
      });
    },
  };
}
