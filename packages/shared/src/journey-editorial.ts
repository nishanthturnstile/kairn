import {
  type EditorialCapability,
  type PrivateJourney,
  updateEditorialCapability,
} from "@kairn/contracts/journeys";
import { z } from "zod";

export const editorialRoles = {
  coauthor: { label: "Coauthor", permission: "edit the shared draft" },
  publisher: { label: "Publisher", permission: "approve publication" },
} satisfies Record<EditorialCapability, { label: string; permission: string }>;

export function journeyRoleLabel(
  capabilities: readonly PrivateJourney["capabilities"][number][],
) {
  if (capabilities.includes("administrator")) return "Organiser";
  const editorial = (["coauthor", "publisher"] as const)
    .filter((capability) => capabilities.includes(capability))
    .map((capability) => editorialRoles[capability].label);
  return editorial.join(" · ") || "Participant";
}

export function editorialActionLabel(
  capability: EditorialCapability,
  enabled: boolean,
) {
  return `${enabled ? "Assign" : "Revoke"} ${editorialRoles[capability].label.toLowerCase()}`;
}

export function editorialChangeDescription(
  capability: EditorialCapability,
  enabled: boolean,
) {
  const permission = editorialRoles[capability].permission;
  const other = capability === "coauthor" ? "publisher" : "coauthor";
  if (enabled)
    return `They’ll be able to review contributed sources and ${permission}.`;
  return `They’ll lose permission to ${permission}. They can still review other members’ contributed sources if they also hold the ${other} role.`;
}

export function editorialChangeNotice(
  capability: EditorialCapability,
  enabled: boolean,
) {
  return `${editorialRoles[capability].label} ${enabled ? "assigned" : "revoked"}.`;
}

const editorialAction = updateEditorialCapability
  .omit({ membershipGeneration: true })
  .extend({
    type: z.literal("editorial"),
    person: z.object({
      accountId: z.uuid(),
      membershipGeneration: z.uuid(),
      displayName: z.string(),
    }),
  });
export type EditorialAction = z.infer<typeof editorialAction>;
const editorialAttempt = z.object({
  action: editorialAction,
  state: z.enum(["pending", "uncertain"]),
  expiresAt: z.int().positive(),
});
const editorialAttempts = z.array(editorialAttempt);
type EditorialAttempt = z.infer<typeof editorialAttempt>;
const attemptLifetime = 24 * 60 * 60_000;

export function editorialRoleKey({ person, capability }: EditorialAction) {
  return `${person.accountId}:${person.membershipGeneration}:${capability}`;
}

export function createEditorialAttemptStore(
  read: (key: string) => string | null,
  write: (key: string, value: string) => void,
) {
  const fallback = new Map<string, EditorialAttempt[]>();
  function load(key: string) {
    const now = Date.now();
    let attempts = fallback.get(key);
    if (!attempts) {
      try {
        const raw = read(key);
        const parsed = editorialAttempts.safeParse(raw ? JSON.parse(raw) : []);
        attempts = parsed.success ? parsed.data : [];
      } catch {
        attempts = [];
      }
    }
    return attempts.filter(
      ({ expiresAt }) => expiresAt > now && expiresAt <= now + attemptLifetime,
    );
  }
  return {
    load,
    update(
      key: string,
      action: EditorialAction,
      state?: EditorialAttempt["state"],
    ) {
      const attemptKey = editorialRoleKey(action);
      const stored = load(key);
      const previous = stored.find(
        (entry) => editorialRoleKey(entry.action) === attemptKey,
      );
      const attempts = stored.filter((entry) => entry !== previous);
      if (state) {
        const replay =
          previous?.action.expectedRevision === action.expectedRevision &&
          previous.action.enabled === action.enabled;
        attempts.push({
          action: editorialAction.parse(action),
          state: replay && previous.state === "pending" ? "pending" : state,
          expiresAt: replay ? previous.expiresAt : Date.now() + attemptLifetime,
        });
      }
      try {
        write(key, JSON.stringify(attempts));
        fallback.delete(key);
      } catch {
        fallback.set(key, attempts);
      }
      return attempts;
    },
  };
}

export function editorialAttemptNotice({ action, state }: EditorialAttempt) {
  const { person, capability, enabled } = action;
  return state === "pending"
    ? `${editorialRoles[capability].label} revoked for ${person.displayName}. Confirmation is pending.`
    : `Couldn’t confirm the request to ${editorialActionLabel(capability, enabled).toLowerCase()} for ${person.displayName}.`;
}

export function editorialAttemptActionLabel({
  action,
  state,
}: EditorialAttempt) {
  return state === "pending"
    ? `Check ${action.capability} revocation for ${action.person.displayName}`
    : `Retry ${action.capability} change for ${action.person.displayName}`;
}
