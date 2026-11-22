# Kairn

Kairn is a pnpm workspace for web, mobile, API, and worker development. It uses Vite+ to run workspace tasks and Biome for linting and formatting.

Start with [implementation progress](docs/progress.md) for the current milestone, completed work, and pending items. The [documentation index](docs/README.md) lists the core planning references and milestone plans. For UI contributions, follow the [Fold design contract](DESIGN.md) and open [/design-system](http://localhost:5173/design-system) in the running web app.

## Start developing

Use Node.js 24.22.3 and pnpm 12.21.0. Corepack can provide the pinned pnpm version.

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm check
```

| Command                      | What it runs                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`                   | Web at `http://localhost:5173`.                                                                     |
| `pnpm dev:server`            | Hono on `127.0.0.1:3000`. Set up the local database and server environment first.                   |
| `pnpm dev:worker`            | pg-boss worker in watch mode. Set up the local database and add the worker environment first.       |
| `pnpm dev:mobile`            | Metro for an installed Expo development client.                                                     |
| `pnpm android` or `pnpm ios` | Compile and run the local Expo development client on the selected emulator or simulator.            |
| `pnpm check`                 | Biome and strict TypeScript checks across the workspace.                                            |
| `pnpm test`                  | The bootstrap, API contract, and permission tests.                                                  |
| `pnpm build`                 | Web production assets, compiled Node entry points and packages, and Android/iOS JavaScript bundles. |
| `pnpm format`                | Format supported source and configuration files with Biome.                                         |

Use separate terminals for the development processes and `Ctrl+C` to stop each one. After `pnpm build`, run a compiled Node entry point with `pnpm --filter @kairn/server start` or `pnpm --filter @kairn/worker start`.

## Configuration

Each app has an `.env.example` with its current inputs. Create an app-local `.env.local` when you need to override a default. Web and mobile expose only the values they read through the `VITE_` and `EXPO_PUBLIC_` prefixes. Keep private values in the server or worker and out of files tracked by Git. The mobile bundle identifiers are local development placeholders.

The web, mobile, and client-safe packages use package exports to share code. Node entry points can import `@kairn/backend` through its Node-only export. Biome checks for source imports that cross that boundary.

## Local data services

With Docker and Compose running, start the local stack and apply both schemas.

```sh
pnpm services:up
cp -n packages/backend/.env.example packages/backend/.env.local
cp -n apps/server/.env.example apps/server/.env.local
cp -n apps/worker/.env.example apps/worker/.env.local
pnpm db:migrate
pnpm db:queue
```

Run `pnpm db:seed` to add the synthetic account and foothills journey to the loopback development database. Reruns preserve the same fixture IDs. The fixture account has no sign-in credentials.

The Compose stack binds each published port to loopback.

| Service                                              | Local address                                  |
| ---------------------------------------------------- | ---------------------------------------------- |
| PostgreSQL 17.12 with PostGIS 3.7 and pgvector 0.8.7 | `127.0.0.1:55432`                              |
| Private SeaweedFS S3 endpoint                        | `http://127.0.0.1:58333`                       |
| Mailpit SMTP and inbox                               | `127.0.0.1:51025` and `http://127.0.0.1:58025` |
| Caddy proxy                                          | `http://127.0.0.1:58080`                       |

Generate a development secret with `pnpm dlx auth@1.7.25 secret` and set `BETTER_AUTH_SECRET` in `apps/server/.env.local`. Use the Caddy origin for `BETTER_AUTH_URL`. [Better Auth CLI](https://better-auth.com/docs/concepts/cli#secret)

To test first-run web onboarding, set `ONBOARDING_STARTS_AT` in `apps/server/.env.local` to a UTC timestamp at or before the test account’s email verification time. Restart the server after changing it. When the setting is absent, new accounts go straight to Dashboard. Accounts verified before the cutoff keep their existing access.

Run `pnpm dev --host 127.0.0.1` and `pnpm dev:server` on the Mac in separate terminals. Open [the local app through Caddy](http://127.0.0.1:58080/account) for sign-in and sign-out. Caddy serves web and `/api` on the same origin as `BETTER_AUTH_URL`. A different hostname or port can serve the UI while authentication writes return `INVALID_ORIGIN`. Caddy sends `/media` requests to the Node server. Media returns 404 until the application implements its access checks. The S3 endpoint requires signing credentials and stays on the local development network. The example database connections are for the loopback stack. The server and worker use the runtime database role. The migration commands and synthetic database fixtures use the migration role.

`pnpm test:integration` runs the local conformance suite against the default Compose stack. Run it with the development worker stopped so the suite controls worker start and stop. `pnpm services:down` stops the stack and preserves its named volumes.

## Migrations and generation

Use `pnpm db:generate --name=<change>` to generate a Drizzle migration from the backend schema. Review the SQL before applying it with `pnpm db:migrate`. `pnpm db:queue` runs the pg-boss CLI migration, provisions the infrastructure check queue, and runs the CLI's drift check.

Use `pnpm api:generate` to emit the OpenAPI 3.1 document and regenerate its TypeScript client types. `pnpm api:check` verifies both files without writing to them. The web and mobile client factories consume the generated paths. The live document is at `/api/v1/openapi.json`, liveness at `/api/v1/health`, database readiness at `/api/v1/ready`, and sync protocol compatibility at `/api/v1/protocol?version=1`.

Use the Better Auth CLI to regenerate its Drizzle schema when auth options change. Generate to a temporary file, review the diff against `packages/backend/src/modules/identity/auth-schema.ts`, and bind the table definitions to `kairnAuth.table` before generating the database migration. [Better Auth schema generation](https://better-auth.com/docs/concepts/cli#generate)

```sh
pnpm --dir packages/backend dlx auth@1.7.25 generate --config scripts/auth-generation.ts --adapter drizzle --dialect postgresql --output /tmp/kairn-auth-schema.ts --yes
```

Vite generates `apps/web/src/routeTree.gen.ts` during web development and builds. Include changes to that file when you change route files. Use `pnpm --dir apps/web exec shadcn add <component>` to add web primitives from the configured registry.

## Container images

```sh
docker build -f infra/images/postgres/Dockerfile -t kairn-postgres .
docker build -f infra/images/app/Dockerfile --target server -t kairn-server .
docker build -f infra/images/app/Dockerfile --target worker -t kairn-worker .
docker build -f infra/images/app/Dockerfile --target edge -t kairn-edge .
```

The Node images run as the `node` user. Pass the runtime `DATABASE_URL` to the server and worker. The server also requires `BETTER_AUTH_SECRET` and an HTTPS origin in `BETTER_AUTH_URL`. For the pinned Linux release, deployment and recovery commands, see the [deployment runbook](docs/deployment-and-recovery.md).

## Web reader and browser tests

The web build emits the creator and reader clients in `apps/web/dist/client` and the Node reader renderer in `apps/web/dist/server`. The reader uses the deployment's client manifest to load its hashed assets. The Node route at `/read/*` requires a verified session and routes unfinished accounts to onboarding. It serves the generic unavailable page until publication is implemented.

```sh
pnpm --filter @kairn/web build
pnpm exec playwright install chromium
pnpm test:web
```

To smoke-test the built reader locally, run `READER_BUILD_DIR=../web/dist pnpm dev:server` and `pnpm --dir apps/web exec vp preview --host 127.0.0.1 --port 5173` in separate terminals, then request `/read/example` through Caddy on port `58080`. Run `docker compose -f infra/compose/dev.yml restart edge` to reload changes to the local Caddyfile. [Vite SSR build guide](https://vite.dev/guide/ssr.html)

## Native development checks

Boot an Android phone emulator and an iPhone simulator, then run `pnpm android` or `pnpm ios` to build and install the development client. The JavaScript entry configures Unistyles before loading Expo Router. Mapbox is linked in the native builds and maps will open through an explicit map action when geography is implemented. [Unistyles Expo Router setup](https://www.unistyl.es/v3/guides/expo-router/)

Run `pnpm dev:mobile --localhost` to start Metro for an existing development build. For Android, forward the Metro and Caddy ports with `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:58080 tcp:58080`. Open Account in each app to check sign-in and recovery against the local stack.

## Local identity and recovery

Run `pnpm db:migrate` and `pnpm db:queue` after updating the workspace. Generate a local 32-byte hex key with `openssl rand -hex 32`. Set the same `AUTH_MAIL_KEY` in the server and worker environment files. This key encrypts the queued links and is separate from `BETTER_AUTH_SECRET`. Set the worker's `SMTP_URL` and `AUTH_FROM_EMAIL` from its development example. Start the server, web, and worker, then open `/account` through Caddy and use the Mailpit inbox on port `58025` to follow verification and password reset links. Use synthetic email addresses in development. [Better Auth email and password](https://better-auth.com/docs/authentication/email-password)

- Run `pnpm test:web:identity` after building and migrating, with PostgreSQL and Mailpit running. It starts temporary application processes and exercises verification, device revocation and password recovery. CI runs this command.
- Run `KAIRN_WEB_ONBOARDING=1 pnpm test:web:identity --workers=1` to exercise first-run progress, sign-in return and Dashboard. The test runner sets its own cutoff.
- Run `pnpm check:client-bundles` to scan temporary browser, Android and iOS source maps for server-only packages.
- Run `pnpm test:identity:recovery` with the local Mailpit running. It starts a disposable database and checks SMTP idempotency headers, rejects incomplete journal checkpoints and verifies recovery at an independently approved address.
- For native identity validation, start Metro and use Account on each development client. Open verification and reset emails from Mailpit on the host. Set `EXPO_PUBLIC_API_ORIGIN` to the HTTPS API origin for distributed builds. [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo)

The worker records each delivery as queued, sent, expired, or failed in `kairn_auth.identity_mail`. It discards encrypted links after a terminal outcome. A queue outage rejects registration without creating an account. An exhausted SMTP delivery can be retried by requesting a fresh verification or reset link.

Password resets and device revocations take effect immediately in PostgreSQL. Responses report pending recovery confirmation until the independent journal returns a matching receipt. The local environment intentionally exercises the pending path.

The independent journal must use a separately operated HTTPS destination with credentials and retention outside database restore. `AUTH_JOURNAL_URL` is its API base. The adapter calls `PUT /events/{id}` with the event and digest, `GET /head` for the latest sequence, and `GET /sequence/{number}` for the event and its receipt. Repeated writes for the same event must return the same durable receipt. The write credential requires append and read access.

Production account access requires this destination and a recovery epoch stored outside PostgreSQL. Replay requires the independently retained journal checkpoint and invalidates restored sessions and links. Accounts with superseded credentials remain locked until an operator approves an independently verified address and the user completes a fresh reset. See the [recovery runbook](docs/deployment-and-recovery.md#restore-with-application-access-closed).

Use `KAIRN_APP_VARIANT=staging` or `KAIRN_APP_VARIANT=production` when generating the corresponding native build. Each variant has its own iOS bundle identifier and Android package. SecureStore credentials are scoped to the normalized API origin. Existing development installs require a fresh sign-in after the storage change.
