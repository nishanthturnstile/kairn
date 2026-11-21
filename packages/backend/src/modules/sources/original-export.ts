import { type SQL, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  enqueueRestrictionConfirmation,
  finishRecordedRestriction,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";

interface OriginalExportAuthorization {
  grantId: string;
  assetIds: string[];
  expiresAt: string;
}

interface OriginalExportRequest extends OriginalExportAuthorization {
  ownerId: string;
  recipient: { accountId: string; displayName: string };
  state:
    | "pending"
    | "approved"
    | "declined"
    | "expired"
    | "revoked"
    | "unavailable";
}

type RequestInput = Pick<
  OriginalExportRequest,
  "ownerId" | "assetIds" | "expiresAt"
>;
type RequestResult<Success extends 200 | 201> =
  | { status: Success; request: OriginalExportRequest }
  | { status: 400 | 404 | 409 };
type Revocation =
  | { status: 200; eventId: string; confirmed: boolean; created?: true }
  | { status: 404 | 409 };

export function createOriginalExportService(
  auth: Pick<
    ReturnType<typeof createAuth>,
    "withCurrentSession" | "withCurrentRecoveryEpoch"
  >,
  { boss, journal }: { boss?: PgBoss; journal?: RestrictionJournal },
) {
  function read<Result>(session: VerifiedSession, query: SQL) {
    return auth.withCurrentSession(session, async (tx) => {
      const { rows } = await tx.execute<{ value: Result | null }>(query);
      const { value } = rows[0];
      return value
        ? ({ status: 200, value } as const)
        : ({ status: 404 } as const);
    });
  }

  return {
    request(
      session: VerifiedSession,
      journeyId: string,
      key: string,
      input: RequestInput,
    ) {
      const { ownerId, assetIds, expiresAt } = input;
      // Normalize before the database cast so the expiry round-trips through the API.
      const expiry = new Date(expiresAt);
      const year = expiry.getUTCFullYear();
      if (!Number.isFinite(year) || year < 1 || year > 9999)
        return { status: 400 } as const;
      const selection = sql.join(
        assetIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      return auth.withCurrentSession(session, async (tx) => {
        const { rows } = await tx.execute<{
          result: RequestResult<200 | 201> | { status: 429 };
        }>(sql`
          select kairn.request_original_export(${journeyId}::uuid, ${ownerId}::uuid,
            array[${selection}]::uuid[], ${expiry.toISOString()}::timestamptz, ${key}::uuid) as result
        `);
        return rows[0].result;
      });
    },
    detail(session: VerifiedSession, journeyId: string, grantId: string) {
      return read<OriginalExportRequest>(
        session,
        sql`
        select kairn.read_original_export(${journeyId}::uuid, ${grantId}::uuid) as value
      `,
      );
    },
    list(session: VerifiedSession, journeyId: string, cursor: string | null) {
      return read<{
        items: OriginalExportRequest[];
        nextCursor: string | null;
      }>(
        session,
        sql`
        select kairn.list_original_exports(${journeyId}::uuid, ${cursor}::uuid) as value
      `,
      );
    },
    decide(
      session: VerifiedSession,
      journeyId: string,
      grantId: string,
      decision:
        | { decision: "approve"; metadataAcknowledged: true }
        | { decision: "decline" },
    ) {
      const approve = decision.decision === "approve";
      const acknowledged =
        "metadataAcknowledged" in decision && decision.metadataAcknowledged;
      return auth.withCurrentSession(session, async (tx) => {
        const { rows } = await tx.execute<{ result: RequestResult<200> }>(sql`
          select kairn.decide_original_export(${journeyId}::uuid, ${grantId}::uuid,
            ${approve}::boolean, ${acknowledged}::boolean) as result
        `);
        return rows[0].result;
      });
    },
    authorize(session: VerifiedSession, journeyId: string, grantId: string) {
      return read<OriginalExportAuthorization>(
        session,
        sql`
        select kairn.authorize_original_export(${journeyId}::uuid, ${grantId}::uuid) as value
      `,
      );
    },
    async revoke(session: VerifiedSession, journeyId: string, grantId: string) {
      if (!boss) return { status: 503 } as const;
      const result = await auth.withCurrentSession(session, async (tx) => {
        const { rows } = await tx.execute<{ result: Revocation }>(sql`
          select kairn.revoke_original_export(${journeyId}::uuid, ${grantId}::uuid) as result
        `);
        const local = rows[0].result;
        if (local.status === 200 && local.created) {
          await enqueueRestrictionConfirmation(tx, boss, local.eventId);
        }
        return local;
      });
      if (result.status !== 200) return result;
      return finishRecordedRestriction(auth, journal, result);
    },
  };
}
