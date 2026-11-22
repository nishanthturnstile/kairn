import { type ComponentRef, useRef, useState } from "react";
import { AccessibilityInfo, Image, type Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { destinationIcons } from "../destination-tabs";
import { Heading, Select, styles } from "../fold/controls";
import { ContentLoading, JourneyMap, Progress } from "../fold/expression";
import { FoldGlyph } from "../fold/glyph";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { useReceipt } from "../fold/receipt";

const queueStates = [
  "Ready",
  "Queued",
  "Uploading",
  "Interrupted",
  "Complete",
  "Loading",
  "Empty",
] as const;
export function Feedback() {
  const [state, setState] = useState<(typeof queueStates)[number]>("Ready");
  const show = useReceipt();
  const receiptTrigger = useRef<ComponentRef<typeof Pressable>>(null);
  const queue = useRef<ComponentRef<typeof Pressable>>(null);
  function resume(next: "Ready" | "Uploading") {
    setState(next);
    requestAnimationFrame(() => {
      if (queue.current)
        AccessibilityInfo.sendAccessibilityEvent(queue.current, "focus");
    });
  }
  function returnFocus() {
    if (receiptTrigger.current)
      AccessibilityInfo.sendAccessibilityEvent(receiptTrigger.current, "focus");
  }

  return (
    <>
      <Action
        ref={receiptTrigger}
        label="Show confirmation"
        onPress={() => show({ message: "Sample changes saved.", returnFocus })}
      />
      <Select
        triggerRef={queue}
        label="Queue state"
        values={queueStates}
        value={state}
        onChange={setState}
      />
      {state === "Loading" ? (
        <ContentLoading label="Loading queue…" />
      ) : state === "Empty" ? (
        <Panel>
          <Heading text="No queued moments" />
          <AppText text="Add a sample to see its upload state." subdued />
          <Action label="Add sample" onPress={() => resume("Ready")} />
        </Panel>
      ) : (
        <View style={styles.group}>
          <StatusNotice
            notice={
              state === "Interrupted"
                ? {
                    text: "Upload interrupted. Your local copy is safe.",
                    tone: "error",
                  }
                : state === "Complete"
                  ? { text: "Upload complete.", tone: "success" }
                  : state === "Queued"
                    ? { text: "Queued for upload.", tone: "warning" }
                    : {
                        text:
                          state === "Uploading"
                            ? "Uploading · 42%"
                            : "Ready to upload.",
                        tone: "info",
                      }
            }
          />
          {state === "Uploading" && (
            <Progress value={42} label="Sample upload" />
          )}
          {state === "Interrupted" && (
            <Action label="Retry upload" onPress={() => resume("Uploading")} />
          )}
        </View>
      )}
    </>
  );
}
export function Expression() {
  const [pattern, setPattern] = useState("Empty journey illustration");
  const {
    theme: {
      semantic: { color },
    },
  } = useUnistyles();
  return (
    <>
      <Select
        label="Preview pattern"
        values={[
          "Empty journey illustration",
          "Opening the workspace",
          "Loading journeys",
        ]}
        value={pattern}
        onChange={setPattern}
      />
      {pattern === "Empty journey illustration" ? (
        <JourneyMap />
      ) : (
        <ContentLoading
          key={pattern}
          label={
            pattern === "Loading journeys"
              ? "Loading your journeys"
              : "Opening Kairn…"
          }
          skeleton={pattern === "Loading journeys"}
        />
      )}
      <Heading text="Icons" />
      <View style={styles.inline}>
        <FoldGlyph color={color.ink} />
        <AppText text="Fold mark" />
      </View>
      {[
        ["dashboard", "Dashboard"],
        ["journeys", "Journeys"],
        ["discover", "Discover"],
        ["saved", "Saved"],
      ].map(([key, label]) => (
        <View key={key} style={styles.inline}>
          <Image
            accessible={false}
            source={destinationIcons[key]}
            style={{ width: 20, height: 20, tintColor: color.ink }}
          />
          <AppText text={label} />
        </View>
      ))}
    </>
  );
}
