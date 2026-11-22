# Unified application experience

| Field | Value |
|---|---|
| Version | 1.3 |
| Date | 20 November 2026 |
| Scope | Android phones, iPhone, and responsive web. No dedicated iPad, tablet, desktop-native, watch, or television application. |
| Authority | [Requirements](product-requirements.md) own behaviour and release scope; this document owns navigation, interaction, and experience budgets. [Architecture](architecture.md) owns implementation. |
| Status | Implementation brief with interaction rules and acceptance targets. |

## 1. Experience direction

The founder has interviewed prospective users and identifies a unified, easy, responsive experience as the product priority. The interface should let a person capture, organise, collaborate, publish, and learn without reconstructing the trip across separate tools. Further demand-validation work is outside the build scope. Usability and performance verification remain engineering acceptance work.

The creator is completing a task; the recipient is experiencing a story; the learner is finding an answer. Use a calm, familiar interface for creation and let approved photography and narrative lead the reader. One shared journey, consistent vocabulary, and preserved context connect these jobs. A unified experience means consistent concepts and continuity, not identical web and native widgets.

## 2. Navigation and entry points

The web sidebar links to **Dashboard**, **Journeys**, **Discover** and **Saved**. Its account menu shows the current profile and offers **Account**, **Appearance** and **Sign out**. Dashboard is the default signed-in home. The sidebar starts expanded at 80rem, uses an icon rail from 48rem, and opens as a drawer below 48rem. Users can override the sidebar width at either desktop size. On iPhone and Android, Dashboard is the first tab alongside Journeys, Discover and Saved. Account remains available from the screen header. The bottom bar uses two rows at large text sizes and full-width labels at the largest sizes. Help, privacy, and usage are available from Account. Create journey is available from Dashboard and Journeys. Capture/Add is an action inside the selected journey. A capture outside a journey defaults to personal material and can be assigned later.

Journeys opens the most recently active journey when explicitly resumed; otherwise it shows history and an obvious create/join action. A journey opens its current useful state: capture/contribution during a trip, draft review during preparation, and approved Story for a completed publication. Status never moves someone automatically while they are editing.

Journeys also contains a clearly labelled **Personal moments** entry with an Unassigned filter and Capture/Import actions. These items default to Only me. Account-owned saved items and unsent work are recoverable here after restart or signing back into the same account, subject to the documented device/browser storage limits. Assigning an item to a journey requires an explicit destination and source grant; placement alone never grants group access.

Within a journey, **Story**, **Explore**, and **Learn** are views of the same record. The top-level Discover catalog is never labelled Explore. Contributor tools appear through an explicit Edit action and contextual Add, People, Review, and Share controls. Do not expose all domain modules as tabs. On narrow screens, use one primary work surface at a time; on desktop, a chapter rail, work area, and optional inspector may coexist.

The current web release uses a dedicated account layout for signed-out visitors, including visitors opening Story. Direct workspace links preserve their intended destination through verified sign-in and any required onboarding. Broader publication links can preserve the permitted view, chapter, moment, and pending action as those surfaces are implemented. Validate return destinations against an allowlist. Back restores list filters, scroll position, selection, and unsent edits. [Web account access](../plans/web-account-access.md)

Eligible accounts see a welcome with their display name and a choice of first action after the first verified sign-in. They resume at the first unfinished step after interruption. On completion the person can open Dashboard or continue to an explicit, validated destination. Dashboard offers a planning or recording action when the person chose one and has no journeys yet. See the [onboarding and Dashboard implementation plan](../plans/first-run-onboarding-and-dashboard.md).

## 3. Create and contribute

Create requires a title or editable suggested title, trip dates as known, and timezone context. End date can remain open. Invite friends is optional; one organiser can complete the journey without a response from anyone else. Select the destination and sharing scope once for a batch, with an explicit summary before committing. Never make an import silently public.

Use three role presets in ordinary invitations: Participant, Contributor, and Coauthor. Contributor is a participant who can add their own sources; coauthor can review contributed sources and edit. Administrator and Publisher are explicit additional capabilities in People. Presets do not weaken the capability matrix or grant raw-original export.

An invitation shows the trip, inviter, proposed capability, and what joining does before acceptance when access permits. Expired, revoked, already-accepted, wrong-account, and unavailable states have a safe action. A signed-out permission request resumes on the exact eligible asset list after authentication, with the audience and approve/decline choices visible.

## 4. Capture and import

Keep the capture destination visible. Show permission requests at the relevant action with a usable denial path. Capture never waits for transcription, map loading, or a location fix. Distinguish **Saving**, **Saved on this device**, **Waiting to upload**, **Uploading**, **Uploaded privately**, **Shared with group**, and publication state. Successful feedback follows durable saving; button animation is not proof that bytes are saved.

