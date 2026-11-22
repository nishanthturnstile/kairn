import {
  journeyInvitationContinuation,
  journeyInvitationReview,
} from "@kairn/contracts/journeys";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { JourneyDate } from "../components/journeys/dates";
import { JourneyLoading, JourneyRetry } from "../components/journeys/states";
import { PageHeading } from "../components/page-heading";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, ButtonLink } from "../components/ui/button";
import {
  captureInvitationFragment,
  clearInvitationHandoff,
  forgetInvitationFragment,
  readInvitationHandoff,
  saveInvitationHandoff,
} from "../lib/invitation-handoff";
import { JourneyRequestError, journeyResult } from "../lib/journey-api";
import { saveJourneyReturnTo } from "../lib/journey-return";
import { useOnboarding } from "../lib/onboarding";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/journey-invitations")({
  component: InvitationReviewRoute,
});

const destination = "/journey-invitations";
const expiryFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});
type Review = ReturnType<typeof journeyInvitationReview.parse>;

function InvitationReviewRoute() {
  const { scope } = Route.useRouteContext();
  const access = useSessionAccess();
  const progress = useOnboarding();
  const navigate = Route.useNavigate();
  const [token, setToken] = useState(captureInvitationFragment);
  const [handoff, setHandoff] = useState(readInvitationHandoff);
  const [replacement, setReplacement] = useState(false);
  const [problem, setProblem] = useState<"exchange" | "review" | "accept">();
  const [review, setReview] = useState<Review>();
  const [attempt, setAttempt] = useState(0);
  const [joining, setJoining] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const acceptLock = useRef(false);
  const accepting = useRef<AbortController>(null);
  const accountId = scope.accountId;
  const setupPending = progress.data?.state === "pending";
  useEffect(() => () => accepting.current?.abort(), []);

  useEffect(() => {
    function verifyAgain() {
      if (document.visibilityState !== "visible") return;
      accepting.current?.abort();
      setReview(undefined);
      setAttempt((value) => value + 1);
    }
    function disconnected() {
      accepting.current?.abort();
      setOffline(true);
      setReview(undefined);
    }
    function connected() {
      setOffline(false);
      verifyAgain();
    }
    document.addEventListener("visibilitychange", verifyAgain);
    window.addEventListener("focus", verifyAgain);
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", connected);
    const interval = handoff
      ? window.setInterval(verifyAgain, 30_000)
      : undefined;
    const remaining = (handoff?.expiresAt ?? 0) - Date.now();
    const expiration =
      remaining > 0 ? window.setTimeout(verifyAgain, remaining) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", verifyAgain);
      window.removeEventListener("focus", verifyAgain);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", connected);
      window.clearInterval(interval);
      window.clearTimeout(expiration);
    };
  }, [handoff]);

  useEffect(() => {
    const capture = () => {
      const next = captureInvitationFragment();
      if (next) {
        accepting.current?.abort();
        setToken(next);
        setReplacement(false);
        setProblem(undefined);
      }
    };
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry restarts the exchange.
  useEffect(() => {
    if (offline || !token || (handoff && !replacement)) return;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      forgetInvitationFragment();
      setToken(undefined);
      return;
    }
    const request = new AbortController();
    setProblem(undefined);
    void scope.api
      .POST("/api/v1/journey-invitations/continue", {
        body: { token },
        signal: request.signal,
      })
      .then((result) => {
        request.signal.throwIfAborted();
        scope.signal.throwIfAborted();
        if (result.response.status === 404) {
          forgetInvitationFragment();
          setToken(undefined);
          setReplacement(false);
          return;
        }
        const data = journeyInvitationContinuation.parse(
          journeyResult(result, scope, access.refresh),
        );
        const next = {
          continuation: data.continuation,
          expiresAt: Date.parse(data.expiresAt),
        };
        saveInvitationHandoff(next);
        forgetInvitationFragment();
        setHandoff(next);
        setToken(undefined);
        setReplacement(false);
        setReview(undefined);
      })
      .catch(() => {
        if (!request.signal.aborted && !scope.signal.aborted)
          setProblem("exchange");
      });
    return () => request.abort();
  }, [token, handoff, replacement, scope, attempt, access.refresh, offline]);

  useEffect(() => {
    if (
      token ||
      !handoff ||
      access.state !== "verified" ||
      !accountId ||
      !setupPending
    )
      return;
    saveJourneyReturnTo(destination, accountId);
    void navigate({ to: "/onboarding", replace: true });
  }, [token, handoff, access.state, accountId, setupPending, navigate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry restarts verification.
  useEffect(() => {
    if (
      offline ||
      token ||
      !handoff ||
      access.state !== "verified" ||
      !accountId ||
      !progress.data ||
      setupPending
    )
      return;
    const request = new AbortController();
    setReview(undefined);
    setProblem(undefined);
    void (async () => {
      const current = readInvitationHandoff();
      if (!current || (current.accountId && current.accountId !== accountId)) {
        clearInvitationHandoff();
        setHandoff(undefined);
        return;
      }
      if (current.operationId) {
        const status = await scope.api.POST(
          "/api/v1/journey-invitations/acceptance-status",
          {
            body: { operationId: current.operationId },
            signal: request.signal,
          },
        );
        request.signal.throwIfAborted();
        if (status.response.status !== 404) {
          const result = journeyResult(status, scope, access.refresh);
          setReview({ state: "joined", journeyId: result.id });
          return;
        }
      }
      if (!current.continuation) {
        setReview({ state: "unavailable" });
        return;
      }
      const result = await scope.api.POST(
        "/api/v1/journey-invitations/review",
        {
          body: { continuation: current.continuation },
          signal: request.signal,
        },
      );
      request.signal.throwIfAborted();
      const data = journeyInvitationReview.parse(
        journeyResult(result, scope, access.refresh),
      );
      if (data.state === "ready" && !current.accountId) {
        saveInvitationHandoff({
          ...current,
          accountId,
          continuation: data.continuation,
        });
      }
      setReview(data);
    })().catch(() => {
      if (!scope.signal.aborted && !request.signal.aborted)
        setProblem("review");
    });
    return () => request.abort();
  }, [
    token,
    handoff,
    access.state,
    accountId,
    progress.data,
    setupPending,
    scope,
    attempt,
    access.refresh,
    offline,
  ]);

  function abandon() {
    clearInvitationHandoff();
    setHandoff(undefined);
  }

  async function openJourney(journeyId: string, signal?: AbortSignal) {
    await scope.queryClient.cancelQueries();
    if (scope.signal.aborted || signal?.aborted) return;
    void scope.queryClient.invalidateQueries();
    abandon();
    await navigate({
      to: "/journeys/$journeyId",
      params: { journeyId },
      replace: true,
    });
  }

  async function join() {
    if (acceptLock.current || !accountId) return;
    const current = readInvitationHandoff();
    if (!current?.continuation || current.accountId !== accountId) {
      setAttempt((value) => value + 1);
      return;
    }
    const operationId = current.operationId ?? crypto.randomUUID();
    saveInvitationHandoff({ ...current, operationId });
    const request = new AbortController();
    accepting.current = request;
    acceptLock.current = true;
    setJoining(true);
    setProblem(undefined);
    try {
      const result = await scope.api.POST(
        "/api/v1/journey-invitations/accept",
        {
          body: { operationId, continuation: current.continuation },
          signal: request.signal,
        },
      );
      await openJourney(
        journeyResult(result, scope, access.refresh).id,
        request.signal,
      );
    } catch (error) {
      if (scope.signal.aborted || request.signal.aborted) return;
      if (
        error instanceof JourneyRequestError &&
        (error.status === 404 || error.code === "invitation_accepted")
      ) {
        setAttempt((value) => value + 1);
      } else setProblem("accept");
    } finally {
      accepting.current = null;
      acceptLock.current = false;
      setJoining(false);
    }
  }

  const retry = () => setAttempt((value) => value + 1);
  const back = (
    <ButtonLink
      render={<Link to="/dashboard" onClick={abandon} />}
      variant="ghost"
    >
      Back to Dashboard
    </ButtonLink>
  );

  let content: React.ReactNode;
  if (offline) {
    content = (
      <Alert>
        <AlertDescription>Reconnect to check this invitation.</AlertDescription>
      </Alert>
    );
  } else if (token && handoff && !replacement) {
    content = (
      <>
        <p>Open this invitation in place of the one you were reviewing?</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setReplacement(true)}>
            Open new invitation
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              forgetInvitationFragment();
              setToken(undefined);
            }}
          >
            Keep current invitation
          </Button>
        </div>
      </>
    );
  } else if (problem === "exchange" || problem === "review") {
    content = (
      <JourneyRetry title="Couldn’t open this invitation" retry={retry} />
    );
  } else if (
    token ||
    access.state === "checking" ||
    (handoff &&
      access.state === "verified" &&
      (!progress.data || setupPending || !review) &&
      !progress.isError)
  ) {
    content = <JourneyLoading label="Opening invitation" />;
  } else if (access.state === "unavailable" || progress.isError) {
    content = (
      <JourneyRetry
        title="Couldn’t check your access"
        retry={() =>
          progress.isError ? void progress.refetch() : access.refresh()
        }
      />
    );
  } else if (access.state === "signed-out") {
    content = (
      <>
        <p>
          {handoff
            ? "Sign in with the email address that received the invitation."
            : "This invitation is unavailable. Ask the organiser for a new link."}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            render={
              <Link
                to="/account"
                search={{ returnTo: handoff ? destination : undefined }}
              />
            }
          >
            Sign in
          </ButtonLink>
          {handoff && (
            <ButtonLink
              render={
                <Link
                  to="/account"
                  search={{ returnTo: destination, mode: "sign-up" }}
                />
              }
              variant="outline"
            >
              Create account
            </ButtonLink>
          )}
        </div>
      </>
    );
  } else if (review?.state === "ready") {
    content = (
      <>
        <p>{review.inviter} invited you to join as a Participant.</p>
        <dl className="grid gap-3 rounded-card control-border bg-card p-4">
          {review.schedule && (
            <div>
              <dt className="font-semibold">Intended start</dt>
              <dd>
                <JourneyDate minute={review.schedule.intendedStart} />
              </dd>
            </div>
          )}
          {review.schedule?.intendedEnd && (
            <div>
              <dt className="font-semibold">Intended end</dt>
              <dd>
                <JourneyDate minute={review.schedule.intendedEnd} />
              </dd>
            </div>
          )}
          <div>
            <dt className="font-semibold">Invitation expires</dt>
            <dd>
              <time dateTime={review.expiresAt}>
                {expiryFormat.format(new Date(review.expiresAt))}
              </time>
            </dd>
          </div>
        </dl>
        {problem === "accept" && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              Couldn’t confirm that you joined. Try again.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={joining}
            feedback={joining ? "pending" : "idle"}
            onClick={() => void join()}
          >
            {joining
              ? "Joining…"
              : problem === "accept"
                ? "Retry joining"
                : "Join journey"}
          </Button>
          {joining ? null : back}
        </div>
      </>
    );
  } else if (review?.state === "joined") {
    content = (
      <>
        <p>You’ve already joined this journey.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void openJourney(review.journeyId)}>
            Open journey
          </Button>
          {back}
        </div>
      </>
    );
  } else if (review?.state === "wrong_account") {
    content = (
      <>
        <p>Sign in with the email address that received the invitation.</p>
        {access.signOutError && (
          <Alert variant="destructive">
            <AlertDescription>{access.signOutError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              void access.signOut({ switchInvitationAccount: true })
            }
          >
            Switch account
          </Button>
          {back}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <p>
          {review?.state === "cancelled"
            ? "The organiser cancelled this invitation."
            : review?.state === "expired"
              ? "This invitation expired."
              : "This invitation is unavailable."}{" "}
          Ask the organiser for a new link.
        </p>
        <ButtonLink
          render={<Link to="/journeys" onClick={abandon} />}
          variant="outline"
          className="justify-self-start"
        >
          Go to Journeys
        </ButtonLink>
      </>
    );
  }

  return (
    <section className="grid min-w-0 gap-4">
      <span className="flex size-12 items-center justify-center rounded-control bg-accent text-primary">
        <MailOpen aria-hidden="true" />
      </span>
      <PageHeading
        title={
          !offline &&
          access.state === "verified" &&
          !setupPending &&
          !token &&
          review?.state === "ready"
            ? review.title
            : "Journey invitation"
        }
      />
      {content}
    </section>
  );
}
