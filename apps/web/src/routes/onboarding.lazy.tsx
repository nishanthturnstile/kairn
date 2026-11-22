import type { AdvanceOnboarding, OnboardingIntent } from "@kairn/contracts";
import { createLazyFileRoute, Navigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CompassIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ProfileName } from "../components/profile-name";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Radio } from "../components/ui/selection";
import { JourneyRequestError, journeyResult } from "../lib/journey-api";
import { journeyIntentCopy } from "../lib/journey-intent-copy";
import {
  boundJourneyReturn,
  rememberSetupExit,
  workspaceDestination,
} from "../lib/journey-return";
import { onboardingKey, useOnboarding } from "../lib/onboarding";
import { useSessionAccess } from "../lib/session-access";
import "../components/onboarding/setup.css";

export const Route = createLazyFileRoute("/onboarding")({
  component: Onboarding,
});

const steps = [
  {
    title: "Welcome to Kairn",
    description:
      "Keep your plans and past journeys together. Every journey starts private.",
  },
  {
    title: "What would you like to do first?",
    description: "Your choice sets the first action on your Dashboard.",
  },
] as const;

const choices = [
  {
    value: "plan",
    icon: CalendarDaysIcon,
    title: journeyIntentCopy.plan.action,
    description: journeyIntentCopy.plan.choice,
  },
  {
    value: "record",
    icon: BookOpenIcon,
    title: journeyIntentCopy.record.action,
    description: journeyIntentCopy.record.choice,
  },
  {
    value: "look",
    icon: CompassIcon,
    title: "Look around",
    description: "Open your Dashboard and decide later.",
  },
] as const;

type AdvanceAction = "continue" | "dashboard";

const finishLabels = {
  "/dashboard": "Go to Dashboard",
  "/journeys": "Continue to Journeys",
  "/journeys/new": "Continue to journey creation",
  "/journeys/$journeyId": "Continue to journey",
  "/journeys/$journeyId/invite": "Continue to invite people",
  "/journeys/$journeyId/people": "Continue to People",
  "/saved": "Continue to Saved",
  "/discover": "Continue to Discover",
  "/journey-invitations": "Continue to invitation",
} as const;

