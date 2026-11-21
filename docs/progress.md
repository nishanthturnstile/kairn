# Implementation progress

Updated 2026-11-21. Baseline [bootstrap PR #1](https://github.com/nishanthturnstile/kairn/pull/1) merged into `main` at `fef181b`.

## Next milestone

**Plan reviewed and revised with GPT-6.2 Astra · Journey invitations and membership.** The plan covers optional onboarding, a Mailpit email flow, acceptance into the existing journey, and revocation on web, iPhone and Android. Next, implement and validate the shared permission, invitation, delivery and restriction operations in isolated PostgreSQL and Mailpit. [Implementation plan and review](plans/journey-invitations-and-membership.md)

**Verified locally · Web account access.** Sign in and Create account share an aligned layout with a new ferry illustration, in-field password visibility and a round appearance control. Browser checks covered 320 CSS px reflow, keyboard theme selection, wordmark destinations, registration, password reset, cross-tab sign-out and onboarding return. Next, implement native onboarding and Dashboard using the shared account contracts. [Design and verification](plans/web-account-access.md)

**Web setup ready for review · First-run onboarding and Dashboard.** Two steps reuse the display name and carry the plan, record or look-around choice into the actual Dashboard. The new migration is applied locally. Chromium and WebKit passed all three onboarding tests, Linux Firefox passed the large-text and appearance check, and 11 isolated database checks passed. Next, review the verified web flow before adapting it for native. [Web evidence](plans/first-run-onboarding-and-dashboard.md#web-implementation)

**Verified locally · Web Dashboard and sidebar redesign.** Dashboard centers the next journey and keeps the onboarding action in an illustrated empty state. The shadcn sidebar passed Chromium, WebKit and Linux Firefox checks for resizing, draft preservation, keyboard focus and mobile account actions. Chromium also passed the web account, journey, onboarding and reader regressions. Next, review the redesigned workspace on web. [Navigation design](plans/first-run-onboarding-and-dashboard.md#dashboard-and-navigation) · [Browser coverage](../tests/web/workspace-sidebar.playwright.ts)

**Verified locally · Journey wording and signed-in Account.** Onboarding, Dashboard and the creation form use journey terminology. The profile menu groups the four appearances, and Account separates profile and device controls. Chromium passed all three onboarding scenarios and the five workspace checks. Chromium and WebKit passed profile editing, device revocation and 320 CSS px reflow at 200% text. Next, review the updated web screens. [Account design](plans/web-account-access.md#design-and-entry-points) · [Browser coverage](../tests/web/identity.playwright.ts)

**Verified on the development clients · iPhone and Android onboarding and Dashboard.** The Astra-reviewed flow uses the shared account and Dashboard APIs. iOS and Android verified enrollment, journey handoff, and readable navigation at enlarged text sizes. Android also verified access removal after device revocation and account switching. Web regressions, 62 unit tests, builds, and bundle scans passed. Next, review the native experience and cover packaged cold links and physical-device accessibility before wider release. [Plan and device evidence](plans/first-run-onboarding-and-dashboard.md#native-verification) [Native implementation plan](plans/first-run-onboarding-and-dashboard.md#native-implementation-plan)

**Verified on iPhone and Android development clients · Native sign-in redesign.** The signed-out layout uses the ferry artwork, an in-field password control, and contextual verification. Appearance lives in signed-in Account. iPhone verified recovery and sign-out, Android verified signup and resend, and both verified sign-in and large text. Next, review the full native entry flow. [Native design and verification](plans/web-account-access.md#native-sign-in)

**Verified on iPhone and Android development clients · Native Account redesign.** The Account screen follows the web profile and device grouping and adds a compact appearance picker. Both clients verified profile edits, device revocation, appearance changes, and large text. Next, review the signed-in settings on a physical device. [Native Account design and verification](plans/web-account-access.md#native-signed-in-account)

**Web development server restored.** The running Vite process had cached the old shared package exports. Restarting it with `--force` resolved the journey copy import. The live browser reached Sign in, Dashboard and the new journey form. The production web build, workspace checks and 15 Chromium regressions passed. Next, continue the native Account review. [Shared exports](../packages/shared/package.json) · [Web regression suite](../tests/operations/browser-identity.sh)

**Verified locally · Web Create journey redesign.** The form groups title and schedule, opens optional end fields on request, and shows a live preview in wide layouts. Chromium and WebKit each passed eight service-backed checks, including large text, save recovery and onboarding handoff. The production web build and workspace checks passed. Next, review the redesigned form in the web workspace. [Design and verification](plans/private-journey-creation-and-history.md#create-journey-redesign)

**Verified locally · Web Journeys timeline.** An illustrated empty state leads to Create journey. The populated view highlights active journeys and separates upcoming, past, and incomplete schedules with independent paging. Twelve isolated database tests and eight browser tests in each of Chromium and WebKit passed. The timeline passed accessibility checks and 320 CSS px reflow at 200% text. Next, review the empty and populated views in the web workspace. [Design and verification](plans/private-journey-creation-and-history.md#journeys-timeline-redesign)

**Verified locally · Web journey detail redesign.** The title, privacy and date status share a header, and the schedule adapts to narrow screens. Twelve database tests and eight browser tests in each of Chromium and WebKit passed, including server-clock status, save recovery and detail reflow at 320 CSS px and 200% text. Next, review detail from the Journeys timeline and after a new save. [Design and verification](plans/private-journey-creation-and-history.md#journey-detail-redesign)

**Verified on iPhone and Android development clients · Native Journeys redesign.** The empty state, schedule groups, create form and private detail follow the web flow and use the shared Journey API. Both devices verified creation and enlarged text. Android also recovered a dropped save reply. Workspace checks, native builds, bundle scans, 63 unit tests and eight web regressions passed. Next, review the native Journeys flow in the development clients. [Design and verification](plans/private-journey-creation-and-history.md#native-journeys-redesign)

## Private journey creation and history

**First slice verified · R1 workstream 1, private journeys and membership.** A verified account can create a private journey and see one reference to the same ID in history. This gives capture and offline sync a stable account and journey destination. [TRP-01, TRP-02 and TRP-06](core/product-requirements.md#4-create-or-join-a-journey) · [PRO-02 and OWN-06](core/product-requirements.md#3-account-profile-and-private-history)

**Step 1 verified locally.** Shared creation, history, detail and date contracts passed `pnpm check`, `pnpm api:check`, 49 unit tests, production builds and web, Android and iOS client-bundle scans. Journey scheduling now uses FullCalendar's `temporal-polyfill` 1.0.8 in the backend; shared formatting stays on built-in `Intl`. The 19 date fixtures and frozen install passed on Node 24.22.3. Upcoming starts after the server's `asOf`. Recent includes all started journeys, followed by undated legacy rows. Title and date editing remains open for the detail screens. [Step 1 plan and migration evidence](plans/private-journey-creation-and-history.md#step-1--shared-contracts-and-date-rules)

**Step 2 verified locally.** The Journey API now uses verified sessions, transactional creation and current-member history and detail. Eight isolated PostgreSQL tests passed, including migration with an existing undated row, concurrent replay, revocation and full rollback on audit failure. Seven isolated identity recovery tests, workspace and OpenAPI checks, 49 unit tests, builds and client-bundle scans passed. [Step 2 plan and evidence](plans/private-journey-creation-and-history.md#step-2--backend-operations-migration-and-authorization)

**Step 3 verified locally.** Responsive history, create and detail use the approved controls. Chromium and WebKit passed service-backed sign-in return, dropped-response recovery, account switching, paging and Back. The form passed 320 CSS px reflow at 200% text in all three appearances and automated accessibility checks. Workspace and OpenAPI checks, 51 unit tests, baseline browser tests, builds and bundle scans passed. [Step 3 plan and evidence](plans/private-journey-creation-and-history.md#step-3--responsive-web)

**Step 4 implemented and smoke-tested locally.** Android and iPhone use the approved controls for history, create and detail. Both recovered a committed save after a lost reply, reopened the original ID in Chromium, and showed empty history after switching accounts. All 55 unit tests, eight isolated database checks, three Chromium regressions, workspace and OpenAPI checks, builds and bundle scans passed. [Step 4 plan and evidence](plans/private-journey-creation-and-history.md#step-4--native-android-and-ios)

**Step 5 verified on supported development profiles.** Desktop Safari 27.2 passed the canonical Journey flow and 320 CSS px reflow at 200% text. Android TalkBack announced the history link, local schedule and focused form error. Both hosted jobs passed on `9a3d65c`, including Journey integration tests and coordinated restore. Physical-device VoiceOver remains open. [Acceptance evidence](plans/private-journey-creation-and-history.md#acceptance-evidence--19-november-2026) · [Hosted CI](https://github.com/nishanthturnstile/kairn/actions/runs/44516072451)

**Post-acceptance review verified locally.** Fixed uncertain-save retries, foreground privacy and refresh, native validation focus and failed web sign-out recovery. The complete local checks passed, including the three browser engines, Android revocation and TalkBack, iPhone Simulator and Linux ARM64 coordinated restore. [Review results](plans/private-journey-creation-and-history.md#post-acceptance-review--19-november-2026)

The [invitation and membership plan](plans/journey-invitations-and-membership.md) follows onboarding and Dashboard and precedes source and export grants. The complete workstream scope is in the [requirements sequence](core/product-requirements.md#182-dependency-aware-implementation-sequence).

## Design review

**PR #6 release smoke repair.** The smoke test now checks the signed-out reader’s `303` redirect to Sign in and its `private, no-store` response. The service-backed browser suite covers the signed-in `404`. Shell syntax and workspace checks passed locally. The release smoke and coordinated restore result is tracked on [PR #6](https://github.com/nishanthturnstile/kairn/pull/6).

**PR #5 CI repair verified.** The [failed foundation job](https://github.com/nishanthturnstile/kairn/actions/runs/44361573931/job/135004090260) stopped because [workspace settings](../.vscode/settings.json) lacked a final newline. Restored it and reconciled the web-shell conflict with `development`, retaining the equivalent `max-w-248` utility. Both `foundation` and `release-smoke` passed in the [hosted validation run](https://github.com/nishanthturnstile/kairn/actions/runs/44362384404), including browser, integration, identity-recovery, and coordinated restore checks. Local formatting/types, API parity, 25 unit tests, builds, client-bundle scans, Expo dependency checks, and 15 browser tests also passed.

The founder approved all seven design-system phases, including [governance and rollout](core/design-system/design-system-governance.md). The [route visual regressions](../tests/web/route-visual.playwright.ts) passed in all three appearances on macOS and Linux ARM64 and detected a deliberately incorrect solid estimate. Hosted AMD64 CI will exercise these baselines on the PR. The existing web and mobile screens now consume the approved system.

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
