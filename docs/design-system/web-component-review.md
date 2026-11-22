# Fold web component review

Reviewed the owned modules under `apps/web/src/components/ui`, the production catalog, and representative account, onboarding, journey and People flows. Inset key is the approved primary web button. The catalog now shows the approved component’s ready, busy, saved and disabled states. [Design contract](../../DESIGN.md) · [Owned components](../../apps/web/src/components/ui/) · [Catalog](../../apps/web/src/routes/design-system.tsx)

| Components | Finding and disposition |
| --- | --- |
| Button | Onboarding drew a second arrow, and several submissions kept the idle arrow while their text said “Saving” or “Sending”. Onboarding, authentication, password reset, profile editing and invitation sending now use the shared pending treatment. A button-styled link retains link semantics. |
| Field, Input, Textarea, NativeSelect | The catalog and profile editor now mark invalid field groups as well as inputs. The catalog shows a visible required label, focuses the invalid input and describes its error. Textarea and select share field styling and retain native editing and picker behavior. |
| ScheduleInput | The start and optional end fields support a single masked text box with persistent format hints and automatic separator advancement, a Monday-first calendar with direct month selection and nearby or typed years, and a 24-hour clock with every minute available. Keyboard checks cover Tab to the picker button and back, mid-value replacement, per-part errors, paste, single-digit padding and first-invalid selection, leap-day selection, cancelling a partial draft, arrow navigation, applying a time and restoring focus. Both popups participate in accessibility checks. |
| Selection | Checkbox and radio use native inputs and labelled targets. Switch now hides its custom thumb when the OS draws the native forced-colours control. Pointer presses briefly compress the choice indicator, including through its label. Reduced motion applies the state immediately. Keyboard checks cover Space, radio arrows and disabled choices. |
| Sidebar, Tabs | The catalog index exposed nine current links on one page. Its links now point directly to focusable section headings and announce one current location. Sidebar instances have their own trigger and panel IDs. Active rows and tabs keep a citron face on hover and press and an underline in forced colours. An inset outline identifies keyboard focus on the active item. Both tab orientations support arrow keys. |
| DropdownMenu, Tooltip | A modal action menu hid focusable background content from assistive technology. Ordinary action menus now open non-modally. Escape and selection return focus as appropriate. A named sort group demonstrates checked menu items. Tooltips wrap within the viewport and dismiss with Escape. |
| Dialog, Sheet | Mixing logical positioning with a physical transform moved a dialog partly offscreen in RTL. The shared dialog now centres in either direction and reserves room for its close target. The finder restores focus after shortcut dismissal, and navigating to a result focuses its heading. Sheet and dialog both have titles, descriptions and close controls. |
| Alert, Progress, Skeleton, Empty | Neutral updates previously inherited assertive announcements. Status is now the default, with alert reserved by default for destructive feedback. The catalog exercises waiting, interrupted, uploading, complete, loading and empty states. Progress has a name and value. Skeletons have accompanying loading text. |
| Card, Avatar, Badge | Rows pair a visible name and role with a disclosure. Duplicate avatar initials are now decorative in the catalog, matching production. The badge remains readable text, and ordinary cards add no keyboard stop. |
| Toast, FoldMark, ContentLoading | A single polite receipt confirms completion on an inverse surface. Its label, dismiss control and focus indicator inherit colours from that surface. Durable feedback and actionable errors stay inline. Finite pleat motion, static skeletons and a labelled launch state share the catalog and application. |
| Appearance switcher | Its visible value was missing from its accessible name. The labelled trigger now includes the current appearance, and the icon-only version keeps its action name. System follows the OS and an explicit choice persists after reload. |

The application shell now gives each route a descriptive browser-tab title. Titles identify the task and omit private journey names. The route map is checked against the generated router types. [Application shell](../../apps/web/src/routes/__root.tsx) · [Navigation regression](../../tests/web/reader.playwright.ts)

## Follow-up catalog review · 22 November 2026

At 320 CSS px and 200% text, the Colour dialog originally needed 405 px for its 240 px scrollport. Its rows now stack, titles and close buttons have separate space, and the finder, foundation dialogs and row-details sheet fit horizontally. The narrow calendar exposes full month, year and day choices. **Use date** commits the day after browsing, and **Go** applies a typed year before selection can resume. The mask retains its full width by moving the picker trigger below it when needed. [Dialogs](../../apps/web/src/components/ui/dialog.tsx) · [Schedule input](../../apps/web/src/components/ui/schedule-input.tsx)

