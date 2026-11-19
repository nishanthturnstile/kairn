# Implementation progress

Updated 2026-11-19. Baseline [bootstrap PR #1](https://github.com/nishanthturnstile/kairn/pull/1) merged into `main` at `fef181b`.

## Next milestone

**In progress · R1 workstream 1, private journeys and membership.** The first slice lets a verified account create a private journey and see one reference to the same ID in history. This gives capture and offline sync a stable account and journey destination. [TRP-01, TRP-02 and TRP-06](core/product-requirements.md#4-create-or-join-a-journey) · [PRO-02 and OWN-06](core/product-requirements.md#3-account-profile-and-private-history)

**Step 1 verified locally.** Shared creation, history, detail and date contracts passed `pnpm check`, `pnpm api:check`, 49 unit tests, production builds and web, Android and iOS client-bundle scans. Journey scheduling now uses FullCalendar's `temporal-polyfill` 1.0.8 in the backend; shared formatting stays on built-in `Intl`. The 19 date fixtures and frozen install passed on Node 24.22.3. Upcoming starts after the server's `asOf`. Recent includes all started journeys, followed by undated legacy rows. Title and date editing remains open for the detail screens. [Step 1 plan and migration evidence](plans/private-journey-creation-and-history.md#step-1--shared-contracts-and-date-rules)

**Step 2 verified locally.** The Journey API now uses verified sessions, transactional creation and current-member history and detail. Eight isolated PostgreSQL tests passed, including migration with an existing undated row, concurrent replay, revocation and full rollback on audit failure. Seven isolated identity recovery tests, workspace and OpenAPI checks, 49 unit tests, builds and client-bundle scans passed. [Step 2 plan and evidence](plans/private-journey-creation-and-history.md#step-2--backend-operations-migration-and-authorization)

**Step 3 verified locally.** Responsive history, create and detail use the approved controls. Chromium and WebKit passed service-backed sign-in return, dropped-response recovery, account switching, paging and Back. The form passed 320 CSS px reflow at 200% text in all three appearances and automated accessibility checks. Workspace and OpenAPI checks, 51 unit tests, baseline browser tests, builds and bundle scans passed. [Step 3 plan and evidence](plans/private-journey-creation-and-history.md#step-3--responsive-web)

**Step 4 implemented and smoke-tested locally.** Android and iPhone use the approved controls for history, create and detail. Both recovered a committed save after a lost reply, reopened the original ID in Chromium, and showed empty history after switching accounts. All 55 unit tests, eight isolated database checks, three Chromium regressions, workspace and OpenAPI checks, builds and bundle scans passed. Next, run the Step 5 acceptance matrix, starting with native screen readers and a delayed response during account switching. [Step 4 plan and evidence](plans/private-journey-creation-and-history.md#step-4--native-android-and-ios) · [Step 5 matrix](plans/private-journey-creation-and-history.md#step-5--verify-and-record-acceptance)

**Step 5 in progress.** Automated acceptance passed 55 unit tests, 21 integration checks, seven identity recovery checks, 15 baseline browser checks and three service-backed checks each in Chromium, Linux Firefox and WebKit. Android and iPhone recovered the original save after a delayed reply crossed an account switch. Desktop Safari, manual TalkBack and VoiceOver and hosted CI remain open. [Verification sequence and results](plans/private-journey-creation-and-history.md#step-5--verify-and-record-acceptance)

Then add invitations into the same journey and verify membership revocation before expanding into source and export grants. This first slice covers part of workstream 1. The complete scope is in the [requirements sequence](core/product-requirements.md#182-dependency-aware-implementation-sequence).

## Design review

**PR #5 CI repair verified.** The [failed foundation job](https://github.com/nishanthturnstile/kairn/actions/runs/44361573931/job/135004090260) stopped because [workspace settings](../.vscode/settings.json) lacked a final newline. Restored it and reconciled the web-shell conflict with `development`, retaining the equivalent `max-w-248` utility. Both `foundation` and `release-smoke` passed in the [hosted validation run](https://github.com/nishanthturnstile/kairn/actions/runs/44362384404), including browser, integration, identity-recovery, and coordinated restore checks. Local formatting/types, API parity, 25 unit tests, builds, client-bundle scans, Expo dependency checks, and 15 browser tests also passed. The next feature milestone remains private journey creation and history above.

The founder approved all seven design-system phases, including [governance and rollout](core/design-system/design-system-governance.md). The [route visual regressions](../tests/web/route-visual.playwright.ts) passed in all three appearances on macOS and Linux ARM64 and detected a deliberately incorrect solid estimate. Hosted AMD64 CI will exercise these baselines on the PR. The existing web and mobile screens now consume the approved system. Private journey creation and history are the next feature surfaces.

| Existing surface | Where to change it | Coverage |
| --- | --- | --- |
| Web workspace | [Shell](../apps/web/src/routes/__root.tsx), [workspace states](../apps/web/src/components/workspace-page.tsx), [shared controls](../apps/web/src/components/ui/) | Journeys, Discover and Saved, including sign-in prompts, loading, retry and empty states. |
| Web account | [Account](../apps/web/src/routes/account.tsx) and [password reset](../apps/web/src/routes/account_.reset.tsx) | Registration, verification, recovery, signed-in devices, revocation and feedback. |
| Web story | [Reader](../apps/web/src/reader/story.tsx) | Server-rendered chapters, larger text, appearance selection and the generic unavailable story. |
| Android and iPhone | [Destination](../apps/mobile/src/components/destination.tsx), [tabs](../apps/mobile/src/components/destination-tabs.tsx), [account](../apps/mobile/src/app/account.tsx) and [shared controls](../apps/mobile/src/components/ui.tsx) | Journeys, Discover, Saved, account forms, device controls and app appearance. Both platforms load the bundled Source Sans 3 faces. |

The [production-route browser checks](../tests/web/reader.playwright.ts) cover persisted appearances, 44 CSS px controls, 320 CSS px reflow at 200% text size, automated accessibility and the reader with JavaScript disabled. The Chromium account flow also exercised a local server and email inbox. Native checks on the API 37 Android emulator and iPhone 17 simulator exercised the three tabs, account form modes, signed-in devices, sign-out and appearance choices. Changing the system appearance while Journeys was open updated the status bar, heading, panel and selected tab together. At Android 2× font scale and the largest iOS accessibility text size, the tab labels remained readable. Physical-device glare and manual TalkBack and VoiceOver checks remain open.

## Completed and verified

| Area | Current evidence |
| --- | --- |
| Workspace and data | All seven [bootstrap steps](plans/bootstrap-plan.md#bootstrap-execution-sequence) landed. The workspace has shared contracts, schema migrations, local PostgreSQL and SeaweedFS, and a durable worker. |
| Account access | Local registration, verification, session revocation, and password reset worked in Chromium and the Android and iOS development clients. Isolated tests covered journal replay and a fresh reset for a recovery-locked account. |
| Web and mobile | Navigation shells, account screens, reader rendering and hydration, native storage, private Journey creation and history are implemented and exercised locally. Shared membership flows follow acceptance. |
| CI and recovery | GitHub's `foundation` and `release-smoke` checks passed on PR #1, including the hosted Linux amd64 synthetic restore drill. A local Linux ARM64 drill also passed. |
| Post-bootstrap cleanup | Temporary native verification routes were retired after their qualification was recorded. Type checks, OpenAPI parity, unit tests, production builds, Chromium smoke checks, and client bundle scans passed after cleanup. |

## Open before shared use

| Item | Evidence needed |
| --- | --- |
| GitHub controls | `main` has no active protection rules, and staging and production environments are absent. Configure required checks and protected environments. |
| Target VPS and providers | Confirm the VPS architecture, deploy the matching images to staging, verify SMTP and DNS, and test live alert delivery. |
| Independent recovery | Provision off-VPS backup storage and the restriction journal, then demonstrate replay and closed-access recovery using those destinations. |
| Dependency advisory | The [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) was open at bootstrap sign-off. Track its resolution in [dependency qualification](bootstrap/dependency-qualification.md#bootstrap-review-follow-up). |

Use the [deployment and recovery runbook](deployment-and-recovery.md) for operations and the [development and validation plan](core/development-and-validation.md#6-evidence-register) for verification expectations. Update this file when a milestone or blocker changes.
