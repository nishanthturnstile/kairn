import { journeyPath } from "@kairn/contracts/journeys";
import type { Href } from "expo-router";

export const returnLifetime = 24 * 60 * 60 * 1000;

export type WorkspaceTarget =
  | "/journeys"
  | "/journeys/new"
  | "/discover"
  | "/saved"
  | `/journeys/${string}`;

export function workspaceTarget(value: unknown): WorkspaceTarget | undefined {
  if (
    value === "/journeys" ||
    value === "/journeys/new" ||
    value === "/discover" ||
    value === "/saved"
  )
    return value;
  if (typeof value !== "string" || !value.startsWith("/journeys/")) return;
  const result = journeyPath.safeParse({
    journeyId: value.slice("/journeys/".length),
  });
  if (result.success) return `/journeys/${result.data.journeyId}`;
}

export function workspaceHref(target?: WorkspaceTarget): Href {
  if (!target) return "/dashboard";
  if (
    target === "/journeys" ||
    target === "/journeys/new" ||
    target === "/discover" ||
    target === "/saved"
  )
    return target;
  return {
    pathname: "/journeys/[journeyId]",
    params: { journeyId: target.slice("/journeys/".length) },
  };
}

export function workspaceReturnLabel(target: WorkspaceTarget) {
  if (target === "/journeys") return "Continue to Journeys";
  if (target === "/journeys/new") return "Continue to journey creation";
  if (target === "/discover") return "Continue to Discover";
  if (target === "/saved") return "Continue to Saved";
  return "Continue to journey";
}

export type ReturnHandoff = {
  target: WorkspaceTarget;
  accountId: string;
  expiresAt: number;
};

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
      return { target, accountId: value.accountId, expiresAt: value.expiresAt };
    }
  } catch {
    // Invalid stored values cannot supply a destination.
  }
}
