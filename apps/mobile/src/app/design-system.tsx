import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Text, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { sections } from "../components/design-system/catalog";
import { AppearancePicker } from "../components/fold/appearance";
import { Disclosure } from "../components/fold/controls";
import { AppText, Field } from "../components/fold/primitives";
import { FoldScreen } from "../components/fold/screen";

export default function DesignSystem() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { fontScale } = useWindowDimensions();
  const {
    theme: {
      semantic: { color },
    },
  } = useUnistyles();
  const matches = sections.filter((s) =>
    `${s.name} ${s.detail} ${s.id} ${s.terms}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <FoldScreen safeBottom density="catalog">
      <View style={styles.hero}>
        {fontScale < 1.7 && (
          <Image
            accessible={false}
            source={require("../../assets/fold/fold.png")}
            resizeMode="contain"
            style={styles.art}
          />
        )}
        <View style={fontScale < 1.7 && styles.heroCopy}>
          <Text accessibilityRole="header" style={styles.wordmark}>
            Fold<Text style={{ color: color.citron }}>.</Text>
          </Text>
          <AppText text="Mobile design system" style={styles.intro} />
        </View>
      </View>
      <AppearancePicker />
      <Field
        label="Component library"
        placeholder="Find a component"
        returnKeyType="search"
        clearButtonMode="while-editing"
        value={query}
        onChangeText={setQuery}
      />
      <View>
        {matches.map((s) => (
          <Disclosure
            key={s.id}
            label={s.name}
            detail={s.detail}
            onPress={() =>
              router.push({
                pathname: "/design-system/[section]",
                params: { section: s.id },
              })
            }
          />
        ))}
        {!matches.length && <AppText text="No matching components." subdued />}
      </View>
    </FoldScreen>
  );
}
const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  hero: {
    backgroundColor: color.dock,
    borderRadius: radius.card,
    padding: space.step16,
    overflow: "hidden",
    minHeight: 96,
    justifyContent: "center",
  },
  art: {
    position: "absolute",
    right: -4,
    top: 0,
    bottom: 0,
    width: "44%",
    height: "100%",
  },
  heroCopy: { width: "61%" },
  wordmark: {
    fontFamily: "FoldHeading",
    fontSize: 40,
    lineHeight: 46,
    color: color.dockInk,
    letterSpacing: -1,
  },
  intro: { color: color.dockInk },
}));
