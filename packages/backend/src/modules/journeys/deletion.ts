import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  enqueueRestrictionConfirmation,
  finishRecordedRestriction,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";
import { enqueueJourneyDeletionNotice } from "./invitation-mail.js";

type Deletion =
  | { status: 404 | 409 }
  | { status: 200; eventId: string; confirmed: boolean; recipients?: string[] };

export function createJourneyDeletionService(
  auth: Pick<
    ReturnType<typeof createAuth>,
    "withCurrentSession" | "withCurrentRecoveryEpoch"
  >,
  config: {
    boss?: PgBoss;
    journal?: RestrictionJournal;
    mailKey?: string;
    epoch: string;
  },
) {
  return async (session: VerifiedSession, journeyId: string) => {
    const { boss, journal, mailKey, epoch } = config;
    if (!boss) return { status: 503 } as const;
    const result = await auth.withCurrentSession(session, async (tx) => {
      const { rows } = await tx.execute<{ result: Deletion }>(sql`
        select kairn.begin_journey_deletion(${journeyId}::uuid, ${session.sessionId}::uuid) as result
      `);
      const deletion = rows[0].result;
      if (deletion.status === 200 && deletion.recipients) {
        await enqueueRestrictionConfirmation(tx, boss, deletion.eventId);
        for (const email of deletion.recipients) {
          if (!mailKey) throw new Error("Member notices cannot be enqueued.");
          await enqueueJourneyDeletionNotice(tx, boss, {
            email,
            mailKey,
            epoch,
          });
        }
      }
      return deletion;
    });
    if (result.status !== 200) return { status: result.status };
    return finishRecordedRestriction(auth, journal, result);
  };
}
