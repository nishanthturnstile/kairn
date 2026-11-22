import { useState } from "react";
import { Platform, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { AppearancePicker } from "../fold/appearance";
import { Heading, Select, styles } from "../fold/controls";
import { FoldGlyph } from "../fold/glyph";
import { useReduceMotionPreference } from "../fold/motion";
import { Action, AppText, touchTarget } from "../fold/primitives";

const colours = {
  Canvas: "canvas",
  Surface: "surface",
  Ink: "ink",
  "Secondary text": "secondaryText",
  Focus: "focus",
  Divider: "divider",
  Dock: "dock",
  "Dock text": "dockInk",
  "Receipt background": "ink",
  "Receipt text": "surface",
  Boundary: "boundary",
  Action: "action",
  "Inset key": "key",
  Citron: "citron",
  Lilac: "lilac",
  Clay: "clay",
  Information: "information",
  Success: "success",
  Warning: "warning",
  Error: "error",
} as const;
const typeStyles = {
  Heading: "title",
  Section: "section",
  Body: "body",
  Label: "label",
  Caption: "caption",
} as const;
export function Foundations() {
  const {
    theme: {
      semantic: { color, space, fontSize, lineHeight, motion },
    },
  } = useUnistyles();
  const [role, setRole] = useState<keyof typeof colours>("Canvas"),
    [type, setType] = useState<keyof typeof typeStyles>("Heading"),
    [spacing, setSpacing] = useState("16"),
    [replay, setReplay] = useState(0);
  const reduced = useReduceMotionPreference();
  const typeRole =
    type === "Heading"
      ? "chapter"
      : type === "Section"
        ? "section"
        : type === "Caption"
          ? "caption"
          : "body";
  return (
    <>
      <AppearancePicker />
      <View style={styles.block}>
        <Heading text="Colour" />
        <View style={styles.inline}>
          {(Object.keys(colours) as (keyof typeof colours)[]).map((k) => (
            <View
              key={k}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: color.boundary,
                backgroundColor: color[colours[k]],
              }}
            />
          ))}
        </View>
        <Select
          label="Colour role"
          values={Object.keys(colours) as (keyof typeof colours)[]}
          value={role}
          onChange={setRole}
        />
        <View style={styles.inline}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: color.boundary,
              backgroundColor: color[colours[role]],
            }}
          />
          <AppText text={color[colours[role]].toUpperCase()} />
        </View>
      </View>
      <View style={styles.block}>
        <Heading text="Typography" />
        <Select
          label="Type style"
          values={Object.keys(typeStyles) as (keyof typeof typeStyles)[]}
          value={type}
          onChange={setType}
        />
        <AppText variant={typeStyles[type]} text="A day in the Nilgiris" />
        <AppText
          subdued
          text={`${type === "Heading" || type === "Section" ? "Bricolage Grotesque" : "Source Sans 3"} · ${fontSize[typeRole]} / ${lineHeight[typeRole]} at default text size`}
        />
      </View>
      <View style={styles.block}>
        <Heading text="Spacing" />
        <Select
          label="Spacing step"
          values={Object.values(space).map(String)}
          value={spacing}
          onChange={setSpacing}
        />
        <View style={[styles.inline, { gap: Number(spacing) }]}>
          <View
            style={{
              width: 30,
              height: 30,
              backgroundColor: color.key,
              borderWidth: 1,
              borderColor: color.boundary,
            }}
          />
          <View
            style={{
              width: 30,
              height: 30,
              backgroundColor: color.key,
              borderWidth: 1,
              borderColor: color.boundary,
            }}
          />
        </View>
      </View>
      <View style={styles.block}>
        <Heading text="Motion & targets" />
        <AppText
          text={`${touchTarget} ${Platform.OS === "ios" ? "pt" : "dp"} minimum touch target. Capture uses 56. ${reduced ? "Reduced motion is on." : `Selection settles in ${motion.selection} ms.`}`}
        />
        <View style={styles.inline}>
          <FoldGlyph key={replay} moving color={color.action} />
          <Action label="Replay motion" onPress={() => setReplay(replay + 1)} />
        </View>
      </View>
    </>
  );
}
