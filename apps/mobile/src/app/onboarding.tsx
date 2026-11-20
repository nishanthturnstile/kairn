import type { AdvanceOnboarding, OnboardingIntent } from "@kairn/contracts";
import { journeyIntentCopy } from "@kairn/shared/journey-intent-copy";
import { useRouter } from "expo-router";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../api";
import { ProfileName } from "../components/profile-name";
import { Action, AppText, focusOutline, StatusNotice } from "../components/ui";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import type { VerifiedMobileScope } from "../session";
import { useWorkspace, WorkspaceWaiting } from "../workspace";
import { onboardingKey } from "../workspace-keys";
import { liveExpiry, workspaceReturnLabel } from "../workspace-return";

const ferryArt = require("../../assets/onboarding/ferry.jpg");
const choices = [
  { value: "plan", ...journeyIntentCopy.plan },
  { value: "record", ...journeyIntentCopy.record },
  {
    value: "look",
    action: "Look around",
    choice: "Open your Dashboard and decide later.",
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

function Onboarding({
  scope,
  checkpoint,
}: {
  scope: VerifiedMobileScope;
  checkpoint: 1 | 2;
}) {
  const router = useRouter();
  const { refresh, canSubmit } = useMobileSession();
  const { handoff, forgetReturn, progress } = useWorkspace();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const saving = useRef(false);
  const [reviewingWelcome, setReviewingWelcome] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<OnboardingIntent>();
  const [failedStep, setFailedStep] = useState<1 | 2>();
  const step = checkpoint === 2 && reviewingWelcome ? 1 : checkpoint;
  const title =
    step === 1 ? "Welcome to Kairn" : "What would you like to do first?";
  const target =
    handoff?.accountId === scope.accountId &&
    liveExpiry(handoff.expiresAt, Date.now())
      ? handoff.target
      : undefined;

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(`Step ${step} of 2. ${title}`);
  }, [step, title]);

  async function advance(openDashboard = false) {
    if (editing || saving.current || !canSubmit(scope)) return;
    if (step < checkpoint) {
      setReviewingWelcome(false);
      return;
    }
    if (openDashboard) forgetReturn(scope.accountId);
    saving.current = true;
    setBusy(true);
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
      setFailedStep(undefined);
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
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        ref={scroll}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.top}>
          <AppText text="Kairn" variant="label" style={styles.brand} />
          <Action
            label="Account"
            disabled={busy}
            onPress={() => router.push("/account")}
          />
        </View>
        <View style={styles.group}>
          <AppText text={`Step ${step} of 2`} variant="caption" subdued />
          <View accessible={false} style={styles.progress}>
            <View style={[styles.segment, styles.activeSegment]} />
            <View
              style={[styles.segment, step === 2 && styles.activeSegment]}
            />
          </View>
          <AppText text={title} accessibilityRole="header" variant="title" />
          <AppText
            text={
              step === 1
                ? "Keep your journeys together. Each one starts private."
                : "Choose what you want to do and we’ll put that next step on your Dashboard."
            }
            subdued
          />
        </View>
        {step === 1 ? (
          <>
            <Image source={ferryArt} accessible={false} style={styles.cover} />
            <ProfileName
              scope={scope}
              disabled={busy}
              onEditingChange={setEditing}
            />
          </>
        ) : (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Your first step"
            style={styles.choices}
          >
            {choices.map(({ value, action, choice }) => (
              <Choice
                key={value}
                title={action}
                description={choice}
                checked={(intent ?? "look") === value}
                disabled={busy}
                onPress={() => setIntent(value === "look" ? undefined : value)}
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
              busy
                ? "Saving…"
                : step === 1
                  ? "Continue"
                  : target
                    ? workspaceReturnLabel(target)
                    : "Go to Dashboard"
            }
            variant="primary"
            disabled={busy || editing}
            accessibilityState={busy ? { busy: true } : undefined}
            onPress={() => void advance()}
          />
          {step === 2 && target && (
            <Action
              label="Go to Dashboard"
              disabled={busy}
              onPress={() => void advance(true)}
            />
          )}
          {step === 2 && (
            <Action
              label="Back"
              disabled={busy}
              onPress={() => setReviewingWelcome(true)}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Choice({
  title,
  description,
  checked,
  disabled,
  onPress,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.choice,
        checked && styles.selected,
        pressed && !checked && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <View
        style={[styles.radio, checked && styles.selectedRadio]}
        accessible={false}
      >
        {checked && <View style={styles.radioDot} />}
      </View>
      <View style={styles.choiceCopy}>
        <AppText text={title} variant="label" />
        <AppText text={description} subdued />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    fill: { flex: 1 },
    hidden: { display: "none" },
    screen: { flex: 1, backgroundColor: color.canvas },
    content: { padding: space.step24, gap: space.step24 },
    top: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.step8,
    },
    brand: { color: color.action },
    group: { gap: space.step8 },
    progress: { flexDirection: "row", gap: space.step8 },
    segment: {
      flex: 1,
      height: 4,
      borderRadius: radius.control,
      backgroundColor: color.actionWash,
    },
    activeSegment: { backgroundColor: color.action },
    cover: {
      width: "100%",
      height: 168,
      borderRadius: radius.card,
      backgroundColor: color.actionWash,
    },
    choices: { gap: space.step8 },
    choice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space.step12,
      padding: space.step16,
      borderWidth: border.control,
      borderColor: color.boundary,
      borderRadius: radius.card,
      backgroundColor: color.surface,
    },
    selected: { borderColor: color.action, backgroundColor: color.actionWash },
    pressed: { backgroundColor: color.actionWash },
    focused: { ...focusOutline(color.information) },
    choiceCopy: { flex: 1, minWidth: 0, gap: space.step4 },
    radio: {
      marginTop: 2,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: border.control,
      borderColor: color.boundary,
    },
    selectedRadio: { borderColor: color.action },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: color.action,
    },
  }),
);
