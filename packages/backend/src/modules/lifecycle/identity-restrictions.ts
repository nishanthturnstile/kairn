import { randomUUID } from "node:crypto";
import { eq, isNotNull, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { session, verification } from "../identity/auth-schema.js";
import {
  accounts,
  identityMail,
  identityRecovery,
} from "../identity/schema.js";
import { epochId, identityAccount, identityEpoch } from "../identity/state.js";
import {
  type IdentityRestriction,
  type RestrictionJournal,
  restrictionDigest,
  verifyReceipt,
} from "./restriction-journal.js";
import { auditEvents, restrictionEvents } from "./schema.js";

export const restrictionQueue = "identity.restriction";
const jobPayload = z.object({ id: z.uuid() });

export async function recordIdentityRestriction(
  tx: DatabaseTransaction,
  boss: PgBoss,
  accountId: string,
  action:
    | { operation: "credentials_changed"; sessionId: null }
    | { operation: "device_session_revoked"; sessionId: string },
) {
  const account = await identityAccount(tx, accountId);
  if (!account || account.restrictedAt)
    throw new Error("Identity is unavailable.");
  const event: IdentityRestriction = {
    version: 1,
    id: randomUUID(),
    accountId,
    generation: account.securityGeneration + 1,
    ...action,
  };
  await tx
    .update(accounts)
    .set({ securityGeneration: event.generation })
    .where(eq(accounts.id, accountId));
  await tx.insert(auditEvents).values({
    id: event.id,
    actorId: accountId,
    action: event.operation,
    targetKind: "account",
    targetId: accountId,
  });
  await tx.insert(restrictionEvents).values({
    id: event.id,
    auditEventId: event.id,
    policyGeneration: event.generation,
    affectedSessionId: event.sessionId,
    operation: event.operation,
    integrityDigest: restrictionDigest(event),
  });
  const jobId = await boss.send(
    restrictionQueue,
    { id: event.id },
    {
      id: event.id,
      db: fromDrizzle(tx, sql),
      retryLimit: 12,
      retryDelay: 30,
      retryBackoff: true,
    },
  );
  if (!jobId) throw new Error("Restriction reconciliation was not scheduled.");
  return event;
}

export async function confirmRestriction(
  db: Database,
  journal: RestrictionJournal,
  id: string,
) {
  const [row] = await db
    .select({
      event: restrictionEvents,
      accountId: auditEvents.targetId,
    })
    .from(restrictionEvents)
    .innerJoin(auditEvents, eq(auditEvents.id, restrictionEvents.auditEventId))
    .where(eq(restrictionEvents.id, id));
  if (!row) throw new Error("Restriction record is unavailable.");
  if (row.event.journalSequence) return;
  const {
    operation,
    affectedSessionId: sessionId,
    policyGeneration: generation,
  } = row.event;
  const target = {
    version: 1 as const,
    id,
    accountId: row.accountId,
    generation,
  };
  if (
    operation !== "device_session_revoked" &&
    operation !== "credentials_changed"
  ) {
    throw new Error("Invalid identity restriction.");
  }
  if (operation === "device_session_revoked" && !sessionId)
    throw new Error("Missing revoked session ID.");
  const event: IdentityRestriction =
    operation === "device_session_revoked" && sessionId
      ? { ...target, operation, sessionId }
      : { ...target, operation: "credentials_changed", sessionId: null };
  if (restrictionDigest(event) !== row.event.integrityDigest)
    throw new Error("Invalid restriction digest.");
  const receipt = verifyReceipt(event, await journal.append(event));
  await db
    .update(restrictionEvents)
    .set({
      journalSequence: BigInt(receipt.sequence),
      journalReceipt: receipt.receipt,
    })
    .where(eq(restrictionEvents.id, id));
}

export async function registerIdentityRestrictions(
  boss: PgBoss,
  db: Database,
  journal?: RestrictionJournal,
) {
  if (!journal) return;
  await boss.work(restrictionQueue, { localConcurrency: 1 }, async ([job]) => {
    const { id } = jobPayload.parse(job.data);
    try {
      await confirmRestriction(db, journal, id);
    } catch {
      throw new Error("Restriction awaits independent confirmation.");
    }
  });
}

export async function replayIdentityRestrictions(
  db: Database,
  journal: RestrictionJournal,
  epoch: string,
) {
  const digest = identityEpoch(epoch);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(630006)`);
    const [state] = await tx
      .select()
      .from(identityRecovery)
      .where(eq(identityRecovery.id, epochId))
      .for("update");
    if (state?.epochDigest === digest)
      throw new Error("Restore requires a new recovery epoch.");
    await tx
      .insert(identityRecovery)
      .values({ id: epochId, epochDigest: "0".repeat(64) })
      .onConflictDoUpdate({
        target: identityRecovery.id,
        set: { epochDigest: "0".repeat(64) },
      });
    await tx.delete(session);
    await tx.delete(verification);
    await tx.update(identityMail).set({ state: "expired", ciphertext: null });
  });

  const head = await journal.head();
  const seen = new Set<string>();
  const restoredGenerations = new Map<string, number>();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(630006)`);
    const confirmed = await tx
      .select({
        id: restrictionEvents.id,
        sequence: restrictionEvents.journalSequence,
        digest: restrictionEvents.integrityDigest,
        receipt: restrictionEvents.journalReceipt,
      })
      .from(restrictionEvents)
      .where(isNotNull(restrictionEvents.journalSequence));
    const localReceipts = new Map(confirmed.map((row) => [row.sequence, row]));
    if (
      confirmed.some(
        (row) => row.sequence !== null && row.sequence > BigInt(head),
      )
    ) {
      throw new Error("Restriction journal is missing a confirmed receipt.");
    }
    for (let sequence = 1; sequence <= head; sequence++) {
      const { event, receipt } = await journal.read(sequence);
      if (
        verifyReceipt(event, receipt).sequence !== sequence ||
        seen.has(event.id)
      ) {
        throw new Error("Restriction journal is incomplete.");
      }
      const local = localReceipts.get(BigInt(sequence));
      if (
        local &&
        (event.id !== local.id ||
          receipt.digest !== local.digest ||
          receipt.receipt !== local.receipt)
      ) {
        throw new Error(
          "Restriction journal disagrees with a confirmed receipt.",
        );
      }
      seen.add(event.id);
      const account = await identityAccount(tx, event.accountId);
      if (!account) continue;
      const restoredGeneration =
        restoredGenerations.get(event.accountId) ?? account.securityGeneration;
      restoredGenerations.set(event.accountId, restoredGeneration);
      if (event.generation <= restoredGeneration) continue;
      await tx
        .update(accounts)
        .set({
          securityGeneration: Math.max(
            account.securityGeneration,
            event.generation,
          ),
          ...(event.operation !== "device_session_revoked"
            ? { restrictedAt: new Date() }
            : {}),
        })
        .where(eq(accounts.id, event.accountId));
    }
    if ((await journal.head()) !== head)
      throw new Error("Restriction journal changed during replay.");
    await tx
      .update(identityRecovery)
      .set({ epochDigest: digest })
      .where(eq(identityRecovery.id, epochId));
  });
}
