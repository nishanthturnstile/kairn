import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { logger } from "../../logger.js";
import type { createAuth } from "../identity/auth.js";
import { session, verification } from "../identity/auth-schema.js";
import {
  accounts,
  identityMail,
  identityRecovery,
} from "../identity/schema.js";
import {
  epochId,
  identityAccount,
  identityEpoch,
  identityIsCurrent,
  localRecoveryEpoch,
} from "../identity/state.js";
import { originalExportGrants } from "../sources/schema.js";
import {
  type IdentityRestriction,
  type JournalCheckpoint,
  journalCheckpoint,
  type RestrictionJournal,
  restrictionDigest,
  restrictionEvent,
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
  await enqueueRestrictionConfirmation(tx, boss, event.id);
  return event;
}

export async function enqueueRestrictionConfirmation(
  tx: DatabaseTransaction,
  boss: PgBoss,
  id: string,
) {
  const jobId = await boss.send(
    restrictionQueue,
    { id },
    {
      id,
      db: fromDrizzle(tx, sql),
      retryLimit: 12,
      retryDelay: 30,
      retryBackoff: true,
    },
  );
  if (!jobId) throw new Error("Restriction reconciliation was not scheduled.");
}

async function readRecordedRestriction(tx: DatabaseTransaction, id: string) {
  const [row] = await tx
    .select({
      event: restrictionEvents,
      accountId: auditEvents.targetId,
    })
    .from(restrictionEvents)
    .innerJoin(auditEvents, eq(auditEvents.id, restrictionEvents.auditEventId))
    .where(
      and(eq(restrictionEvents.id, id), eq(auditEvents.targetKind, "account")),
    );
  if (row) {
    const {
      operation,
      affectedSessionId,
      policyGeneration,
      integrityDigest,
      journalSequence,
    } = row.event;
    return {
      event: restrictionEvent.parse({
        version: 1,
        id,
        operation,
        accountId: row.accountId,
        sessionId: affectedSessionId,
        generation: policyGeneration,
      }),
      digest: integrityDigest,
      confirmed: journalSequence !== null,
      earlierPending: false,
    };
  }

  const { rows } = await tx.execute<{ record: unknown }>(sql`
    select coalesce(
      kairn.read_membership_restriction(${id}::uuid),
      kairn.read_source_withdrawal(${id}::uuid),
      kairn.read_editorial_capability_removal(${id}::uuid),
      kairn.read_source_narrowing(${id}::uuid),
      kairn.read_original_export_revocation(${id}::uuid)
    ) as record
  `);
  return z
    .object({
      event: restrictionEvent,
      digest: z.string(),
      confirmed: z.boolean(),
      earlierPending: z.boolean(),
    })
    .parse(rows[0]?.record);
}

// The caller holds the shared recovery lock. The local restriction has already committed.
export async function confirmRecordedRestriction(
  tx: DatabaseTransaction,
  journal: RestrictionJournal,
  id: string,
) {
  const { event, digest, confirmed, earlierPending } =
    await readRecordedRestriction(tx, id);
  if (restrictionDigest(event) !== digest)
    throw new Error("Invalid restriction digest.");
  if (confirmed) return;
  // Recovery needs the earlier denial before it can apply the later restriction.
  if (earlierPending)
    throw new Error("An earlier restriction awaits confirmation.");

  const receipt = verifyReceipt(event, await journal.append(event));
  if (event.version === 2) {
    await tx.execute(sql`
      select kairn.confirm_membership_restriction(
        ${id}::uuid, ${digest}, ${receipt.sequence}::bigint, ${receipt.receipt}
      )
    `);
    return;
  }
  if (event.version === 3) {
    await tx.execute(sql`
      select kairn.confirm_source_withdrawal(
        ${id}::uuid, ${digest}, ${receipt.sequence}::bigint, ${receipt.receipt}
      )
    `);
    return;
  }
  if (event.version === 4) {
    await tx.execute(sql`
      select kairn.confirm_editorial_capability_removal(
        ${id}::uuid, ${digest}, ${receipt.sequence}::bigint, ${receipt.receipt}
      )
    `);
    return;
  }
  if (event.version === 5) {
    await tx.execute(sql`
      select kairn.confirm_source_narrowing(
        ${id}::uuid, ${digest}, ${receipt.sequence}::bigint, ${receipt.receipt}
      )
    `);
    return;
  }
  if (event.version === 6) {
    await tx.execute(sql`
      select kairn.confirm_original_export_revocation(
        ${id}::uuid, ${digest}, ${receipt.sequence}::bigint, ${receipt.receipt}
      )
    `);
    return;
  }
  await tx
    .update(restrictionEvents)
    .set({
      journalSequence: BigInt(receipt.sequence),
      journalReceipt: receipt.receipt,
    })
    .where(
      and(
        eq(restrictionEvents.id, id),
        isNull(restrictionEvents.journalSequence),
      ),
    );
}

