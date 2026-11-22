# Journey interactions

These behavioral requirements supplement the [Fold component contract](../../DESIGN.md). Use the product requirements for permissions, data and release scope.

## Priority 1 · Capture, ownership and recovery

| Component | Anatomy and variants | States, interaction and accessibility | Web / Android / iPhone |
| --- | --- | --- | --- |
| Quick capture | Visible destination, Photo and Voice buttons, secondary Video, Write and Import. Outside a journey default to Personal moments · Only me. | Ready, recording, saving, saved, interrupted, storage full or permission denied. Tap Start/Stop, show elapsed time and clip limit, offer Write or Import on denial. Announce recording and durable save. Request location only at capture. A missing fix permits saving. | File input and supported media controls / camera, microphone, system picker / native capture and Photos picker. iPhone launch web retains file import. |
| Sync and offline status | Per-item status and journey queue with counts, wait reason, Retry and Cancel. Display storage and audience on separate lines. | Saving → Saved on this device → Queued → Uploading → Uploaded privately. Distinguish Wi-Fi, sign-in and failed verification. Name an independent backup only after its checkpoint. Preserve the last local original on cancel. Announce transitions, skip percentage chatter. | Status region and progress / TalkBack status, queue sheet / VoiceOver announcement, queue sheet. |
| Contributor chip and attribution badge | Initials/avatar plus approved name. Credit creator or speaker separately from uploader. Owner and grant appear in authorised details. | Unknown creator, attributed, selected filter, withdrawn. A public credit uses the approved identity. Expose “Photo by Mira, contributed by Anu” as text. A filter chip exposes selected state. | Text credit or toggle button / labelled selectable chip / labelled button with selected trait. |
| Visibility selector | Two controls. Owner chooses Only me, Journey review or Allow journey publication and sharing. Publisher chooses Members only (default), Anyone with the link or Public and discoverable. | Journey review admits the owner and active coauthors/publishers. Explain forwardable links and permitted exports. Preview location redaction and the exact recipient view. Widening needs valid grants and fresh consent for narrower wording. Listing is explicit. Name selected option and blockers. | Radio groups and preview dialog / single-select sheet, system Back / single-select sheet, Done or Cancel. |
| Empty, error and loading panel | Heading, reason and one usable next action. Variants cover first capture, empty filters, partial load and inaccessible publication. | Keep loaded text and successful imports during retry. Offer Clear filters or Retry affected items. Private/unavailable links show generic copy and a report contact. Announce completion; hide decorative skeletons. | Inline status or blocking alert / inline panel with TalkBack / inline panel with VoiceOver. |

## Priority 2 · Coauthoring and reading

Use one primary media item per moment. Thumbnails keep the timeline readable on weak connections. Autoplaying the full collection would spend data and interrupt a voice note.

