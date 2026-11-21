import { createHash } from "node:crypto";
import { z } from "zod";

const target = z.object({
  version: z.literal(1),
  id: z.uuid(),
  accountId: z.uuid(),
  generation: z.int().positive(),
});
const identityEvent = z.discriminatedUnion("operation", [
  target.extend({
    operation: z.literal("device_session_revoked"),
    sessionId: z.uuid(),
  }),
  target.extend({
    operation: z.enum(["credentials_changed", "account_restriction"]),
    sessionId: z.null(),
  }),
]);
const membershipEvent = z.strictObject({
  version: z.literal(2),
  id: z.uuid(),
  operation: z.literal("membership_revocation"),
  accountId: z.uuid(),
  journeyId: z.uuid(),
  membershipGeneration: z.uuid(),
  generation: z.int().positive().max(2_147_483_647),
});
export const restrictionEvent = z.union([identityEvent, membershipEvent]);
export type IdentityRestriction = z.infer<typeof identityEvent>;
export type RestrictionEvent = z.infer<typeof restrictionEvent>;

const receiptSchema = z.object({
  eventId: z.uuid(),
  sequence: z.int().positive(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  receipt: z.string().min(1).max(2048),
});
type Receipt = z.infer<typeof receiptSchema>;
export const journalCheckpoint = z.union([
  z.strictObject({
    sequence: z.literal(0),
    independentlyVerifiedEmpty: z.literal(true),
  }),
  receiptSchema,
]);
export type JournalCheckpoint = z.infer<typeof journalCheckpoint>;
const journalRecord = z.object({
  event: restrictionEvent,
  receipt: receiptSchema,
});

export interface RestrictionJournal {
  append(event: RestrictionEvent): Promise<Receipt>;
  head(): Promise<number>;
  read(
    sequence: number,
  ): Promise<{ event: RestrictionEvent; receipt: Receipt }>;
}

export function restrictionDigest(event: RestrictionEvent) {
  const scope =
    event.version === 1
      ? [event.sessionId]
      : [event.journeyId, event.membershipGeneration];
  return createHash("sha256")
    .update(
      JSON.stringify([
        event.version,
        event.id,
        event.operation,
        event.accountId,
        ...scope,
        event.generation,
      ]),
    )
    .digest("hex");
}

export function verifyReceipt(input: unknown, receipt: unknown) {
  const event = restrictionEvent.parse(input);
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
