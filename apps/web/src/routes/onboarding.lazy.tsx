import type { AdvanceOnboarding, OnboardingIntent } from "@kairn/contracts";
import { createLazyFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ferryArt from "../assets/onboarding-ferry.webp";
import { ProfileName } from "../components/profile-name";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { JourneyRequestError, journeyResult } from "../lib/journey-api";
import { journeyIntentCopy } from "../lib/journey-intent-copy";
import {
  boundJourneyReturn,
  clearJourneyReturn,
  workspaceDestination,
} from "../lib/journey-return";
import { onboardingKey, useOnboarding } from "../lib/onboarding";
import { useSessionAccess } from "../lib/session-access";
import "./onboarding-art.css";

export const Route = createLazyFileRoute("/onboarding")({
  component: Onboarding,
});

const steps = [
  {
    label: "Welcome",
    title: "Welcome to Kairn",
    description: "Keep your journeys together. Each one starts private.",
  },
  {
    label: "Get started",
    title: "What would you like to do first?",
    description:
      "Choose what you want to do and we’ll put that next step on your Dashboard.",
  },
] as const;

const choices = [
  {
    value: "plan",
    title: journeyIntentCopy.plan.action,
    description: journeyIntentCopy.plan.choice,
  },
  {
    value: "record",
    title: journeyIntentCopy.record.action,
    description: journeyIntentCopy.record.choice,
  },
  {
    value: "look",
    title: "Look around",
    description: "Open your Dashboard and decide later.",
  },
] as const;

function Onboarding() {
  const { scope } = Route.useRouteContext();
  const { refresh } = useSessionAccess();
  const progress = useOnboarding();
  const navigate = Route.useNavigate();
  const [reviewingWelcome, setReviewingWelcome] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [intent, setIntent] = useState<OnboardingIntent>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    step: 1 | 2;
    action: "continue" | "dashboard";
  }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);

  const checkpoint =
    progress.data?.state === "pending" ? progress.data.step : undefined;
  const step = checkpoint === 2 && reviewingWelcome ? 1 : checkpoint;
  const failedAction = failure?.step === step ? failure?.action : undefined;
  const accountId = scope.accountId;
  const target = boundJourneyReturn(accountId);
  let targetLabel = "Continue to journey";
  if (target === "/journeys") targetLabel = "Continue to Journeys";
  if (target === "/journeys/new") targetLabel = "Continue to journey creation";
  if (target === "/saved") targetLabel = "Continue to Saved";
  if (target === "/discover") targetLabel = "Continue to Discover";

  useEffect(() => {
    if (step) heading.current?.focus();
  }, [step]);

  async function confirm(action: "continue" | "dashboard") {
    if (!step || !checkpoint || !accountId || editingName || saving.current)
      return;
    if (step < checkpoint) {
      setReviewingWelcome(false);
      return;
    }
    saving.current = true;
    setBusy(true);
    setFailure(undefined);
    if (action === "dashboard") clearJourneyReturn(accountId);
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
      setReviewingWelcome(false);
      if (result.state !== "pending") {
        await navigate({
          ...workspaceDestination(
            action === "continue" ? boundJourneyReturn(accountId) : undefined,
          ),
          replace: true,
        });
      }
    } catch (error) {
      if (scope.signal.aborted) return;
      if (error instanceof JourneyRequestError && error.status === 409) {
        await progress.refetch();
        setReviewingWelcome(false);
      }
      setFailure({ step, action });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!step || !accountId)
    return progress.data && progress.data.state !== "pending" && !busy ? (
      <Navigate {...workspaceDestination(target)} replace />
    ) : null;

  const active = steps[step - 1];
  return (
    <section className="onboarding-flow" aria-labelledby="onboarding-heading">
      <div className="onboarding-progress">
        <p className="font-semibold text-muted-foreground">
          Step {step} of {steps.length}
        </p>
        <ol aria-label="Setup steps" className="onboarding-steps">
          {steps.map(({ label }, index) => (
            <li
              key={label}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div
        className="onboarding-panel rounded-card control-border bg-card"
        data-step={step}
      >
        <header className="onboarding-intro">
          <h1
            id="onboarding-heading"
            ref={heading}
            tabIndex={-1}
            className="onboarding-title outline-none"
          >
            {active.title}
          </h1>
          <p className="text-muted-foreground">{active.description}</p>
        </header>
        {step === 1 && (
          <div className="onboarding-cover">
            <img
              src={ferryArt}
              alt=""
              width={1152}
              height={864}
              className="onboarding-photo"
            />
          </div>
        )}
        <div className="onboarding-content">
          {step === 1 ? (
            <ProfileName
              accountId={accountId}
              scope={scope}
              disabled={busy}
              onEditingChange={setEditingName}
            />
          ) : (
            <fieldset className="onboarding-choices" disabled={busy}>
              <legend className="sr-only">Your first step</legend>
              {choices.map(({ value, title, description }) => (
                <label
                  className="onboarding-choice control-border rounded-control"
                  key={value}
                >
                  <input
                    type="radio"
                    name="onboarding-intent"
                    value={value}
                    checked={(intent ?? "look") === value}
                    onChange={() =>
                      setIntent(value === "look" ? undefined : value)
                    }
                    aria-labelledby={`purpose-${value}`}
                    aria-describedby={`purpose-${value}-details`}
                  />
                  <span className="grid min-w-0">
                    <span id={`purpose-${value}`} className="font-semibold">
                      {title}
                    </span>
                    <span
                      id={`purpose-${value}-details`}
                      className="text-sm text-muted-foreground"
                    >
                      {description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <footer className="onboarding-actions">
          {failedAction && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                Couldn’t save your progress. Try again.
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                disabled={editingName}
                onClick={() => void confirm(failedAction)}
              >
                Retry
              </Button>
            </Alert>
          )}
          <div className="onboarding-navigation">
            {step === 2 && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setFailure(undefined);
                  setReviewingWelcome(true);
                }}
              >
                Back
              </Button>
            )}
            <div className="onboarding-forward">
              <Button
                type="button"
                disabled={busy || editingName}
                onClick={() =>
                  void confirm(step === 2 && !target ? "dashboard" : "continue")
                }
              >
                {busy
                  ? "Saving…"
                  : step === 1
                    ? "Continue"
                    : target
                      ? targetLabel
                      : "Go to Dashboard"}
                {!busy && (
                  <span aria-hidden="true" className="onboarding-arrow" />
                )}
              </Button>
              {step === 2 && target && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void confirm("dashboard")}
                >
                  Go to Dashboard
                </Button>
              )}
            </div>
          </div>
          {busy && (
            <span role="status" className="sr-only">
              Saving progress
            </span>
          )}
        </footer>
      </div>
    </section>
  );
}
