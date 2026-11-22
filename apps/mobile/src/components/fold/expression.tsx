import { Image, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { styles } from "./controls";
import { FoldGlyph } from "./glyph";
import { AppText } from "./primitives";

export function JourneyMap() {
  const { rt } = useUnistyles();
  return (
    <View style={look.map}>
      <Image
        accessible={false}
        resizeMode="contain"
        style={look.print}
        source={
          rt.themeName === "dark"
            ? require("../../../assets/fold/map-dark.png")
            : require("../../../assets/fold/map-light.png")
        }
      />
    </View>
  );
}
export function ContentLoading({
  label,
  skeleton = true,
}: {
  label: string;
  skeleton?: boolean;
}) {
  const {
    theme: {
      semantic: { color },
    },
  } = useUnistyles();
  return (
    <View
      style={styles.group}
      accessibilityRole="progressbar"
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <View style={styles.inline}>
        <FoldGlyph moving color={color.action} />
        <AppText text={label} />
      </View>
      {skeleton && (
        <>
          <View style={look.skeleton} />
          <View style={[look.skeleton, { width: "60%" }]} />
        </>
      )}
    </View>
  );
}
export function Progress({ value, label }: { value: number; label: string }) {
  const now = Math.max(0, Math.min(100, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now }}
      style={look.track}
    >
      <View style={[look.progress, { width: `${now}%` }]} />
    </View>
  );
}
const look = StyleSheet.create(({ semantic: { color, radius } }) => ({
  map: {
    backgroundColor: color.actionWash,
    borderRadius: radius.card,
    alignItems: "center",
    overflow: "hidden",
  },
  print: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 288 / 160,
    height: undefined,
  },
  skeleton: {
    height: 14,
    width: "86%",
    borderRadius: 4,
    backgroundColor: color.divider,
  },
  track: {
    height: 8,
    backgroundColor: color.actionWash,
    borderRadius: 4,
    overflow: "hidden",
  },
  progress: { height: "100%", backgroundColor: color.action },
}));
