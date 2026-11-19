# Design foundations · Phase 2

**Founder-approved · 18 November 2026.** English (India) is the sole launch interface language. Metric units and INR are the defaults. The [Phase 3 token contract](design-system-tokens.md) implements these foundations. Capture uses optional foreground location and tracks imported from other recorders. Use the [visual specimen](../../design-system/foundations.html) to compare the same chapter in three appearances.

## Identity and voice

Use **Kairn** as a working wordmark, set in Source Sans 3 Semibold with ordinary letter spacing. Keep the deep green already present in the bootstrap tokens. Pair it with warm paper, dark ink and a small amount of terracotta for chapter metadata. These choices fit a fare receipt, a coastal drive and a rest-day photograph equally well. A mountain emblem or expedition-badge identity would give trekking disproportionate weight. A bespoke mark can wait until the product name is confirmed. [Existing palette](../../../packages/design-tokens/src/index.ts) · [Product plan](../product-plan.md)

Aim for **observant, calm and precise**. In Story, preserve the contributor’s words. In capture, say where the work is: “Saved on this device.” In Learn, say what the group observed: “₹2,400 for the vehicle, four passengers.” Reserve celebratory language for the authors themselves.

## Colour and appearance

| Role | Light | Dark | Outdoor |
| --- | --- | --- | --- |
| Canvas | `#F6F3EB` | `#111C1B` | `#FFFFFF` |
| Surface | `#FFFFFF` | `#1C2B29` | `#FFFFFF` |
| Ink | `#172C2B` | `#F1F4EE` | `#101815` |
| Secondary text | `#49635F` | `#B5C8BF` | `#293B34` |
| Control boundary | `#78857E` | `#8A9E95` | `#31463D` |
| Primary action | `#174940` | `#9CD5BD` | `#0D382D` |
| Text on primary | `#FFFFFF` | `#112B24` | `#FFFFFF` |
| Information / focus | `#285AA4` | `#A9C8FF` | `#123E81` |
| Success | `#21633F` | `#93D8AC` | `#134729` |
| Waiting / warning | `#80530B` | `#F2C36F` | `#583900` |
| Error / conflict | `#9D2C2D` | `#FFABAC` | `#761D23` |
| Story accent | `#824820` | `#F3BA88` | `#603916` |

Use action green for the next action or current selection. Use a check and verb for success, a clock and reason for waiting, and a labelled recovery action for conflicts. Waiting for signal is routine. Pair focus with a contrasting outer boundary over media. Light and Dark can follow system appearance. Make Outdoor manually selectable for glare, with opaque controls, strong outlines and generous spacing. Automatic brightness-triggered switching could change a capture surface mid-task.

