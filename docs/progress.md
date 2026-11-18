# Implementation progress

Updated 2026-11-18. Baseline [bootstrap PR #1](https://github.com/nishanthturnstile/kairn/pull/1) merged into `main` at `fef181b`.

## Next milestone

**Ready to start · R1 workstream 1, private journeys and membership.** Start with an authenticated person creating a private journey and seeing one entry for it in their own history. This gives capture and offline sync a stable account and journey destination.

1. Add authenticated journey creation and private history contracts. Derive the account from the server session and validate the journey title, dates, and timezone.
2. Create the canonical journey, creator membership, initial capabilities, and audit record in one transaction. Keep history scoped to current membership and return one entry per journey.
3. Connect the web and native Journeys views. Verify unauthenticated access is rejected, a second account cannot read the journey, and multiple capabilities do not create duplicate entries.

Then add invitations into the same journey and verify membership revocation before expanding into source and export grants. This first slice covers part of workstream 1. The complete scope is in the [requirements sequence](product-requirements.md#182-dependency-aware-implementation-sequence).

## Design review

The founder approved all seven design-system phases, including [governance and rollout](design-system-governance.md). The [route visual regressions](../tests/web/route-visual.playwright.ts) passed in all three appearances on macOS and Linux ARM64 and detected a deliberately incorrect solid estimate. Hosted AMD64 CI will exercise these baselines on the PR. The existing web and mobile screens now consume the approved system. Private journey creation and history are the next feature surfaces.

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
| Workspace and data | All seven [bootstrap steps](bootstrap-plan.md#bootstrap-execution-sequence) landed. The workspace has shared contracts, schema migrations, local PostgreSQL and SeaweedFS, and a durable worker. |
| Account access | Local registration, verification, session revocation, and password reset worked in Chromium and the Android and iOS development clients. Isolated tests covered journal replay and a fresh reset for a recovery-locked account. |
| Web and mobile | Navigation shells, account screens, reader rendering and hydration, and native storage adapters are in place. Journey creation, private history, and shared-data flows are pending. |
| CI and recovery | GitHub's `foundation` and `release-smoke` checks passed on PR #1, including the hosted Linux amd64 synthetic restore drill. A local Linux ARM64 drill also passed. |
| Post-bootstrap cleanup | Temporary native verification routes were retired after their qualification was recorded. Type checks, OpenAPI parity, unit tests, production builds, Chromium smoke checks, and client bundle scans passed after cleanup. |

## Open before shared use

| Item | Evidence needed |
| --- | --- |
| GitHub controls | `main` has no active protection rules, and staging and production environments are absent. Configure required checks and protected environments. |
| Target VPS and providers | Confirm the VPS architecture, deploy the matching images to staging, verify SMTP and DNS, and test live alert delivery. |
| Independent recovery | Provision off-VPS backup storage and the restriction journal, then demonstrate replay and closed-access recovery using those destinations. |
| Dependency advisory | The [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) was open at bootstrap sign-off. Track its resolution in [dependency qualification](bootstrap/dependency-qualification.md#bootstrap-review-follow-up). |

Use the [deployment and recovery runbook](deployment-and-recovery.md) for operations and the [development and validation plan](development-and-validation.md#6-evidence-register) for verification expectations. Update this file when a milestone or blocker changes.
