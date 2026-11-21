import {
  exchangeJourneyInvitation,
  journeyInvitationOperation,
  journeyPath,
  reviewJourneyInvitation,
} from "@kairn/contracts/journeys";

export const invitationPath = "/journey-invitations";
const receiptWindow = 24 * 60 * 60_000;

export type InvitationHandoff = {
  continuation?: string;
  expiresAt: number;
  accountId?: string;
  operationId?: string;
};

export function invitationLink(
  path: string,
  origin?: string,
  development = false,
) {
  try {
    const url = new URL(path, "https://local.invalid");
    const appLink = url.protocol === "kairn:";
    const route = appLink
      ? `/${url.hostname}${url.pathname}`.replace(/^\/\//, "/")
      : url.pathname;
    if (route.replace(/\/$/, "") !== invitationPath) return;
    const trusted =
      !url.username &&
      !url.password &&
      ((url.origin === origin &&
        (url.protocol === "https:" ||
          (development && url.protocol === "http:"))) ||
        (appLink && development && !url.port));
    const parsed = exchangeJourneyInvitation.safeParse({
      token: url.hash.slice(1),
    });
    return { token: trusted && parsed.success ? parsed.data.token : undefined };
  } catch {
    return undefined;
  }
}

export function activeInvitation(value: InvitationHandoff, now: number) {
  if (now < value.expiresAt && value.continuation) return value;
  if (
    value.accountId &&
    value.operationId &&
    now < value.expiresAt + receiptWindow
  )
    return { ...value, continuation: undefined };
}

export function invitationDeadline(value: InvitationHandoff) {
  return value.continuation ? value.expiresAt : value.expiresAt + receiptWindow;
}

export function restoreInvitation(raw: string | null, now: number) {
  if (!raw) return;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value?.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt > now + 7 * receiptWindow ||
      (value.accountId !== undefined &&
        !journeyPath.safeParse({ journeyId: value.accountId }).success) ||
      (value.operationId !== undefined &&
        (!value.accountId ||
          !journeyInvitationOperation.safeParse({
            operationId: value.operationId,
          }).success)) ||
      (value.continuation !== undefined &&
        !reviewJourneyInvitation.safeParse({ continuation: value.continuation })
          .success)
    )
      return;
    return activeInvitation(
      {
        expiresAt: value.expiresAt,
        continuation: value.continuation,
        accountId: value.accountId,
        operationId: value.operationId,
      },
      now,
    );
  } catch {
    return undefined;
  }
}
