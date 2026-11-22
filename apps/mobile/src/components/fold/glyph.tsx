import { themes } from "@kairn/design-tokens";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useReduceMotionPreference } from "./motion";

export function FoldGlyph({
  kind = "cairn",
  color,
  moving = false,
}: {
  kind?: "cairn" | "arrow" | "check";
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
      {kind === "cairn" ? (
        <Animated.Image
          source={require("../../../assets/brand/mark-small.png")}
          resizeMode="contain"
          style={{ width: 18, height: 16, tintColor: color, opacity: pulse }}
        />
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
