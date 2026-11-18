# Journey patterns and flows · Phase 5

**Founder-approved · 18 November 2026.** Follow one group’s trip to Coonoor. Anu records what four passengers paid for a taxi. Mira edits the chapter. A friend later opens Mira’s highlights, and another traveller looks up the fare. The people and amounts are illustrative. [Approved components](design-system-components.md) · [Interactive conflict review](design-system/flows.html)

Carry the journey, day and selected moment through Story, Explore and Learn. Back restores the previous selection, filters, scroll position and pending work. Recheck access before restoring protected content. On phones, show one work surface at a time. On wider web layouts, the selected chapter can stay alongside its inspector. Use the same English labels on web, Android and iPhone.

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

## Acceptance at implementation

Use the five-person, five-day fixture. Target ten contributed photos within two minutes of active effort, an initial text/thumbnail draft within ten seconds of metadata readiness, and an approved story within fifteen minutes of active organiser work in four of five attempts. In four of five reader attempts, the visitor should identify the sequence and find the supplied fare within sixty seconds, account-free and map-free. Measure waiting separately. Also exercise restart, a second stale save and source withdrawal from a previously shared link. [Experience budgets](application-design.md#10-experience-and-performance-acceptance) · [Release scenario](product-requirements.md#201-full-product-acceptance-scenario)
