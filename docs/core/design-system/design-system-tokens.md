# Design tokens · Phase 3

**Version 0.1.0 · Founder-approved · 18 November 2026.** The approved [foundations](design-system-foundations.md) now have a machine-readable source in Git. English is the sole launch interface language, with Indian English formatting, metric units and INR. Authored names, place names and observations retain their original text. Translation strings, currency amounts and source permissions belong to application data and content.

## Three tiers

| Tier | Example | Who uses it |
| --- | --- | --- |
| Primitive | `primitive.color.pine800` → deep green, `#174940` | Foundation authors define an opaque sRGB value once. |
| Semantic | `semantic.color.action` → pine800 in Light, mint300 in Dark, pine925 in Outdoor | Screens use the same action role against different surfaces. Journey phases, activity types and route evidence use named roles so their meanings survive a palette change. |
| Component | `component.captureButton.background` → `semantic.color.action` | Capture uses this with `component.captureButton.foreground` and the 56-unit target. A button can evolve independently of the recorded route even though both use green today. |

The canonical [base file](../../../packages/design-tokens/tokens/base.tokens.json) uses the Design Tokens Community Group 2025.10 format. Values have a DTCG type, either declared on a group or inferred from an alias. Colours use sRGB components, dimensions use px and durations use ms. The [dark](../../../packages/design-tokens/tokens/dark.tokens.json) and [outdoor](../../../packages/design-tokens/tokens/outdoor.tokens.json) files override semantic paths **before** alias resolution. For example, the Outdoor control boundary propagates to a two-unit moment-card border. [Format report](https://www.designtokens.org/tr/2025.10/format/) · [Colour report](https://www.designtokens.org/tr/2025.10/color/)

## Naming and scope

Use three lower-camel-case segments, `tier.group.role`. Examples include `semantic.phase.restDay`, `semantic.activity.roadTrip` and `component.routeLine.estimatedWidth`. Name primitives for their value or scale position. Name public roles for their purpose. Keep mode names out of paths so switching appearance keeps the API stable. An alias is a full path in braces, such as `{semantic.color.onAction}`.

The first component tokens cover quick capture, moment cards, chapter headings, route lines and sync status. Phase 4 will define their anatomy and states. A value such as the missing portion of a track, a local save receipt or a report’s observation date must come from journey evidence. A colour token can only style it.

## Outputs and consumers

| Target | Use | Platform treatment |
| --- | --- | --- |
| Web | [CSS variables](../../../packages/design-tokens/generated/tokens.css), imported through `@kairn/design-tokens/tokens.css` by the creator and reader. Example: `var(--kairn-component-capture-button-background)`. | Text size, line height and spacing use rem. Borders and route geometry use CSS px. The system dark preference is automatic. Set `data-appearance="light"`, `"dark"` or `"outdoor"` on the document root to override it. Reduced motion zeroes durations. |
| Expo / React Native | [Package API](../../../packages/design-tokens/src/index.ts) exposes `themes.outdoor.component.captureButton` and `appTheme("outdoor")` to [Unistyles](../../../apps/mobile/src/theme.ts). Existing callers retain `colors`, `spacing`, `typeScale` and `motion`. | Numeric layout units and millisecond durations suit React Native. The app follows the system appearance by default. Account lets people choose Light, Dark or Outdoor and saves their choice on the device. |
| Android Compose | [Kotlin bindings](../../../packages/design-tokens/generated/compose/KairnTokens.kt). Example: `KairnTokens.Outdoor.componentCaptureButtonBackground`. | Compose Color, dp for layout, sp for text, typed durations and easing. Font-family names are an ordered fallback list for the host’s font resources. |
| SwiftUI | [Swift bindings](../../../packages/design-tokens/generated/swift/KairnTokens.swift). Example: `KairnTokens.outdoor.componentCaptureButtonBackground`. | SwiftUI Color, layout points and durations in seconds. Apply Dynamic Type scaling to text dimensions in the view and use the instant duration with Reduce Motion. |

Expo remains the shipping mobile architecture. The Compose and Swift files are ready for platform-native consumers if one is introduced. The existing [review specimen](../../design-system/foundations.html) now reads the generated palette and control borders directly. Its English presentation and user-supplied Tamil place name exercise separate concerns.

## Generation and versioning

Edit the source, run `pnpm tokens:generate`, and review the source and generated changes together. Run `pnpm tokens:check` for a read-only regeneration check. The repository’s normal `pnpm check` includes it. The [generator](../../../packages/design-tokens/scripts/generate.mjs) validates this project’s token types and detects missing aliases, cycles, incompatible types and unknown mode overrides. A small Node build step fits the current fixed outputs and requires no additional package. Style Dictionary is the main alternative if more teams need plugins or additional transform formats.

Version the public token contract independently in the [package manifest](../../../packages/design-tokens/package.json). Use a patch for a value correction that preserves meaning, a minor for an additive role, and a major for removing or renaming a public role or changing its meaning, type or unit. For a rename, introduce the replacement, keep the old name through the migration and remove it in the next major. Review palette updates against the [contrast and alias tests](../../../tests/design-tokens.test.ts). The package stays private and its version travels with the repository.

## Checkpoint evidence

Generation freshness, Biome, workspace type checks, production web/Android/iOS builds and client-bundle scans passed. The default unit suite passed 25 tests, including four token regressions. Chromium passed the three ordinary web smoke tests. A separate check exercised the three appearances, automatic dark and reduced motion. Service-backed identity and database integration suites were outside this token check. Kotlin 2.2.21 compiled the bindings against Compose 1.10.5 and a JVM consumer checked representative values. Swift 6 type-checked a SwiftUI consumer against an iOS simulator target. Device rendering and field readability remain for component acceptance.