Import is select → review → add. Group permitted items by day, expose uncertain dates and unsupported items, retain successful items when one fails, and support batch selection. Use thumbnails and paging/virtualisation; do not decode 500 originals to display a selection grid. Missing GPS does not prevent the story. Provide a supported iPhone/Safari path for ordinary HEIF photos and short HEVC/MOV clips through a qualified conversion path. Camera-setting changes or desktop conversion are not the primary fallback for ordinary group participation.

Progress shows completed/remaining items, waiting reason, and cancel/retry controls. A truthful state is preferable to an invented time estimate. Wi-Fi-only, expired sessions, low storage, cloud-only selections, missing files, and quota waits remain distinct. Cancellation preserves the last local original.

## 5. Draft and review

Maintain an explicit distinction between the complete source collection and the selected story. Generate an editable chronological draft with bounded representative highlights per chapter; let the user expand a chapter or include more. Initial selection uses deterministic metadata and user choices; visual similarity or quality models are optional, never required for a usable draft. Do not delete unselected originals or merge ownership across people.

The review queue has **Must resolve** for rights/privacy conflicts and **Optional improvements** for unknown places, missing details, or aesthetic choices. Unknown or estimated travel may remain publishable. Group related decisions, support batch confirmation, and preserve accepted corrections. A source without publication permission can be requested or excluded without restarting review.

Autosave shows saving, locally saved, synced, or conflict. Never substitute a spinner for recovery. Conflicts show the current version and retained attempted change, with compare/combine actions. Reordering has keyboard and non-drag controls. Closing an editor does not discard unsent changes without an explicit decision.

## 6. Learn and practical knowledge

Offer an optional five-prompt debrief after a trip: how the group reached the start, where it stayed, what it rented/arranged, what it paid and for how many people, and what it would do differently. Text and voice are equal entry paths; the user can skip topics. R1 transcription and practical-detail extraction support English only. Explain that limit before voice processing, preserve unsupported recordings for playback, and offer manual English notes without silently translating or inventing details. A private keepsake does not need a logistics checklist.

Extraction produces reviewable cards with source, observation date, units, and uncertainty. Show not recorded, author reported, or source linked; none is a current-safety certification. Request a missing detail from a named companion only by an intentional action. A single request must not become a general chat thread.

Learn opens practical categories and search before a conversational interface. Ask is a secondary action for questions not resolved by those cards. Display scope and dates; answers cite accessible evidence, and missing evidence offers a bounded clarification request rather than invented advice. A correction enters the publisher's private queue and requires deliberate approval before publication.

## 7. Review, audience, and sharing

R1 supports all three publication audiences. The publication review uses the same viewer contract as the reader. Explain **Members only**, **Anyone with the link**, and **Public and discoverable** in plain language. Members-only is an approved, read-only publication for active members, not draft access. Public discovery is a separate explicit listing action.

Default a first publication to Members only. Widening the audience requires publisher review and currently valid source grants. Existing reuse grants must disclose that a designated publisher can widen the publication to public; never reinterpret a grant collected under narrower wording. Public-facing fields and derivatives are reviewed for the widest audience actually selected.

Show a cover, title, audience, selected source eligibility, and any remaining blocker. Optional listing metadata is requested only when listing: destination/region, category, visit dates, completion state, and a short useful summary. Source dates and publication dates remain distinct.

Personal highlights remain selections of approved material. A members-only share opens only for active members and does not offer an externally downloadable social card. Unlisted/public links are forwardable; public highlights expose a route to the complete approved public journey. Preview that boundary before sharing.

Audience and source-grant explanations must say that active members may export the approved fields and derivatives they are permitted to read. Members only controls managed access; it cannot prevent members retaining permitted copies or recall copies already exported. Another person's raw originals still require a separate owner-issued grant.

For groups that want public logistics without personal photos, use a knowledge-focused selection in the same canonical approved publication: exclude private media, publish permitted reports, and preserve provenance. R1 does not maintain simultaneous independent private and public narratives. The preview must explain the trade-off.

## 8. Reading and discovery

Story opens with a useful title, visit dates, summary, and initial content before map/AI code. Preserve image dimensions to prevent layout shifts. Load responsive derivatives; open full media on demand. Audio/video never autoplay during scrolling, and only one player may run at a time.

Explore loads a map only on explicit entry/action. Keep day/moment selection across Story, Explore, and Learn; avoid remounting the map on every selection or style change. A complete stage list remains available if maps fail. Learn can deep-link back to supporting text, media, or a real transcript offset.