The catalog toolbar stays visible while the index follows reading position and explicit destinations. The collapsed rail has a persistent selection edge. Calendar and clock selection also have contrasting edges, and the sort chevron retains its expanded orientation with reduced motion. Clay text on clay measures 4.64:1. The catalog demonstrates field availability, disabled choices, bookmark commands, compact cards, avatar sizes, typography, motion and touch targets. [Catalog](../../apps/web/src/routes/design-system.tsx) · [Foundations](../../apps/web/src/components/design-system/foundations.tsx) · [Specimens](../../apps/web/src/components/design-system/specimens.tsx)

The independent reviewer checked six viewport widths from 320 to 1280 px at default and doubled text. The corrections cover focus after Save, Discard, Retry and Add, idle feedback on disabled controls, selection at the end of the catalog, and committing a date while a year edit is unfinished. Production Join and People confirmations now use the busy treatment. Account uses the shared card spacing and regional loading pattern.

All 25 catalog checks passed in Chromium, WebKit and Linux Firefox. The web build, workspace types, 75 unit tests, 41 standalone Chromium checks and 14 service-backed Chromium scenarios passed. Changed-source Biome checks passed. The repository-wide Biome run reported errors in the existing agent skill bundles. The later Pixel 8 follow-up covers physical touch editing. Spoken checks remain open. [Catalog regressions](../../tests/web/fold-atlas.playwright.ts) · [Journey regressions](../../tests/web/journeys.playwright.ts) · [People regressions](../../tests/web/journey-people.playwright.ts)

## Journey accessibility follow-up · 22 November 2026

Submitting an empty journey queued two schedule errors while focus moved to Title. The date and time fields now expose submitted errors through their descriptions. Errors discovered during editing still use the field’s polite live region. Saving a journey also left focus on the document body. When the detail view first loads, it now focuses the journey heading if focus is on the body. Both issues reproduced before the fixes. The service-backed Chromium suite passed all six scenarios afterward, including a keyboard save with the server response held pending. [Schedule input](../../apps/web/src/components/ui/schedule-input.tsx) · [Journey detail](../../apps/web/src/routes/journeys_.$journeyId.tsx) · [Journey regression](../../tests/web/journeys.playwright.ts)

On a physical Pixel 8 running Android 17 and Chrome 157 at 411 CSS px, Android Back originally navigated away from an unsaved journey with a picker open. It also changed catalog location under an open overlay. After the fix, Back dismissed the date picker, time picker, sort menu, dialog and sheet, kept the URL and restored focus to each trigger. The next Back navigated normally. The phone’s numeric keyboard entered **2027-02-29** and **08:61**. Submitting selected the invalid day and then the invalid minute. Replacing them with **28** and **30** cleared their errors. Dismissing the clock kept the corrected draft, and saving focused the new journey heading. Long-press selection replaced an entire date, and Android’s Copy and Paste actions restored the original formatted value. Calendar and clock selection, a menu action and the visible receipt also passed by touch. [Physical-device regression](../../tests/operations/android-overlay-back.mjs)

For the spoken walkthrough, use a test account and record the words heard and the focused control at any step that differs.

1. Open **Create journey** and activate **Save journey** with the form empty. Expect focus on **Title** and its required-field error. The two schedule errors should be available when visiting their fields.
2. Enter a title, then enter **2027-02-29** and **08:30** as the start. Submit and check that the day is selected for correction. Replace **29** with **28**. Verify the corrected date and its format hint.
3. Activate **Choose start time**, then dismiss with Escape. Expect focus back on the trigger and the time to remain **08:30**. Save and listen for the new journey heading once.
4. In the catalog’s **Menus & overlays**, open **Sort moments** and dismiss with Escape. Expect focus back on **Sort moments**. In **Feedback**, activate **Show confirmation** once and listen for “Sample changes saved.” once.

## Base UI migration and independent review

