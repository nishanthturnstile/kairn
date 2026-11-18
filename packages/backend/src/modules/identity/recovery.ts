import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/index.js";
import { auditEvents } from "../lifecycle/schema.js";
import { account, session, user, verification } from "./auth-schema.js";
import { accounts } from "./schema.js";
import { identityAccount, identityEpoch, identityIsCurrent } from "./state.js";

export async function approveCredentialRecovery(
  db: Database,
  input: { accountId: string; verifiedEmail: string; epoch: string },
) {
  const accountId = z.uuid().parse(input.accountId);
  const email = z.email().parse(input.verifiedEmail).toLowerCase();
  const digest = identityEpoch(input.epoch);

  // Only the migration operator can supply independently verified identity evidence.
  await db.transaction(async (tx) => {
    if (!(await identityIsCurrent(tx, digest)))
      throw new Error("Complete journal replay before approving recovery.");
    const current = await identityAccount(tx, accountId);
    if (!current?.restrictedAt || !current.credentialRecovery)
      throw new Error("Account has no eligible credential recovery lock.");

    await tx
      .update(user)
      .set({ email, emailVerified: true })
      .where(eq(user.id, accountId));
    await tx
      .update(account)
      .set({ password: null })
      .where(
        and(
          eq(account.providerId, "credential"),
          eq(account.userId, accountId),
        ),
      );
    await tx.delete(session).where(eq(session.userId, accountId));
    await tx.delete(verification).where(eq(verification.value, accountId));
    await tx
      .update(accounts)
      .set({ credentialRecovery: "approved" })
      .where(eq(accounts.id, accountId));
    await tx.insert(auditEvents).values({
      id: randomUUID(),
      action: "credential_recovery_approved",
      targetKind: "account",
      targetId: accountId,
    });
  });
}