function Onboarding() {
  const { scope } = Route.useRouteContext();
  const { refresh } = useSessionAccess();
  const progress = useOnboarding();
  const [reviewingWelcome, setReviewingWelcome] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [intent, setIntent] = useState<OnboardingIntent>();
  const [pendingAction, setPendingAction] = useState<AdvanceAction>();
  const busy = pendingAction !== undefined;
  const [failure, setFailure] = useState<{
    step: 1 | 2;
    action: AdvanceAction;
  }>();
  const progressId = useId();
  const descriptionId = useId();
  const failureId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const saving = useRef(false);

  const checkpoint =
    progress.data?.state === "pending" ? progress.data.step : undefined;
  const step = checkpoint === 2 && reviewingWelcome ? 1 : checkpoint;
  const failedAction = failure?.step === step ? failure?.action : undefined;
  const accountId = scope.accountId;
  const target = boundJourneyReturn(accountId);

  useEffect(() => {
    if (step) heading.current?.focus();
  }, [step]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function confirm(action: AdvanceAction) {
    if (!step || !checkpoint || !accountId || editingName || saving.current)
      return;
    if (step < checkpoint) {
      setReviewingWelcome(false);
      return;
    }
    saving.current = true;
    setPendingAction(action);
    setFailure(undefined);
    if (step === 2) rememberSetupExit(accountId, action === "dashboard");
    try {
      const body: AdvanceOnboarding = step === 1 ? { step } : { step, intent };
      const response = await scope.api.POST("/api/v1/onboarding", {
        params: { header: { "x-expected-account": accountId } },
        body,
      });
      const result = journeyResult(response, scope, refresh);
      await scope.queryClient.cancelQueries({ queryKey: onboardingKey(scope) });
      scope.signal.throwIfAborted();
      scope.queryClient.setQueryData(onboardingKey(scope), result);
    } catch (error) {
      if (!mounted.current || scope.signal.aborted) return;
      if (
        step === 2 ||
        (error instanceof JourneyRequestError && error.status === 409)
      ) {
        const checked = await progress.refetch();
        if (checked.isSuccess && checked.data.state !== "pending") return;
      }
      if (mounted.current && !scope.signal.aborted)
        setFailure({ step, action });
    } finally {
      saving.current = false;
      if (mounted.current) setPendingAction(undefined);
    }
  }

  if (!step || !accountId) {
    if (!progress.data || progress.data.state === "pending" || busy)
      return null;
    return (
      <Navigate
        {...workspaceDestination(
          boundJourneyReturn(accountId, { afterSetup: true }),
        )}
        replace
      />
    );
  }

  const active = steps[step - 1];
  const welcome = step === 1;
  const finishLabel = finishLabels[workspaceDestination(target).to];
  return (
    <section
      className={
        welcome
          ? "mx-auto grid w-full max-w-[76rem] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 xl:gap-16"
          : "mx-auto w-full max-w-[35.5rem]"
      }
      aria-label={active.title}
    >
      <div className="grid min-w-0 gap-section">
        <header className="grid gap-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p
              id={progressId}
              className="text-sm font-semibold text-muted-foreground"
            >
              Step {step} of {steps.length}
            </p>
            <span aria-hidden="true" className="flex gap-1.5">
              {steps.map(({ title }, index) => (
                <span
                  key={title}
                  data-complete={index < step}
                  className="onboarding-step-meter h-1.5 w-8 rounded-full control-border border-border bg-muted"
                />
              ))}
            </span>
          </div>
          <div className="grid gap-2">
            <h1
              ref={heading}
              tabIndex={-1}
              aria-describedby={`${progressId} ${descriptionId}`}
              className="font-heading text-4xl leading-[1.08] font-bold tracking-[-0.035em] text-pretty outline-none lg:text-[3.25rem]"
            >
              {active.title}
            </h1>
            <p
              id={descriptionId}
              className="max-w-[42ch] text-lg leading-snug text-pretty text-muted-foreground"
            >
              {active.description}
            </p>
          </div>
        </header>

        {welcome ? (
          <section
            aria-label="Profile"
            className="min-w-0 rounded-card control-border border-border bg-card p-inset"
          >
            <ProfileName
              accountId={accountId}
              scope={scope}
              embedded
              disabled={busy}
              onEditingChange={setEditingName}
            />
          </section>
        ) : (
          <fieldset
            className="@container/choices grid min-w-0 gap-2"
            disabled={busy}
          >
            <legend className="sr-only">Your first step</legend>
            {choices.map(({ value, title, description, icon: Icon }) => (
              <label
                className="onboarding-choice relative grid min-h-touch min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start @min-[18rem]/choices:grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-card control-border border-input bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-muted hover:bg-muted has-[:disabled]:cursor-default"
                htmlFor={`intent-${value}`}
                key={value}
              >
                <span className="hidden size-8 place-items-center rounded-control bg-accent text-accent-foreground @min-[18rem]/choices:grid">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold">{title}</span>
                  <span
                    id={`purpose-${value}-details`}
                    className="text-sm text-muted-foreground"
                  >
                    {description}
                  </span>
                </span>
                <Radio
                  id={`intent-${value}`}
                  name="onboarding-intent"
                  value={value}
                  className="mt-1 size-[1.125rem]"
                  checked={(intent ?? "look") === value}
                  onChange={() =>
                    setIntent(value === "look" ? undefined : value)
                  }
                  aria-label={title}
                  aria-describedby={`purpose-${value}-details`}
                />
              </label>
            ))}
          </fieldset>
        )}

        <footer className="grid min-w-0 gap-3">
          {failedAction && (
            <Alert variant="destructive">
              <AlertDescription id={failureId}>
                Couldn’t save your progress. Try again.
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="lg"
            disabled={busy || editingName}
            focusableWhenDisabled
            aria-describedby={
              failedAction === "continue" ? failureId : undefined
            }
            feedback={pendingAction === "continue" ? "pending" : "idle"}
            onClick={() => void confirm("continue")}
          >
            {pendingAction === "continue"
              ? "Saving…"
              : welcome
                ? "Continue"
                : finishLabel}
          </Button>
          {!welcome && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="px-0"
                disabled={busy}
                onClick={() => {
                  setFailure(undefined);
                  setReviewingWelcome(true);
                }}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Back
              </Button>
              {target && target !== "/dashboard" && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  focusableWhenDisabled
                  aria-busy={pendingAction === "dashboard" || undefined}
                  aria-describedby={
                    failedAction === "dashboard" ? failureId : undefined
                  }
                  onClick={() => void confirm("dashboard")}
                >
                  {pendingAction === "dashboard"
                    ? "Saving…"
                    : "Go to Dashboard"}
                </Button>
              )}
            </div>
          )}
        </footer>
      </div>
      {welcome && (
        <div aria-hidden="true" className="onboarding-art rounded-card" />
      )}
    </section>
  );
}