| Component | Anatomy and variants | States, interaction and accessibility | Web / Android / iPhone |
| --- | --- | --- | --- |
| Moment card | Time, lead media or text, caption, creator credit and source link. Edit adds selection and save state; Story shows approved content. | Draft, selected, pending media, approved or unavailable. Preserve text-only observations. Give Open and Select separate names and targets. | Article with link and checkbox / list item with separate actions / accessible row with separate actions. |
| Day and segment header | Day/date, phase, title and optional distance. A day can contain multiple segments or a stay without a track. | Expanded, collapsed, selected, unknown date. Announce heading level, phase and expansion. Show distance only when supported. | Heading and disclosure button / expandable heading row / disclosure row with heading trait. |
| Timeline | Ordered moments, active day, previous/next and move controls in Edit. Share selection across Story, Explore and Learn. | Browsing, selected, reordered, pending save. Preserve scroll and keyboard focus. Offer Move up/down and announce new position. | Ordered list and buttons / list with accessible move actions / list with VoiceOver actions and visible buttons. |
| Map markers, route and elevation | Labelled stops, solid recorded track, dashed estimate, selected ring, elevation by recorded km. Label branches and contributors. | Confirmed travel can have an unknown path. Leave gaps in track and profile; label elevation in m. Preserve selection across Map/Satellite; manual pan pauses following. Full stage list works offline or without gestures. Reduced motion jumps directly. | Map plus keyboard stage list / native map and TalkBack list / native map and VoiceOver list. |
| Media viewer | Photo, video poster or gallery, caption, credit, Close and Previous/Next. | Loading, ready, playing, paused, unsupported, failed. Load full media on request. One player runs at once. Provide the applicable [media alternative](#accessible-media-and-publication), explicit controls and focus return. | Figure or dialog with native video / full-screen viewer, system Back / full-screen viewer with Close. |
| Voice-note player | Play/Pause, elapsed/total, seek, speaker, transcript and linked time offset. | Buffering, playing, ended, transcript pending or unavailable. Keep original audio playable. Read seek position in minutes/seconds. Provide skip buttons alongside scrubbing. | Audio with keyboard slider / adjustable seek control / VoiceOver-adjustable control. [W3C seek example](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/) |
| Conflict review | Field name, current shared text, retained local edit, editor/time and editable result. | Stale, comparing, merged, saved or changed again. Preserve both candidates through dismissal and retry. Recheck grants before restore. Read versions in order. | Comparison panel / stacked sheet / stacked sheet. |

## Priority 3 · Sharing and research

| Component | Anatomy and variants | States, interaction and accessibility | Web / Android / iPhone |
| --- | --- | --- | --- |
| Personal highlight selection | Own approved contributions, cover, order, caption and inherited audience preview. | Eligible, empty or permission changed. Offer explicit group selection or journey link when empty. Public highlights lead to the full approved journey. Members-only uses an authenticated link; static cards require eligible unlisted/public material. Announce selected count. | Checkbox list, copy link / selector and share sheet / selector and activity sheet. |
| Practical-info card | Category, arrangement, reporter, observation date and evidence. Covers transport, stays, equipment, rentals, guides, costs and lessons. | Not recorded, Author reported or Source linked. Open permitted evidence at its timestamp. Corrections enter private review; preserve observation date. Use headings and labelled values. | Article and source link / detail row / detail row. |
| Cost summary | Amount, original currency, exact/estimated, unit, group size, inclusions and date. | “₹2,400 per vehicle · 4 passengers.” Separate group and per-person bases, missing values and currencies. Read amount with its basis. | Definition list or table / stacked labelled rows / stacked labelled rows. |
| Filters | Discover uses destination, activity, dates and status. Learn uses category. Show applied choices, count and Reset. | Unapplied, applied or zero matches. Keep choices on Back. Announce result count after Apply. A chip has a named remove action. | Fieldset or filter dialog / bottom sheet / sheet with Apply. |

Use provenance labels for practical knowledge because a rating cannot explain who paid a fare or when. Use distinct owner and publisher selectors because a single “Share” switch hides whose consent is needed. [Source scopes](product-requirements.md#23-source-sharing-scopes) · [Experience brief](application-design.md)

## 1. Capture in the field

**Companion · Open journey → Capture → Voice → Stop.** Keep the destination and audience visible before recording. Anu says, “The taxi cost ₹2,400 for the four of us.” A foreground location fix is optional. Confirm **Saved on this device** after the recording and its metadata persist. Anu can pocket the phone here. A capture started outside a journey lands in Personal moments under Only me.

**Return and contribute.** Show why upload is waiting and offer Retry or Cancel. A completed local save survives a supported restart; a retry uses the same moment. After private upload verification, Anu selects the destination and source grant. Journey review admits active coauthors and designated publishers. Allow journey publication and sharing makes the note eligible for publisher selection. Contribution completes when the service accepts it. If Anu switches accounts, suspend her queue. If membership expires before retry, her original stays private and recoverable.

**Recovery and choice.** If the microphone is denied, offer Write or Import. If recording is interrupted, show the recoverable portion when available and offer Record again. If storage is full, say the new recording could not be saved. Keep existing captures. Asking for GPS, transcription or a full logistics form before saving would delay the one action that matters in the field. [Capture and sync](product-requirements.md#5-capture-offline-saving-and-synchronisation)

## 2. Review the auto-assembled story

**Coauthor · Journey → Review draft → Day 2.** Build a departure-to-return sequence from source times, imported tracks and accepted corrections. Separate departures can converge for the activity and diverge on return. Keep stays, rest days and transfers even without GPS. Show text and representative thumbnails first. Expand a chapter to see the remaining sources or move a moment with buttons or drag.

**Decide what needs attention.** Put a review-only photo under **Must resolve** if selected for publication. Request permission for that exact source and audience, or exclude it and continue, including after a refusal or expiry. Put an uncertain stop under **Optional improvements**. Keep route gaps visible. Confirm the suggested fare’s date, currency and group basis against Anu’s recording. Preserve corrections when more material arrives.

**Finish.** The designated publisher previews the exact recipient view, checks sensitive locations and chooses the audience. First publication defaults to Members only. Recheck grants when publishing; a changed grant returns the affected item to review. Reviewing chapter highlights first keeps a 200-photo trip manageable. A contact sheet remains available for finding a specific photo. [Draft and review](application-design.md#5-draft-and-review)

## 3. Coauthor and resolve a conflict

**Coauthor · Edit chapter → Save → Compare edits.** Mira revises the arrival caption offline. On reconnect, Anu’s newer version is already in the shared draft. Keep both texts, credit each editor and identify the affected field. Offer **Keep shared wording**, **Use my wording** or **Combine wording**. Let Mira edit the result and choose **Save to shared draft**.

**Recover.** Dismissing the comparison keeps the attempted edit. If another revision arrives during review, refresh the shared candidate and preserve Mira’s proposed wording for another comparison. If editing access has been revoked, retain her unsent work privately and block the shared write. Compare, merge and restore only sources the editor can still access. A successful merge creates one attributed draft revision; readers continue seeing the approved publication until the publisher reviews and republishes. Last-save-wins would discard a companion’s account. [Shared editing rights](product-requirements.md#7-contribute-and-coauthor-with-explicit-rights)

## 4. Share personal highlights

**Active member · Approved journey → Share my highlights → Preview → Share.** Start with Mira’s approved, attributed contributions. She can choose a cover, reorder eligible moments and add a personal caption. Retain original credits. If she has no eligible moments, offer a deliberate group selection or the ordinary journey link.

**Check the recipient’s reach.** Members only produces an authenticated member link with a generic external preview. Anyone with the link is forwardable. A public highlight offers a route to the full approved public journey. Offer a static card only for eligible unlisted or public material. Use the system share sheet on phones and a copyable link on web. If a source is withdrawn, recheck the hosted selection and remove the affected material. Explain that downloaded cards can persist. Sharing a selection keeps later corrections attached to the same event; duplicating the story would split them. [Highlights and access](product-requirements.md#13-share-approved-personal-highlights)

## 5. Discover a public journey

**Publisher → visitor · Public publication → Submit listing → Discover → Story.** The publisher previews destination aliases, category, visit dates, status and summary. Show Pending review, Listed or Removed. After approval, a signed-out visitor can search Coonoor, filter the results and see one listing for the event across all companions’ highlights. Show visit dates separately from updates. Another group’s departure gets its own result.

**Open and return.** Story opens with text and thumbnails. Explore loads the map on request; a stage list works if tiles fail. Back restores the results and filters. For no matches, offer to clear a filter. If access changed after search, show a generic unavailable page and report contact. Removing a listing affects Discover; unpublishing also closes the hosted reader. Explicit listing lets a group choose public reading and catalog participation separately. [Discovery requirements](product-requirements.md#141-discovery-and-saved-reference-requirements)

## 6. Research a similar trip

**Planner · Learn → Transport → Fare card → Hear source.** Show “₹2,400 per vehicle · 4 passengers”, who reported it, the observation date and whether it was exact or estimated. The source action opens the approved note at the relevant timestamp. Play on request. Back restores the card. Categories and text search work signed out; leading with chat would add a step for a known fact.

**Save or investigate.** Save invites sign-in, returns to the card and stores a private reference with an optional note. If access was withdrawn during sign-in, suppress the stale preview and explain that the journey is unavailable. Ask also resumes after sign-in. Cite accessible evidence and attribute conflicting reports. For “What does this taxi cost today?”, explain that the journey only records the earlier fare. If a source disappears, refresh the card and citation according to current access. Starting a future trip creates a separate journey with its own group and dates and a link to the earlier account. [Saved research](product-requirements.md#143-reuse-by-another-group) · [Answer rules](product-requirements.md#152-sources-and-answer-rules)

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