**Palette checks.** On the specified canvas and surface pairs, the lowest calculated text contrast across ink, secondary, information, success, warning, error and story accent is 5.85:1 in Light, 8.18:1 in Dark and 10.02:1 in Outdoor. Primary labels exceed 9:1 and control boundaries exceed 3.4:1 in all three. These are sRGB calculations. Sunlight, actual basemap tiles, photo overlays and platform rendering need separate checks. [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

| Meaning | Accent rule |
| --- | --- |
| Journey phase | Use story accent for travel before and return (outbound/inbound arrows), action green for activity (footsteps), secondary ink for stays and rest days (bed/cup), information blue for transfers (two arrows), and story accent for challenges (flag). Always print the phase name. |
| Activity type | Use action green for Trek, information blue for Road trip, story accent for Cycling, secondary ink for Other. Pair with footprints, car, bicycle or compass and text. Use these accents on neutral surfaces. |
| Map evidence | Recorded track uses a solid action-green 4-unit line. An estimated connection uses a dashed information-blue 3-unit line, 6 on/4 off. Use a contrasting light or dark casing extending 2 units on each side and opaque labels. A captured stop uses a circle, a selected moment a double ring and its name. |

The limited palette keeps phase, activity and status readable together. Seven unique phase hues plus four activity hues would compete with the map. Author-confirmed travel can carry a transport icon even when its path is unknown. Leave a visible break for missing evidence. Use permitted geometry and bounds for the map, profile and stage list. Check Map and Satellite at two zoom levels. A schematic specimen only demonstrates the legend. [Geographic evidence](../product-requirements.md#82-evidence-categories)

## Type, space and motion

| Foundation | Proposed scale and use |
| --- | --- |
| Type | Source Sans 3 for capture, facts and reading text. Use 400 body, 600 labels and 700 emphasis. Use a system serif (Georgia where available, then platform serif) for Story chapter titles. It gives reading a distinct rhythm without downloading another family. |
| Roles | Size/line height at default scale: caption 14/20, control and body 16/24, Story body 18/28, section 22/28, chapter 36/42. Use scalable native text and relative web sizes. Give script fallback and large text room to grow. |
| Scripts | Preserve original spelling. Use platform script fallback, then add a targeted Noto face if a supported device shows missing glyphs. Test “कुल्लू”, “குன்னூர்”, “ಮಡಿಕೇರಿ” and mixed-script credits at 200% text, including vowel marks above and below the line. These are coverage samples for an English UI. [Source Sans 3](https://github.com/adobe-fonts/source-sans) · [Noto](https://notofonts.github.io/) |
| Space and shape | Use 4, 8, 12, 16, 24, 32, 40 and 64 logical units. Put 8 between a label and its value, 16 inside a card, 24 between moments, 40–64 at chapter breaks. Radius 4 for small tags, 8 for controls, 12 for media/cards, circular for map markers. Reserve 56 for primary field targets. |
| Depth | Flat reading surface; 1-unit border for actionable cards, 2 outdoors. Only floating controls and sheets rise above content. Web shadow: 0 4px 16px at 14% black; use native sheet elevation on phones. Outlines carry the boundary in glare. |
| Motion | 180 ms ease-out for selection, 220 ms for an opening panel. Give taps immediate feedback; show save confirmation only after persistence. Reduced motion uses instant selection, static progress text and immediate map updates. Manual panning suspends camera following. |

## Icons, media and illustration

Use **Lucide** for app-owned icons on web and React Native. Its 24-unit grid, 2-unit stroke and rounded ends read clearly together. Use Camera, Mic, Image, MapPin, Lock and CloudUpload with visible labels where intent or state matters. Preserve native back, share and picker controls. Separate platform icon packs would double the mapping work for a small team. Keep the bundled licence notices. [Lucide design language](https://lucide.dev/contribute/icons/design-principles) · [Licence](https://lucide.dev/license)

Lead with a contributor-approved photograph or video poster, keep the original aspect ratio in the viewer, and put credit and captions on an opaque surface. Use one player at a time with explicit play, duration, captions for video and a transcript or its availability for speech. Keep original audio playable if English transcription is unavailable. Use simple line illustrations only to explain something, such as how two disconnected route sections appear. AI-made landscapes would misrepresent a trip if presented as evidence.

## Numbers, maps and costs

| Data | Indian English treatment |
| --- | --- |
| Measures and time | Use m and km, elevation/gain in m, km/h, °C, kg/g, L/mL and h/min as applicable. Use “12 Jun 2026” and a local time with timezone where ambiguity matters. Preserve the trip timezone across midnight. |
| Money | Default new entries to INR. Format ₹1,25,000 and ₹1,250.50 with Indian grouping. Preserve reported currency, paise, date, group size, inclusions and estimate status. Keep other currencies separate. [Unicode number patterns](https://cldr.unicode.org/translation/number-currency-formats/number-and-currency-patterns) |
| Elevation and distance | Plot elevation (m) against cumulative recorded distance (km), label axes and offer the equivalent stage list. Break the profile across gaps. Show “Elevation unavailable” for absent samples. Count shared recorded legs once and keep estimated distance separate. |
| Costs | Prefer aligned rows with tabular numerals. Compare like bases with labelled horizontal bars only when useful. A group fare beside a per-person rental needs explicit units. A pie chart would imply a complete trip budget when costs are missing. |

## Where to maintain the system

Keep approved decisions in **version-controlled repository docs**, the review specimen beside them and implementation values in the [existing token package](../../../packages/design-tokens/src/index.ts). This gives the founder, helpers and AI tools the same inspectable reference in each change. A Figma-first library would add a second maintenance task. Add an optional Figma library when someone regularly designs there, with variables derived from the approved tokens. Phase 3 can then formalise token files and build outputs. [Experience budgets](../application-design.md#10-experience-and-performance-acceptance)
