import { describe, expect, it } from "vite-plus/test";
import { invitationBatchNotice } from "../packages/shared/src/journey-invitations";

const queued = {
  status: "queued",
  invitationId: "033f7800-cbb0-4659-b751-f515530721e1",
} as const;

describe("invitation batch feedback", () => {
  it("distinguishes queued and already resolved invitations", () => {
    expect(invitationBatchNotice([queued])).toEqual({
      text: "1 invitation queued.",
      tone: "success",
    });
    expect(invitationBatchNotice([{ status: "already_pending" }])).toEqual({
      text: "No invitations were queued.",
      tone: "info",
    });
  });

  it("calls out partial and complete failures", () => {
    expect(invitationBatchNotice([queued, { status: "rate_limited" }])).toEqual(
      {
        text: "1 invitation queued. 1 recipient needs attention.",
        tone: "warning",
      },
    );
    expect(
      invitationBatchNotice([
        { status: "invalid_email" },
        { status: "rate_limited" },
      ]),
    ).toEqual({
      text: "No invitations were queued. 2 recipients need attention.",
      tone: "error",
    });
  });
});
