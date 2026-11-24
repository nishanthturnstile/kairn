import type { RecordingImport } from "@kairn/contracts/recordings";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { DatabaseTransaction } from "../../db/index.js";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  originalActive,
  scopeRecordings,
  selectImports,
  unconsumed,
} from "./access.js";
import { queueRecordingJob, recordingInspectionQueue } from "./job-queue.js";
import { readOverlay } from "./overlay.js";
import { readRecordingReview, selectRecordingSections } from "./review.js";
import {
  recordingImports,
  recordingOriginals,
  recordingSamplePages,
  recordingUploads,
} from "./schema.js";

const pageSize = 25;
function projectImport({
  batchId: _batch,
  batchPosition: _position,
  documentName: _name,
  sourceId: _source,
  originalId: _,
  inspectionJobId: _job,
  ...value
}: Awaited<ReturnType<typeof selectImports>>[number]): RecordingImport {
  return value;
}

export function createRecordingImportService(
  auth: ReturnType<typeof createAuth>,
  boss: PgBoss,
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

  async function visibleStage(
    entry: Awaited<ReturnType<typeof selectImports>>[number],
  ) {
    if (entry.stage !== "queued") return entry.stage;
    const job = await boss.getJobById(
      recordingInspectionQueue,
      entry.inspectionJobId,
    );
    return job?.state === "active" ||
      job?.state === "created" ||
      job?.state === "retry"
      ? "queued"
      : "failed";
  }

  return {
    list(session: VerifiedSession, cursor?: string) {
      return withOwner(session, async (tx) => {
        const page = await selectImports(tx)
          .where(
            and(
              originalActive,
              unconsumed,
              isNull(recordingUploads.batchId),
              cursor ? gt(recordingImports.id, cursor) : undefined,
            ),
          )
          .orderBy(asc(recordingImports.id))
          .limit(pageSize + 1);
        const visible = page.slice(0, pageSize);
        return {
          status: 200,
          page: {
            imports: await Promise.all(
              visible.map(async (entry) =>
                projectImport({ ...entry, stage: await visibleStage(entry) }),
              ),
            ),
            nextCursor:
              page.length > pageSize ? visible[pageSize - 1].id : null,
          },
        } as const;
      });
    },

    status(session: VerifiedSession, id: string) {
      return withOwner(session, async (tx) => {
        const [entry] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (!entry) return { status: 404 } as const;
        return {
          status: 200,
          entry: projectImport({ ...entry, stage: await visibleStage(entry) }),
        } as const;
      });
    },

    sections(session: VerifiedSession, id: string, cursor?: number) {
      return withOwner(session, async (tx) => {
        const [entry] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (entry?.stage !== "ready") return { status: 404 } as const;
        const selection = await readRecordingReview(tx, id, entry.revision);
        return {
          status: 200,
          page: await selectRecordingSections(
            tx,
            entry.originalId,
            selection,
            cursor,
          ),
        } as const;
      });
    },

    overlay(
      session: VerifiedSession,
      id: string,
      cursor: number | undefined,
      through: number,
    ) {
      return withOwner(session, async (tx) => {
        const [entry] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (entry?.stage !== "ready") return { status: 404 } as const;
        const selection = await readRecordingReview(tx, id, entry.revision);
        return {
          status: 200,
          overlay: await readOverlay(
            tx,
            entry.originalId,
            selection,
            cursor,
            through,
          ),
        } as const;
      });
    },

    samples(
      session: VerifiedSession,
      id: string,
      ordinal: number,
      page: number,
    ) {
      return withOwner(session, async (tx) => {
        const [entry] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (entry?.stage !== "ready") return { status: 404 } as const;
        const rows = await tx
          .select()
          .from(recordingSamplePages)
          .where(
            and(
              eq(recordingSamplePages.originalId, entry.originalId),
              eq(recordingSamplePages.section, ordinal),
              sql`${recordingSamplePages.page} between ${page} and ${page + 1}`,
            ),
          )
          .orderBy(asc(recordingSamplePages.page))
          .limit(2);
        if (rows[0]?.page !== page) return { status: 404 } as const;
        return {
          status: 200,
          page: {
            samples: rows[0].samples,
            nextCursor: rows.length === 2 ? page + 1 : null,
          },
        } as const;
      });
    },

    retry(session: VerifiedSession, id: string) {
      return withOwner(session, async (tx) => {
        const [initial] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (!initial) return { status: 404 } as const;
        const [current] = await tx
          .select({
            stage: recordingOriginals.stage,
            inspectionJobId: recordingOriginals.inspectionJobId,
          })
          .from(recordingOriginals)
          .where(eq(recordingOriginals.id, initial.originalId))
          .for("update");
        if (!current) return { status: 404 } as const;
        const entry = { ...initial, ...current };
        if ((await visibleStage(entry)) !== "failed")
          return { status: 200, entry: projectImport(entry) } as const;
        const inspectionJobId = await queueRecordingJob(
          tx,
          boss,
          recordingInspectionQueue,
          {
            ownerId: session.accountId,
            id: entry.originalId,
          },
        );
        await tx
          .update(recordingOriginals)
          .set({ stage: "queued", inspectionJobId })
          .where(eq(recordingOriginals.id, entry.originalId));
        return {
          status: 200,
          entry: projectImport({ ...entry, stage: "queued" }),
        } as const;
      });
    },
  };
}
