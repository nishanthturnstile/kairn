import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  enqueueRestrictionConfirmation,
  finishRecordedRestriction,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";

type SourceReview = {
  sourceId: string;
  scope: "only_me" | "journey_review" | "publication_reuse";
  revision: number;
};

type LocalUpdate =
  | ({ status: 200 } & SourceReview)
  | {
      status: 200;
      eventId: string;
      confirmed: boolean;
      revision: number;
      created?: true;
    }
  | { status: 404 | 409 };

export function createSourceReviewService(
  auth: Pick<
    ReturnType<typeof createAuth>,
    "withCurrentSession" | "withCurrentRecoveryEpoch"
  >,
  { boss, journal }: { boss?: PgBoss; journal?: RestrictionJournal },
) {
  return {
    read(session: VerifiedSession, journeyId: string, sourceId: string) {
      return auth.withCurrentSession(session, async (tx) => {
        const { rows } = await tx.execute<{ review: SourceReview | null }>(sql`
          select kairn.read_source_review(${journeyId}::uuid, ${sourceId}::uuid) as review
        `);
        const review = rows[0].review;
        return review
          ? ({ status: 200, review } as const)
          : ({ status: 404 } as const);
      });
    },
    async update(
      session: VerifiedSession,
      journeyId: string,
      sourceId: string,
      change: { expectedRevision: number } & (
        | { action: "share" | "withdraw" | "narrow_to_review" }
        | {
            action: "allow_publication_reuse";
            consent: "members_unlisted_public_v1";
          }
      ),
    ) {
      const { action, expectedRevision } = change;
      if ((action === "withdraw" || action === "narrow_to_review") && !boss)
        return { status: 503 } as const;
      const consent = "consent" in change ? change.consent : null;
      const result = await auth.withCurrentSession(session, async (tx) => {
        const { rows } = await tx.execute<{ result: LocalUpdate }>(sql`
          select kairn.set_source_permission(
            ${journeyId}::uuid, ${sourceId}::uuid, ${expectedRevision}::integer,
            ${action}::text, ${consent}::text
          ) as result
        `);
        const local = rows[0].result;
        if (local.status === 200 && "eventId" in local && local.created) {
          if (!boss) throw new Error("The restriction queue is unavailable.");
          await enqueueRestrictionConfirmation(tx, boss, local.eventId);
        }
        return local;
      });
      if (result.status !== 200 || !("eventId" in result)) return result;

      return {
        ...(await finishRecordedRestriction(auth, journal, result)),
        revision: result.revision,
        ...(action === "narrow_to_review"
          ? { scope: "journey_review" as const }
          : {}),
      };
    },
  };
}
