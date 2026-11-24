import { createHash, randomUUID } from "node:crypto";
import { gpxBatchLimits, gpxLimits } from "@kairn/contracts/recording-limits";
import type {
  CommitRecordingBatch,
  CommitRecordingImport,
  JourneyRecording,
  RecordingCommit,
  RecordingDestination,
  RecordingOverlay,
} from "@kairn/contracts/recordings";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { DatabaseTransaction } from "../../db/index.js";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import { journeys } from "../journeys/schema.js";
import {
  createPrivateJourney,
  findJourney,
  projectedSchedule,
  scopeJourneys,
  selectMemberJourneys,
} from "../journeys/service.js";
import {
  enqueueRestrictionConfirmation,
  finishRecordedRestriction,
} from "../lifecycle/identity-restrictions.js";
import type { RestrictionJournal } from "../lifecycle/restriction-journal.js";
import {
  lockRecordingAccount,
  originalActive,
  scopeRecordings,
  selectImports,
} from "./access.js";
import { overlayBatch, summarizeBatch } from "./batch-review.js";
import { readRecordingBatch } from "./batches.js";
import {
  combineRecordingOverviews,
  readOverlay,
  readOverviewOverlay,
} from "./overlay.js";
import {
  countSelectedSections,
  hasSelectedPath,
  latestRecordingReview,
  readRecordingReview,
  selectRecordingSections,
  summarizeSelection,
  updateRecordingReview,
} from "./review.js";
import {
  recordingAttachments,
  recordingBatches,
  recordingCommits,
  recordingImports,
  recordingOriginals,
} from "./schema.js";

type Attachment = typeof recordingAttachments.$inferSelect;
type Commit = typeof recordingCommits.$inferInsert;
type LockedDestination = { generation: string; canPlace: boolean };
const pageSize = 25;

function destination(
  row: Awaited<ReturnType<typeof selectMemberJourneys>>[number],
): RecordingDestination {
  return {
    id: row.id,
    title: row.title,
    schedule: projectedSchedule(row),
    membershipGeneration: row.membershipGeneration,
    canPlace: row.capabilities.includes("coauthor"),
    grantRevision: null,
  };
}

async function lockDestination(tx: DatabaseTransaction, id: string) {
  const { rows } = await tx.execute<{ destination: LockedDestination | null }>(
    sql`select kairn.lock_recording_destination(${id}::uuid) as destination`,
  );
  return rows[0].destination;
}

const scope = sql<
  "only_me" | "journey_review" | null
>`kairn.recording_attachment_scope(
  ${recordingAttachments.journeyId}, ${recordingAttachments.sourceId}, ${recordingAttachments.originalId},
  ${recordingAttachments.ownerId}, ${recordingAttachments.membershipGeneration}
)`;

const placement = sql<boolean>`(${recordingAttachments.placedInDraft} and kairn.recording_placement_visible(
  ${recordingAttachments.journeyId}, ${recordingAttachments.sourceId}, ${recordingAttachments.ownerId},
  ${recordingAttachments.placementGrantRevision}
))`;

async function receipt(tx: DatabaseTransaction, command: Commit) {
  if (!command.associationId) return { status: 404 } as const;
  const [item] = await tx
    .select({
      id: recordingAttachments.id,
      originalId: recordingAttachments.originalId,
      journeyId: recordingAttachments.journeyId,
      scope,
      placedInDraft: placement,
      detachedAt: recordingAttachments.detachedAt,
    })
    .from(recordingAttachments)
    .where(eq(recordingAttachments.id, command.associationId));
  if (!item) return { status: 404 } as const;
  const visibleJourney =
    !item.detachedAt &&
    item.scope !== null &&
    (await findJourney(tx, command.ownerId, item.journeyId));
  const outcome: RecordingCommit = {
    associationId: item.id,
    recordingId: item.originalId,
    outcome: command.outcome,
    journeyId: visibleJourney ? item.journeyId : null,
    scope: visibleJourney ? (item.scope ?? "only_me") : "only_me",
    placedInDraft: Boolean(
      visibleJourney && item.scope === "journey_review" && item.placedInDraft,
    ),
  };
  return { status: 200, outcome } as const;
}