export async function finishRecordedRestriction(
  auth: Pick<ReturnType<typeof createAuth>, "withCurrentRecoveryEpoch">,
  journal: RestrictionJournal | undefined,
  { eventId, confirmed }: { eventId: string; confirmed: boolean },
) {
  if (confirmed)
    return { status: 200, eventId, confirmation: "confirmed" } as const;
  if (journal) {
    const result = await auth.withCurrentRecoveryEpoch(async (tx) => {
      await confirmRecordedRestriction(tx, journal, eventId);
      return { status: 200 };
    });
    if (result.status === 200)
      return { status: 200, eventId, confirmation: "confirmed" } as const;
  }
  return { status: 202, eventId, confirmation: "pending" } as const;
}

export async function confirmRestriction(
  db: Database,
  journal: RestrictionJournal,
  id: string,
  epoch = localRecoveryEpoch,
) {
  await db.transaction(async (tx) => {
    if (!(await identityIsCurrent(tx, identityEpoch(epoch))))
      throw new Error("The restriction worker recovery epoch is not current.");
    await confirmRecordedRestriction(tx, journal, id);
  });
}

export async function registerIdentityRestrictions(
  boss: PgBoss,
  db: Database,
  journal?: RestrictionJournal,
  epoch = localRecoveryEpoch,
) {
  if (!journal) return;
  await boss.work(restrictionQueue, { localConcurrency: 1 }, async ([job]) => {
    const { id } = jobPayload.parse(job.data);
    try {
      await confirmRestriction(db, journal, id, epoch);
    } catch {
      logger.warn(
        { jobId: job.id, eventId: id },
        "Restriction awaits independent confirmation",
      );
      throw new Error("Restriction awaits independent confirmation.");
    }
  });
}

