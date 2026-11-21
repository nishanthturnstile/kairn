import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  confirmRecordedRestriction,
  enqueueRestrictionConfirmation,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";

type LocalResult =
  | { status: 200; eventId: string; confirmed: boolean; created?: true }
  | { status: 404 }
  | {
      status: 409;
      code:
        | "last_administrator"
        | "membership_changed"
        | "idempotency_conflict";
    };

export function createJourneyMembershipService(
  auth: Pick<
    ReturnType<typeof createAuth>,
    "withCurrentSession" | "withCurrentRecoveryEpoch"
  >,
  { boss, journal }: { boss?: PgBoss; journal?: RestrictionJournal },
) {
  return async (
    session: VerifiedSession,
    journeyId: string,
    memberId: string | null,
    membershipGeneration: string,
    operationId: string,
  ) => {
    if (!boss) return { status: 503 } as const;
    const result = await auth.withCurrentSession(session, async (tx) => {
      const { rows } = await tx.execute<{ result: LocalResult }>(sql`
        select kairn.restrict_journey_member(
          ${journeyId}::uuid, ${memberId}::uuid, ${membershipGeneration}::uuid, ${operationId}::uuid
        ) as result
      `);
      const local = rows[0].result;
      if (local.status === 200 && local.created) {
        await enqueueRestrictionConfirmation(tx, boss, local.eventId);
      }
      return local;
    });
    if (result.status !== 200) return result;

    const { confirmed, eventId } = result;
    if (confirmed)
      return { status: 200, eventId, confirmation: "confirmed" } as const;
    if (journal) {
      const appended = await auth.withCurrentRecoveryEpoch(async (tx) => {
        await confirmRecordedRestriction(tx, journal, eventId);
        return { status: 200 } as const;
      });
      if (appended.status === 200)
        return { status: 200, eventId, confirmation: "confirmed" } as const;
    }
    return { status: 202, eventId, confirmation: "pending" } as const;
  };
}
