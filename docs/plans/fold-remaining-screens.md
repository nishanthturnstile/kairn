# Remaining Fold screens

This pass follows the [Fold design contract](../../DESIGN.md) and the screen coverage review. Discover and Saved are separate product work.

| Order | Surface | Design and acceptance criteria |
| --- | --- | --- |
| 1 | Native Dashboard | Show the notebook illustration and one action on first use. Give the next journey visual priority, keep useful counts compact, and make each recent row a single touch target. Check empty, populated, loading and retry states. |
| 2 | Native Journeys | Add shortcuts when multiple groups contain results. Use labeled schedule lines and highlight active journeys. Keep long lists and pagination usable. |
| 3 | Invitation acceptance | Show inviter, participant role, local start and end, time zone, and expiration on web and native. Check open-ended and undated invitations and the transition after joining. Keep invitation details behind the existing verified-account checks. |
| 4 | Unavailable pages | Give unknown web and native links a Fold recovery path. Return readable, private story-unavailable HTML, including when the server has no configured Reader build. Check signed-out and verified access. |

Review the completed flows at phone and desktop widths and on the iOS and Android development clients. Check larger text, action labels, focus, motion, and loading or recovery states wherever the flow allows.

## Verification

- The iPhone 18 Pro and Android API 37 showed the first-use artwork and populated Dashboard. Both opened journey details from a whole row and recovered from a forced 503 on the summary request.
- Both development clients jumped past 25 timeline rows and loaded the next two upcoming journeys. Both showed separate start and end lines and an open-ended row.
- Chromium and WebKit checked invitation acceptance, unavailable dates, cancellation, private data during rechecks, and reflow at 320 CSS px with 200% text. The iPhone joined a dated journey at Accessibility Large. Android joined an open-ended journey at 175% text. [Invitation checks](../../tests/web/journey-people.playwright.ts)
- Browser checks exercised unknown links at 320, 768, and 1280 CSS px, keyboard recovery, and the Reader exit. Both native clients used the new recovery screen when verified and opened sign-in when signed out. The server test checks that the asset-free Reader fallback returns private, generic HTML with HTTP 404. [Browser recovery checks](../../tests/web/recovery.playwright.ts) · [HTTP contract](../../tests/contracts.test.ts)
- Workspace checks, 80 unit tests, 39 standalone Chromium tests, the web build, and the iOS and Android bundle exports passed. Chromium and WebKit each passed 12 targeted invitation, recovery and Reader checks.

Spoken VoiceOver and TalkBack checks remain open. The Android development client showed a linking warning once after a system text-size change followed immediately by a deep link. Subsequent signed-out deep-link recovery worked.

## Independent review

- Native timeline jumps resolve the latest section position by ID and cancel when the destination disappears or the screen loses focus. Dashboard loading keeps its Fold indicator and restores the accessibility announcement.
- Web recovery moves keyboard focus to the page heading and to the Journeys heading after following the recovery link. Invitation details clear when setup verification fails and refresh after a successful retry. [Recovery regressions](../../tests/web/recovery.playwright.ts)
- Workspace checks, 80 unit tests, 40 standalone Chromium checks, 10 WebKit recovery and Reader checks, and three service-backed invitation checks in each browser passed. The web build and both native bundle exports succeeded. Native fixes still need a device replay and spoken checks.
