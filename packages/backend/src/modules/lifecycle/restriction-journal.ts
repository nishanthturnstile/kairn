import { createHash } from "node:crypto";
import { z } from "zod";

const target = z.object({
  version: z.literal(1),
  id: z.uuid(),
  accountId: z.uuid(),
  generation: z.int().positive(),
});
const eventSchema = z.discriminatedUnion("operation", [
  target.extend({
    operation: z.literal("device_session_revoked"),
    sessionId: z.uuid(),
  }),
  target.extend({
    operation: z.enum(["credentials_changed", "account_restriction"]),
    sessionId: z.null(),
  }),
]);
export type IdentityRestriction = z.infer<typeof eventSchema>;

const receiptSchema = z.object({
  eventId: z.uuid(),
  sequence: z.int().positive(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  receipt: z.string().min(1).max(2048),
});
type Receipt = z.infer<typeof receiptSchema>;
const journalRecord = z.object({ event: eventSchema, receipt: receiptSchema });

export interface RestrictionJournal {
  append(event: IdentityRestriction): Promise<Receipt>;
  head(): Promise<number>;
  read(
    sequence: number,
  ): Promise<{ event: IdentityRestriction; receipt: Receipt }>;
}

export function restrictionDigest(event: IdentityRestriction) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        event.version,
        event.id,
        event.operation,
        event.accountId,
        event.sessionId,
        event.generation,
      ]),
    )
    .digest("hex");
}

export function verifyReceipt(event: IdentityRestriction, receipt: unknown) {
  const verified = receiptSchema.parse(receipt);
  if (
    verified.eventId !== event.id ||
    verified.digest !== restrictionDigest(event)
  ) {
    throw new Error("Restriction journal receipt did not match the event.");
  }
  return verified;
}

export function openRestrictionJournal(
  endpoint: string,
  credential: string,
): RestrictionJournal {
  const origin = new URL(endpoint);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Expected a private HTTPS restriction journal endpoint.");
  }
  const base = origin.href.replace(/\/$/, "");
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${base}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error("Restriction journal request failed.");
    return response.json();
  }
  return {
    async append(event) {
      return verifyReceipt(
        event,
        await request(`events/${event.id}`, {
          method: "PUT",
          body: JSON.stringify({ event, digest: restrictionDigest(event) }),
        }),
      );
    },
    async head() {
      return z
        .object({ sequence: z.int().nonnegative() })
        .parse(await request("head")).sequence;
    },
    async read(sequence) {
      const entry = journalRecord.parse(await request(`sequence/${sequence}`));
      verifyReceipt(entry.event, entry.receipt);
      return entry;
    },
  };
}
