import type { journeyInvitationBatchResult } from "@kairn/contracts/journeys";

type Item = ReturnType<
  typeof journeyInvitationBatchResult.parse
>["items"][number];

export function invitationBatchNotice(items: readonly Item[]) {
  const queued = items.filter(({ status }) => status === "queued").length;
  const failed = items.filter(
    ({ status }) => status === "invalid_email" || status === "rate_limited",
  ).length;
  const summary = queued
    ? `${queued} ${queued === 1 ? "invitation" : "invitations"} queued.`
    : "No invitations were queued.";
  if (!failed)
    return {
      text: summary,
      tone: queued ? ("success" as const) : ("info" as const),
    };
  const attention =
    failed === 1
      ? "1 recipient needs attention."
      : `${failed} recipients need attention.`;
  return {
    text: `${summary} ${attention}`,
    tone: queued ? ("warning" as const) : ("error" as const),
  };
}
