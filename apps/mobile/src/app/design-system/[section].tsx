import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  type SectionId,
  sections,
} from "../../components/design-system/catalog";
import { Expression, Feedback } from "../../components/design-system/feedback";
import { Foundations } from "../../components/design-system/foundations";
import {
  Buttons,
  Fields,
  Navigation,
  Selection,
} from "../../components/design-system/inputs";
import { Overlays, Surfaces } from "../../components/design-system/surfaces";
import { AppearancePicker } from "../../components/fold/appearance";
import { Action, AppText } from "../../components/fold/primitives";
import { ReceiptProvider } from "../../components/fold/receipt";
import { FoldScreen } from "../../components/fold/screen";

const examples = {
  foundations: Foundations,
  fields: Fields,
  navigation: Navigation,
  selection: Selection,
  feedback: Feedback,
  expression: Expression,
  surfaces: Surfaces,
  overlays: Overlays,
};
export default function ComponentSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const entry = sections.find((item) => item.id === section);
  const router = useRouter();
  const navigate = (id: SectionId) =>
    router.push({
      pathname: "/design-system/[section]",
      params: { section: id },
    });
  const Sample = entry && entry.id !== "actions" ? examples[entry.id] : null;
  return (
    <ReceiptProvider key={section}>
      <Stack.Screen options={{ title: entry?.name ?? "Component library" }} />
      <FoldScreen safeBottom density="catalog">
        {entry ? (
          Sample ? (
            <Sample />
          ) : (
            <Buttons navigate={navigate} />
          )
        ) : (
          <>
            <AppText text="Component not found." />
            <Action
              label="Component library"
              onPress={() => router.replace("/design-system")}
            />
          </>
        )}
        {entry && entry.id !== "foundations" && <AppearancePicker />}
      </FoldScreen>
    </ReceiptProvider>
  );
}
