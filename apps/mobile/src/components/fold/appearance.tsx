import { useAppearancePreference } from "../../appearance";
import { Select } from "./controls";

const appearances = {
  System: "system",
  Light: "light",
  Dark: "dark",
  Outdoor: "outdoor",
} as const;
export function AppearancePicker() {
  const { preference, selectAppearance } = useAppearancePreference();
  const choices = Object.keys(appearances) as (keyof typeof appearances)[];
  const current =
    choices.find((name) => appearances[name] === preference) ?? "System";
  return (
    <Select
      label="Appearance"
      values={choices}
      value={current}
      onChange={(name) => selectAppearance(appearances[name])}
    />
  );
}
