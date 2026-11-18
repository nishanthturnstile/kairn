# Application bootstrap plan

| Field | Value |
|---|---|
| Date | 17 November 2026 |
| Status | Steps 1–7 and the bootstrap review follow-ups merged in PR #1. See [implementation progress](progress.md) for current evidence and pending work. |
| Basis | Architecture 1.9, requirements 2.6, application design 1.2, and development and validation 1.2. |
| Scope | Repository foundation, technology recommendations, CLI workflow, service setup, implementation order, and acceptance criteria. |

Build the existing architecture as a TypeScript monorepo with four applications: web, mobile, server, and worker. Keep the confirmed Vite+/TanStack, Expo, PostgreSQL, SeaweedFS, Mapbox, Mailpit/Resend, and VPS choices. The most useful additions are reproducible generation, automated contract and permission checks, native compatibility evidence, and recovery tooling.

The first implementation milestone should leave a reproducible development environment and working application foundations. The complete R1 product then grows in this same codebase in the requirements' dependency order. Bootstrap completion is an engineering milestone; community release still requires every R1 workstream and its acceptance evidence.

## Relationship to the existing documents

[Product requirements](product-requirements.md) remain authoritative for behaviour and release scope. [Architecture section 14](architecture.md#14-canonical-stack-and-dependency-register) remains the canonical dependency register. This proposal explains installation timing and execution; it does not replace that register. Approved changes should be reconciled there before installation.

The application has three particularly important foundations:

- Capture success means an app-owned file and recoverable local record exist, even without connectivity.
- A canonical journey has separate ownership, contribution, editing, publication, and original-export permissions.
- An approved story remains stable across ordinary draft edits, while current withdrawals and takedowns override old versions, derivatives, exports, and answers.

These requirements justify native persistence, explicit domain modules, durable workers, and private media delivery. They also explain why adding a hosted backend, realtime server, or generic AI agent framework would not remove the difficult application work.

## Recommended technology choices

### Foundation and web

| Area | Recommendation | Value for this application | Introduce |
|---|---|---|---|
| Runtime | Node.js 24 LTS as the initial qualification candidate; pin the supported patch after dependency checks. | A common runtime for HTTP, workers, tooling, and CI. Node 24 and 26 are currently LTS; choosing 24 is a conservative compatibility recommendation. [Node release status](https://nodejs.org/en/about/previous-releases). | Bootstrap |
| Workspace | pnpm workspaces managed through Vite+ commands. | One lockfile and task pipeline across the four applications. [Vite+ scaffolding](https://viteplus.dev/guide/create). | Bootstrap |
| Toolchain | Project-local Vite+ for builds, tests and tasks, Biome for linting and formatting supported files, and explicit strict TypeScript checks. | Repeatable checks with one formatter for each file. [Local CLI](https://viteplus.dev/guide/local-cli), [Biome quick start](https://biomejs.dev/guides/getting-started/). | Bootstrap |
| Web | React, TanStack Router and Query, React/Vite and Router plugins. | Typed navigation, preserved journey/view state, and account-scoped server data. Configure the Router plugin before the React plugin. [Router integration](https://tanstack.com/router/latest/docs/installation/with-vite). | Bootstrap |
| Web UI | Tailwind with its Vite plugin, shadcn/ui generated components, and Lucide icons. | Owned components that can express the source-rights and publication states without another UI platform. [Official Vite installation](https://ui.shadcn.com/docs/installation/vite). | Bootstrap; generate only used components |
| Public reader | Narrow React server renderer hosted by the Node service, sharing approved-view contracts and reader components with preview. | Useful story HTML and safe metadata before maps, authentication UI, or AI load. [Vite SSR](https://vite.dev/guide/ssr). | Establish build boundary in bootstrap; complete reader with publication |
| Durable browser edits | Dexie/IndexedDB, partitioned by account. | Recover unsent commands separately from ordinary Query caching. [Dexie integration](https://dexie.org/docs/Tutorial/React). | Editorial implementation |
| Forms and review | TanStack Form; TanStack Table for the web review workspace. | Shared input rules and structured batch review without loading table code in the reader. [Form documentation](https://tanstack.com/form/latest/docs/overview). | First relevant forms and import review |

Next.js and Turborepo were examples in the request, rather than changes to the confirmed architecture. Keep Vite+/TanStack: another web framework would replace an agreed choice, and another workspace runner would duplicate an existing responsibility. Reconsider TanStack Start only if the public renderer demonstrates a maintenance problem, following ADR-09.

### Mobile

| Area | Recommendation | Value for this application | Introduce |
|---|---|---|---|
| Framework | Supported stable Expo SDK with its matching React Native, React, and Expo Router versions. | One native application for Android and iPhone with local builds. [SDK matrix](https://docs.expo.dev/versions/latest/). | Bootstrap |
| Styling | Unistyles v3, a fixed compatible Nitro Modules release, and shared semantic tokens. | Platform-native controls with consistent meaning, colour, spacing, and typography. [Unistyles requirements](https://www.unistyl.es/v3/start/getting-started/). | Bootstrap |
| Local state | Expo SQLite, FileSystem, and SecureStore. | Recoverable captures and command outbox, persistent bytes, and protected session material. [SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/). | Storage/session adapters in bootstrap; full save/sync protocol next |
| Device features | Expo camera, audio, video, image, image/document pickers, foreground location, linking and sharing modules as used. | Native capture and participation without unsupported browser durability promises. | Relevant feature work |
| Maps | `@rnmapbox/maps` with its config plugin and qualified native SDK versions. | Basemap and satellite rendering using the selected provider. [Maintainer installation guide](https://rnmapbox.github.io/docs/install). | Early native build qualification; full geography later |

The current Expo reference lists SDK 58 with React Native 0.88 and React 19.3.0. Treat that as the first candidate, rather than independently updating those packages. Current Unistyles instructions require New Architecture, Expo 56+, React Native 0.85+, and compatible Nitro Modules. Better Auth's Expo guide currently uses SDK 55 examples, so copying all example versions together would be incorrect. Qualify the newer combination in the actual application. [Expo matrix](https://docs.expo.dev/versions/latest/), [Unistyles setup](https://www.unistyl.es/v3/start/getting-started/), [Better Auth Expo guide](https://better-auth.com/docs/integrations/expo).

Use Android emulator and iPhone Simulator development builds on the MacBook. Unistyles and native Mapbox require compiled native code. Keep native configuration in Expo config plugins where supported, and make generated native projects reproducible. Retain an explicit native change only when a required integration cannot be expressed through supported configuration. Apple enrollment and public iOS distribution remain deferred.

### Backend and data

| Area | Recommendation | Value for this application | Introduce |
|---|---|---|---|
| HTTP | Hono on Node, `@hono/node-server`, Zod and `@hono/zod-openapi`. | Thin HTTP handlers around domain operations and versioned validated contracts. [Node setup](https://hono.dev/docs/getting-started/nodejs), [OpenAPI integration](https://hono.dev/examples/zod-openapi). | Bootstrap |
| Clients | `openapi-typescript` generation and `openapi-fetch`. | Explicit web/mobile compatibility without exposing database types. [Generator CLI](https://openapi-ts.dev/cli). | Bootstrap |
| Identity | Better Auth, Drizzle adapter, database sessions, Expo integration and SecureStore. | Email verification/recovery and device sessions while journey permissions stay application-owned. [Expo integration](https://better-auth.com/docs/integrations/expo). | Bootstrap identity foundation |
| Database | One supported PostgreSQL major with PostGIS and pgvector, plus native full-text search. | Transactions, route geometry, discovery and grounded retrieval in one authority. [PostGIS documentation](https://postgis.net/documentation/), [pgvector documentation](https://github.com/pgvector/pgvector). | Bootstrap extension image; feature schemas progressively |
| Data access | Drizzle ORM and `pg`; Drizzle Kit for generated, reviewed migrations. | Explicit SQL and shared transactions without sharing database rows with clients. [PostgreSQL setup](https://orm.drizzle.team/docs/get-started/postgresql-new). | Bootstrap |
| Jobs | pg-boss in `apps/worker`, including its Drizzle transaction adapter. | Restart-safe work and atomic domain-write/job creation without a Redis service. [Transaction adapter](https://pgboss.io/api/adapters). | Bootstrap |
| Objects | Private SeaweedFS with AWS S3 SDK behind one owned storage interface. | Preserve originals and future R2/S3 portability while current access stays under application control. [S3 interface](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API). | Bootstrap |
| Logs | Pino and request/job correlation IDs. | Diagnose failed uploads, queue work and restrictions without retaining private source content in logs. | Bootstrap |

Select the PostgreSQL major together with compatible PostGIS, pgvector, pgBackRest, and container packages. Pin the built image and extension versions as one tested unit. Avoid choosing the newest database major before those artifacts qualify.

### Processing and external services

| Area | Recommendation | Value and boundary | Introduce |
|---|---|---|---|
| Media | Sharp, ExifTool, FFmpeg/ffprobe and explicitly qualified HEIF/HEVC support. | Safe previews and ordinary iPhone import support while preserving originals. A stock image library is insufficient evidence of codec support. [Sharp installation](https://sharp.pixelplumbing.com/install/). | Worker image foundation, then import implementation |
| Track formats | Bounded GPX parsing with `fast-xml-parser`, owned normalization and the official Garmin FIT decoder. | Retain segment gaps, missing times, provenance and participant-specific travel. | Import implementation |
| Web maps | Mapbox GL JS directly, with lazy loading. | Basemap/satellite and journey overlays; ordinary reading never requires a map. [Mapbox installation](https://docs.mapbox.com/mapbox-gl-js/guides/get-started/). | Geography implementation |
| AI integration | Server-only Vercel AI SDK and the hosted Vercel AI Gateway. | One controlled route for transcription, extraction, embeddings and grounded answers. [Node integration](https://ai-sdk.dev/docs/getting-started/nodejs). | Adapter/configuration boundary first; live calls with transcription and answers |
| Email | Nodemailer to Mailpit locally and Resend SMTP in production. | Verification, recovery and invitations use the same transport interface. [Mailpit image](https://mailpit.axllent.org/docs/install/docker/), [Resend SMTP](https://resend.com/docs/send-with-smtp). | Local email in bootstrap; production after domain setup |
| Edge and deployment | Caddy and Docker Compose on the existing VPS. | TLS, same-origin web/API delivery, private service networking and bounded processes. [Caddy CLI](https://caddyserver.com/docs/command-line), [Compose CLI](https://docs.docker.com/reference/cli/docker/compose/). | Local configuration in bootstrap; deployment after host inventory |
| Recovery | pgBackRest for database/WAL; consistent SeaweedFS snapshots and encrypted restic copies; independent restriction journal. | Recover data without restoring superseded access rights. [pgBackRest](https://pgbackrest.org/user-guide.html), [restic](https://restic.readthedocs.io/en/stable/020_installation.html). | Design and fixture support immediately; independent persistence before shared use |
| Verification | Vite+ tests, Testing Library, Playwright with axe, native profiling and accessibility tools. | Test domain invariants, real service integration, user journeys and runtime behaviour. [Playwright initializer](https://playwright.dev/docs/intro). | Bootstrap, expanding with features |

The architecture's three model candidates currently appear in the [Gateway public catalog](https://ai-gateway.vercel.sh/v1/models): `openai/gpt-6.1-sol`, `openai/gpt-transcribe`, and `openai/text-embedding-3-large`. Catalog presence does not qualify account access, supported task endpoints, retention, latency or quality. Check those before enabling each route, keep provider routing explicit, and avoid silent fallback. Keep the selected 3072-dimensional embedding generation with exact ranking initially; do not add an incompatible approximate vector index.

## Additional services that would add value

Prioritise these operational capabilities ahead of adding more application infrastructure:

1. **Independent backup and restriction-journal storage.** Select an off-VPS destination with separate credentials and retention. An S3 Object Lock bucket is a concrete option for protecting journal event versions, subject to region and retention decisions. It still needs application event IDs, ordering, receipts, integrity checks and replay; bucket configuration alone does not implement the journal. This is backup/recovery storage and does not move live application media out of SeaweedFS. [Object Lock behaviour](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).
2. **CI with a container registry.** Use GitHub Actions and GHCR if the repository is hosted on GitHub; otherwise use its existing host's equivalents. Run frozen installs, generation checks, real database/storage tests and production builds, and retain image digests. Native verification can initially use the MacBook with recorded results; every web change need not buy hosted macOS builds. [Actions setup](https://docs.github.com/en/actions/get-started/quickstart).
3. **An external uptime check and an alert channel.** Reuse existing host monitoring. Add an off-VPS check so total server loss is observable. Track disk/scratch headroom, queue age, backup freshness and pending restriction receipts alongside API health. Select a specific provider after checking what already exists.
4. **A small permission and recovery fixture suite.** Treat this as maintained project infrastructure. It will catch product-specific regressions that another SaaS dashboard cannot: review-only source leaks, stale publication jobs, revoked exports and restored sessions.

A dedicated error tracker can be evaluated when redacted logs no longer explain client failures. Analytics SaaS, session replay, a full metrics/trace cluster, paid build subscriptions, and a feature-flag service have no demonstrated bootstrap requirement. Start with audited configuration flags and content-free operational counters.

## Repository structure and ownership

Keep the architecture's structure:

```text
apps/
  web/                 Creator UI, approved-reader components and browser entry
  mobile/              Expo routes, native adapters, files, SQLite and sync
  server/              Hono API, auth handler, public HTML and media gateway
  worker/              pg-boss coordinator and processing jobs
packages/
  contracts/           Wire schemas, emitted OpenAPI and generated client types
  backend/             Server-only domain modules, policies, Drizzle and jobs
  shared/              Pure chronology, money, evidence and selection rules
  sync-protocol/       Versioned commands, acknowledgments and tombstones
  design-tokens/       Platform-neutral semantic tokens
tests/
  fixtures/            Consented or synthetic media and permission scenarios
  integration/         Real PostgreSQL, storage, queue and recovery tests
  e2e/                 Browser user journeys and accessibility checks
infra/
  compose/             Development and production definitions
  images/              Application, database and bounded decoder builds
  operations/          Release, migration, backup, restore and incident runbooks
docs/
```

Each application owns its platform configuration. `backend` exposes domain operations rather than tables for clients to compose. Shared packages stay free of React/native dependencies unless their responsibility explicitly requires them. Keep web and native UI components within their applications. A server rendering entry may import reader components, but browser/mobile entrypoints may never import backend configuration, database code, provider credentials or worker libraries.

Add explicit package exports, import restrictions and a client-bundle check. Keep one React instance per renderer; let Expo dictate native versions. Start with the supported pnpm/Metro defaults and change hoisting only for an evidenced integration failure, as described in the [Expo monorepo guide](https://docs.expo.dev/guides/monorepos/).

## CLI first installation policy

Use official generators for their supported responsibilities. After generation, inspect the diff and adapt configuration to the repository. Use the package manager to install libraries without a project initializer. Handwritten domain code, SQL extension migrations, and service configuration remain necessary where no generator describes this product.

For every installation or generation step:

1. Read the official documentation matching the intended release and inspect the CLI's current help.
2. Record the CLI version, command, working directory and relevant template choices.
3. Generate through that CLI, preserve relevant upstream configuration, and remove unrelated demo content.
4. Resolve compatible versions, pin direct dependencies and commit the workspace lockfile. Record native binaries and container digests separately.
5. Verify the generated result using the actual runtime, rather than treating a successful install as qualification.

`@latest` below identifies the documented discovery entrypoint. At implementation time, record the resolved version and use that exact version for reproducible regeneration. Subsequent CI runs use installed, pinned binaries. Bootstrap commands below are a planned sequence, not a script executed by this proposal.

### Workspace and application generation

| Working directory | Official CLI approach | Configuration to retain |
|---|---|---|
| Temporary directory | `pnpm dlx --package=vite-plus@1.7.0 vp create vite:monorepo` | Use the [verified command and flags](bootstrap/dependency-qualification.md#pinned-starter-cli-commands), then bring the reviewed workspace files into the existing repository. [Creation guide](https://viteplus.dev/guide/create). |
| Repository root | `pnpm create vite@9.3.4 apps/web --template react-ts --no-interactive --no-immediate` | The Vite+ monorepo initializer produces a vanilla web starter. Use this React/TypeScript template and apply the Vite+ aliases recorded in Step 1. |
| Repository root | `pnpm dlx create-hono@0.19.5 apps/server --template nodejs` | Decline the nested install and consolidate package-manager settings at the workspace root. [Hono setup](https://hono.dev/docs/getting-started/nodejs). |
| Repository root | `pnpm create expo@5.1.9 apps/mobile --template default@58.0.35 --no-install --no-agents-md` | Use the pinned Expo Router template and install through the workspace. [Expo initializer](https://docs.expo.dev/more/create-expo/). |
| Repository root | `pnpm exec vp create vite:library` | Generate the library and worker package foundations using supported prompts and explicit destinations. Use a Node entrypoint for the worker. |
| `apps/web` | `pnpm dlx shadcn@4.23.0 init` | Initialize the existing app. Add primitives through the same pinned CLI when a screen needs them. [Existing-project setup](https://ui.shadcn.com/docs/installation/vite). |

Use `pnpm exec vp` wherever a global `vp` is unavailable. Vite+ supports project-local execution, so a global install is optional. If a root initializer refuses a nonempty directory, generate into a temporary sibling directory and merge reviewed generated files into this repository without replacing its history or documentation.

Do not run a second web initializer through shadcn after Vite+ creates the app. Likewise, do not migrate Expo's Metro/native build into Vite+: the workspace task runner invokes Expo's own commands.

### Installation and generation commands

| Responsibility | Planned CLI | Important detail |
|---|---|---|
| Ordinary packages | `vp add <package>` / `vp add -D <package>` in the owning workspace | Use the selected package manager through Vite+; keep backend dependencies out of clients. [Add command](https://viteplus.dev/guide/package-management/add). |
| Native modules | `pnpm exec expo install <packages>` in `apps/mobile` | Expo resolves SDK-compatible packages. Include an exact Nitro Modules version from its compatibility table. |
| Native diagnostics | `pnpm exec expo install --check`; `pnpm dlx expo-doctor@latest` | Check both dependency alignment and real builds. [Expo CLI](https://docs.expo.dev/more/expo-cli/), [development tools](https://docs.expo.dev/develop/tools/). |
| Local native builds | `pnpm exec expo run:android` and `pnpm exec expo run:ios` | Use the [verified Mac toolchain](bootstrap/dependency-qualification.md#development-mac-inventory) for local development builds. |
| Better Auth schema | `pnpm dlx auth@latest generate --config <auth-config-path> --output <auth-schema-path>` | Current official CLI entrypoint is `auth`. Generate for the configured Drizzle adapter, then apply through Drizzle migrations. [CLI reference](https://better-auth.com/docs/concepts/cli). |
| SQL migrations | `pnpm exec drizzle-kit generate`; `pnpm exec drizzle-kit migrate` | Configure explicit schema/output paths in `packages/backend`; review and commit SQL. Use custom migrations for extensions where needed. [Generate](https://orm.drizzle.team/docs/drizzle-kit-generate), [migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate). |
| Queue schema | `pnpm exec pg-boss migrate`; `pnpm exec pg-boss doctor` | Use `PGBOSS_DATABASE_URL` from protected environment configuration. Separate migration privileges from application privileges. [Queue CLI](https://pgboss.io/cli). |
| API client | `pnpm exec openapi-typescript openapi.json -o src/generated/api.d.ts` in `packages/contracts` | Emit OpenAPI from registered schemas first, then generate; CI rejects unexplained generated drift. [CLI reference](https://openapi-ts.dev/cli). |
| Browser tests | `pnpm create playwright`, then `pnpm exec playwright install` | Use its initializer once; configure real application test startup and axe checks. [Installation](https://playwright.dev/docs/intro). |
| Containers | `docker compose -f infra/compose/dev.yml config`; `docker compose -f infra/compose/dev.yml up -d` | These are proposed repository paths. Validate configuration before starting pinned services. [Compose CLI](https://docs.docker.com/reference/cli/docker/compose/). |
| Static checks and tests | `pnpm exec biome check`, `tsc`, `vp test`, and `vp run <task>` | Run Biome and explicit per-app type checks through workspace tasks. Disable overlapping formatter and lint tasks from the generated templates. |
| Operations | Caddy, pgBackRest, restic, FFmpeg/ffprobe, ExifTool and SeaweedFS CLIs | Use official binaries/images and documented configuration; record versions and codec flags. |

Do not let a generator replace Vite+ with standalone Vite/Vitest configuration. Retain the selected release's documented Vite core alias and bundled Vitest alignment. Avoid broad peer-dependency suppression. Also inspect generated agent instructions and plugins before retaining them; application scaffolding should not silently alter unrelated tooling preferences.

Some account, billing, DNS and store-enrollment actions require their provider's account interface. Use a supported official CLI/API where one exists; record the remaining owner action instead of inventing a command. No production account or paid resource needs to be created to review this plan.

## Bootstrap execution sequence

### Step 1 Inventory and compatible versions

Read the approved plan and repository instructions. Record Mac architecture, available memory, Node/pnpm, container runtime, Xcode/simulator, Android SDK/emulator and required JDK. Inspect VPS details only when infrastructure work begins: OS, architecture, actual CPU/RAM, disk, region, existing workloads and network constraints.

Create a dependency qualification record with candidate versions, official source links, license notes and verification status. Resolve Vite+ plugins, one TypeScript version where compatible, and the Expo/Unistyles/Nitro/Mapbox combination. Do not copy prerelease package tags from a documentation example into the baseline without an explicit reason.

**Completion:** compatible candidate manifests and an environment setup checklist exist; unresolved native or binary compatibility is visible before feature dependencies spread.

**Evidence:** [dependency qualification](bootstrap/dependency-qualification.md) records the initial candidates and toolchain evidence. The [workspace lockfile](../pnpm-lock.yaml) records the resolved dependencies.

### Step 2 Generate the workspace and quality commands

Generate the four apps and five shared packages through supported CLIs. Preserve the existing documents. Add strict per-platform TypeScript configurations, package exports, editor settings, environment examples, ignore rules and the workspace lockfile. Use Vite+'s task runner for checks, builds and invoking Expo.

Provide documented tasks for local service startup/shutdown, development processes, generation, migrations, seeding, type checks, tests and production builds. Validate environment variables with Zod at process startup. Separate public browser/native configuration from server secrets; local examples contain placeholders only. Seed only synthetic users and journeys in development/test.

**Completion:** a clean checkout installs with the frozen lockfile; root tasks correctly address every workspace; browser/native code cannot import server-only packages.

**Evidence:** a fresh frozen install, Biome, strict type checks and builds for all nine app and package workspaces, and three bootstrap tests passed. The generated route tree reproduced byte for byte. Expo Doctor passed 20 checks, and Metro exported both platforms. The local web and Hono endpoints responded, and Biome rejected backend package imports, relative server imports and client-safe re-exports. See the [workspace commands](../README.md).

### Step 3 Establish local data and worker services

Create development Compose definitions for PostgreSQL with both extensions, private SeaweedFS and Mailpit. Bind administration ports to local access and use named volumes. Run Node development processes on the Mac for fast iteration; also prepare production-compatible images. Add Caddy configuration for same-origin web, API and authenticated media routes.

Introduce the Drizzle migration process and separate migration credentials. Install pg-boss's schema through its CLI and give the worker bounded database pools, graceful shutdown and durable queue processing. Implement the S3 adapter's stream, multipart, completion, abort, HEAD and Range operations with a conformance suite. Test real whole-file checksum verification rather than treating multipart ETags as hashes.

**Completion:** a fresh database migrates from zero, PostGIS/pgvector queries execute, a domain transaction and queued job roll back together, a job survives worker restart, private storage passes representative multipart/read tests, and Mailpit captures a test message. Repeated startup preserves data.

**Evidence:** PostgreSQL 17.12 initialized the extensions and separate migration/runtime roles. Drizzle and pg-boss migrated from an empty volume, and the pg-boss drift check passed. Seven conformance tests passed against the local services. A Compose down/up cycle preserved a database row, queued job, signed-access object and captured message. The Linux ARM64 server, worker and Caddy images built and passed smoke checks. The [local services workflow](../README.md#local-data-services) records the commands.

### Step 4 Establish contracts and domain boundaries

Create `/api/v1` contracts, health/readiness endpoints, safe errors and request IDs. Keep `/api/auth` owned by Better Auth. Emit OpenAPI and generate the first client. Version command IDs, expected revisions, pagination, upload acknowledgments and tombstones before clients start depending on them.

Establish identity, journeys, sources, and lifecycle modules for the bootstrap. Add the remaining modules with their implementation according to [architecture section 5](architecture.md#5-module-ownership-and-repository-structure). Implement the initial account, canonical journey, capability, grant, audit and restriction-event schema before shared-data operations are enabled. Keep source ownership, publication reuse and original export grants separate.

**Completion:** web and mobile use generated wire types, generated output is reproducible, invalid requests fail predictably, and foundational permission fixtures cover participant, coauthor, publisher, administrator, source owner and revoked member.

**Evidence.** `pnpm api:check` reproduced the OpenAPI document and generated client types. The web and mobile client factories passed contract tests, including malformed version input and request IDs. The new PostgreSQL migration passed on the existing database and a fresh instance. Permission fixtures covered all six roles, and database fixtures verified canonical memberships, scoped grants, and denial of private tables to the runtime role. All 17 unit tests and nine integration tests passed. The API responded through local Caddy and from the Linux ARM64 server image. Better Auth owns `/api/auth`. Email authentication and independent journal confirmation are Step 6 work. See [the workspace commands](../README.md#migrations-and-generation).

### Step 5 Build the web and native foundations

On web, establish Router/Query providers, an account-safe API client and the Journeys, Discover and Saved navigation structure. Generate only the shadcn primitives those screens need. Wire shared tokens into Tailwind and create distinct loading, empty, error and unavailable states. Establish separate creator, reader client and reader server build entries, safe serialization and request-local rendering state. Use fixtures to check HTML/hydration without implying publication is already implemented.

On mobile, generate Expo Router navigation for the same product destinations and configure tokens through Unistyles. Initialize Unistyles before Router imports and configure its Babel integration for the actual route/component paths. Add SecureStore, SQLite migrations and account-owned file namespaces. Use fixture-backed tests of these production adapters for interruption/relaunch and account switching. Compile with Mapbox included early so native integration failures are found before the geography screens are built.

**Completion:** production web client/server builds work, reader HTML hydrates without cross-request state leakage, and local Android/iPhone development builds run with Unistyles and the native map module. Inspect client bundles for backend code and server-only AI, storage and email SDKs. Actual camera, battery and background-transfer claims remain subject to the evidence boundaries in the development plan.

**Evidence.** The creator, reader client, and Node reader built successfully. Three Chromium tests passed for reader HTML and hydration, request isolation, unavailable metadata, and creator states. The Linux ARM64 server and Caddy images served the unavailable reader HTML and its manifest assets. The development clients compiled and ran on the iPhone 17 simulator and Android API 37 emulator. Both passed the bootstrap checks for the native Mapbox bridge and the SQLite, files, and SecureStore fixture across full app relaunch and account switching. Production web and native source maps contained no backend, AI, storage, or email SDK sources. See the [current native validation workflow](../README.md#native-development-checks).

### Step 6 Complete identity and recovery foundations

Wire email/password registration, verification, sign-in, logout, recovery and session revocation through Better Auth and the queue-backed mail interface. Use Mailpit for local verification. Test expired/consumed tokens, delayed email, queue errors, allowlisted return destinations and account switching. Require fresh server checks for sensitive actions and avoid session caches that bypass revocation.

Define the independent restriction-journal adapter, stable event identity, ordered receipt format, pending confirmation response and recovery epoch. Use an isolated test destination to exercise failures. Before any real shared data is accepted, configure an actual independent destination and prove local deny → durable independent receipt → confirmed completion, plus restore replay. A file on the same VPS is insufficient.

**Completion:** identity flows work in the web and both native builds, email failures are visible, and account/security restrictions survive the tested rollback scenario. Any foundation missing the independent destination remains explicitly incomplete for shared use.

**Evidence.** Chromium, iPhone 17 Simulator, and the Android API 37 emulator passed verified email identity and password recovery with Mailpit. Browser tests verified device revocation and pending confirmation. PostgreSQL integration exercised stale sessions, untrusted return destinations, expired and consumed reset links, delayed delivery, queue rollback, and exhausted SMTP delivery. A disposable PostgreSQL fixture restored an older password and replayed independently retained test receipts, including out-of-order confirmation and an unavailable journal tail. The old credentials and restored token stayed blocked. An actual off-VPS journal destination and recovery drill are pending. See the [local identity and recovery commands](../README.md#local-identity-and-recovery).

**Review follow-up.** Replay now requires an independently retained checkpoint. The fixture rejects a stable truncated head and a mismatched receipt, then proves that approved recovery requires a fresh reset at the verified address. Native credentials are scoped by API origin and distributed variants use distinct app identifiers. Mailpit confirms a stable Resend idempotency header, and Pino logs request and job IDs without recording email addresses, tokens or request bodies.

### Step 7 Make the foundation reproducible in CI and deployment

Run frozen installation, generated-contract checks, lint/type checks, focused unit/integration tests, production web/server/worker builds, and browser smoke/accessibility checks. Test against the same extension/storage image families used in deployment. Keep separate protected environments and secrets. Build pinned Linux artifacts for the actual VPS architecture; a successful Mac installation does not qualify Linux codecs or native Node binaries.

Add a deployment sequence for backup, reviewed migrations, restart, readiness checks and compatible rollback images. Add pgBackRest/WAL configuration, the consistent object-backup procedure, journal replay and closed-access restore. Test recovery using synthetic data. Configure host/provider usage alerts and an external availability check before community deployment.

**Completion:** a second clean setup can run the documented workflow, CI protects the foundations, and recovery instructions include demonstrated results. The foundation is then ready for the complete feature sequence below.

**Evidence.** A clean workspace passed frozen install, Biome, type checks, generated-contract checks, unit tests, production builds and Chromium accessibility checks. The local integration suite and the disposable journal replay passed. Linux ARM64 images booted the server, worker and edge. The synthetic restore recovered PostgreSQL to the named WAL point, verified the matching SeaweedFS object checksum, preserved private access and excluded later writes while ingress remained closed. The rehearsal used disposable repositories. GitHub passed the foundation and Linux amd64 release checks for [PR #1](https://github.com/nishanthturnstile/kairn/pull/1). See [implementation progress](progress.md#open-before-shared-use) for hosted controls and live recovery verification.

**Review follow-up.** CI now executes the live browser identity fixture, the web and native bundle checks, and Expo dependency validation. The release drill qualifies synthetic HEIC and HEVC on the actual worker image and resumes a multipart upload after SeaweedFS restarts. The isolated database tests reject partial migrations, and production worker startup checks mail and journal configuration. The synthetic development seed runs twice against a disposable database to check repeatability.

## Full application implementation after bootstrap

Follow [requirements section 18.2](product-requirements.md#182-dependency-aware-implementation-sequence). Each workstream extends the production application and adds lifecycle controls with its data.

| Order | Production work | Evidence that closes the workstream |
|---|---|---|
| 1 | Complete accounts, canonical journeys, membership, capabilities, source/export grants and audit. | Single journey reference per member; verified recovery; current rights enforced; independent restriction receipts. |
| 2 | Android/iPhone durable capture, command outbox, resumable uploads and incremental sync. | Files survive restart, duplicate operations do not duplicate assets, cancelled uploads preserve originals, account partitions remain isolated. |
| 3 | Photo/video/audio/GPX/FIT import, metadata and bounded processing. | Real supported HEIF/HEVC fixtures work; originals, segment breaks and unknown timestamps survive; failures are per file. |
| 4 | Contribution, autosave, revision conflicts, ownership transfer and departure. | Five-member editing scenario retains stale candidates and applies current grants. |
| 5 | English transcription, review/corrections and real source offsets. | Supported recordings produce reviewable text; unsupported/failed recordings remain playable; transcripts remain private until approved. |
| 6 | Reconstruction, chapters, maps, story editing, debrief and practical details. | No fabricated route/time/cost evidence; corrections and participant branches survive; map-free fallback works. |
| 7 | Approved projections, exact publisher preview, Story/Explore/Learn, all three audiences and revocation. | Draft changes remain private; actual HTML, metadata, media and ranges contain only permitted content; stale jobs cannot republish withdrawals. |
| 8 | Approved personal highlights, static cards and optional public profiles. | Attribution, canonical journey links, eligible selection and withdrawal work without duplicating a journey. |
| 9 | Discover, listing moderation, saved research and future-event references. | Only explicit public listings appear; one listing per journey; reporting/takedown operator and workflow exist. |
| 10 | Approved-text search, grounded questions, citations, quotas and answer invalidation. | Authorization precedes retrieval; claims cite eligible evidence; stale/private sources are excluded; missing evidence causes abstention. |

Implement export, deletion, retention, quotas, access invalidation, support and recovery throughout. Preserve the required full R1 scope, including discovery, questions and lifecycle work. Web and Android public distribution come first; iPhone implementation and Simulator validation happen during development, while public iOS distribution remains deferred.

## Accounts and environment setup

| Service or input | Needed for | Timing and owner action |
|---|---|---|
| Git hosting and optional registry | CI and artifact distribution | Reuse the current repository host. Confirm deployment identity and protected environment access during CI setup. |
| Container runtime, Android tooling, Xcode | Local services and native builds | The [Mac toolchain](bootstrap/dependency-qualification.md#development-mac-inventory) is installed and verified. Local development uses Docker Compose and local Expo builds. |
| Product identity and domain | Production URLs, email sender, native package IDs | Keep the existing working name until the founder selects ownership/domain/package identifiers. Set final identifiers before distribution/signing integration. |
| Existing VPS | Production app and primary data | Inventory the real machine before configuring resource limits or public routes. The approximately 4 vCPU/8 GB baseline is a testing assumption. |
| Independent backup/journal destination | Recovery and restrictions | Select region, retention, write/verify credentials and key recovery before shared use. Keep backup administration separate from application append credentials. |
| Mapbox | Native qualification and live maps | Configure scoped public runtime tokens and any required build-time credentials under current account/SDK instructions. Never bundle a secret download token. |
| Resend and DNS access | Production verification, recovery and invitations | Verify a sender domain and records, then test SMTP/TLS from the VPS. Keep a stable application mail-event identity and provider idempotency header. |
| Vercel AI Gateway | Live transcription, extraction, embeddings and questions | Verify allowed providers, task support, regional/retention policies and account access. Keep credentials on the trusted server/worker coordinator. |
| Google Play Console and Android signing | Android public release | Complete signing and current store/testing/privacy requirements before release; this is not a local development prerequisite. |
| Monitoring alert destination | Detect service, storage and backup failures | Reuse existing monitoring, configure an external uptime check and identify the operator before community deployment. |

Local web/server development should start with PostgreSQL, SeaweedFS and Mailpit, with external integrations disabled until configured. Missing AI or map credentials must produce explicit unavailable states rather than fabricated successful responses. Production, staging and development use separate data, secrets and provider configuration.

## Verification and bootstrap completion

The bootstrap milestone is complete when:

- A clean checkout follows the documented setup and frozen lockfile without undocumented global JavaScript dependencies.
- Web, server and worker production builds pass; Android and iPhone development builds run against the recorded native matrix.
- Strict type checks and package boundaries cover all workspaces; no backend secrets or server-only SDKs enter client bundles.
- OpenAPI and generated client output agree, and the repository has an installed-client compatibility fixture strategy.
- Fresh migrations, extension queries, transactional job rollback and worker restart recovery pass against real services.
- Private storage and multipart finalization pass checksum, abort, restart and representative Range/HEAD tests.
- Local identity/email/session flows pass, including failure and account-isolation cases.
- Restriction confirmation and rollback recovery have evidence using an independent destination before shared use.
- The reader build boundary renders/hydrates fixture content safely, and web/native startup does not require maps or AI.
- CI, environment documentation, dependency records and release/restore runbooks match the actual implementation.

Carry the experience targets into feature acceptance: initial public compressed JavaScript at most 250 KiB, initial viewport transfer at most 1 MiB, map/editor/AI code excluded from that entry, and the documented LCP/INP/CLS targets. These are project budgets to measure on the declared fixture, not results promised by selecting a framework.

Keep the solo, five-person/five-day and 500-item fixtures in the test plan. Record Planned, Verified, Failed and Not run distinctly, with source revision, dependency/artifact versions, environment, procedure and limitations. Simulator imports are useful protocol evidence but do not prove real phone camera, battery or background behaviour.

## Decisions carried into R1

The merged foundation uses Node 24, Expo 58, and GitHub Actions. Continue with the ten R1 workstreams in dependency order. Set final app identifiers and provision the actual deployment and independent recovery destinations when that work begins. See [implementation progress](progress.md) for the next slice and current verification.

After review, incorporate accepted decisions into the architecture's canonical register and implement the foundation in small, reviewable changes: workspace generation; local services; contracts/data/jobs; web/native foundations; identity/recovery; and CI/deployment evidence. Keep generated changes separate enough that CLI output and application-specific edits can be reviewed clearly.