Discover uses approved destination aliases, category, visit dates, and status. Present a bounded first page and explicit filters; no map per card. An empty result explains that coverage is limited and offers filter adjustment or relevant available destinations without pretending to have a global route inventory. Saved references stay distinct from completed trips.

## 9. Component system

Use owned shadcn/Tailwind components on web and native controls with Unistyles on phones. Share semantic tokens, terminology, evidence labels, and pure rules; preserve platform navigation, keyboard, focus, and accessibility expectations. Do not add a second UI framework for visual uniformity.

[Fold](../../DESIGN.md) defines the shared palette, typography and spacing, along with web and native component interactions. [Journey interactions](journey-interactions.md) covers product-specific content, accessibility and recovery.

Controls need focus, pressed, disabled, loading, error, and success states where applicable. Labels accompany unfamiliar icons. Use at least 44 logical-point iPhone and 48 dp Android touch areas as product targets; primary web touch controls target 48 CSS px and must meet WCAG 2.2 AA including spacing exceptions. Provide visible focus, scalable text, contrast, screen-reader names, and non-colour evidence distinctions. [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Use the Fold motion timings on web and respect reduced-motion preferences on every platform. No decorative loading choreography, scroll capture, forced overlays for every photo, or modal chains for ordinary editing. Use progressive disclosure for rarely used controls without hiding the next task. [Fold motion](../../DESIGN.md#feedback-icons-and-motion) · [Progressive disclosure research](https://www.nngroup.com/articles/progressive-disclosure/).

## 10. Experience and performance acceptance

These are adopted engineering targets to test, not measured results or market benchmarks. Record the fixture, browser/build, host, network, and assistance for every result. A failed target requires an explicit product/engineering decision; do not silently move the threshold.

| Outcome | Target and measurement |
|---|---|
| First contribution | After authentication and invitation acceptance, an unassisted person can select and contribute 10 ordinary photos in at most 2 minutes of active effort; network waiting is reported separately. |
| Useful draft | On a 5-person, 5-day fixture with 200 photos, 5 short clips, and 5 voice notes, produce an initial text/thumbnail draft within 10 seconds of metadata becoming ready. Audio/video can remain visibly pending. |
| Organiser effort | At least 4 of 5 representative task attempts reach an approved story within 15 minutes of active organiser work after source selection; record selection/upload/processing time and every failure separately. This is usability verification, not new demand research. |
| Reader comprehension | At least 4 of 5 task attempts identify the trip sequence and locate a supplied transport/cost detail within 60 seconds without an account or map gesture. |
| Navigation | Capture/Add is reachable within 2 explicit actions from an open journey. A mode switch preserves day/moment and back restores the prior context. |
| Web responsiveness | p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1. Use repeatable pre-release lab runs; field p75 becomes available only after deployment. |
| Public first load | Initial compressed JS ≤250 KiB and initial viewport transfer ≤1 MiB, including CSS, fonts, and initial media on the declared fixture. Map/editor/AI-provider SDK code is absent from this path. These are project budgets, not standards. |
| Input feedback | Visible feedback for ordinary actions within 100 ms; an already-loaded local view transition completes within 200 ms at p75 on the declared test profile. Acknowledgement of durable save waits for actual persistence. |
| Native lists | Target 60 fps interaction on a 60 Hz test profile, bounded mounted rows, and no sustained freeze during the 500-item stress fixture. Profile release builds; simulator timing is a development comparison, not a physical-phone claim. |
| Resource lifecycle | At most one live map and one playing media item per journey surface. After 20 enter/leave cycles, listeners, players, and view instances return to their expected baseline; measured memory stabilises within the declared bounded cache budget. |
| Accessibility | Primary flows pass keyboard, VoiceOver/TalkBack where available, reduced-motion, large-text, and map-free reading tests. Dragging has a non-drag alternative. |

The Core Web Vitals thresholds come from [web.dev](https://web.dev/articles/vitals). The remaining numerical budgets are product engineering decisions. Optimise from profiles and task results, not framework popularity. [React Native performance guidance](https://reactnative.dev/docs/performance).

## 11. Implementation handoff

For each production workstream, provide the relevant route/state contract, ordinary and failure states, fixture, permissions, and acceptance result. Implement the [requirements delivery sequence](product-requirements.md#182-dependency-aware-implementation-sequence) in the same application. Navigation/state foundations, durable capture, media/rights, default draft/debrief, publication/reader, sharing/catalog, and answers all use this experience contract.

The [development and validation plan](development-and-validation.md) defines MacBook/simulator/web execution and evidence limits.
