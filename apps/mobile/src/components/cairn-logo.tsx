import { Image, useWindowDimensions, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { publicEnvironment } from "../env";
import { FoldGlyph } from "./fold/glyph";
import { AppText } from "./fold/primitives";

export function CairnLogo({ heading = false }: { heading?: boolean }) {
  const { theme } = useUnistyles();
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(fontScale, 1.35);
  const name = publicEnvironment.appName;
  if (name !== "Kairn") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexShrink: 1,
        }}
      >
        <FoldGlyph color={theme.semantic.color.ink} />
        <AppText
          text={name}
          variant="section"
          accessibilityRole={heading ? "header" : undefined}
        />
      </View>
    );
  }
  return (
    <Image
      accessible
      accessibilityLabel={name}
      accessibilityRole={heading ? "header" : "image"}
      source={require("../../assets/brand/horizontal.png")}
      resizeMode="contain"
      style={{
        width: 116 * scale,
        height: 36 * scale,
        maxWidth: "100%",
        tintColor: theme.semantic.color.ink,
      }}
    />
  );
}
