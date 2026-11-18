const appearances = ["light", "dark", "outdoor"];
const banner =
  "// Generated from packages/design-tokens/tokens. Edit the DTCG source.";
const capitalize = (name) => name[0].toUpperCase() + name.slice(1);

const swiftWeights = [
  "ultraLight",
  "thin",
  "light",
  "regular",
  "medium",
  "semibold",
  "bold",
  "heavy",
  "black",
];

function quoteFamily(name, compose) {
  const escaped = name.replace(/["\\$\p{Cc}\p{Zl}\p{Zp}]/gu, (character) => {
    if (character === '"' || character === "\\") return `\\${character}`;
    if (character === "$") return compose ? "\\$" : "$";
    const hex = character.codePointAt(0).toString(16);
    return compose ? `\\u${hex.padStart(4, "0")}` : `\\u{${hex}}`;
  });
  return `"${escaped}"`;
}

function kotlinDouble(value) {
  const literal = String(value);
  return /[.e]/.test(literal) ? literal : `${literal}.0`;
}

function kotlinUnit(literal, unit) {
  return `${literal.startsWith("-") ? `(${literal})` : literal}.${unit}`;
}

function nativeValue({ path, type, value }) {
  switch (type) {
    case "color": {
      const hex = value.slice(1).toUpperCase();
      return {
        compose: ["Color", `Color(0xFF${hex})`],
        swift: ["Color", `Self.srgb(0x${hex})`],
      };
    }
    case "dimension": {
      const text = path.some(
        (part) => part === "fontSize" || part === "lineHeight",
      );
      return {
        compose: text
          ? ["TextUnit", kotlinUnit(`${value}f`, "sp")]
          : ["Dp", kotlinUnit(`${value}f`, "dp")],
        swift: ["CGFloat", String(value)],
      };
    }
    case "duration": {
      const literal =
        Number.isInteger(value) && Math.abs(value) <= 2_147_483_647
          ? String(value)
          : kotlinDouble(value);
      return {
        compose: ["Duration", kotlinUnit(literal, "milliseconds")],
        swift: ["TimeInterval", String(value / 1_000)],
      };
    }
    case "number":
      return {
        compose: ["Double", kotlinDouble(value)],
        swift: ["Double", String(value)],
      };
    case "fontWeight": {
      const index = Math.min(8, Math.max(0, Math.round(value / 100) - 1));
      return {
        compose: ["FontWeight", `FontWeight(${value})`],
        swift: [
          "FontWeight",
          `.init(value: ${value}, swiftUI: .${swiftWeights[index]})`,
        ],
      };
    }
    case "fontFamily":
      return {
        compose: [
          "List<String>",
          `listOf(${value.map((name) => quoteFamily(name, true)).join(", ")})`,
        ],
        swift: [
          "[String]",
          `[${value.map((name) => quoteFamily(name, false)).join(", ")}]`,
        ],
      };
    case "cubicBezier":
      return {
        compose: [
          "CubicBezierEasing",
          `CubicBezierEasing(${value.map((point) => `${point}f`).join(", ")})`,
        ],
        swift: ["CubicBezier", `.init(${value.join(", ")})`],
      };
    default:
      throw new Error(
        `Unsupported native token type ${type} at ${path.join(".")}`,
      );
  }
}

function composeProperty({ name, values }) {
  const [[type, value]] = values;
  if (values.every(([, expression]) => expression === value)) {
    return `    public val ${name}: ${type} get() = ${value}`;
  }
  const cases = values.map(
    ([, expression], index) =>
      `            ${capitalize(appearances[index])} -> ${expression}`,
  );
  return [
    `    public val ${name}: ${type}`,
    "        get() = when (this) {",
    ...cases,
    "        }",
  ].join("\n");
}

function swiftProperty({ name, values }) {
  const [[type, value]] = values;
  if (values.every(([, expression]) => expression === value)) {
    return `    public var ${name}: ${type} { ${value} }`;
  }
  const cases = values.map(
    ([, expression], index) =>
      `        case .${appearances[index]}: return ${expression}`,
  );
  return [
    `    public var ${name}: ${type} {`,
    "        switch self {",
    ...cases,
    "        }",
    "    }",
  ].join("\n");
}

const swiftColor = `    private static func srgb(_ hex: UInt32) -> Color {
        Color(.sRGB,
              red: Double((hex >> 16) & 0xFF) / 255,
              green: Double((hex >> 8) & 0xFF) / 255,
              blue: Double(hex & 0xFF) / 255)
    }`;

const swiftFontWeight = `    public struct FontWeight: Sendable {
        public let value: Int
        public let swiftUI: Font.Weight
    }`;

const swiftCubicBezier = `    public struct CubicBezier: Sendable {
        public let x1: Double
        public let y1: Double
        public let x2: Double
        public let y2: Double

        fileprivate init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
            self.x1 = x1
            self.y1 = y1
            self.x2 = x2
            self.y2 = y2
        }

        public func animation(duration: TimeInterval) -> Animation {
            .timingCurve(x1, y1, x2, y2, duration: duration)
        }
    }`;

export function nativeOutputs(themes) {
  const byAppearance = appearances.map(
    (appearance) =>
      new Map(themes[appearance].map((token) => [token.path.join("."), token])),
  );
  const [light] = byAppearance;
  for (const [index, tokens] of byAppearance.entries()) {
    const appearance = appearances[index];
    if (
      tokens.size !== themes[appearance].length ||
      tokens.size !== light.size
    ) {
      throw new Error(`Invalid native token paths in ${appearance}`);
    }
  }
  const names = new Set();
  const compose = [];
  const swift = [];
  for (const key of [...light.keys()].sort()) {
    const { path, type } = light.get(key);
    const [tier, ...parts] = path;
    const name = tier + parts.map(capitalize).join("");
    if (names.has(name))
      throw new Error(`Duplicate native token name ${name} at ${key}`);
    names.add(name);

    const values = byAppearance.map((tokens, index) => {
      const token = tokens.get(key);
      if (token?.type !== type) {
        throw new Error(
          `Missing or incompatible ${appearances[index]} native token ${key}`,
        );
      }
      return nativeValue(token);
    });
    compose.push({ name, values: values.map((entry) => entry.compose) });
    swift.push({ name, values: values.map((entry) => entry.swift) });
  }

  const swiftTypes = new Set(swift.map(({ values }) => values[0][0]));
  const swiftHelpers = [];
  if (swiftTypes.has("FontWeight")) swiftHelpers.push(swiftFontWeight);
  if (swiftTypes.has("CubicBezier")) swiftHelpers.push(swiftCubicBezier);
  if (swiftTypes.has("Color")) swiftHelpers.push(swiftColor);

  return {
    "generated/compose/KairnTokens.kt": `${banner}
package dev.kairn.tokens

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

// Text dimensions use sp and layout dimensions use dp. Font families are ordered fallback names.
// Use semanticMotionInstant for reduced motion.
public enum class KairnTokens {
    ${appearances.map(capitalize).join(", ")};

${compose.map(composeProperty).join("\n\n")}
}
`,
    "generated/swift/KairnTokens.swift": `${banner}
import SwiftUI

// Multiply font size and line height points by a view's @ScaledMetric(relativeTo:) scale.
// Font families are ordered fallback names. Font weights provide the nearest SwiftUI weight.
// Use semanticMotionInstant with accessibilityReduceMotion. TimeInterval values are in seconds.
public enum KairnTokens: Sendable {
    case ${appearances.join(", ")}

${[...swift.map(swiftProperty), ...swiftHelpers].join("\n\n")}
}
`,
  };
}
