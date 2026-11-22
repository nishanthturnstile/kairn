import { journeyPath } from "@kairn/contracts/journeys";
import type { Href } from "expo-router";
import { invitationPath } from "./invitation-link";

export const returnLifetime = 24 * 60 * 60 * 1000;

export type WorkspaceTarget =
  | "/dashboard"
  | "/journeys"
  | "/journeys/new"
  | "/discover"
  | "/saved"
  | typeof invitationPath
  | `/journeys/${string}/invite`
  | `/journeys/${string}/people`
  | `/journeys/${string}`;

export function workspaceTarget(value: unknown): WorkspaceTarget | undefined {
  if (
    value === "/dashboard" ||
    value === "/journeys" ||
    value === "/journeys/new" ||
    value === "/discover" ||
    value === "/saved" ||
    value === invitationPath
  )
    return value;
  if (typeof value !== "string" || !value.startsWith("/journeys/")) return;
  const match = /^\/journeys\/([^/]+)(\/(?:invite|people))?$/.exec(value);
  const result = journeyPath.safeParse({ journeyId: match?.[1] });
  if (result.success)
    return match?.[2] === "/invite"
      ? `/journeys/${result.data.journeyId}/invite`
      : match?.[2] === "/people"
        ? `/journeys/${result.data.journeyId}/people`
        : `/journeys/${result.data.journeyId}`;
}

export function workspaceHref(target?: WorkspaceTarget): Href {
  if (!target) return "/dashboard";
  if (
    target === "/dashboard" ||
    target === "/journeys" ||
    target === "/journeys/new" ||
    target === "/discover" ||
    target === "/saved" ||
    target === invitationPath
  )
    return target;
  return {
    pathname: target.endsWith("/invite")
      ? "/journeys/[journeyId]/invite"
      : target.endsWith("/people")
        ? "/journeys/[journeyId]/people"
        : "/journeys/[journeyId]",
    params: { journeyId: target.split("/")[2] },
  };
}

export function workspaceReturnLabel(target: WorkspaceTarget) {
  if (target === invitationPath) return "Continue to invitation";
  if (target === "/dashboard") return "Go to Dashboard";
  if (target === "/journeys") return "Continue to Journeys";
  if (target === "/journeys/new") return "Continue to journey creation";
  if (target === "/discover") return "Continue to Discover";
  if (target === "/saved") return "Continue to Saved";
  if (target.endsWith("/invite")) return "Continue to invite people";
  if (target.endsWith("/people")) return "Continue to People";
  return "Continue to journey";
}

export type ReturnHandoff = {
  target: WorkspaceTarget;
  accountId: string;
  expiresAt: number;
  finishAtDashboard?: true;
};

export function setupExit(handoff?: ReturnHandoff): {
  target?: WorkspaceTarget;
  dismissInvitation: boolean;
} {
  return {
    target: handoff?.finishAtDashboard ? "/dashboard" : handoff?.target,
    dismissInvitation:
      handoff?.finishAtDashboard === true && handoff.target === invitationPath,
  };
}

export function liveExpiry(value: unknown, now: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > now &&
    value <= now + returnLifetime
  );
}

export function readReturnHandoff(
  raw: string | null,
  now: number,
): ReturnHandoff | undefined {
  if (!raw) return;
  try {
    const value = JSON.parse(raw);
    const target = workspaceTarget(value?.target);
    if (
      target &&
      typeof value.accountId === "string" &&
      journeyPath.safeParse({ journeyId: value.accountId }).success &&
      liveExpiry(value.expiresAt, now)
    ) {
      return {
        target,
        accountId: value.accountId,
        expiresAt: value.expiresAt,
        ...(value.finishAtDashboard === true && { finishAtDashboard: true }),
      };
    }
  } catch {
    // Invalid stored values cannot supply a destination.
  }
}