export async function replayIdentityRestrictions(
  db: Database,
  journal: RestrictionJournal,
  epoch: string,
  checkpoint: JournalCheckpoint,
) {
  const digest = identityEpoch(epoch);
  const expected = journalCheckpoint.parse(checkpoint);
  const closed = "0".repeat(64);
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
      .values({ id: epochId, epochDigest: closed })
      .onConflictDoUpdate({
        target: identityRecovery.id,
        set: { epochDigest: closed },
      });
    await tx.delete(session);
    await tx.delete(verification);
    await tx.update(identityMail).set({ state: "expired", ciphertext: null });
    await tx
      .update(accounts)
      .set({ credentialRecovery: "required" })
      .where(eq(accounts.credentialRecovery, "approved"));
  });

  const head = await journal.head();
  if (head !== expected.sequence) {
    throw new Error(
      "Restriction journal head does not match the trusted checkpoint.",
    );
  }
  const seen = new Set<string>();
  const restoredGenerations = new Map<string, number>();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(630006)`);
    const [state] = await tx
      .select()
      .from(identityRecovery)
      .where(eq(identityRecovery.id, epochId));
    if (state?.epochDigest !== closed)
      throw new Error("Identity recovery gate is no longer closed.");
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
      const entry = await journal.read(sequence);
      const event = restrictionEvent.parse(entry.event);
      const receipt = verifyReceipt(event, entry.receipt);
      if (receipt.sequence !== sequence || seen.has(event.id.toLowerCase())) {
        throw new Error("Restriction journal is incomplete.");
      }
      if (
        sequence === head &&
        "eventId" in expected &&
        (receipt.eventId !== expected.eventId ||
          receipt.digest !== expected.digest ||
          receipt.receipt !== expected.receipt)
      ) {
        throw new Error(
          "Restriction journal receipt does not match the trusted checkpoint.",
        );
      }
      const local = localReceipts.get(BigInt(sequence));
      let receiptPersisted = local !== undefined;
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
      if (!local) {
        const [pending] = await tx
          .select({
            digest: restrictionEvents.integrityDigest,
            sequence: restrictionEvents.journalSequence,
          })
          .from(restrictionEvents)
          .where(eq(restrictionEvents.id, event.id));
        if (pending) {
          if (pending.digest !== receipt.digest || pending.sequence !== null)
            throw new Error(
              "Restriction journal disagrees with a local event.",
            );
          await tx
            .update(restrictionEvents)
            .set({
              journalSequence: BigInt(sequence),
              journalReceipt: receipt.receipt,
            })
            .where(eq(restrictionEvents.id, event.id));
          receiptPersisted = true;
        }
      }

      seen.add(event.id.toLowerCase());
      if (event.version === 2) {
        await tx.execute(sql`
          select kairn.apply_journey_membership_revocation(
            ${event.journeyId}::uuid, ${event.accountId}::uuid, ${event.membershipGeneration}::uuid, ${event.generation}::integer
          )
        `);
        continue;
      }
      if (event.version === 3) {
        await tx.execute(sql`
          select kairn.apply_source_withdrawal(
            ${event.journeyId}::uuid, ${event.sourceId}::uuid, ${event.accountId}::uuid, ${event.generation}::integer
          )
        `);
        continue;
      }
      if (event.version === 4) {
        await tx.execute(sql`
          select kairn.apply_editorial_capability_removal(
            ${event.journeyId}::uuid, ${event.accountId}::uuid, ${event.membershipGeneration}::uuid,
            ${event.capability}::kairn.journey_capability, ${event.generation}::integer
          )
        `);
        continue;
      }
      if (event.version === 5) {
        await tx.execute(sql`
          select kairn.apply_source_restriction(
            ${event.journeyId}::uuid, ${event.sourceId}::uuid, ${event.accountId}::uuid, ${event.generation}::integer, false
          )
        `);
        continue;
      }
      if (event.version === 6) {
        await tx.execute(sql`
          select kairn.apply_original_export_revocation(
            ${event.journeyId}::uuid, ${event.grantId}::uuid, ${event.accountId}::uuid
          )
        `);
        if (!receiptPersisted) {
          const [grant] = await tx
            .select({ id: originalExportGrants.id })
            .from(originalExportGrants)
            .where(
              and(
                eq(originalExportGrants.id, event.grantId),
                eq(originalExportGrants.journeyId, event.journeyId),
                eq(originalExportGrants.ownerId, event.accountId),
              ),
            );
          // The owner can retry against the original receipt after restoring an older request.
          if (grant) {
            await tx.insert(auditEvents).values({
              id: event.id,
              actorId: event.accountId,
              action: event.operation,
              targetKind: "original_export_grant",
              targetId: grant.id,
              journeyId: event.journeyId,
            });
            await tx.insert(restrictionEvents).values({
              id: event.id,
              auditEventId: event.id,
              operation: event.operation,
              policyGeneration: event.generation,
              integrityDigest: receipt.digest,
              journalSequence: BigInt(receipt.sequence),
              journalReceipt: receipt.receipt,
            });
          }
        }
        continue;
      }
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
          ...(event.operation === "account_restriction"
            ? { restrictedAt: new Date(), credentialRecovery: null }
            : event.operation === "credentials_changed" &&
                (!account.restrictedAt || account.credentialRecovery)
              ? {
                  restrictedAt: new Date(),
                  credentialRecovery: "required" as const,
                }
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
