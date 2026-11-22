import { themes } from "@kairn/design-tokens";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useReduceMotionPreference } from "./motion";

export function FoldGlyph({
  kind = "pleats",
  color,
  moving = false,
}: {
  kind?: "pleats" | "arrow" | "check";
  color: string;
  moving?: boolean;
}) {
  const reduced = useReduceMotionPreference();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pulse.setValue(1);
    if (!moving || reduced) return;
    const sequence = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: themes.light.semantic.motion.selection,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: themes.light.semantic.motion.selection,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
      { iterations: 3 },
    );
    sequence.start();
    return () => sequence.stop();
  }, [moving, reduced, pulse]);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 18,
        height: 18,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {kind === "pleats" ? (
        <Animated.View style={{ opacity: pulse, flexDirection: "row", gap: 1 }}>
          {[-18, 18, -18].map((angle, i) => (
            <View
              key={i === 1 ? "middle" : i === 0 ? "first" : "last"}
              style={{
                width: 4,
                height: 12,
                backgroundColor: color,
                opacity: i === 1 ? 0.65 : 1,
                transform: [{ skewY: `${angle}deg` }],
              }}
            />
          ))}
        </Animated.View>
      ) : kind === "check" ? (
        <View
          style={{
            width: 7,
            height: 12,
            borderRightWidth: 2,
            borderBottomWidth: 2,
            borderColor: color,
            transform: [{ rotate: "42deg" }],
          }}
        />
      ) : (
        <>
          <View style={{ width: 13, height: 2, backgroundColor: color }} />
          <View
            style={{
              position: "absolute",
              right: 2,
              width: 8,
              height: 8,
              borderRightWidth: 2,
              borderTopWidth: 2,
              borderColor: color,
              transform: [{ rotate: "45deg" }],
            }}
          />
        </>
      )}
    </View>
  );
}
