import { type ComponentRef, useEffect, useRef } from "react";
import { AccessibilityInfo, type Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AppText } from "../fold/primitives";

export function JourneyFlowHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (mounted && enabled && heading.current)
          AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <View style={journeyFlowStyles.heading}>
      <AppText
        ref={heading}
        text={title}
        variant="title"
        accessibilityRole="header"
      />
      {description && <AppText text={description} subdued />}
    </View>
  );
}

export const journeyFlowStyles = StyleSheet.create(
  ({ semantic: { border, color, space } }) => ({
    heading: { gap: space.step4 },
    section: { gap: space.step8 },
    actions: {
      borderTopWidth: border.control,
      borderTopColor: color.boundary,
      paddingTop: space.step12,
      gap: space.step8,
    },
  }),
);
