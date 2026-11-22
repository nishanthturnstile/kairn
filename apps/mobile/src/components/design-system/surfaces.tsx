import { type ComponentRef, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Platform,
  type Pressable,
} from "react-native";
import { FoldSheet, Heading, Select } from "../fold/controls";
import { MemberDisclosure } from "../fold/identity";
import { Action, AppText, Panel } from "../fold/primitives";

export function Surfaces() {
  const [density, setDensity] = useState("Standard");
  return (
    <>
      <Select
        label="Card density"
        values={["Standard", "Compact"]}
        value={density}
        onChange={setDensity}
      />
      <Panel compact={density === "Compact"}>
        <Heading text="Journey people" />
        <MemberDisclosure
          large
          name="Anu Menon"
          memberRole="Coauthor"
          detail="Can review shared moments and edit chapters."
        />
        <MemberDisclosure
          name="Mira Rao"
          memberRole="Contributor"
          detail="Can add moments and manage her original files."
        />
      </Panel>
    </>
  );
}
export function Overlays() {
  const [order, setOrder] = useState("Newest first"),
    [bookmarked, setBookmarked] = useState(false);
  const [sheet, setSheet] = useState<"bookmark" | "row" | null>(null);
  const bookmark = useRef<ComponentRef<typeof Pressable>>(null),
    row = useRef<ComponentRef<typeof Pressable>>(null);
  const invoker = useRef<ComponentRef<typeof Pressable> | null>(null);
  function open(surface: "row" | "bookmark") {
    invoker.current = surface === "row" ? row.current : bookmark.current;
    setSheet(surface);
  }
  function restore() {
    if (invoker.current)
      AccessibilityInfo.sendAccessibilityEvent(invoker.current, "focus");
  }
  function close() {
    setSheet(null);
    if (Platform.OS === "android") requestAnimationFrame(restore);
  }
  return (
    <>
      <Select
        label="Sort moments"
        values={["Newest first", "Oldest first"]}
        value={order}
        onChange={setOrder}
      />
      <Action
        ref={bookmark}
        label="Sample bookmark"
        onPress={() => open("bookmark")}
      />
      <AppText
        text={bookmarked ? "Sample bookmarked" : "No sample bookmark"}
        subdued
      />
      <Action ref={row} label="Open sheet" onPress={() => open("row")} />
      <Action
        label="Open dialog"
        onPress={() =>
          Alert.alert(
            "Visibility preview",
            "Only the owner can see this sample moment.",
            [{ text: "Close" }],
            { cancelable: true },
          )
        }
      />
      <FoldSheet
        visible={sheet !== null}
        title={sheet === "bookmark" ? "Bookmark actions" : "Row details"}
        onClose={close}
        onDismiss={restore}
      >
        {sheet === "bookmark" ? (
          <>
            <Action
              label="Add bookmark"
              disabled={bookmarked}
              onPress={() => {
                setBookmarked(true);
                close();
              }}
            />
            <Action
              label="Remove bookmark"
              disabled={!bookmarked}
              variant="danger"
              onPress={() => {
                setBookmarked(false);
                close();
              }}
            />
          </>
        ) : (
          <>
            <AppText text="Anu Menon · Coauthor" variant="label" />
            <AppText text="Can review shared moments and edit chapters." />
          </>
        )}
      </FoldSheet>
    </>
  );
}
