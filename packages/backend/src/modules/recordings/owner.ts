import type { OwnerRecording } from "@kairn/contracts/recordings";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { DatabaseTransaction } from "../../db/index.js";
import type { openObjectStore } from "../../storage.js";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  enqueueRestrictionConfirmation,
  finishRecordedRestriction,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";
import { completedKey, originalActive, scopeRecordings } from "./access.js";
import {
  latestRecordingReview,
  readRecordingReview,
  selectRecordingSections,
} from "./review.js";
import {
  recordingImports,
  recordingOriginals,
  recordingUploads,
} from "./schema.js";

function selectOwned(tx: DatabaseTransaction) {
  return tx
    .select({
      id: recordingOriginals.id,
      fileName: recordingUploads.fileName,
      byteLength: recordingOriginals.byteLength,
      stage: recordingOriginals.stage,
      diagnostics: recordingOriginals.diagnostics,
      issue: recordingOriginals.issue,
      sectionCount: recordingOriginals.sectionCount,
      uploadId: recordingOriginals.uploadId,
    })
    .from(recordingOriginals)
    .innerJoin(
      recordingUploads,
      and(
        eq(recordingUploads.id, recordingOriginals.uploadId),
        eq(recordingOriginals.retained, true),
      ),
    );
}

function ownerRecording(
  { uploadId: _, ...summary }: Awaited<ReturnType<typeof selectOwned>>[number],
  deletionAvailable: boolean,
): OwnerRecording {
  return { ...summary, deletionAvailable };
}

async function ownerReview(tx: DatabaseTransaction, id: string) {
  const latest = await latestRecordingReview(tx, id);
  if (latest) return latest;
  const [current] = await tx
    .select({
      id: recordingImports.id,
      revision: recordingImports.reviewRevision,
    })
    .from(recordingImports)
    .innerJoin(recordingUploads, eq(recordingUploads.id, recordingImports.id))
    .where(
      and(
        eq(recordingImports.originalId, id),
        isNull(recordingUploads.batchId),
      ),
    )
    .orderBy(asc(recordingImports.id))
    .limit(1);
  if (!current) throw new Error("Missing original recording import");
  return {
    importId: current.id,
    revision: current.revision,
    selection: await readRecordingReview(tx, current.id, current.revision),
  };
}

function byteRange(header: string, length: number) {
  const match = /^bytes=(\d{0,16})-(\d{0,16})$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, length - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end)
    return null;
  return `bytes=${start}-${end}`;
}

export function createOwnerRecordingService(
  auth: ReturnType<typeof createAuth>,
  store: ReturnType<typeof openObjectStore>,
  {
    boss,
    journal,
    deletionEnabled,
  }: { boss: PgBoss; journal?: RestrictionJournal; deletionEnabled?: boolean },
) {
  function withOwner<T>(
    session: VerifiedSession,
    action: (tx: DatabaseTransaction) => Promise<T>,
  ) {
    return auth.withCurrentSession(session, async (tx) => {
      await scopeRecordings(tx, session.accountId);
      return action(tx);
    });
  }
  const deletionAvailable = Boolean(journal && deletionEnabled);
  return {
    list(session: VerifiedSession, cursor?: string) {
      return withOwner(session, async (tx) => {
        const size = 25;
        const rows = await selectOwned(tx)
          .where(
            and(
              originalActive,
              cursor ? gt(recordingOriginals.id, cursor) : undefined,
            ),
          )
          .orderBy(asc(recordingOriginals.id))
          .limit(size + 1);
        const recordings = rows
          .slice(0, size)
          .map((row) => ownerRecording(row, deletionAvailable));
        return {
          status: 200,
          page: {
            recordings,
            nextCursor:
              rows.length > size ? (recordings.at(-1)?.id ?? null) : null,
          },
        } as const;
      });
    },

    detail(session: VerifiedSession, id: string) {
      return withOwner(session, async (tx) => {
        const [row] = await selectOwned(tx).where(
          and(originalActive, eq(recordingOriginals.id, id)),
        );
        return row
          ? ({
              status: 200,
              recording: {
                ...ownerRecording(row, deletionAvailable),
                reviewImportId:
                  row.stage === "ready"
                    ? (await ownerReview(tx, id)).importId
                    : undefined,
              },
            } as const)
          : ({ status: 404 } as const);
      });
    },

    sections(session: VerifiedSession, id: string, cursor?: number) {
      return withOwner(session, async (tx) => {
        const [row] = await selectOwned(tx).where(
          and(originalActive, eq(recordingOriginals.id, id)),
        );
        if (row?.stage !== "ready") return { status: 404 } as const;
        const { selection } = await ownerReview(tx, id);
        return {
          status: 200,
          page: await selectRecordingSections(tx, id, selection, cursor),
        } as const;
      });
    },

    async deleteOriginal(session: VerifiedSession, id: string) {
      if (!deletionAvailable) return { status: 503 } as const;
      const local = await withOwner(session, async (tx) => {
        const [recording] = await selectOwned(tx).where(
          eq(recordingOriginals.id, id),
        );
        if (!recording) return { status: 404 } as const;
        const { rows } = await tx.execute<{
          result: {
            eventId: string;
            confirmed: boolean;
            created?: boolean;
          } | null;
        }>(sql`select kairn.begin_recording_deletion(${id}::uuid) as result`);
        const result = rows[0].result;
        if (!result) return { status: 404 } as const;
        if (result.created)
          await enqueueRestrictionConfirmation(tx, boss, result.eventId);
        return { status: 200, ...result } as const;
      });
      if (local.status !== 200) return local;
      const receipt = await finishRecordedRestriction(auth, journal, local);
      return { ...receipt, id } as const;
    },

    async original(
      session: VerifiedSession,
      id: string,
      rangeHeader: string | undefined,
    ) {
      const permitted = await withOwner(session, async (tx) => {
        const [row] = await selectOwned(tx).where(
          and(originalActive, eq(recordingOriginals.id, id)),
        );
        return row
          ? ({ status: 200, row } as const)
          : ({ status: 404 } as const);
      });
      if (permitted.status !== 200) return permitted;
      const range =
        rangeHeader === undefined
          ? undefined
          : byteRange(rangeHeader, permitted.row.byteLength);
      if (range === null)
        return { status: 416, size: permitted.row.byteLength } as const;
      try {
        const response = await store.get(
          completedKey(permitted.row.uploadId),
          range,
        );
        if (!response.size || (range && !response.contentRange)) {
          response.body.destroy();
          return { status: 503 } as const;
        }
        return {
          ...response,
          status: range ? (206 as const) : (200 as const),
          fileName: permitted.row.fileName,
        };
      } catch {
        return { status: 503 } as const;
      }
    },
  };
}
