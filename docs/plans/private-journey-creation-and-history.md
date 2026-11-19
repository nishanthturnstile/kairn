# Create a private journey and show it in history

**Status · Ready to start.** This is the first slice of R1 workstream 1. The checkout assessment uses `development` at `dd7ac32`. Implementation and feature verification are planned. See [implementation progress](../progress.md) for the current next step.

## Outcome and scope

Journeys is the first destination. A verified account can create a private journey before departure or after returning. After saving, the app opens the journey. Back returns to history, where a single entry opens the same journey ID. A person can create Coorg for next month while Coonoor is underway, and can keep working on Coonoor after its intended end. Dates determine history placement. Current membership and capabilities determine access.

The journey ID will also be the destination for future invitations. A companion who accepts will join that journey and see its ID in their own history. This slice delivers creation, private history and a minimal detail page. Invitations, **Continue journey**, capture, contributions, publishing, history filters and trip preparation tools follow in later work. The full R1 launches publicly on web and Android. Native iOS is developed and tested locally in this milestone, and iPhone users have the responsive web path at launch. [Product plan](../core/product-plan.md#7-product-direction-and-release-boundaries) · [R1 implementation sequence](../core/product-requirements.md#182-dependency-aware-implementation-sequence) · [Distribution](../core/development-and-validation.md#3-distribution)

| Requirement or decision | How this slice applies it |
| --- | --- |
| **TRP-01, D-01** | Store a title, intended start time, optional end time, and journey timezone. Schedule data stays on the canonical journey. |
| **TRP-02, TRP-06, PRO-02, D-09, D-19** | Use one canonical ID and one private history row per eligible account and journey. Display the same record in every client. |
| **OWN-01, OWN-06, OWN-07, PRO-06** | Require a verified, current session. Recheck current membership. Keep pending work and cached data bound to its owner across account and session changes. Preserve recovery gates. |
| **D-15, D-21, OWN-05** | Create a private draft with distinct administrator, coauthor and publisher capabilities for its creator. Use the audit convention for the creation event required by this milestone. |
| **D-04, D-14** | Develop web, Android and iOS now. Release web and Android first. Defer itineraries, bookings, packing lists and task assignments. |

[Trip and account requirements](../core/product-requirements.md#3-account-profile-and-private-history) · [Capability matrix](../core/product-requirements.md#25-capability-and-source-access-matrix) · [Audit and recovery requirements](../core/product-requirements.md#17-quality-security-limits-and-operations) · [Product decisions](../core/product-requirements.md#212-product-decisions)

## Current checkout

| Area | Reuse | Gap to close |
| --- | --- | --- |
| Web | Journeys is the initial route. The shell, account flow and per-account typed client already exist. The scope aborts requests and clears queries on account changes. [Journeys route](../../apps/web/src/routes/journeys.tsx) · [Workspace states](../../apps/web/src/components/workspace-page.tsx) · [Web session scope](../../apps/web/src/lib/session.ts) | Journeys checks readiness and then displays a placeholder. Add history, create and detail routes, and distinguish session checking from signed out. |
| Android and iOS | The Expo app starts in Journeys, has three tabs, and has an account screen, secure session storage, themed controls and account-partitioned SQLite. [Mobile code](../../apps/mobile/src/) · [Native controls](../../apps/mobile/src/components/ui.tsx) · [Workspace storage](../../apps/mobile/src/storage/workspace.ts) | Journeys is static. The typed API client only supplies a base URL, and the root query client is shared across accounts. Add authenticated request transport and an account-scoped lifetime. |
| Identity and HTTP | Better Auth provides verified email, current-device checks, recovery-epoch validation and an Expo integration. The server already emits OpenAPI for its health, readiness and protocol endpoints. [Identity module](../../packages/backend/src/modules/identity/auth.ts) · [Versioned routes](../../apps/server/src/http/v1.ts) · [OpenAPI emitter](../../apps/server/scripts/emit-openapi.ts) | The Journey API needs a reusable server-side session gate, domain operation wiring and typed problem responses. |
| Data and policy | Journey, membership and capability tables exist. The membership primary key already makes duplicate references impossible. Reuse `journeyAccess` and the lifecycle audit schema. [Journey schema](../../packages/backend/src/modules/journeys/schema.ts) · [Permission helper](../../packages/backend/src/modules/journeys/permissions.ts) · [Audit schema](../../packages/backend/src/modules/lifecycle/schema.ts) | Add schedule fields, an attempt receipt and scoped runtime journey grants and row policies. Add the journey audit path alongside identity auditing. The development seed gives a concrete undated journey to preserve. [Seed](../../packages/backend/scripts/seed-development.ts) · [Identity migration](../../packages/backend/drizzle/0002_identity_recovery.sql) |
| Tests | Existing tests cover contracts, identity recovery, permission semantics, membership constraints and disposal of web account state. [Contract tests](../../tests/contracts.test.ts) · [Domain integration](../../tests/integration/domain.test.ts) · [Web session tests](../../tests/web-session.test.ts) · [Browser identity harness](../../tests/operations/browser-identity.sh) | Add real journey API and browser regressions and verify both native clients. Update the old runtime-role assertion to prove that scoped reads work and unscoped reads see zero private rows. |

## Screen flow and states

1. **Journeys.** Keep the stable Journeys, Discover and Saved destinations. Put **Create journey** directly below the Journeys heading for a verified account. Below it, show **Upcoming** and then **Recent journeys**. Each entry is one link or press target with its title and intended dates.
2. **Create journey.** Use a dedicated form for **Title**, **Intended start**, **Intended end (optional)** and **Timezone**. Intended start and end each use a calendar date and a local clock time to the minute. Suggest the device IANA timezone when supported and let the person change it. Changing it leaves their entered clock values intact. An entirely blank end means unknown. Validate partial date/time pairs, calendar values, unsupported zones and end before start. Equal start and end is valid. Ask for a different time in a daylight-saving gap. If an entered minute occurs twice, ask the person which occurrence they meant and show the two offsets.
3. **Save and open.** Show field errors next to their inputs and focus the first invalid field. Announce **Saving…** and disable repeat submission. On confirmed save, replace the form with a private detail route for the returned ID. Show the title, **Private**, and intended dates with the journey timezone. Render stored local values in Indian English so that **9:00 am · Asia/Kolkata** reads the same on a phone set to London. Show **End date unknown** for an open end and **Dates unavailable** for an undated legacy journey.
4. **Back and reopen.** Back goes to Journeys, restores list position where possible and refreshes history. The new row opens the same detail route. Support direct detail links and allowlisted return targets through sign-in. A saved journey whose detail fails to load offers a detail retry.

| State | Expected behaviour |
| --- | --- |
| Checking session or loading data | Distinguish session checking from history or detail loading. Announce meaningful progress once and hide protected content while a new account is being verified. |
| Signed out | Offer **Sign in** through Account. Resume the allowlisted Journeys or detail destination after verification and load it under the current account. |
| Empty history | Keep the create action visible. If both sections are empty, show one **No journeys yet** state. If only one is empty, keep its heading and show **No upcoming journeys** or **No recent journeys**. |
| History or detail unavailable temporarily | Show the appropriate retry action. Leave Create journey available on history for a verified account. |
| Missing or inaccessible detail | Show **This journey is unavailable** with a way back. Exclude the title, dates, and member data from the message and announcement. |
| Invalid form or definite failure | Keep the inputs and explain what to correct or retry. A rejected attempt can be corrected and submitted with a fresh key. |
| Save confirmation lost | Keep the submitted fields and offer **Retry save** with the original key and payload. A changed form becomes a separate attempt once the uncertain save has been resolved. |
| Account switch or logout | Immediately hide protected content, stop dispatch, abort requests and ignore late results. Only the original account can see or retry its pending form after reauthentication. |

### Section placement and sorting

Use one server `asOf` instant for both sections. **Upcoming** holds journeys whose intended start is after `asOf`, soonest start first. **Recent journeys** holds every journey whose intended start has been reached, newest start first. That includes underway trips, past trips, and started trips with an unknown end. A future trip with an unknown end stays in Upcoming until its start. Undated legacy journeys follow dated Recent rows, newest creation first. Break ties by journey ID in ascending order. Refresh the grouping when returning to Journeys or foregrounding the app. An intended date passing has no effect on archive state, membership, or editing authority.

### Design-system use

Use the existing web shell and `PageHeading`, `Button`, `Field`, `Input`, `Alert`, `Empty`, and `Skeleton`. Fit desktop within the content column and stack the form, dates and actions on phone web. On native, use `AppText`, `Panel`, `Action`, `Field` and `StatusNotice`. Qualify platform date and time controls on Android and iOS with a labelled entry path for keyboard and assistive technology. Use approved Source Sans 3 and the existing semantic surface, action, focus and error tokens for Light, Dark and Outdoor. Keep touch targets at 44 CSS px on web, 48 dp on Android, and 44 pt on iOS. Preserve keyboard visibility, focus, wrapped titles, and usable actions at large text sizes. [Application design](../core/application-design.md#2-navigation-and-entry-points) · [Components](../core/design-system/design-system-components.md) · [Flow patterns](../core/design-system/design-system-flows.md) · [Tokens](../core/design-system/design-system-tokens.md) · [Accessibility](../core/design-system/design-system-accessibility.md)

## Step 1 · Shared contracts and date rules

| Operation | Contract |
| --- | --- |
| `POST /api/v1/journeys` | Require a UUID `Idempotency-Key`. Accept strict JSON with a trimmed, nonempty title (proposed maximum 120 characters), `intendedStart` in `YYYY-MM-DDTHH:mm`, optional or null `intendedEnd` in the same format, and an IANA `timeZone`. Accept `startOffset` or `endOffset` to disambiguate a repeated minute. Return `201 { id }` and a detail `Location` on commit. Return `200 { id }` on a matching replay with current access. |
| `GET /api/v1/journeys` | Initial response includes `asOf` and an Upcoming and Recent page, each with `items` and nullable `nextCursor`. Each follow-up requests one section with its cursor. Use bounded pages and validate the opaque cursor against the account, section, original `asOf` and sort position. Recheck current membership for every page. A refreshed history starts at a new `asOf`. |
| `GET /api/v1/journeys/{journeyId}` | Return the same private metadata projection as a history row. Include ID, title, intended local times and their resolved UTC instants, timezone, draft or archived state, and the caller's capabilities. Legacy schedule fields may be null. Current membership gates the metadata. Existing capability rules govern future draft content. |

Use the existing Problem Details shape and `X-Request-Id`. Return safe field codes on `400`, `401` for an absent or invalid session, and a common `404` for a missing journey or one outside current membership. Document distinct `409` codes for an idempotency key reused with changed input and a changed account precondition. Use `403` for rejected browser write origins and `503` for a closed recovery gate or temporary dependency failure. All protected responses use `Cache-Control: private, no-store`.

- [ ] Add a Journey contract module in `packages/contracts/src/`, export client-safe schema types and reuse existing cursor conventions. Wire the versioned routes in `apps/server/src/http/v1.ts` and extend `http/problem.ts`. Keep declarations usable by the OpenAPI emitter without live services.
- [ ] Share pure entry and formatting rules where practical. Use a server resolver for IANA zones, calendar validity, ambiguity and UTC range comparisons. Format the original local values independently of the current device timezone.
- [ ] Generate `packages/contracts/openapi.json` and the typed client. Extend `tests/contracts.test.ts` for the new endpoints, problem codes and response shapes.

**Done when** web and native can consume the same generated request and response types, and `pnpm api:check` passes. Contract fixtures cover an optional end, legacy null fields, validation errors and stable private projections. [Shared schemas](../../packages/contracts/src/schemas.ts) · [Cursor conventions](../../packages/sync-protocol/src/index.ts) · [Architecture HTTP rules](../core/architecture.md#91-http-contracts)

## Step 2 · Backend operations, migration and authorization

- [ ] **Verify the actor.** Expose a backend identity entry point that verifies the incoming Better Auth session from request headers and reuses the current-session, account restriction and recovery-epoch checks. Apply the production recovery gate to the Journey API. Set account scope from the verified actor inside the transaction. Reject unexpected fields that try to set the actor. Use bounded JSON bodies and exact origin enforcement for browser writes. An expected-account header is an additional precondition for the client lifetime. Compare it to the session-derived account and stop before any domain read or write on mismatch.
- [ ] **Migrate existing data.** Add UTC instants, original local values and IANA timezone context. Constrain paired values and valid ranges while allowing undated legacy rows. Require a start and zone on new creates. Preserve IDs, memberships, capability grants, and archive state. Keep the synthetic undated row usable and render it with the legacy display path. Add the receipt table with unique account and key constraints. Check schema readiness with the runtime role.
- [ ] **Commit creation once.** Use a single PostgreSQL transaction to claim the account-scoped idempotency key, persist a fingerprint of the normalized request, allocate the canonical journey ID, create the journey and creator membership, grant administrator, coauthor and publisher, and insert one `journey_created` audit event. The audit records the actor, target and journey IDs, action and server time. A concurrent matching attempt returns the winning ID after commit and rechecks access. A changed payload with the same key returns a conflict. Rollback removes every write including the receipt. Keep receipts for the life of the journey. Separate keys allow distinct trips even with identical titles and dates.
- [ ] **Scope reads and writes.** Grant the non-owner runtime role the minimum privileges and add row policies using transaction-local account context. Select history from active membership and aggregate capabilities per journey. Detail and replay use the same active membership rule. Reuse `journeyAccess` for capability semantics. Implement the initial write as a narrowly scoped database routine with a fixed search path and scope checks, grant execution only to the intended runtime role, and keep direct membership and capability writes closed. Test that the routine cannot create a membership for an existing unrelated journey.
- [ ] **Exercise the real transaction.** In a disposable database, force the last audit insert to fail and verify that the receipt, journey, membership, and capabilities all roll back. Exercise concurrent requests, revocation, legacy rows, and migration with the runtime role. Keep fault injection in the test harness.

**Likely files** · Add a Journeys service in `packages/backend/src/modules/journeys/` and an additive Drizzle migration. Update backend exports, database readiness, identity integration, `apps/server/src/app.ts`, `apps/server/src/index.ts`, and the versioned route wiring. Add service-backed journey tests under `tests/integration/` and extend the existing domain and permission checks.

**Done when** real PostgreSQL verifies atomic creation, replay with one ID and audit event, overlapping journeys, current-member reads, and fail-closed behavior for unrelated accounts and invalid or restricted sessions. [Domain boundaries](../core/architecture.md#51-domain-responsibilities) · [Storage and row security](../core/architecture.md#62-storage-rules) · [Identity integration](../core/architecture.md#92-authentication-and-permissions) · [Backend readiness](../../packages/backend/src/db/index.ts)

## Step 3 · Responsive web

- [ ] Replace the Journeys placeholder with authenticated history. Add `/journeys/new` and `/journeys/$journeyId` and keep Journeys selected on both routes. Reuse the current shell, per-account query scope and same-origin transport.
- [ ] Implement the form, list and detail states above. Persist the submitted payload and attempt key in an account-scoped pending record before dispatch so a refresh can recover it. Reuse the key and submitted payload for a retry and clear the record after a confirmed outcome. Clear protected render and cache state on access denial or account switch.
- [ ] On save, navigate to the returned ID and load current detail. Invalidate history for the verified account. Refresh private queries on reentry and prevent stale request callbacks from navigating or mutating client state after the scope ends.
- [ ] Add service-backed browser coverage using the existing identity harness. Simulate a lost response by forwarding the POST to the real service and dropping the response after commit.

**Likely files** · Update `apps/web/src/routes/journeys.tsx`, the root and account route integration, the generated route tree, and `apps/web/src/lib/session.ts`. Add create and detail routes and a focused pending-submission store. Add `tests/web/journeys.playwright.ts`.

**Done when** desktop and phone-sized web pass creation, history, direct detail and Back against the real API. A delayed response or account switch leaves one confirmed journey and keeps the new account isolated. [Web routes](../../apps/web/src/routes/) · [Web session lifecycle](../../apps/web/src/main.tsx) · [Browser identity harness](../../tests/operations/browser-identity.sh)

## Step 4 · Native Android and iOS

- [ ] Replace the native placeholder with the same authenticated history and add create and detail to the Journeys stack. Preserve Android system Back and iOS stack navigation.
- [ ] Bind the query client, requests and callbacks to the verified account lifetime. Await the existing Expo client's SecureStore-backed cookie and attach it to typed requests for the configured API origin. Check the lifetime again after cookie retrieval and prevent cookie forwarding to another origin. Cancel and clear private work before another account loads.
- [ ] Reuse account-partitioned SQLite for the pending attempt and recheck session and private history on foreground and Back. Verify platform controls behave consistently with the wire date and timezone rules.
- [ ] Run local development builds on the documented Android profile and iPhone Simulator. Use the same backend as web to verify IDs in both directions. Use the existing test harness or local test proxy for delays and response loss.

**Likely files** · Update `apps/mobile/src/api.ts`, the app root and Journeys tab, Account sign-out and `storage/workspace.ts`. Add create and detail routes and keep fixtures under `tests/`.

**Done when** both platforms can create and reopen the same server records as web, retry safely, and isolate identities across sign-out and account switching. [Native setup](../../README.md#native-development-checks) · [Expo custom authenticated requests](https://better-auth.com/docs/integrations/expo)

## Step 5 · Verify and record acceptance

Use synthetic accounts A and B and a controlled clock for backend date boundaries. Run all platforms against one local backend for ID comparisons. Record the ID at creation, in history, and on detail. Build and test the actual product routes.

| Surface | Required evidence |
| --- | --- |
| **Backend** | Create future Coorg and past Coonoor. Create a second overlapping trip while the first remains editable at the permission boundary. Verify that passing an end time preserves access and edit capability. Check optional end, invalid ranges, equal endpoints, DST cases, timezone and the precise Upcoming cutoff. Cover paging, an undated legacy row and one history row with three capabilities. Exercise signed-out, unrelated-account, revoked-member, expired-session and recovery-locked requests. Prove that the final-write failure leaves no partial records, and that concurrent submissions and retry after a committed response is lost return one ID and one audit row. |
| **Web** | Use desktop Chromium for service-backed regressions, with Firefox, Safari, and phone-sized WebKit or Safari for responsive checks. Cover signed-out, loading, empty, invalid, saving, retry, unavailable detail, direct route, Back and double submit. Drop the create reply after commit and verify the same ID on retry. Delay a response across A → B and verify no old private list, form or detail appears. Check all three appearances, keyboard and focus, accessibility, and 320 CSS px at 200% text. |
| **Android emulator** | On the documented API 37 profile, open a web-created ID from Android history and an Android-created ID from web history. Verify an optional end, date and timezone parity with different device zones, interrupted save and retry, account switch, system Back, keyboard, 2× font scale and TalkBack where supported. |
| **iPhone Simulator** | On the documented iPhone 17 profile, verify web → iOS and iOS → web IDs. Cover optional end, timezone parity, interrupted save, account switching, Back, keyboard, largest accessibility text size and VoiceOver where supported. Record this run separately from the iPhone web launch path. |

- [ ] Run `pnpm check`, `pnpm api:check`, `pnpm test`, `pnpm test:integration`, the service-backed browser suite, `pnpm build`, and `pnpm check:client-bundles`. Keep automated checks and fixtures under `tests/`.
- [ ] Link test and CI evidence, synthetic ID comparisons, and the dated native device profiles. Record manual and automation results separately. Mark missing coverage **Not run** and record environment limits.

[Foundation CI](../../.github/workflows/ci.yml) · [Development evidence register](../core/development-and-validation.md#6-evidence-register) · [Design-system rollout checks](../core/design-system/design-system-governance.md#rollout)

## Scope decision · Editing title and dates

Confirm whether “remains editable” requires a title and date editing form in this slice. The recommended baseline is a minimal detail page and an acceptance check that neither a second trip nor a passed end time removes the first journey's coauthor authority. If saving corrections is required in this slice, add an Edit action and a revision-checked `PATCH` on the same ID with authorization, audit and cross-client checks. TRP-01 requires date correction in R1. The recommendation preserves that later work while allowing the shared contracts and create path to start. [Trip requirements](../core/product-requirements.md#4-create-or-join-a-journey) · [Revision contract](../core/architecture.md#91-http-contracts)

## Progress record

Update [implementation progress](../progress.md) when work starts. Mark the milestone **In progress**, link this plan and its requirement IDs, record the date and section rules and editing scope, and name the next concrete step. Set feature checks to **Planned** until there is evidence.

At verification, record the revision, date, environment and OS/build profiles, fixture version, procedures and actual results. Link to durable CI and local evidence for rollback, lost-response retry, the access matrix, and canonical IDs across all platforms. Record failed and unrun checks and the next concrete step. After sign-off, proceed to invitations into the same journey and verify membership revocation before source and export grants.
