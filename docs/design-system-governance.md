# Design-system governance and rollout · Phase 7

**Founder-approved · 18 November 2026.** Maintain Kairn’s design system in the same repository as its web and Expo apps. Release the smallest useful set internally and adopt it in private journey creation and history first. Public web and Android launch still depends on complete R1 acceptance. Native iPhone development and testing follow each workstream; public distribution comes later. [Delivery sequence and release criteria](product-requirements.md#18-implementation-order-and-complete-release)

The design decisions trace back to the [principles and audit](design-system-audit.md). The [foundations](design-system-foundations.md), [tokens](design-system-tokens.md), [components](design-system-components.md), [flows](design-system-flows.md) and [accessibility and content guidance](design-system-accessibility.md) define the contracts reviewed here.

## Who changes what

The founder owns the public token names, shared component behaviour, accessibility decisions and words that describe ownership or audience. A helper or AI coding agent can propose and implement a change. Use the feature PR as the decision record. When working alone, the founder can author and review the evidence. A standing design council would add another queue for a team of one to three.

| Change | Contributor brings | Founder reviews |
| --- | --- | --- |
| Reuse an existing pattern | Name the journey task and approved component; include the screen’s ordinary state and relevant failure or recovery state. | Can a person complete the task with the intended audience, keyboard and large text? |
| Change a shared role or component | Show the current problem, existing consumers, proposed behaviour, main alternative and a representative before/after. Update source, affected docs, specimen and checks together. | Inspect one real consumer per affected platform. For a changed save or sharing label, inspect the event or permission that makes the label true. |
| Use a platform-specific exception | Record the reason, affected surface, owner and a concrete revisit point in the PR. Example: retain the system Photos picker for scoped selection. | Keep deliberate native differences. Revisit temporary workarounds at the named milestone. |

Give an AI contributor the [component contract](design-system-components.md), [relevant flow](design-system-flows.md) and [accessibility rules](design-system-accessibility.md). Ask it to identify the existing role before adding one. For example, a waiting upload uses the existing sync status. A new “offline yellow” would introduce a second meaning for the same condition. Use synthetic journeys and media in PR evidence.

## Versioning, deprecation and rollback

The private token package starts at **0.1.0**. A value correction that preserves meaning is a patch. An additive role is a minor change. Removal or a change of meaning, type or unit is a major change under the project’s versioning policy. Record the old name, replacement, affected consumers and removal version alongside the change. [Token contract](design-system-tokens.md#generation-and-versioning)

For a rename, introduce the replacement and retain the old public name as a deprecated alias resolving to the same value across appearances. Migrate the web, Unistyles, Compose and Swift consumers that use it. Check that both names resolve through the migration, then search for old references before removal in the next major release. For a regression, revert the source and regenerate all outputs together. Approve a corrected expected screenshot only after deciding that the changed appearance is intentional.

## Figma and code parity

Git holds the approved token values, English state labels and component behaviour. The [foundations](design-system-foundations.md) and browser specimens give a solo maintainer a review surface today. Introduce a Figma library when a helper regularly works there. A Figma-first workflow would require the founder to reconcile two edited copies.

When adopted, map Figma variables to semantic token paths, with Light, Dark and Outdoor modes. Link components back to their repo contract. On each design-system release, record the token version and commit in the library description. Compare the same example in both places, including the outdoor card border, source permission text and a long fare at large type. Route discrepancies through the feature PR, update code and the library from the agreed source, and record platform-native differences explicitly. Until a Figma library exists, record parity as “not applicable”.

## Visual regression

The [route screenshot test](../tests/web/route-visual.playwright.ts) compares the specimen’s recorded sections, gap, marker and dashed estimate against three reviewed PNGs at a 360 CSS px viewport. It crops to the evidence drawing so browser chrome and font rasterisation do not dominate the diff. Run `pnpm exec playwright test tests/web/route-visual.playwright.ts`. For an intentional change, inspect expected, actual and diff, regenerate just this test with `--update-snapshots`, review the PNGs alongside the token or component change, then rerun normally. Adding artwork for a new state also needs a behaviour assertion. [Visual comparisons](https://playwright.dev/docs/test-snapshots) · [Accessibility checks](../tests/web/design-accessibility.playwright.ts)

As production surfaces land, add stable fixtures for private-history empty/error, queued capture, merge conflict, a withdrawn source, and the Learn fare card. Fix locale, appearance, viewport, fonts and fixture data. Use Linux Chromium for text-rich web baselines; record separate Android emulator and iPhone Simulator OS, device and font scale for native captures. Compare before/after on each affected platform. Track real-phone glare, TalkBack, VoiceOver and media timing separately. Screenshots cannot demonstrate recovery or recipient permissions.

## Rollout

| Stage | Scope and evidence to leave behind |
| --- | --- |
| First internal design-system release | Use the private 0.1.0 package, generated outputs, approved docs, specimens and checks at one Git revision. First production adoption is create private journey → private history. Verify empty history, invalid input, failure/retry, account isolation and one entry for a member with multiple capabilities. |
| Capture and coauthoring · workstreams 2–5 | Adopt field controls, upload status, source grants, revision comparison and transcript review as their underlying capabilities ship. Verify offline restart, one logical upload on retry and retained edits. |
| Story, Explore and Learn · workstreams 6–7 | Adopt chapter, map/list, media and practical-info components together with the approved viewer projection. Verify gap semantics, historical costs and sensitive-location removal in both visible and accessible outputs. |
| Sharing, discovery and reuse · workstreams 8–10 | Adopt personal highlights, catalog filters, saved references and cited answers. Verify one listing per event and current access on old links. Run the complete five-person scenario before community release. [Acceptance scenario](product-requirements.md#201-full-product-acceptance-scenario) |

## How to measure adoption

At each workstream review, the founder records counts and exceptions in the PR or linked evidence. Establish the first production baseline with create/history; include the numerator and denominator so one new screen cannot disguise an untested platform. Use the implemented surface on each platform as the counting unit. A package import alone cannot show whether a screen handles interruption or withdrawal correctly.

| Signal | Measurement and use |
| --- | --- |
| Token adoption | Count eligible production surfaces using the approved semantic/component roles over all eligible implemented surfaces, by platform. List deliberate native controls separately. Inspect repeated literals before adding a token. |
| State and accessibility coverage | For each touched flow, count verified applicable states over specified applicable states. Record web, Android and iPhone separately; mark untested cases and link evidence. Prioritise gaps that can lose a capture or reveal a private item. |
| Migration health | At a version change, count production references to deprecated names and list their owners. Retire the alias when the migration and compatibility window are complete. |
| User outcome | In acceptance sessions, measure successful photo contribution, active organiser review time, and finding the sourced fare within 60 seconds. Separate waiting and failures. After launch, count each intentionally shared canonical journey with a meaningful external view once; report private keepsakes separately. Exclude identifiable bots/member previews and keep private media and precise coordinates out of analytics. [Experience targets](application-design.md#10-experience-and-performance-acceptance) · [Product metric definitions](product-plan.md#82-funnel-and-metric-definitions) |

**Checkpoint evidence.** The three screenshot comparisons passed on macOS and Linux ARM64 Chromium. A deliberate change from a dashed estimate to a solid line failed the Light comparison as expected. The full local web run passed 12 tests and skipped the opt-in identity test. Workspace checks passed. Emulated Linux AMD64 Chromium closed before it could capture the page; hosted AMD64 CI is still unverified for these new baselines.

The founder approved all seven design-system phases. The next engineering milestone is [private journeys and membership](progress.md#next-milestone).
