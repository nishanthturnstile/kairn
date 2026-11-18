# Kairn

Kairn is a pnpm workspace for web, mobile, API, and worker development. The scaffold uses Vite+ to run workspace tasks and Biome for linting and formatting.

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
| `pnpm dev:server`            | Hono on `127.0.0.1:3000`. Request `/` to smoke-test the process.                                    |
| `pnpm dev:worker`            | pg-boss worker in watch mode. Set up the local database and add the worker environment first.       |
| `pnpm dev:mobile`            | Metro for an installed Expo development client.                                                     |
| `pnpm android` or `pnpm ios` | Compile and run the local Expo development client on the selected emulator or simulator.            |
| `pnpm check`                 | Biome and strict TypeScript checks across the workspace.                                            |
| `pnpm test`                  | The Vitest bootstrap tests.                                                                         |
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
cp -n apps/worker/.env.example apps/worker/.env.local
pnpm db:migrate
pnpm db:queue
```

The Compose stack binds each published port to loopback.

| Service                                              | Local address                                  |
| ---------------------------------------------------- | ---------------------------------------------- |
| PostgreSQL 17.12 with PostGIS 3.7 and pgvector 0.8.7 | `127.0.0.1:55432`                              |
| Private SeaweedFS S3 endpoint                        | `http://127.0.0.1:58333`                       |
| Mailpit SMTP and inbox                               | `127.0.0.1:51025` and `http://127.0.0.1:58025` |
| Caddy proxy                                          | `http://127.0.0.1:58080`                       |

Run `pnpm dev --host 127.0.0.1` and `pnpm dev:server` on the Mac in separate terminals. Caddy serves web and `/api` on one origin and sends `/media` requests to the Node server. Media returns 404 until the application implements its access checks. The S3 endpoint requires signing credentials and stays on the local development network. The example database connections are for the loopback stack. Only the migration workspace receives the migration credentials.

`pnpm test:integration` runs the local conformance suite against the default Compose stack. Run it with the development worker stopped so the suite controls worker start and stop. `pnpm services:down` stops the stack and preserves its named volumes.

## Migrations and generation

Use `pnpm db:generate --name=<change>` to generate a Drizzle migration from the backend schema. Review the SQL before applying it with `pnpm db:migrate`. `pnpm db:queue` runs the pg-boss CLI migration, provisions the infrastructure check queue, and runs the CLI's drift check.

Vite generates `apps/web/src/routeTree.gen.ts` during web development and builds. Include changes to that file when you change route files. Use `pnpm --dir apps/web exec shadcn add <component>` to add web primitives from the configured registry.

Synthetic user and journey seeds follow their domain schemas. The API contracts milestone adds the OpenAPI emitter and generated client types.

## Container images

```sh
docker build -f infra/images/postgres/Dockerfile -t kairn-postgres .
docker build -f infra/images/app/Dockerfile --target server -t kairn-server .
docker build -f infra/images/app/Dockerfile --target worker -t kairn-worker .
docker build -f infra/images/app/Dockerfile --target edge -t kairn-edge .
```

The Node images run as the `node` user. Pass the runtime `DATABASE_URL` to the worker and set the edge's `KAIRN_API_UPSTREAM` when its upstream DNS name differs from `server:3000`. The edge serves the static web build on `:8080` by default. Production host configuration and backup policy are part of the deployment milestone.
