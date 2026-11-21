import { eq } from "drizzle-orm";
import type { createAuth, VerifiedSession } from "./auth.js";
import { user } from "./auth-schema.js";
import { accounts, type onboardingIntent } from "./schema.js";

type Intent = (typeof onboardingIntent.enumValues)[number];
type CompanionAction =
  | { action: "complete"; intent?: Intent }
  | { action: "select"; journeyId: string }
  | { action: "skip" | "done" };

function progress(step: number | null, intent?: Intent | null) {
  if (step === 1) return { state: "pending", step: 1 } as const;
  if (step === 2 || step === 3) return { state: "pending", step: 2 } as const;
  if (step === 4)
    return { state: "completed", intent: intent ?? undefined } as const;
  return { state: "exempt" } as const;
}

export function createOnboardingService(auth: ReturnType<typeof createAuth>) {
  return (
    session: VerifiedSession,
    confirmation?: { step: number; intent?: Intent },
  ) =>
    auth.withCurrentSession(session, async (tx) => {
      const [account] = await tx
        .select({
          step: accounts.onboardingStep,
          intent: accounts.onboardingIntent,
        })
        .from(accounts)
        .where(eq(accounts.id, session.accountId));
      if (!account) return { status: 401 } as const;
      const current = progress(account.step, account.intent);
      if (
        !confirmation ||
        current.state !== "pending" ||
        confirmation.step < current.step
      )
        return { status: 200, progress: current } as const;
      // An already-open client on the former third screen can still finish.
      if (
        confirmation.step > current.step &&
        account.step !== confirmation.step
      )
        return { status: 409 } as const;
      const nextStep = current.step === 1 ? 2 : 4;
      const intent = nextStep === 4 ? (confirmation.intent ?? null) : null;
      await tx
        .update(accounts)
        .set({ onboardingStep: nextStep, onboardingIntent: intent })
        .where(eq(accounts.id, session.accountId));
      return { status: 200, progress: progress(nextStep, intent) } as const;
    });
}

export function createCompanionSetupService(
  auth: ReturnType<typeof createAuth>,
) {
  const onboarding = createOnboardingService(auth);
  // Older clients can finish required setup through the previous endpoint.
  return async (session: VerifiedSession, command?: CompanionAction) => {
    const result = await onboarding(
      session,
      command?.action === "complete"
        ? { step: 2, intent: command.intent }
        : undefined,
    );
    if (result.status !== 200) return result;
    return {
      status: 200,
      setup: {
        progress: result.progress,
        checkpoint: { state: "unavailable" },
      },
    } as const;
  };
}

export function createProfileService(auth: ReturnType<typeof createAuth>) {
  return (
    session: VerifiedSession,
    displayName?: string,
    inviteDiscoverable?: boolean,
  ) =>
    auth.withCurrentSession(session, async (tx) => {
      const ownsProfile = eq(user.id, session.accountId);
      const [profile] =
        displayName === undefined
          ? await tx
              .select({ displayName: user.name })
              .from(user)
              .where(ownsProfile)
          : await tx
              .update(user)
              .set({ name: displayName })
              .where(ownsProfile)
              .returning({ displayName: user.name });
      const [settings] =
        inviteDiscoverable === undefined
          ? await tx
              .select({ inviteDiscoverable: accounts.inviteDiscoverable })
              .from(accounts)
              .where(eq(accounts.id, session.accountId))
          : await tx
              .update(accounts)
              .set({ inviteDiscoverable })
              .where(eq(accounts.id, session.accountId))
              .returning({ inviteDiscoverable: accounts.inviteDiscoverable });
      return profile && settings
        ? ({ status: 200, profile: { ...profile, ...settings } } as const)
        : ({ status: 401 } as const);
    });
}