async function selectAttachment(
  tx: DatabaseTransaction,
  journeyId: string,
  id: string,
) {
  const [item] = await tx
    .select({ item: recordingAttachments, scope, placedInDraft: placement })
    .from(recordingAttachments)
    .where(
      and(
        eq(recordingAttachments.journeyId, journeyId),
        eq(recordingAttachments.id, id),
        isNull(recordingAttachments.detachedAt),
        sql`${scope} is not null`,
      ),
    );
  return item;
}

function reviewVersion(item: Pick<Attachment, "importId" | "reviewRevision">) {
  return createHash("sha256")
    .update(`${item.importId}:${item.reviewRevision}`)
    .digest("hex");
}

function projectItem(
  item: Attachment,
  itemScope: JourneyRecording["scope"],
  accountId: string,
  placedInDraft: boolean,
  canPlace: boolean,
): JourneyRecording {
  const owned = item.ownerId === accountId;
  return {
    id: item.id,
    sourceId: owned ? item.sourceId : null,
    scope: itemScope,
    fileName: item.fileName,
    sectionCount: item.sectionCount,
    reviewVersion: reviewVersion(item),
    placedInDraft: itemScope === "journey_review" && placedInDraft,
    placementRevision:
      canPlace && placedInDraft ? item.placementGrantRevision : null,
    owned,
  };
}

async function currentGrant(
  tx: DatabaseTransaction,
  journeyId: string,
  sourceId: string,
) {
  const { rows } = await tx.execute<{
    review: { scope: string; revision: number } | null;
  }>(
    sql`select kairn.read_source_review(${journeyId}::uuid, ${sourceId}::uuid) as review`,
  );
  return rows[0].review;
}

async function grantReview(
  tx: DatabaseTransaction,
  journeyId: string,
  sourceId: string,
  expectedRevision: number,
) {
  const grant = await tx.execute<{
    result: { status: number; revision?: number };
  }>(sql`
    select kairn.set_source_permission(${journeyId}::uuid, ${sourceId}::uuid, ${expectedRevision}::integer, 'share', null) as result
  `);
  return grant.rows[0].result;
}

