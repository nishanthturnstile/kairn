import { describe, expect, it } from "vite-plus/test";
import { appTheme, themes } from "../packages/design-tokens/src/index";

function luminance(hex: string) {
  const linear = (start: number) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("journey design tokens", () => {
  for (const mode of ["light", "dark", "outdoor"] as const) {
    it(`resolves capture and route roles with readable contrast in ${mode}`, () => {
      const { semantic, component, colors } = appTheme(mode);
      const { color } = semantic;
      expect(component.captureButton.background).toBe(color.action);
      expect(component.routeLine.recorded).toBe(color.action);
      expect(component.routeLine.estimated).toBe(color.information);
      expect(
        contrast(
          component.captureButton.foreground,
          component.captureButton.background,
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.accent, colors.accentWash)).toBeGreaterThanOrEqual(
        4.5,
      );
      for (const surface of [color.canvas, color.surface]) {
        expect(contrast(color.boundary, surface)).toBeGreaterThanOrEqual(3);
        for (const label of [
          color.ink,
          color.secondaryText,
          color.success,
          color.warning,
          color.error,
          color.storyAccent,
          color.information,
        ]) {
          expect(contrast(label, surface)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
  it("propagates the outdoor boundary to moment cards without changing geometry or field target sizes", () => {
    expect(themes.light.component.momentCard.borderWidth).toBe(1);
    expect(themes.outdoor.component.momentCard.borderWidth).toBe(2);
    expect(themes.outdoor.semantic.map).toEqual(themes.light.semantic.map);
    expect(themes.outdoor.component.captureButton.minHeight).toBe(56);
  });
});
