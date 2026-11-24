import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  gpxInspectionVersion,
  gpxLimits,
} from "@kairn/contracts/recording-limits";
import type {
  BeginRecordingUpload,
  RecordingBatch,
  RecordingUpload,
} from "@kairn/contracts/recordings";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { DatabaseTransaction } from "../../db/index.js";
import type { openObjectStore } from "../../storage.js";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  completedKey,
  lockRecordingAccount,
  partKey,
  readUpload,
  scopeRecordings,
} from "./access.js";
import {
  discardBatchFile,
  readRecordingBatch,
  reserveBatchFile,
} from "./batches.js";
import { recordingIdentity, recordingUploadDenied } from "./identity.js";
import {
  queueRecordingJob,
  recordingInspectionQueue,
  recordingReclaimQueue,
} from "./job-queue.js";
import {
  recordingImports,
  recordingOriginals,
  recordingParts,
  recordingUploads,
} from "./schema.js";

type Upload = typeof recordingUploads.$inferSelect;
type Part = typeof recordingParts.$inferSelect;
type Store = ReturnType<typeof openObjectStore>;
const expiresAfterMs = 24 * 60 * 60 * 1000;
const ownerQuota = 512 * 1024 ** 2;
const openUploadLimit = 4;
const contentType = "application/gpx+xml";

async function readParts(tx: DatabaseTransaction, uploadId: string) {
  return tx
    .select()
    .from(recordingParts)
    .where(eq(recordingParts.uploadId, uploadId))
    .orderBy(asc(recordingParts.partNumber));
}

async function receipt(tx: DatabaseTransaction, upload: Upload) {
  const parts = await readParts(tx, upload.id);
  const result: RecordingUpload = {
    id: upload.id,
    state:
      upload.state === "uploading" && upload.expiresAt <= new Date()
        ? "expired"
        : upload.state,
    fileName: upload.fileName,
    byteLength: upload.byteLength,
    sha256: upload.sha256,
    expiresAt: upload.expiresAt.toISOString(),
    partSize: gpxLimits.partBytes,
    importId: upload.state === "complete" ? upload.id : null,
    parts: parts.map(({ partNumber, byteLength, sha256 }) => ({
      protocolVersion: 1,
      uploadId: upload.id,
      partNumber,
      byteLength,
      sha256,
    })),
  };
  return { status: 200, upload: result } as const;
}

function partLength(upload: Upload, number: number) {
  return Math.min(
    gpxLimits.partBytes,
    upload.byteLength - (number - 1) * gpxLimits.partBytes,
  );
}

function isOpen(upload: Upload) {
  return upload.state === "uploading" && upload.expiresAt > new Date();
}

async function boundedPart(stream: ReadableStream<Uint8Array>, length: number) {
  const reader = stream.getReader();
  const buffer = Buffer.allocUnsafe(length);
  let received = 0;
  let done = false;
  const readTimeout = AbortSignal.timeout(30_000);
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  readTimeout.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) {
        done = true;
        return received === length && !readTimeout.aborted ? buffer : null;
      }
      if (item.value.length > length - received) return null;
      buffer.set(item.value, received);
      received += item.value.length;
    }
  } finally {
    readTimeout.removeEventListener("abort", cancel);
    if (!done) cancel();
    reader.releaseLock();
  }
}

async function* assembledParts(store: Store, parts: Part[]) {
  for (const part of parts) {
    const { body } = await store.get(partKey(part.uploadId, part.partNumber));
    const hash = createHash("sha256");
    let received = 0;
    try {
      for await (const chunk of body) {
        received += chunk.length;
        if (received > part.byteLength)
          throw new Error("Invalid stored part size");
        hash.update(chunk);
        yield chunk;
      }
      if (received !== part.byteLength || hash.digest("hex") !== part.sha256)
        throw new Error("Invalid stored part");
    } finally {
      body.destroy();
    }
  }
}

