import { themes } from "./generated/themes.ts";

export { themes };
export type Appearance = keyof typeof themes;

export function appTheme(appearance: Appearance) {
  const { semantic, component } = themes[appearance];
  const { color, space, fontSize } = semantic;
  return {
    semantic,
    component,
    colors: {
      canvas: color.canvas,
      paper: color.surface,
      ink: color.ink,
      subdued: color.secondaryText,
      line: color.boundary,
      accent: color.action,
      accentWash: color.actionWash,
      danger: color.error,
    },
    spacing: {
      small: space.step8,
      medium: space.step16,
      large: space.step24,
      section: space.step40,
    },
    typeScale: {
      caption: fontSize.caption,
      body: fontSize.body,
      section: fontSize.section,
      title: fontSize.chapter,
    },
    motion: { state: semantic.motion.selection },
  };
}

export const { colors, spacing, typeScale, motion } = appTheme("light");
