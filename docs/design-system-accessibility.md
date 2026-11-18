# Accessibility and content · Phase 6

**Founder-approved · 18 November 2026.** Kairn’s minimum is WCAG 2.2 AA on web. Apply the same user outcomes on Android and iPhone through native focus, text sizing and assistive technology. A companion must be able to stop a recording one-handed; a visitor must be able to follow a split departure by listening; a planner must be able to establish who paid a fare and when. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Approved flows](design-system-flows.md)

## Interaction contract

| Decision | Implementation and acceptance |
| --- | --- |
| Size the hit area for the task | Give Photo, Voice and Stop at least **56 × 56** logical units. Other primary touch controls target **48 × 48 dp on Android, 44 × 44 pt on iPhone and 44 × 44 CSS px on web**. The glyph can remain 24 units. Keep Stop away from Discard and offer separate taps for starting and stopping. Hold-to-record requires sustained contact through gloves. WCAG 2.5.8 sets a 24 × 24 CSS px web minimum with defined exceptions. For undersized map pins, provide equivalent, adequately sized stage-list controls. [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| Preserve reading order, focus and input choices | Give each day a heading. Put credit and source actions after the moment they describe. Buttons expose their visible name, role and state. On opening a sheet, move focus inside; on dismissal, restore it to the opener or the next available item. Keep focused controls visible above sticky bars and the keyboard. Offer Move up/down alongside drag, and give every action a keyboard path. [Keyboard](https://www.w3.org/TR/WCAG22/#keyboard) · [Focus visibility](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum) |
| Preserve meaning at larger sizes | Honour browser zoom, iOS Dynamic Type and Android font scaling. At 200% web text size, wrap captions and stack fares with their units. Check a 320 CSS px viewport for horizontal page scrolling. On phones test the largest supported accessibility text settings. Keep the source credit, audience and Save/Cancel actions reachable. A truncated “₹2,400 per…” loses the fact the planner came for. [Resize text](https://www.w3.org/TR/WCAG22/#resize-text) · [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| Make states legible in every appearance | Require 4.5:1 for ordinary text and 3:1 for large text (18 pt regular or 14 pt bold and above). Essential control boundaries, states and graphics need 3:1 against adjacent colours. Pair colour with labels, icons or line patterns. Check focus rings and route casings over actual Map/Satellite tiles, and captions over snow and night footage. Use opaque surfaces in Outdoor. [Text contrast](https://www.w3.org/TR/WCAG22/#contrast-minimum) · [Non-text contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) |
| Announce useful changes | Announce recording start/stop, durable local save, actionable failure and completed reordering once. Keep ordinary progress polite; reserve immediate announcements for failures needing immediate action. A queue can say “3 of 5 uploaded” on inspection. Announcing every tick masks the next control. Pair haptics with visible and spoken feedback. Reduced motion uses instant selection and a stationary camera until explicitly repositioned. [Status messages](https://www.w3.org/TR/WCAG22/#status-messages) |

## A journey that works by ear

Offer **View stages** before activating the map. Give the list the same permitted stages, selection and source actions as the map. Example reading order: “Day 2, transfer. Coonoor. Train travel confirmed by Mira. Path estimated.” Give branch participants where approved, distance in km, elevation in m and gaps in recording. A rest day stays in the sequence. For elevation, give the meaningful changes and available values by segment. A map-wide “Route map” label cannot communicate this information.

Selecting a stage updates the marker and profile without moving focus out of the list. Provide labelled pan, zoom, previous, next and pause controls as applicable. Keep list navigation available when tiles fail. On VoiceOver and TalkBack, group each stage’s descriptive text and expose its actions separately. Apply the same location redaction to labels, bounds, accessibility descriptions and source links as to visible pins. [Geographic evidence](product-requirements.md#82-evidence-categories) · [Complex images](https://www.w3.org/WAI/tutorials/images/complex/) · [Dragging alternatives](https://www.w3.org/TR/WCAG22/#dragging-movements)

## Accessible media and publication

| Medium | Author, player and publication behaviour |
| --- | --- |
| Photo | Supply concise alt text for its purpose in this moment. “Tea fields below houses in Coonoor” describes the scene. Keep photographer credit separate. Hide decorative duplicates from assistive technology. Use only approved identities and locations. |
| Prerecorded voice note | Provide an equivalent transcript with speaker changes and meaningful sounds. Keep it adjacent to Play, with real time offsets when available. Name the control “Play Anu’s taxi fare note”; expose paused state, duration, adjustable seek and skip buttons. |
| Silent video | Supply equivalent descriptive text or a descriptive audio track conveying the visual sequence. A poster image alone loses changes over time. |
| Video with sound | Supply synchronised captions for speech, speaker changes and meaningful sounds. Provide audio description when essential visual information is absent from the soundtrack. A transcript also supports reading and search. Allow playback on request and one active player at a time. |

For example, a taxi clip might caption Anu saying “₹2,400 for all four of us” as she speaks. If only the picture shows that the group changes vehicles, describe that change in the audio. Make caption size adjustable, keep timing aligned after seeking, and keep controls clear of the caption area.

Explain English-only automatic transcription before processing. Preserve the original and mark uncertain speech for review. Check rupee amounts, group size and local names against the recording. If processing fails, the author can still play the private recording and supply an accurate alternative. At publication review, offer to complete the applicable alternative or omit the affected media and publish the rest. Redact sensitive details from the media **and** its alternatives; after withdrawal, remove affected text, citations and media from recipient outputs. [W3C media requirements](https://www.w3.org/TR/WCAG22/#time-based-media) · [Audio description at AA](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html) · [Kairn media scope](product-requirements.md#153-media-boundaries)

## Voice, tone and microcopy

Use Indian English and sentence case. In capture, lead with what happened and what the companion can do now. In Story, preserve the contributor’s words and attribution. In Learn, give the observation, date, source and unit before interpretation. Keep original spellings in names and notes. Prefer specific action labels such as **Retry upload** and **Save to shared draft**; a generic “Continue” hides the consequence.

| Situation | Suggested copy |
| --- | --- |
| Offline after durable save | “Saved on this device. Waiting for Wi-Fi.” Offer **Upload now** only if the person can override that preference. |
| Save failed | “Couldn’t save the recording. Device storage is full. Free up space and try again.” If a partial recording survived, offer **Review recording**. |
| Review-only grant | “You, active coauthors and designated publishers can review this note.” Explain each wider audience before the owner consents. |
| Stale edit | “Anu updated this caption. Your wording is saved on this device.” Use that last sentence only after persistence. Offer **Compare versions**. |
| Historical fare | “₹2,400 per vehicle · 4 passengers. Reported by Anu on 12 Jun 2026.” For a current-price question: “This journey records the June fare. Today’s fare is unknown.” |
| Unavailable link | “This journey is unavailable.” Offer a report contact. Keep private titles, locations and member names out of the message and its spoken announcement. |

## Checkpoint evidence

[Six Chromium regression checks](../tests/web/design-accessibility.playwright.ts) cover the three design specimens at 320 CSS px with 200% root text, automated accessibility scans, the route schematic’s accessible name in all three appearances, withdrawal from the member’s accessible fare card, and keyboard focus and edit retention. [Token tests](../tests/design-tokens.test.ts) check contrast on the defined solid surfaces.

**Manual acceptance during implementation:** with TalkBack on Android and VoiceOver on iPhone, record offline, hear the save state and return to that item. Follow a split route and track gap via the list. With audio muted, follow a captioned clip; with the screen hidden, follow its essential visual events. At maximum text size inspect the fare and audience, then complete a sharing decision. Record device, OS, settings, expected output, actual result and any assistance. Physical glove use, glare, native speech output and real media timing remain open. [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps)
