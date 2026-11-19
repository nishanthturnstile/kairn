import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const historyCursor = z.object({
  version: z.literal(1),
  section: z.enum(["upcoming", "recent"]),
  asOf: z.iso.datetime(),
  at: z.iso.datetime(),
  journeyId: z.uuid(),
  undated: z.boolean(),
});

export type HistoryCursor = z.infer<typeof historyCursor>;
export type HistorySection = HistoryCursor["section"];

export function createHistoryCursorCodec(secret: string, epoch: string) {
  const key = createHmac("sha256", secret)
    .update("kairn-journey-history:")
    .update(epoch)
    .digest();

  function signature(accountId: string, payload: string) {
    return createHmac("sha256", key)
      .update(accountId)
      .update(".")
      .update(payload)
      .digest("base64url");
  }

  return {
    encode(accountId: string, cursor: HistoryCursor) {
      const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
      return `${payload}.${signature(accountId, payload)}`;
    },
    decode(accountId: string, section: HistorySection, cursor: string) {
      const [payload, supplied, extra] = cursor.split(".");
      if (!payload || !supplied || extra !== undefined) return;

      const expected = Buffer.from(signature(accountId, payload));
      const actual = Buffer.from(supplied);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        return;

      let json: unknown;
      try {
        json = JSON.parse(Buffer.from(payload, "base64url").toString());
      } catch {
        return;
      }
      const decoded = historyCursor.safeParse(json);
      if (decoded.success && decoded.data.section === section)
        return decoded.data;
    },
  };
}
