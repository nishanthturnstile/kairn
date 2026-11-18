import { createHash, createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { accounts, identityRecovery } from "./schema.js";

export const localRecoveryEpoch = "kairn-local-initial-recovery-epoch";
export const epochId = "current";

export function identityEpoch(epoch: string) {
  return createHash("sha256").update(epoch).digest("hex");
}

export function epochSigningSecret(secret: string, epoch: string) {
  return createHmac("sha256", secret)
    .update(`kairn-auth:${epoch}`)
    .digest("hex");
}

export async function initializeLocalIdentity(db: Database, epoch: string) {
  await db
    .insert(identityRecovery)
    .values({ id: epochId, epochDigest: identityEpoch(epoch) })
    .onConflictDoNothing();
}

export async function identityIsCurrent(
  tx: DatabaseTransaction,
  digest: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(630006)`);
  const [state] = await tx
    .select()
    .from(identityRecovery)
    .where(eq(identityRecovery.id, epochId));
  return state?.epochDigest === digest;
}

export async function scopeIdentity(
  tx: DatabaseTransaction,
  accountId: string,
) {
  await tx.execute(
    sql`select set_config('kairn.identity_account', ${accountId}, true)`,
  );
}

export async function identityAccount(
  tx: DatabaseTransaction,
  accountId: string,
) {
  await scopeIdentity(tx, accountId);
  const [account] = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for("update");
  return account;
}