export function createRecordingAttachmentService(
  auth: ReturnType<typeof createAuth>,
  { boss, journal }: { boss: PgBoss; journal?: RestrictionJournal },
) {
  function authorized<T>(
    session: VerifiedSession,
    action: (tx: DatabaseTransaction, ownerId: string) => Promise<T>,
  ) {
    return auth.withCurrentSession(session, async (tx) => {
      await scopeRecordings(tx, session.accountId);
      await scopeJourneys(tx, session.accountId);
      return action(tx, session.accountId);
    });
  }
  function journeyView<T>(
    session: VerifiedSession,
    journeyId: string,
    action: (
      tx: DatabaseTransaction,
      ownerId: string,
      journey: NonNullable<Awaited<ReturnType<typeof findJourney>>>,
    ) => Promise<T>,
  ) {
    return authorized(session, async (tx, ownerId) => {
      const journey = await findJourney(tx, ownerId, journeyId);
      if (!journey) return { status: 404 } as const;
      await tx.execute(
        sql`select set_config('kairn.recording_journey', ${journeyId}, true)`,
      );
      return action(tx, ownerId, journey);
    });
  }
  return {
    reviewBatch(session: VerifiedSession, id: string) {
      return authorized(session, async (tx) => {
        const batch = await readRecordingBatch(tx, id);
        if (!batch || batch.savedAt || batch.expiresAt <= new Date())
          return { status: 404 } as const;
        const { review } = await summarizeBatch(tx, id, true);
        return { status: 200, review } as const;
      });
    },

    overlayBatch(session: VerifiedSession, id: string) {
      return authorized(session, async (tx) => {
        const batch = await readRecordingBatch(tx, id);
        if (!batch || batch.savedAt || batch.expiresAt <= new Date())
          return { status: 404 } as const;
        return { status: 200, overlay: await overlayBatch(tx, id) } as const;
      });
    },

    commitBatch(
      session: VerifiedSession,
      id: string,
      input: CommitRecordingBatch,
    ) {
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            input.title ?? null,
            input.files.map(({ id, revision }) => [id, revision]),
          ]),
        )
        .digest("hex");
      return authorized(session, async (tx, ownerId) => {
        await lockRecordingAccount(tx, ownerId);
        const batch = await readRecordingBatch(tx, id);
        if (!batch) return { status: 404 } as const;
        if (batch.savedAt) {
          if (
            !batch.journeyId ||
            !(await findJourney(tx, ownerId, batch.journeyId))
          )
            return { status: 404 } as const;
          if (batch.saveDigest !== fingerprint) return { status: 409 } as const;
          return { status: 200, id: batch.journeyId } as const;
        }
        if (batch.expiresAt <= new Date()) return { status: 404 } as const;
        const { review, files } = await summarizeBatch(tx, id);
        if (
          !review.complete ||
          input.files.length !== files.length ||
          input.files.some((file, index) => file.id !== files[index].entry.id)
        )
          return { status: 409 } as const;
        if (
          input.files.some(
            (file, index) => file.revision !== files[index].entry.revision,
          )
        )
          return { status: 412, code: "recording_review_changed" } as const;

        const title = input.title ?? review.title;
        const window = review.recordedWindow;
        const dated =
          window &&
          [window.start, window.end].every(
            (instant) =>
              /^\d{4}-/.test(instant) && !instant.startsWith("0000-"),
          );
        const created = await createPrivateJourney(
          tx,
          ownerId,
          randomUUID(),
          dated
            ? {
                title,
                timeZone: review.timeZone,
                intendedStart: window.start.slice(0, 16),
                intendedEnd: window.end.slice(0, 16),
              }
            : { title, timeZone: null, intendedStart: null, intendedEnd: null },
        );
        if (created.status !== 201) return { status: 409 } as const;
        const journeyId = created.id;
        const destination = await lockDestination(tx, journeyId);
        if (!destination)
          throw new Error("New recording destination unavailable");

        const associated = new Map<string, string>();
        for (const { entry, selection, summary } of files) {
          const previous = associated.get(entry.originalId);
          const associationId = previous ?? randomUUID();
          if (!previous) {
            await tx
              .update(recordingOriginals)
              .set({ retained: true })
              .where(eq(recordingOriginals.id, entry.originalId));
            await tx.insert(recordingAttachments).values({
              id: associationId,
              journeyId,
              ownerId,
              originalId: entry.originalId,
              importId: entry.id,
              sourceId: entry.sourceId,
              membershipGeneration: destination.generation,
              reviewRevision: entry.revision,
              selection,
              fileName: entry.fileName,
              sectionCount: summary.sectionCount,
            });
            await tx.execute(
              sql`select kairn.audit_recording_attachment(${associationId}::uuid)`,
            );
            associated.set(entry.originalId, associationId);
          }
          await tx.insert(recordingCommits).values({
            importId: entry.id,
            associationId,
            ownerId,
            commandId: randomUUID(),
            deviceId: id,
            fingerprint,
            outcome: previous ? "already_added" : "created",
          });
        }
        await tx
          .update(recordingBatches)
          .set({ savedAt: new Date(), journeyId, saveDigest: fingerprint })
          .where(eq(recordingBatches.id, id));
        return { status: 200, id: journeyId } as const;
      });
    },

    destinations(session: VerifiedSession, cursor?: string) {
      return authorized(session, async (tx, ownerId) => {
        const rows = await selectMemberJourneys(tx, ownerId)
          .where(
            and(
              isNull(journeys.archivedAt),
              cursor ? gt(journeys.id, cursor) : undefined,
            ),
          )
          .orderBy(asc(journeys.id))
          .limit(pageSize + 1);
        const items = rows.slice(0, pageSize).map(destination);
        return {
          status: 200,
          page: {
            journeys: items,
            nextCursor:
              rows.length > pageSize ? (items.at(-1)?.id ?? null) : null,
          },
        } as const;
      });
    },

    destination(session: VerifiedSession, id: string, importId?: string) {
      return authorized(session, async (tx, ownerId) => {
        const [row] = await selectMemberJourneys(tx, ownerId).where(
          and(eq(journeys.id, id), isNull(journeys.archivedAt)),
        );
        if (!row) return { status: 404 } as const;
        const result = destination(row);
        if (importId) {
          const [entry] = await selectImports(tx).where(
            and(eq(recordingImports.id, importId), originalActive),
          );
          if (!entry) return { status: 404 } as const;
          const [original] = await tx
            .select({ sourceId: recordingOriginals.sourceId })
            .from(recordingOriginals)
            .where(
              and(eq(recordingOriginals.id, entry.originalId), originalActive),
            );
          if (!original) return { status: 404 } as const;
          const grant = await currentGrant(tx, id, original.sourceId);
          if (!grant) return { status: 404 } as const;
          result.grantRevision = grant.revision;
        }
        return { status: 200, destination: result } as const;
      });
    },

    review(session: VerifiedSession, id: string) {
      return authorized(session, async (tx) => {
        const [entry] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (entry?.stage !== "ready") return { status: 404 } as const;
        const selection = await readRecordingReview(tx, id, entry.revision);
        return {
          status: 200,
          review: {
            revision: entry.revision,
            selection: {
              excluded: selection.excluded,
              splits: selection.splits,
              clock: selection.clock,
            },
            summary: await summarizeSelection(tx, entry.originalId, selection),
          },
        } as const;
      });
    },

    updateReview(
      session: VerifiedSession,
      id: string,
      change: Parameters<typeof updateRecordingReview>[3],
    ) {
      return authorized(session, (tx) =>
        updateRecordingReview(tx, session, id, change),
      );
    },

    result(session: VerifiedSession, id: string) {
      return authorized(session, async (tx) => {
        const [command] = await tx
          .select()
          .from(recordingCommits)
          .where(eq(recordingCommits.importId, id));
        if (!command) return { status: 404 } as const;
        return receipt(tx, command);
      });
    },

    commit(session: VerifiedSession, id: string, input: CommitRecordingImport) {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      return authorized(session, async (tx, ownerId) => {
        await lockRecordingAccount(tx, ownerId);
        const [locked] = await tx
          .select()
          .from(recordingImports)
          .where(eq(recordingImports.id, id))
          .for("update");
        if (!locked) return { status: 404 } as const;
        const [entry] = await selectImports(tx).where(
          and(eq(recordingImports.id, id), originalActive),
        );
        if (entry?.stage !== "ready" || entry.batchId)
          return { status: 404 } as const;
        const [prior] = await tx
          .select()
          .from(recordingCommits)
          .where(eq(recordingCommits.importId, id));
        if (prior) {
          if (!prior.associationId) return { status: 404 } as const;
          if (
            prior.deviceId !== input.deviceId ||
            prior.commandId !== input.commandId ||
            prior.fingerprint !== fingerprint
          )
            return { status: 409 } as const;
          return receipt(tx, prior);
        }
        const [duplicateCommand] = await tx
          .select({ id: recordingCommits.importId })
          .from(recordingCommits)
          .where(
            and(
              eq(recordingCommits.ownerId, ownerId),
              eq(recordingCommits.deviceId, input.deviceId),
              eq(recordingCommits.commandId, input.commandId),
            ),
          );
        if (duplicateCommand) return { status: 409 } as const;
        if (entry.revision !== input.reviewRevision)
          return { status: 412, code: "recording_review_changed" } as const;
        if (input.placeInDraft && input.scope !== "journey_review")
          return { status: 400 } as const;
        const selection = await readRecordingReview(tx, id, entry.revision);
        if (!(await hasSelectedPath(tx, entry.originalId, selection)))
          return { status: 400 } as const;
        const [original] = await tx
          .select({ sourceId: recordingOriginals.sourceId })
          .from(recordingOriginals)
          .where(
            and(eq(recordingOriginals.id, entry.originalId), originalActive),
          );
        if (!original) return { status: 404 } as const;

        let journeyId: string;
        let target: LockedDestination;
        if (input.destination.kind === "existing") {
          journeyId = input.destination.journeyId;
          const eligible = await lockDestination(tx, journeyId);
          if (!eligible) return { status: 404 } as const;
          if (eligible.generation !== input.destination.membershipGeneration)
            return { status: 412, code: "membership_changed" } as const;
          if (input.placeInDraft && !eligible.canPlace)
            return { status: 412, code: "capability_changed" } as const;
          target = eligible;
        } else {
          const attempted = input.destination.journey;
          const created = await createPrivateJourney(
            tx,
            ownerId,
            randomUUID(),
            { ...attempted, intendedEnd: attempted.intendedEnd ?? null },
          );
          if (created.status !== 201)
            return created.status === 400
              ? created
              : ({ status: 409 } as const);
          journeyId = created.id;
          const createdTarget = await lockDestination(tx, journeyId);
          if (!createdTarget)
            throw new Error("New recording destination unavailable");
          target = createdTarget;
        }

        const [priorLink] = await tx
          .select()
          .from(recordingAttachments)
          .where(
            and(
              eq(recordingAttachments.journeyId, journeyId),
              eq(recordingAttachments.originalId, entry.originalId),
              isNull(recordingAttachments.detachedAt),
            ),
          );
        let existing: Attachment | undefined = priorLink;
        if (priorLink && priorLink.membershipGeneration !== target.generation) {
          const previousGrant = await currentGrant(
            tx,
            journeyId,
            original.sourceId,
          );
          if (
            previousGrant?.scope !== "only_me" ||
            input.destination.kind !== "existing" ||
            input.destination.grantRevision !== previousGrant.revision
          )
            return { status: 412, code: "source_grant_changed" } as const;
          await tx
            .update(recordingAttachments)
            .set({ detachedAt: new Date() })
            .where(eq(recordingAttachments.id, priorLink.id));
          existing = undefined;
        }
        const associationId = existing?.id ?? randomUUID();
        if (!existing) {
          const current = await currentGrant(tx, journeyId, original.sourceId);
          const expected =
            input.destination.kind === "existing"
              ? input.destination.grantRevision
              : 0;
          if (
            !current ||
            current.revision !== expected ||
            current.scope !== "only_me"
          ) {
            if (input.destination.kind === "new")
              throw new Error("New recording grant unavailable");
            return { status: 412, code: "source_grant_changed" } as const;
          }
          let placementGrantRevision: number | null = null;
          if (input.scope === "journey_review") {
            const grant = await grantReview(
              tx,
              journeyId,
              original.sourceId,
              expected,
            );
            if (grant.status !== 200 || grant.revision === undefined) {
              if (input.destination.kind === "new")
                throw new Error("New recording grant unavailable");
              return { status: 412, code: "source_grant_changed" } as const;
            }
            if (input.placeInDraft) placementGrantRevision = grant.revision;
          }
          await tx.insert(recordingAttachments).values({
            id: associationId,
            journeyId,
            ownerId,
            originalId: entry.originalId,
            importId: id,
            sourceId: original.sourceId,
            membershipGeneration: target.generation,
            reviewRevision: entry.revision,
            reviewPinnedAt: sql`clock_timestamp()`,
            selection,
            fileName: entry.fileName,
            sectionCount: await countSelectedSections(
              tx,
              entry.originalId,
              selection,
            ),
            placementGrantRevision,
            placedInDraft: input.placeInDraft,
          });
          await tx.execute(
            sql`select kairn.audit_recording_attachment(${associationId}::uuid)`,
          );
        }
        const command: Commit = {
          importId: id,
          associationId,
          ownerId,
          commandId: input.commandId,
          deviceId: input.deviceId,
          fingerprint,
          outcome: existing
            ? "already_added"
            : input.destination.kind === "new"
              ? "created"
              : "added",
        };
        await tx.insert(recordingCommits).values(command);
        return receipt(tx, command);
      });
    },

    journeyList(session: VerifiedSession, journeyId: string, cursor?: string) {
      return journeyView(session, journeyId, async (tx, ownerId, journey) => {
        const rows = await tx
          .select({
            item: recordingAttachments,
            scope,
            placedInDraft: placement,
          })
          .from(recordingAttachments)
          .where(
            and(
              eq(recordingAttachments.journeyId, journeyId),
              isNull(recordingAttachments.detachedAt),
              cursor ? gt(recordingAttachments.id, cursor) : undefined,
              sql`${scope} is not null`,
            ),
          )
          .orderBy(asc(recordingAttachments.id))
          .limit(pageSize + 1);
        const recordings = rows
          .slice(0, pageSize)
          .map(({ item, scope, placedInDraft }) =>
            projectItem(
              item,
              scope ?? "only_me",
              ownerId,
              placedInDraft,
              journey.state === "draft" &&
                journey.capabilities.includes("coauthor"),
            ),
          );
        return {
          status: 200,
          page: {
            recordings,
            nextCursor:
              rows.length > pageSize ? (recordings.at(-1)?.id ?? null) : null,
          },
        } as const;
      });
    },

    removePlacement(
      session: VerifiedSession,
      journeyId: string,
      id: string,
      expectedRevision: number,
    ) {
      return authorized(session, async (tx) => {
        const { rows } = await tx.execute<{ status: 200 | 404 | 412 }>(sql`
          select kairn.remove_recording_placement(${journeyId}::uuid, ${id}::uuid, ${expectedRevision}::integer) as status
        `);
        return { status: rows[0].status };
      });
    },

    placementReview(
      session: VerifiedSession,
      journeyId: string,
      id: string,
      token?: string,
    ) {
      return journeyView(session, journeyId, async (tx, viewerId, journey) => {
        if (
          journey.state !== "draft" ||
          !journey.capabilities.includes("coauthor")
        )
          return { status: 404 } as const;
        let attached = await selectAttachment(tx, journeyId, id);
        if (attached?.scope !== "journey_review" || !attached.placedInDraft)
          return { status: 404 } as const;
        if (token) {
          await lockRecordingAccount(tx, attached.item.ownerId);
          if (!(await lockDestination(tx, journeyId))?.canPlace)
            return { status: 404 } as const;
          attached = await selectAttachment(tx, journeyId, id);
          if (attached?.scope !== "journey_review" || !attached.placedInDraft)
            return { status: 404 } as const;
        }
        const { item } = attached;
        await scopeRecordings(tx, item.ownerId);
        const latest = await latestRecordingReview(
          tx,
          item.originalId,
          item.id,
        );
        if (
          !latest ||
          latest.revision === 1 ||
          (latest.importId === item.importId &&
            latest.revision === item.reviewRevision)
        ) {
          return token
            ? ({ status: 412 } as const)
            : ({ status: 200, review: null } as const);
        }
        const candidateToken = createHash("sha256")
          .update(
            JSON.stringify([
              id,
              reviewVersion(item),
              item.placementGrantRevision,
              latest.importId,
              latest.revision,
            ]),
          )
          .digest("hex");
        if (token && token !== candidateToken) return { status: 412 } as const;
        const selection = {
          ...latest.selection,
          excluded: [
            ...new Set([
              ...item.selection.excluded,
              ...latest.selection.excluded,
            ]),
          ],
        };
        if (!(await hasSelectedPath(tx, item.originalId, selection))) {
          return token
            ? ({ status: 412 } as const)
            : ({ status: 200, review: null } as const);
        }
        const sectionCount = await countSelectedSections(
          tx,
          item.originalId,
          selection,
        );
        if (!token)
          return {
            status: 200,
            review: {
              token: candidateToken,
              sectionCount,
              clock: selection.clock ?? null,
            },
          } as const;
        await tx
          .update(recordingAttachments)
          .set({
            importId: latest.importId,
            reviewRevision: latest.revision,
            reviewPinnedAt: sql`clock_timestamp()`,
            selection,
            sectionCount,
          })
          .where(eq(recordingAttachments.id, id));
        await scopeRecordings(tx, viewerId);
        await tx.execute(
          sql`select kairn.audit_recording_review_acceptance(${journeyId}::uuid, ${id}::uuid)`,
        );
        return { status: 200, review: null } as const;
      });
    },

    async detach(
      session: VerifiedSession,
      journeyId: string,
      id: string,
      expectedRevision: number,
    ) {
      const result = await authorized(session, async (tx, ownerId) => {
        if (!(await lockDestination(tx, journeyId)))
          return { status: 404 } as const;
        const [attached] = await tx
          .select({ item: recordingAttachments, placedInDraft: placement })
          .from(recordingAttachments)
          .where(
            and(
              eq(recordingAttachments.id, id),
              eq(recordingAttachments.journeyId, journeyId),
              eq(recordingAttachments.ownerId, ownerId),
            ),
          );
        if (!attached) return { status: 404 } as const;
        const { item } = attached;
        if (item.detachedAt)
          return {
            status: 200,
            eventId: item.detachEventId,
            confirmed: false,
          } as const;
        const grant = await currentGrant(tx, journeyId, item.sourceId);
        if (!grant) return { status: 404 } as const;
        if (expectedRevision !== grant.revision)
          return { status: 412 } as const;
        let eventId: string | null = null;
        let confirmed = true;
        if (grant.scope !== "only_me") {
          const { rows } = await tx.execute<{
            result: {
              status: number;
              eventId?: string;
              confirmed?: boolean;
              created?: boolean;
            };
          }>(sql`
            select kairn.set_source_permission(${journeyId}::uuid, ${item.sourceId}::uuid, ${expectedRevision}::integer, 'withdraw', null) as result
          `);
          const outcome = rows[0].result;
          if (outcome.status !== 200 || !outcome.eventId)
            return { status: 412 } as const;
          eventId = outcome.eventId;
          confirmed = outcome.confirmed === true;
          if (outcome.created)
            await enqueueRestrictionConfirmation(tx, boss, eventId);
        }
        await tx
          .update(recordingAttachments)
          .set({ detachedAt: new Date(), detachEventId: eventId })
          .where(eq(recordingAttachments.id, id));
        await tx.execute(
          sql`select kairn.audit_recording_detach(${id}::uuid, ${attached.placedInDraft}::boolean)`,
        );
        return { status: 200, eventId, confirmed } as const;
      });
      if (result.status !== 200) return result;
      if (!result.eventId)
        return { status: 200, id, confirmation: "confirmed" } as const;
      const receipt = await finishRecordedRestriction(auth, journal, {
        eventId: result.eventId,
        confirmed: result.confirmed,
      });
      return {
        status: receipt.status,
        id,
        confirmation: receipt.confirmation,
      } as const;
    },

    journeyOverview(session: VerifiedSession, journeyId: string) {
      return journeyView(session, journeyId, async (tx) => {
        const limit = gpxBatchLimits.files;
        const rows = await tx
          .select({
            id: recordingAttachments.id,
            originalId: recordingAttachments.originalId,
            selection: recordingAttachments.selection,
          })
          .from(recordingAttachments)
          .where(
            and(
              eq(recordingAttachments.journeyId, journeyId),
              isNull(recordingAttachments.detachedAt),
              sql`${scope} is not null`,
            ),
          )
          .orderBy(
            desc(recordingAttachments.reviewPinnedAt),
            asc(recordingAttachments.id),
          )
          .limit(limit + 1);

        const paths: RecordingOverlay["paths"] = [];
        const recordings = rows.slice(0, limit);
        const budget = Math.floor(4096 / Math.max(1, recordings.length));
        let limited = rows.length > limit;
        for (const [series, item] of recordings.entries()) {
          await tx.execute(
            sql`select set_config('kairn.recording_attachment', ${item.id}, true)`,
          );
          const overlay = await readOverviewOverlay(
            tx,
            item.originalId,
            item.selection,
            budget,
          );
          limited ||= overlay.limited;
          for (const path of overlay.paths) {
            paths.push({
              ...path,
              section: series * gpxLimits.sections + path.section,
              series,
            });
          }
        }

        return {
          status: 200,
          overlay: {
            ...combineRecordingOverviews(paths),
            limited,
          },
        } as const;
      });
    },

    journeyOverlay(
      session: VerifiedSession,
      journeyId: string,
      id: string,
      cursor: number | undefined,
      through: number,
    ) {
      return journeyView(session, journeyId, async (tx) => {
        const attached = await selectAttachment(tx, journeyId, id);
        if (!attached) return { status: 404 } as const;
        await tx.execute(
          sql`select set_config('kairn.recording_attachment', ${id}, true)`,
        );
        return {
          status: 200,
          overlay: await readOverlay(
            tx,
            attached.item.originalId,
            attached.item.selection,
            cursor,
            through,
            true,
          ),
        } as const;
      });
    },

    journeySections(
      session: VerifiedSession,
      journeyId: string,
      id: string,
      cursor?: number,
    ) {
      return journeyView(session, journeyId, async (tx) => {
        const attached = await selectAttachment(tx, journeyId, id);
        if (!attached) return { status: 404 } as const;
        await tx.execute(
          sql`select set_config('kairn.recording_attachment', ${id}, true)`,
        );
        return {
          status: 200,
          page: await selectRecordingSections(
            tx,
            attached.item.originalId,
            attached.item.selection,
            cursor,
            true,
          ),
        } as const;
      });
    },
  };
}
