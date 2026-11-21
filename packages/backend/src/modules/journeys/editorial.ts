import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  enqueueRestrictionConfirmation,
  finishRecordedRestriction,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";

type LocalChange =
  | { status: 200; revision: number }
  | {
      status: 200;
      revision: number;
      eventId: string;
      confirmed: boolean;
      created?: true;
    }
  | { status: 404 }
  | { status: 409; code: "membership_changed" | "capability_changed" };

export function createJourneyEditorialService(
  auth: Pick<
    ReturnType<typeof createAuth>,
    "withCurrentSession" | "withCurrentRecoveryEpoch"
  >,
  { boss, journal }: { boss?: PgBoss; journal?: RestrictionJournal },
) {
  return async (
    session: VerifiedSession,
    journeyId: string,
    memberId: string,
    {
      membershipGeneration,
      capability,
      expectedRevision,
      enabled,
    }: {
      membershipGeneration: string;
      capability: "coauthor" | "publisher";
      expectedRevision: number;
      enabled: boolean;
    },
  ) => {
    if (!enabled && !boss) return { status: 503 } as const;
    const result = await auth.withCurrentSession(session, async (tx) => {
      const { rows } = await tx.execute<{ result: LocalChange }>(sql`
        select kairn.set_editorial_capability(
          ${journeyId}::uuid, ${memberId}::uuid, ${membershipGeneration}::uuid,
          ${capability}::kairn.journey_capability, ${expectedRevision}::integer, ${enabled}::boolean
        ) as result
      `);
      const local = rows[0].result;
      if (local.status === 200 && "eventId" in local && local.created) {
        if (!boss) throw new Error("The restriction queue is unavailable.");
        await enqueueRestrictionConfirmation(tx, boss, local.eventId);
      }
      return local;
    });
    if (result.status !== 200) return result;
    if (!("eventId" in result)) return { ...result, enabled: true } as const;
    return {
      ...(await finishRecordedRestriction(auth, journal, result)),
      enabled: false,
      revision: result.revision,
    } as const;
  };
}
