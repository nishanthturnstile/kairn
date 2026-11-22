import type { AdvanceOnboarding, OnboardingIntent } from "@kairn/contracts";
import { journeyIntentCopy } from "@kairn/shared/journey-intent-copy";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../api";
import { AccountEntry, AccountEntryHeading } from "../components/account-entry";
import { Choice } from "../components/fold/controls";
import { Action, AppText, StatusNotice } from "../components/fold/primitives";
import { ReceiptProvider } from "../components/fold/receipt";
import { ProfileName } from "../components/profile-name";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import type { VerifiedMobileScope } from "../session";
import { useWorkspace, WorkspaceWaiting } from "../workspace";
import { onboardingKey } from "../workspace-keys";
import { liveExpiry, workspaceReturnLabel } from "../workspace-return";

const choices = [
  {
    value: "plan",
    ...journeyIntentCopy.plan,
    icon: require("../../assets/icons/dashboard.png"),
  },
  {
    value: "record",
    ...journeyIntentCopy.record,
    icon: require("../../assets/icons/book-open.png"),
  },
  {
    value: "look",
    action: "Look around",
    choice: "Open your Dashboard and decide later.",
    icon: require("../../assets/icons/compass.png"),
  },
] as const;

export default function OnboardingRoute() {
  const { scope, state, isRevalidating } = useMobileSession();
  const { progress } = useWorkspace();
  const pending =
    progress.data?.state === "pending" ? progress.data : undefined;
  const show = pending && state === "verified";
  return (
    <>
      {scope && pending && (
        <View
          key={scope.accountId}
          style={show ? styles.fill : styles.hidden}
          accessibilityElementsHidden={!show}
          importantForAccessibility={show ? "auto" : "no-hide-descendants"}
        >
          <Onboarding scope={scope} checkpoint={pending.step} />
        </View>
      )}
      {(!show || isRevalidating) && <WorkspaceWaiting />}
    </>
  );
}

type AdvanceAction = "continue" | "dashboard";

function Onboarding({
  scope,
  checkpoint,
}: {
  scope: VerifiedMobileScope;
  checkpoint: 1 | 2;
}) {
  const router = useRouter();
  const { refresh, canSubmit } = useMobileSession();
  const { handoff, rememberSetupExit, progress } = useWorkspace();
  const saving = useRef(false);
  const [reviewingWelcome, setReviewingWelcome] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<AdvanceAction>();
  const [intent, setIntent] = useState<OnboardingIntent>();
  const [failedStep, setFailedStep] = useState<1 | 2>();
  const busy = pendingAction !== undefined;
  // Keep a name edit open when another device advances the server checkpoint.
  const welcome = checkpoint === 1 || reviewingWelcome || editing;
  const step = welcome ? 1 : 2;
  const title = welcome
    ? "Welcome to Kairn"
    : "What would you like to do first?";
  const position = `Step ${step} of 2`;
  const target =
    handoff?.accountId === scope.accountId &&
    liveExpiry(handoff.expiresAt, Date.now())
      ? handoff.target
      : undefined;

  const goBack = useCallback(() => {
    setFailedStep(undefined);
    setReviewingWelcome(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (saving.current) return true;
          if (welcome) return false;
          goBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [goBack, welcome]),
  );

  async function advance(action: AdvanceAction) {
    if (editing || saving.current || !canSubmit(scope)) return;
    if (step < checkpoint) {
      setReviewingWelcome(false);
      return;
    }
    if (!welcome) rememberSetupExit(scope.accountId, action === "dashboard");
    saving.current = true;
    setPendingAction(action);
    try {
      if (failedStep === step) {
        const checked = await progress.refetch();
        ensureActive(scope.signal);
        if (checked.isError) return;
        if (checked.data?.state !== "pending" || checked.data.step !== step) {
          setFailedStep(undefined);
          return;
        }
      }
      setFailedStep(undefined);
      const body: AdvanceOnboarding = step === 1 ? { step } : { step, intent };
      const current = journeyResult(
        await scope.api.POST("/api/v1/onboarding", {
          params: { header: { "x-expected-account": scope.accountId } },
          body,
        }),
        scope,
        refresh,
      );
      await scope.queryClient.cancelQueries({ queryKey: onboardingKey });
      ensureActive(scope.signal);
      scope.queryClient.setQueryData(onboardingKey, current);
    } catch {
      if (scope.signal.aborted) return;
      const checked = await progress.refetch();
      if (!scope.signal.aborted)
        setFailedStep(
          checked.isError ||
            (checked.data?.state === "pending" && checked.data.step === step)
            ? step
            : undefined,
        );
    } finally {
      saving.current = false;
      if (!scope.signal.aborted) setPendingAction(undefined);
    }
  }

  const entry = (
    <AccountEntry
      endAction={
        <Action
          label="Account"
          variant="text"
          disabled={busy}
          onPress={() => router.push("/account")}
        />
      }
    >
      <View style={styles.intro}>
        <View
          style={styles.progress}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <AppText text={position} variant="caption" subdued />
          <View style={styles.meter}>
            <View style={[styles.segment, styles.activeSegment]} />
            <View style={[styles.segment, !welcome && styles.activeSegment]} />
          </View>
        </View>
        <AccountEntryHeading
          title={title}
          accessibilityLabel={`${position}. ${title}`}
          detail={
            welcome
              ? "Keep your plans and past journeys together. Every journey starts private."
              : "Your choice sets the first action on your Dashboard."
          }
        />
      </View>
      {welcome ? (
        <ProfileName
          scope={scope}
          disabled={busy}
          onEditingChange={setEditing}
        />
      ) : (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Your first step"
          style={styles.choices}
        >
          {choices.map(({ value, action, choice, icon }) => (
            <Choice
              key={value}
              label={action}
              detail={{ text: choice, icon }}
              checked={(intent ?? "look") === value}
              disabled={busy}
              onChange={() => setIntent(value === "look" ? undefined : value)}
            />
          ))}
        </View>
      )}
      {failedStep === step && (
        <StatusNotice
          notice={{
            text: "Couldn’t save your progress. Try again.",
            tone: "error",
          }}
        />
      )}
      <View style={styles.choices}>
        <Action
          label={
            pendingAction === "continue"
              ? "Saving…"
              : welcome
                ? "Continue"
                : workspaceReturnLabel(target ?? "/dashboard")
          }
          variant="primary"
          disabled={busy || editing}
          accessibilityState={{ busy: pendingAction === "continue" }}
          onPress={() => void advance("continue")}
        />
        {!welcome && target && target !== "/dashboard" && (
          <Action
            label={
              pendingAction === "dashboard" ? "Saving…" : "Go to Dashboard"
            }
            disabled={busy}
            accessibilityState={{ busy: pendingAction === "dashboard" }}
            onPress={() => void advance("dashboard")}
          />
        )}
        {!welcome && (
          <View style={styles.start}>
            <Action
              label="Back"
              variant="text"
              disabled={busy}
              onPress={goBack}
            />
          </View>
        )}
      </View>
    </AccountEntry>
  );
  return welcome ? <ReceiptProvider>{entry}</ReceiptProvider> : entry;
}

const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  fill: { flex: 1 },
  hidden: { display: "none" },
  intro: { gap: space.step12 },
  progress: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.step12,
  },
  meter: { flexDirection: "row", gap: space.step4 },
  segment: {
    width: space.step24,
    height: space.step4,
    borderRadius: radius.control,
    backgroundColor: color.boundary,
  },
  activeSegment: { backgroundColor: color.action },
  choices: { gap: space.step8 },
  start: { alignItems: "flex-start" },
}));
