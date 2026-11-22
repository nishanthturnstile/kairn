import {
  journeyInvitationContinuation,
  journeyInvitationReview,
} from "@kairn/contracts/journeys";
import { formatJourneyLocalMinute } from "@kairn/shared/journey-time";
import { fetch as nativeFetch } from "expo/fetch";
import { randomUUID } from "expo-crypto";
import { useNetworkState } from "expo-network";
import { useIsFocused, usePreventRemove, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { createInvitationExchangeClient, ensureActive } from "../api";
import { authOrigin } from "../auth";
import {
  Action,
  AppText,
  Panel,
  StatusNotice,
} from "../components/fold/primitives";
import { JourneyScreen } from "../components/journeys/states";
import {
  clearInvitationHandoff,
  discardInvitationToken,
  finishInvitationExchange,
  isCurrentInvitation,
  readInvitationHandoff,
  saveInvitationHandoff,
  useInvitationHandoff,
} from "../invitation-handoff";
import { journeyResult, refreshJourneyViews } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import { useWorkspace } from "../workspace";

const exchange =
  authOrigin && createInvitationExchangeClient(authOrigin, nativeFetch);
type Review = ReturnType<typeof journeyInvitationReview.parse>;
const expiryDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function InvitationReview() {
  const router = useRouter();
  const focused = useIsFocused();
  const offline = useNetworkState().isConnected === false;
  const { state, scope, canSubmit, signOut, refresh } = useMobileSession();
  const { progress, retainInvitationForSignIn } = useWorkspace();
  const { handoff, token } = useInvitationHandoff();
  const [replacement, setReplacement] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState("");
  const [resolved, setResolved] = useState<{
    review: Review;
    source: string;
    attempt: number;
    accountId: string;
  }>();
  const [joining, setJoining] = useState(false);
  const [accepted, setAccepted] = useState<{
    id: string;
    accountId: string;
    operationId: string;
  }>();
  const [switching, setSwitching] = useState(false);
  const action = useRef<AbortController>(undefined);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const current = readInvitationHandoff();
  const source = current?.continuation ?? current?.operationId;
  const active =
    focused &&
    !offline &&
    state === "verified" &&
    scope &&
    !progress.isError &&
    progress.data &&
    progress.data.state !== "pending";
  const review =
    active &&
    !token &&
    source &&
    resolved?.source === source &&
    resolved.accountId === scope?.accountId &&
    resolved.attempt === attempt
      ? resolved.review
      : undefined;
  const replacing = Boolean(token && current && replacement !== token);

  usePreventRemove(joining && state === "verified", () => {});

  useEffect(() => {
    if (focused) return;
    action.current?.abort();
  }, [focused]);
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    if (!focused || !handoff) return;
    const next = Math.max(0, handoff.expiresAt - Date.now());
    const update = () => {
      if (!action.current) setAttempt((value) => value + 1);
    };
    const interval = setInterval(update, 30_000);
    const expiration = next > 0 ? setTimeout(update, next) : undefined;
    return () => {
      clearInterval(interval);
      clearTimeout(expiration);
    };
  }, [focused, handoff]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry repeats the exchange.
  useEffect(() => {
    if (!focused || offline || !token || replacing || !exchange) return;
    const request = new AbortController();
    setProblem("");
    void exchange
      .POST("/api/v1/journey-invitations/continue", {
        body: { token },
        signal: request.signal,
      })
      .then((response) => {
        ensureActive(request.signal);
        if (response.response.status === 404) {
          if (!finishInvitationExchange(token)) return;
        } else {
          const value = journeyInvitationContinuation.parse(response.data);
          if (
            !finishInvitationExchange(token, {
              continuation: value.continuation,
              expiresAt: Date.parse(value.expiresAt),
            })
          )
            return;
        }
        setReplacement(undefined);
      })
      .catch(() => {
        if (!request.signal.aborted)
          setProblem("Couldn’t open this invitation. Try again.");
      });
    return () => request.abort();
  }, [attempt, focused, offline, replacing, token]);

  useEffect(() => {
    if (!active || token || !scope || !source) return;
    const saved = readInvitationHandoff();
    if (!saved || (saved.accountId && saved.accountId !== scope.accountId))
      return;
    const request = new AbortController();
    setProblem("");
    let reading = true;
    void (async () => {
      let value: Review = { state: "unavailable" };
      if (saved.operationId) {
        const status = await scope.api.POST(
          "/api/v1/journey-invitations/acceptance-status",
          {
            body: { operationId: saved.operationId },
            signal: request.signal,
          },
        );
        if (status.response.status !== 404) {
          const accepted = journeyResult(status, scope, refresh);
          value = { state: "joined", journeyId: accepted.id };
        }
      }
      if (value.state !== "joined" && saved.continuation) {
        const response = await scope.api.POST(
          "/api/v1/journey-invitations/review",
          {
            body: { continuation: saved.continuation },
            signal: request.signal,
          },
        );
        value = journeyInvitationReview.parse(
          journeyResult(response, scope, refresh),
        );
      }
      ensureActive(request.signal);
      ensureActive(scope.signal);
      if (!reading || !isCurrentInvitation({ source })) return;
      if (value.state === "ready" && !saved.accountId) {
        saveInvitationHandoff({
          ...saved,
          accountId: scope.accountId,
          continuation: value.continuation,
        });
        setResolved({
          review: value,
          source: value.continuation,
          attempt,
          accountId: scope.accountId,
        });
      } else
        setResolved({
          review: value,
          source,
          attempt,
          accountId: scope.accountId,
        });
    })().catch(() => {
      if (reading && !request.signal.aborted && !scope.signal.aborted)
        setProblem("Couldn’t check this invitation. Try again.");
    });
    return () => {
      reading = false;
      request.abort();
      setResolved(undefined);
    };
  }, [active, attempt, refresh, scope, source, token]);

  function abandon() {
    clearInvitationHandoff();
    router.dismissTo(state === "verified" ? "/dashboard" : "/account");
  }

  const openJourney = useCallback(
    async (
      journeyId: string,
      expected: { source?: string; operationId?: string },
    ) => {
      if (!scope) return;
      await refreshJourneyViews(scope);
      if (
        !focusedRef.current ||
        !canSubmit(scope) ||
        !isCurrentInvitation(expected)
      )
        return;
      clearInvitationHandoff();
      router.replace({
        pathname: "/journeys/[journeyId]",
        params: { journeyId },
      });
    },
    [canSubmit, router, scope],
  );

  useEffect(() => {
    if (
      !accepted ||
      joining ||
      !active ||
      token ||
      accepted.accountId !== scope?.accountId
    )
      return;
    setAccepted(undefined);
    if (current?.operationId !== accepted.operationId) return;
    void openJourney(accepted.id, { operationId: accepted.operationId }).catch(
      () => {
        if (!scope.signal.aborted) setAttempt((value) => value + 1);
      },
    );
  }, [
    accepted,
    active,
    current?.operationId,
    joining,
    openJourney,
    scope,
    token,
  ]);

  async function join() {
    if (
      !scope ||
      !canSubmit(scope) ||
      review?.state !== "ready" ||
      !isCurrentInvitation({ source }) ||
      action.current
    )
      return;
    const saved = readInvitationHandoff();
    if (saved?.accountId !== scope.accountId || !saved.continuation) return;
    const operationId = saved.operationId ?? randomUUID();
    saveInvitationHandoff({ ...saved, operationId });
    const request = new AbortController();
    action.current = request;
    setJoining(true);
    setProblem("");
    try {
      const result = journeyResult(
        await scope.api.POST("/api/v1/journey-invitations/accept", {
          body: { continuation: saved.continuation, operationId },
          signal: request.signal,
        }),
        scope,
        refresh,
      );
      if (!request.signal.aborted && canSubmit(scope) && focusedRef.current) {
        setAccepted({ id: result.id, accountId: scope.accountId, operationId });
      }
    } catch {
      if (!request.signal.aborted && !scope.signal.aborted) {
        setProblem(
          "Couldn’t confirm that you joined. Check again to recover your invitation.",
        );
        setResolved(undefined);
      }
    } finally {
      action.current = undefined;
      setJoining(false);
    }
  }

  async function switchAccount() {
    if (switching || joining) return;
    retainInvitationForSignIn();
    setSwitching(true);
    const signedOut = await signOut();
    setSwitching(false);
    if (signedOut && focusedRef.current) router.push("/account");
    else setProblem("Couldn’t sign out. Try again.");
  }

  const unavailable =
    review && !["ready", "joined", "wrong_account"].includes(review.state);
  const alreadyJoined = review?.state === "joined";

  return (
    <JourneyScreen top safeBottom>
      <AppText
        text="Journey invitation"
        variant="title"
        accessibilityRole="header"
      />
      {replacing ? (
        <Panel>
          <AppText text="Open this new invitation? It will replace the one you were reviewing." />
          <Action
            label="Open new invitation"
            variant="primary"
            disabled={joining}
            onPress={() => setReplacement(token)}
          />
          <Action
            label="Keep current invitation"
            onPress={discardInvitationToken}
            disabled={joining}
          />
        </Panel>
      ) : problem ? (
        <Panel>
          <StatusNotice notice={{ text: problem, tone: "error" }} />
          <Action
            label="Try again"
            onPress={() => setAttempt((value) => value + 1)}
            disabled={joining}
          />
        </Panel>
      ) : offline ? (
        <StatusNotice
          notice={{ text: "Reconnect to check this invitation.", tone: "info" }}
        />
      ) : token ? (
        <StatusNotice notice={{ text: "Opening invitation", tone: "info" }} />
      ) : !current || unavailable ? (
        <Panel>
          <AppText text="This invitation is unavailable. Ask the organiser for a new invitation." />
          <Action
            label={state === "verified" ? "Go to Journeys" : "Sign in"}
            onPress={() => {
              clearInvitationHandoff();
              router.dismissTo(state === "verified" ? "/journeys" : "/account");
            }}
          />
        </Panel>
      ) : state === "signed-out" ? (
        <Panel>
          <AppText text="Sign in with the email address that received this invitation." />
          <Action
            label="Sign in"
            variant="primary"
            onPress={() => {
              retainInvitationForSignIn();
              router.push("/account");
            }}
          />
        </Panel>
      ) : review?.state === "wrong_account" ? (
        <Panel>
          <AppText text="This invitation is for a different account." />
          <Action
            label={switching ? "Signing out…" : "Switch account"}
            variant="primary"
            accessibilityState={{ busy: switching }}
            disabled={switching}
            onPress={() => void switchAccount()}
          />
        </Panel>
      ) : review?.state === "ready" ? (
        <Panel>
          <AppText
            text={review.title}
            variant="section"
            accessibilityRole="header"
          />
          <AppText text={`Invited by ${review.inviter}`} />
          {review.schedule && (
            <AppText
              text={scheduleLabel(review.schedule.intendedStart.local)}
            />
          )}
          <AppText
            text={`Expires ${expiryDate.format(new Date(review.expiresAt))}`}
            subdued
          />
          <AppText text="Participant · You can see the journey and its schedule after joining." />
          <Action
            label={joining ? "Joining…" : "Join journey"}
            variant="primary"
            accessibilityState={{ busy: joining }}
            disabled={joining}
            onPress={() => void join()}
          />
        </Panel>
      ) : alreadyJoined ? (
        <Panel>
          <AppText text="You’ve joined this journey." />
          <Action
            label="Open journey"
            variant="primary"
            onPress={() => {
              void openJourney(review.journeyId, { source }).catch(() =>
                AccessibilityInfo.announceForAccessibility(
                  "Couldn’t open this journey.",
                ),
              );
            }}
          />
        </Panel>
      ) : state === "unavailable" || progress.isError ? (
        <Panel>
          <StatusNotice
            notice={{
              text: "Couldn’t check your account or setup.",
              tone: "error",
            }}
          />
          <Action
            label="Try again"
            onPress={() =>
              state === "unavailable" ? refresh() : void progress.refetch()
            }
          />
        </Panel>
      ) : (
        <StatusNotice notice={{ text: "Checking invitation", tone: "info" }} />
      )}
      <Action
        label={state === "verified" ? "Back to Dashboard" : "Close invitation"}
        variant="text"
        disabled={joining || switching}
        onPress={abandon}
      />
    </JourneyScreen>
  );
}

function scheduleLabel(local: string) {
  const { date, time } = formatJourneyLocalMinute(local);
  return `${date} · ${time}`;
}
