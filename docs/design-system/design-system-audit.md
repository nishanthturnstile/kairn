# Kairn design system · Phase 1

**Principles and audit for review · 18 November 2026.** The design should follow one moment from capture to publication to later use. A companion can record the taxi fare offline, a friend can hear the approved recording in the story, and a planner can find what the group paid. Each person needs a different presentation of the same evidence.

**Release context.** Web and Android launch first. Native iPhone is developed and simulator-tested now, with responsive web serving iPhone contributors at launch. The stack is React with Tailwind/shadcn on web and Expo/React Native with Unistyles on phones. WCAG 2.2 AA is the minimum. English is the initial interface and processing language. Original text and recordings retain their language. Brand identity is open. [Product plan](../core/product-plan.md) · [Requirements](../core/product-requirements.md) · [Experience brief](../core/application-design.md)

## Six principles and the patterns behind them

### 1. Let a companion put the phone away with confidence

Put labelled Photo and Voice actions within thumb reach of the open journey. Use an opaque control surface for glare and separate tap-to-start and tap-to-stop states for gloves. Keep the destination visible. Confirm “Saved on this device” only after persistence. Show upload waits and retry separately. Capture can finish without signal, a map or a location fix.

A press-and-hold recorder with one success tick is compact, but requires sustained contact and leaves the author guessing whether companions can see the item. Garmin documents the battery/detail trade-off of continuous recording. Kairn R1 accepts imported tracks and bounded foreground fixes. [Garmin recording guidance](https://support.garmin.com/en-US/?faq=3yEuP9Wb1H5kIpJY7miJ96) · [Capture requirements](../core/product-requirements.md#5-capture-offline-saving-and-synchronisation)

### 2. Tell the whole trip in chapters

Use the day and journey phase as the frame, with selected moments inside it. A transfer can lead with a voice note, a rest day with a written observation, a ride with a photo or short clip. Give each moment one lead item, its credit and optional related media. Keep playback deliberate and transcripts reachable. Day One attaches recorded audio directly to an entry.

A chronological gallery is easy to scan but lets a burst of summit photos bury the unphotographed return. Keep the full collection available to authors. [Day One audio](https://dayoneapp.com/guides/tips-and-tutorials/audio-recording/)

### 3. Keep your place when the view changes

Carry the selected day, segment and moment across Story, Explore and Learn. Once Explore opens, scrolling its timeline can select a marker and the corresponding elevation interval. Manual map movement pauses camera following. Offer a labelled resume action and a complete stage list. Use line style and text to distinguish recorded and estimated travel. Leave missing geometry and elevation visibly incomplete.

An always-moving map gives spatial context but costs battery, competes with reading and makes motion sensitivity harder to accommodate. ArcGIS separates guided tours from free exploration, while Wanderlog demonstrates the value of itinerary/map correspondence. [ArcGIS map tours](https://doc.arcgis.com/en/arcgis-storymaps/author-and-share/add-guided-tours.htm) · [Wanderlog](https://wanderlog.com/)

### 4. Credit the person and preserve both edits

Keep one journey in all members’ histories. Credit the photographer or speaker when known, distinguish the uploader, and expose the source owner in contribution details. A personal highlight selects eligible published moments. On conflicting offline edits, retain both versions and let a coauthor compare and combine them.

Per-person copies offer independence but split corrections. Last-save-wins editing can lose work, a limitation Polarsteps documents. Borrow the explicit review decision from Google Docs. [Polarsteps shared editing](https://support.polarsteps.com/hc/en-us/articles/24266763379218-How-to-edit-text-with-Travel-Together) · [Google Docs suggestions](https://support.google.com/docs/answer/6033474?hl=en)

### 5. Show what a later traveller can rely on

Give transport, stays, gear, rentals, guides, costs and lessons the same evidence fields. For example, “₹2,400 for the vehicle · 4 passengers · 12 June” can link to the reporter’s approved voice note at the relevant time. Show observation date, inclusions, exact/estimated status and missing information. Let readers filter categories and return to the supporting moment.

Stars or a single confidence percentage scan quickly but hide what was observed and when. Borrow the specificity of AllTrails’ conditions and fee prompts. [AllTrails trail reviews](https://support.alltrails.com/hc/en-us/articles/360018930652-How-to-write-a-review-for-a-trail)

### 6. Show the audience before anything leaves the group

Separate source permission, journey audience and location precision. Preview the actual recipient view, including map, captions and share card. Default first publication to Members only. Widening the audience requires eligible sources and publisher review. A personal highlight inherits the publication boundary. Explain when recipients can retain exported copies.

A single public/private switch is quicker but cannot express “share the fare, keep my photograph private, hide the pickup point.” Strava separates map visibility from activity access, and Google Photos explains saved copies. [Strava map visibility](https://support.strava.com/en-us/articles/15402012-how-do-i-edit-my-map-visibility-on-strava) · [Google Photos sharing](https://support.google.com/photos/answer/6131416?hl=en)

## Public design-system benchmark

Official guidance checked on 18 November 2026. The applications to Kairn are design recommendations. Usability in gloves, sunlight legibility, battery life and assistive-technology behavior still require device testing.

| System | Documented pattern | What Kairn should borrow |
| --- | --- | --- |
| Material 3 Expressive | Reference, system and component tokens support paired foreground/background roles. Expressive uses shape and size to prioritize actions. | Give Capture the strongest silhouette and at least a 48 dp target on Android. Reserve expressive motion for optional feedback so the still state remains legible in sunlight. [Material tokens](https://github.com/material-components/material-web/blob/main/docs/theming/README.md) · [Expressive research](https://design.google/library/expressive-material-design-google-research) |
| Apple HIG / Liquid Glass | Dynamic colors adapt to appearance. Liquid Glass gives system navigation and controls a layer above content. | Use supported native bars and sheets. Keep captions, fares and offline warnings on a stable surface, including when Reduce Transparency is enabled. [HIG materials](https://developer.apple.com/design/human-interface-guidelines/materials) · [Adoption guide](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) |
| Atlassian | Semantic names retain their purpose across themes. The docs connect design, code and migration. | Give conflict and selection distinct roles across light, dark and outdoor appearances. Document a real edit for each. [Design tokens](https://atlassian.design/foundations/tokens/design-tokens) |
| IBM Carbon | Contextual tokens follow the containing layer. A public matrix records keyboard and screen-reader test status. | Document a fare card on the page and inside a review sheet so its boundary stays visible in both. [Carbon layers](https://carbondesignsystem.com/elements/color/usage/) · [Accessibility matrix](https://www.carbondesignsystem.com/building-blocks/core/components/overview/accessibility-status) |
| Microsoft Fluent 2 | Global values feed aliases that express design intent across platforms. | Share the meaning of selection. Let each platform render focus with its familiar treatment. [Token architecture](https://fluent2.microsoft.design/design-tokens) |
| Adobe Spectrum | Tokens describe a use case and can vary across implementations while retaining intent. | Name the foreground used on media controls and document its backing surface. Test against snow, foliage and night footage. [Design tokens](https://spectrum.adobe.com/page/design-tokens/) |
| US Web Design System | Color grades and example pairings make contrast choices inspectable. | Publish approved text/background pairs for field controls and test each route overlay on the actual basemap. [Color accessibility](https://designsystem.digital.gov/design-tokens/color/overview/) |
| GitHub Primer | Base, functional and component colors support contrast themes. The docs pair color with text and icons. | Show each saved state with its label and icon, including a queued edit that survives dismissal. [Primer color usage](https://primer.style/product/getting-started/foundations/color-usage/) · [Color accessibility](https://primer.style/accessibility/design-guidance/color-considerations/) |

## What travels across platforms

**Share meaning and context.** Use the same destination names (Journeys, Discover, Saved), audience rules, attribution, route evidence and saved states. Authors need quick actions and batch review. Friends need a calm, account-free Story. Planners need filterable Learn cards. The alternative of separate role dashboards forces someone researching a fare to find the journey again before hearing its source.

**Use familiar platform behavior.** Android keeps system Back, native sheets, pickers, font scaling and optional haptics. iPhone keeps navigation-stack back/swipe, native sheets, Photos picker, Dynamic Type, 44 pt touch targets and system haptics. Web keeps URL/history, keyboard focus restoration, accessible dialogs, file inputs and browser zoom. Pair haptics with visible and screen-reader feedback. A single custom shell would make familiar dismissal and recovery gestures less reliable. [Android Back](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture) · [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

**Judge the design against existing budgets.** Serve story text and sized thumbnails before map code, allow one live map and one playing item, and test the existing 2.5-second p75 LCP target. Restart offline after recording and verify the saved item and its destination. At large text sizes, let names, costs and privacy labels wrap. Test mixed-script names and long place names even in the English UI. The reader task is to reconstruct the sequence and find a supplied transport or cost detail within 60 seconds without a map gesture. [Acceptance targets](../core/application-design.md#10-experience-and-performance-acceptance)

## Decisions for this checkpoint

The founder answered these questions on 18 November 2026. The [Phase 2 foundations](../core/design-system/design-system-foundations.md) record the launch defaults and proposed design direction for a founder-led team with up to two helpers.

1. Should background GPS stay with external recorders for R1, as CAP-08 specifies, or is the new brief requesting an explicit scope change?
2. Which scripts should the first typography samples cover for original names, places and notes? Which distance/elevation units and currencies should the samples include? Preserve the reported currency and cost basis in either case.
3. Are there approved brand attributes, colors, logo assets or voice examples? Otherwise, may Phase 2 propose a visual direction around documentary photography and a restrained field interface?
4. Who will maintain the system, and does the team use Figma? The existing web and mobile stacks already establish the code targets.