The web app resolves shadcn’s `base-nova` registry and `@base-ui/react` 1.9.0. Action menus, dialogs, sheets, popovers, tooltips, tabs, avatars and receipts use the new foundation. Form selects, checkboxes and radios keep their browser behavior. The web production dependency tree, source and compiled client and server artifacts were checked for the previous library. Expo Router owns its separate mobile transitive dependencies. [Component configuration](../../apps/web/components.json) · [Web dependencies](../../apps/web/package.json)

The independent pass reproduced a wrong-theme cold start and Space activating links styled as buttons. The entry document now applies the saved canvas before the bundle arrives. ButtonLink renders a real anchor with the shared Inset key, preserving Enter for navigation and Space for scrolling. The catalog also exercises password visibility and the same editable calendar and clock fields as journey creation. [Entry document](../../apps/web/index.html) · [ButtonLink](../../apps/web/src/components/ui/button.tsx) · [Field specimens](../../apps/web/src/components/design-system/specimens.tsx)

## Verification and remaining work

The catalog regressions exercise the public route, keyboard activation, focus return, open overlays, control relationships, alert states, forced colours, and 320 CSS px reflow at 200% root text. The service-backed suites exercise authentication, onboarding, creation, invitations, People and the workspace sidebar. [Catalog tests](../../tests/web/fold-atlas.playwright.ts) · [Workspace tests](../../tests/web/workspace-sidebar.playwright.ts) · [Journey creation tests](../../tests/web/journeys.playwright.ts)

Measured in Chromium, the following settled colour pairs use the rendered web theme. Field borders and focus rings were compared with the field surface. The remaining rows compare text or a glyph with its own fill.

| Contrast pair | Light | Dark | Outdoor |
| --- | ---: | ---: | ---: |
| Field border / surface | 4.24:1 | 4.96:1 | 10.13:1 |
| Focus ring / surface | 6.57:1 | 12.07:1 | 10.34:1 |
| Secondary text / surface | 5.98:1 | 8.07:1 | 11.87:1 |
| Inset glyph / key | 12.36:1 | 10.73:1 | 12.36:1 |
| Receipt label / receipt surface | 15.91:1 | 13.22:1 | 18.05:1 |
| Primary label / button | 15.01:1 | 13.05:1 | 12.96:1 |

Before the follow-up review, all 21 catalog checks passed in Chromium, WebKit and Linux Firefox. The production journey regression selects its start through both pickers, saves, and recovers the same journey after a dropped response.

The Firefox crash reproduced in axe-core 4.14.1’s `target-size` rule at 320 CSS px with 200% text. In the catalog layout, naming a section via its descendant heading reproduced the crash. Giving the two sections their existing accessible names directly preserved the landmarks and allowed all three narrow scans to finish. The feedback-state and full-page audits run in each appearance. The enlarged-text onboarding and invitation scans also run in Firefox after aligning the region and radio names with their visible labels. Both service-backed scenarios passed twice in succession. [Catalog regressions](../../tests/web/fold-atlas.playwright.ts) · [CI workflow](../../.github/workflows/ci.yml)

Axe reports Base UI’s generated, empty keyboard focus guards as hidden tab stops in Chromium and unnamed ARIA buttons in WebKit. The catalog tests recognize these two findings only on exact empty guard elements. All other nodes and rules remain in scope. The keyboard suite checks focus entry, Escape, selection and return. Confirm the guards’ spoken behavior with assistive technology during manual review.

Spoken announcement timing and reading order still need a listener in VoiceOver/Safari and NVDA/Firefox. Use the journey walkthrough above to record the actual utterances. The Pixel run exercised the controls with device touch input and the installed keyboard. This review covers web. [Playwright testing guidance](https://playwright.dev/docs/accessibility-testing)

The implementation was checked against current upstream guidance with the repository’s pinned versions. Recheck the affected interaction when refreshing a primitive or updating a dependency. [Dependency versions](../../apps/web/package.json) · [shadcn Field](https://ui.shadcn.com/docs/components/base/field) · [Base UI accessibility](https://base-ui.com/react/overview/accessibility) · [IMask pattern and overwrite behavior](https://imask.js.org/guide.html#masked-pattern) · [React useId](https://react.dev/reference/react/useId) · [TanStack navigation](https://tanstack.com/router/latest/docs/framework/react/guide/navigation) · [Tailwind forced colours](https://tailwindcss.com/docs/forced-color-adjust) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