export function createRecordingUploadService(
  auth: ReturnType<typeof createAuth>,
  boss: PgBoss,
  store: Store,
) {
  async function withOwner<T>(
    session: VerifiedSession,
    action: (tx: DatabaseTransaction) => Promise<T>,
  ) {
    return auth.withCurrentSession(session, async (tx) => {
      await scopeRecordings(tx, session.accountId);
      return action(tx);
    });
  }

  async function readActiveUpload(
    tx: DatabaseTransaction,
    id: string,
    lock = false,
  ) {
    const upload = await readUpload(tx, id, lock);
    if (!upload) return;
    const { sourceId } = recordingIdentity(upload.ownerId, upload);
    if (!(await recordingUploadDenied(tx, sourceId))) return upload;
  }

  // Bound peak body buffers and DB connections before consuming request bodies.
  let transfers = 0;
  const accountTransfers = new Map<string, number>();
  async function transfer<T>(session: VerifiedSession, run: () => Promise<T>) {
    const count = accountTransfers.get(session.accountId) ?? 0;
    if (count >= 2 || transfers >= 3) return { status: 429 } as const;
    accountTransfers.set(session.accountId, count + 1);
    transfers++;
    try {
      return await run();
    } finally {
      const active = (accountTransfers.get(session.accountId) ?? 1) - 1;
      if (active === 0) accountTransfers.delete(session.accountId);
      else accountTransfers.set(session.accountId, active);
      transfers--;
    }
  }

  return {
    begin(session: VerifiedSession, input: BeginRecordingUpload) {
      return withOwner(session, async (tx) => {
        const ownerId = session.accountId;
        await lockRecordingAccount(tx, ownerId);
        const { sourceId } = recordingIdentity(ownerId, input);
        if (await recordingUploadDenied(tx, sourceId))
          return { status: 409 } as const;
        const [prior] = await tx
          .select()
          .from(recordingUploads)
          .where(
            and(
              eq(recordingUploads.ownerId, ownerId),
              eq(recordingUploads.deviceId, input.deviceId),
              eq(recordingUploads.commandId, input.commandId),
            ),
          );
        if (prior) {
          if (
            prior.sha256 !== input.sha256 ||
            prior.byteLength !== input.byteLength ||
            prior.fileName !== input.fileName ||
            prior.batchId !== (input.batch?.id ?? null) ||
            prior.batchPosition !== (input.batch?.position ?? null)
          )
            return { status: 409 } as const;
          return receipt(tx, prior);
        }
        const [usage] = await tx
          .select({
            bytes:
              sql<number>`coalesce(sum(${recordingUploads.byteLength}), 0)`.mapWith(
                Number,
              ),
            active:
              sql<number>`count(*) filter (where ${recordingUploads.state} = 'uploading')`.mapWith(
                Number,
              ),
          })
          .from(recordingUploads)
          .where(
            and(
              eq(recordingUploads.ownerId, ownerId),
              isNull(recordingUploads.cleanedAt),
            ),
          );
        const [originals] = await tx
          .select({
            bytes:
              sql<number>`coalesce(sum(${recordingOriginals.byteLength}), 0)`.mapWith(
                Number,
              ),
          })
          .from(recordingOriginals)
          .where(
            and(
              eq(recordingOriginals.ownerId, ownerId),
              sql`kairn.recording_retains_storage(${recordingOriginals.id})`,
            ),
          );
        if (
          usage.active >= openUploadLimit ||
          2 * (usage.bytes + input.byteLength) + originals.bytes > ownerQuota
        )
          return { status: 429 } as const;
        const id = randomUUID();
        let expiresAt = new Date(Date.now() + expiresAfterMs);
        if (input.batch) {
          if (!/\.gpx$/i.test(input.fileName)) return { status: 400 } as const;
          const reserved = await reserveBatchFile(
            tx,
            ownerId,
            input.batch.id,
            input.batch.position,
            input.byteLength,
            expiresAt,
          );
          if (reserved.status !== 200) return reserved;
          expiresAt = reserved.expiresAt;
        }
        const [upload] = await tx
          .insert(recordingUploads)
          .values({
            id,
            ownerId,
            expiresAt,
            deviceId: input.deviceId,
            commandId: input.commandId,
            fileName: input.fileName,
            sha256: input.sha256,
            byteLength: input.byteLength,
            batchId: input.batch?.id,
            batchPosition: input.batch?.position,
          })
          .returning();
        await queueRecordingJob(
          tx,
          boss,
          recordingReclaimQueue,
          { ownerId, id },
          expiresAt,
        );
        return receipt(tx, upload);
      });
    },

    status(session: VerifiedSession, id: string) {
      return withOwner(session, async (tx) => {
        const upload = await readActiveUpload(tx, id);
        if (!upload) return { status: 404 } as const;
        return receipt(tx, upload);
      });
    },

    batch(session: VerifiedSession, id: string) {
      return withOwner(session, async (tx) => {
        const batch = await readRecordingBatch(tx, id);
        if (!batch || batch.savedAt || batch.expiresAt <= new Date())
          return { status: 404 } as const;
        const uploads = await tx
          .select()
          .from(recordingUploads)
          .where(
            and(
              eq(recordingUploads.batchId, id),
              ne(recordingUploads.state, "aborted"),
            ),
          )
          .orderBy(asc(recordingUploads.batchPosition));
        const files = await Promise.all(
          uploads.map(async (upload) => ({
            position: upload.batchPosition ?? 0,
            commandId: upload.commandId,
            upload: (await receipt(tx, upload)).upload,
          })),
        );
        const draft: RecordingBatch = {
          id,
          expiresAt: batch.expiresAt.toISOString(),
          files,
        };
        return { status: 200, draft } as const;
      });
    },

    putPart(
      session: VerifiedSession,
      id: string,
      number: number,
      sha256: string,
      length: number,
      body: ReadableStream<Uint8Array>,
    ) {
      return transfer(session, async () => {
        const snapshot = await withOwner(session, async (tx) => {
          const upload = await readActiveUpload(tx, id);
          if (!upload) return { status: 404 } as const;
          if (
            (!isOpen(upload) && upload.state !== "complete") ||
            partLength(upload, number) !== length
          )
            return { status: 409 } as const;
          return { status: 200 } as const;
        });
        if (snapshot.status !== 200) return snapshot;
        const bytes = await boundedPart(body, length);
        if (
          !bytes ||
          createHash("sha256").update(bytes).digest("hex") !== sha256
        )
          return { status: 400 } as const;
        return withOwner(session, async (tx) => {
          const upload = await readActiveUpload(tx, id, true);
          if (!upload) return { status: 404 } as const;
          const [part] = await tx
            .select()
            .from(recordingParts)
            .where(
              and(
                eq(recordingParts.uploadId, id),
                eq(recordingParts.partNumber, number),
              ),
            );
          if (part) {
            if (part.sha256 !== sha256 || part.byteLength !== length)
              return { status: 409 } as const;
            if (isOpen(upload) || upload.state === "complete")
              return receipt(tx, upload);
          }
          if (!isOpen(upload)) return { status: 409 } as const;
          await store.put(
            partKey(id, number),
            bytes,
            length,
            "application/octet-stream",
          );
          await tx.insert(recordingParts).values({
            uploadId: id,
            ownerId: session.accountId,
            partNumber: number,
            byteLength: length,
            sha256,
          });
          return receipt(tx, upload);
        });
      });
    },

    complete(session: VerifiedSession, id: string) {
      return transfer(session, () =>
        withOwner(session, async (tx) => {
          const upload = await readActiveUpload(tx, id, true);
          if (!upload) return { status: 404 } as const;
          if (upload.state === "complete" || upload.state === "rejected")
            return receipt(tx, upload);
          if (!isOpen(upload)) return { status: 409 } as const;
          const parts = await readParts(tx, id);
          if (
            parts.length !==
              Math.ceil(upload.byteLength / gpxLimits.partBytes) ||
            parts.some(
              (part, index) =>
                part.partNumber !== index + 1 ||
                part.byteLength !== partLength(upload, index + 1),
            )
          )
            return { status: 409 } as const;

          const key = completedKey(id);
          if (!(await store.head(key))) {
            const combined = Readable.from(assembledParts(store, parts));
            try {
              await store.put(key, combined, upload.byteLength, contentType);
            } finally {
              combined.destroy();
            }
          }
          const verified = await store.verify(key, {
            size: upload.byteLength,
            sha256: upload.sha256,
          });
          const ownerId = session.accountId;
          if (!verified) {
            await tx
              .update(recordingUploads)
              .set({ state: "rejected" })
              .where(eq(recordingUploads.id, id));
            await queueRecordingJob(tx, boss, recordingReclaimQueue, {
              ownerId,
              id,
            });
            return receipt(tx, { ...upload, state: "rejected" });
          }
          await lockRecordingAccount(tx, ownerId);
          const { sourceId, assetId } = recordingIdentity(ownerId, upload);
          if (await recordingUploadDenied(tx, sourceId)) {
            await tx
              .update(recordingUploads)
              .set({ state: "rejected" })
              .where(eq(recordingUploads.id, id));
            await queueRecordingJob(tx, boss, recordingReclaimQueue, {
              ownerId,
              id,
            });
            return { status: 409 } as const;
          }
          const [prior] = await tx
            .select({
              id: recordingOriginals.id,
              retained: recordingOriginals.retained,
            })
            .from(recordingOriginals)
            .where(
              and(
                eq(recordingOriginals.ownerId, ownerId),
                eq(recordingOriginals.sha256, upload.sha256),
                eq(recordingOriginals.byteLength, upload.byteLength),
              ),
            );
          const originalId = prior?.id ?? assetId;
          if (!prior) {
            await tx.execute(
              sql`select kairn.register_recording_source(${sourceId}::uuid, ${originalId}::uuid)`,
            );
            const inspectionJobId = await queueRecordingJob(
              tx,
              boss,
              recordingInspectionQueue,
              { ownerId, id: originalId },
            );
            await tx.insert(recordingOriginals).values({
              id: originalId,
              ownerId,
              uploadId: id,
              sourceId,
              sha256: upload.sha256,
              byteLength: upload.byteLength,
              inspectionVersion: gpxInspectionVersion,
              inspectionJobId,
              retained: !upload.batchId,
            });
          } else if (!upload.batchId && !prior.retained) {
            await tx
              .update(recordingOriginals)
              .set({ retained: true })
              .where(eq(recordingOriginals.id, originalId));
          }
          await tx.insert(recordingImports).values({ id, ownerId, originalId });
          await tx
            .update(recordingUploads)
            .set({ state: "complete" })
            .where(eq(recordingUploads.id, id));
          await queueRecordingJob(tx, boss, recordingReclaimQueue, {
            ownerId,
            id,
          });
          return receipt(tx, { ...upload, state: "complete" });
        }),
      );
    },

    abort(session: VerifiedSession, id: string) {
      return withOwner(session, async (tx) => {
        const upload = await readUpload(tx, id, true);
        if (!upload) return { status: 404 } as const;
        if (upload.batchId) {
          const discarded = await discardBatchFile(tx, boss, upload);
          return discarded
            ? receipt(tx, discarded)
            : ({ status: 409 } as const);
        }
        if (upload.state === "complete") return { status: 409 } as const;
        if (upload.state !== "uploading") return receipt(tx, upload);
        await tx
          .update(recordingUploads)
          .set({ state: "aborted" })
          .where(eq(recordingUploads.id, id));
        await queueRecordingJob(tx, boss, recordingReclaimQueue, {
          ownerId: session.accountId,
          id,
        });
        return receipt(tx, { ...upload, state: "aborted" });
      });
    },
  };
}
