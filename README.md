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
| `pnpm dev:worker`            | Worker entry point in watch mode. The scaffold validates its environment and exits on each run.     |
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

## Generation and data services

Vite generates `apps/web/src/routeTree.gen.ts` during web development and builds. Include changes to that file when you change route files. Use `pnpm --dir apps/web exec shadcn add <component>` to add web primitives from the configured registry.

The local data and contracts milestones supply the remaining commands.

| Operation                              | Available when                                              | Intended CLI                                                                                       |
| -------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Start or stop local data services      | Step 3 adds `infra/compose/dev.yml`                         | `docker compose -f infra/compose/dev.yml up -d` and `docker compose -f infra/compose/dev.yml down` |
| Generate and apply database migrations | Step 3 adds the database schema and migration configuration | `pnpm exec drizzle-kit generate` and `pnpm exec drizzle-kit migrate` from `packages/backend`       |
| Seed local data                        | The first database fixtures are introduced                  | Run the backend seed task against the local database with synthetic users and journeys.            |
| Generate API contracts                 | Step 4 adds registered routes and the OpenAPI emitter       | Emit OpenAPI, then run `pnpm exec openapi-typescript` from `packages/contracts`.                   |
