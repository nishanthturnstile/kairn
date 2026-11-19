#!/usr/bin/env bash
set -euo pipefail

scratch=$(mktemp -d)
database=""
cleanup() {
  if [[ -n "$database" ]]; then
    docker stop --time 2 "$database" >/dev/null 2>&1 || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

database=$(docker run -d --rm -p 127.0.0.1::5432 \
  -e POSTGRES_DB=kairn -e POSTGRES_USER=kairn_admin -e POSTGRES_PASSWORD=temporary-bootstrap-admin \
  -e KAIRN_MIGRATOR_PASSWORD=temporary-bootstrap-migrator -e KAIRN_RUNTIME_PASSWORD=temporary-bootstrap-runtime \
  --mount "type=bind,source=$PWD/infra/compose/init-postgres.sql,target=/docker-entrypoint-initdb.d/10-kairn.sql,readonly" \
  kairn-dev-db)
port=$(docker port "$database" 5432/tcp | cut -d : -f 2)
for ((attempt = 0; attempt < 25; attempt++)); do
  if docker exec "$database" pg_isready -h 127.0.0.1 -U kairn_admin -d kairn >/dev/null; then
    break
  fi
  sleep 1
done

export KAIRN_TEST_MIGRATION_DATABASE_URL="postgresql://kairn_migrator:temporary-bootstrap-migrator@127.0.0.1:$port/kairn"
export KAIRN_TEST_DATABASE_URL="postgresql://kairn_runtime:temporary-bootstrap-runtime@127.0.0.1:$port/kairn"

cp -R packages/backend/drizzle "$scratch/drizzle"
pnpm --dir packages/backend exec node --input-type=module - "$scratch/drizzle" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = process.argv[2];
const journalPath = join(migrationsFolder, "meta", "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));
journal.entries = journal.entries.filter(({ idx }) => idx <= 3);
await writeFile(journalPath, JSON.stringify(journal));
const pool = new Pool({ connectionString: process.env.KAIRN_TEST_MIGRATION_DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder });
} finally {
  await pool.end();
}
NODE
docker exec -i -e PGPASSWORD=temporary-bootstrap-migrator "$database" \
  psql -h 127.0.0.1 -U kairn_migrator -d kairn -v ON_ERROR_STOP=1 \
  < tests/integration/fixtures/journey-before-migration.sql

MIGRATION_DATABASE_URL="$KAIRN_TEST_MIGRATION_DATABASE_URL" pnpm db:migrate
PGBOSS_DATABASE_URL="$KAIRN_TEST_MIGRATION_DATABASE_URL" pnpm db:queue
if [[ "$#" -gt 0 ]]; then
  "$@"
else
  KAIRN_INTEGRATION=1 KAIRN_JOURNEY_TEST=isolated pnpm exec vp test run \
    tests/integration/journeys.test.ts tests/integration/domain.test.ts
fi
