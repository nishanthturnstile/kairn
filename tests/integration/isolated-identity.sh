#!/usr/bin/env bash
set -euo pipefail

database=$(docker run -d --rm -p 127.0.0.1::5432 \
  -e POSTGRES_DB=kairn -e POSTGRES_USER=kairn_admin -e POSTGRES_PASSWORD=temporary-bootstrap-admin \
  -e KAIRN_MIGRATOR_PASSWORD=temporary-bootstrap-migrator -e KAIRN_RUNTIME_PASSWORD=temporary-bootstrap-runtime \
  --mount "type=bind,source=$PWD/infra/compose/init-postgres.sql,target=/docker-entrypoint-initdb.d/10-kairn.sql,readonly" \
  kairn-dev-db)
trap 'docker stop --time 2 "$database" >/dev/null' EXIT

port=$(docker port "$database" 5432/tcp | cut -d : -f 2)
for ((attempt = 0; attempt < 25; attempt++)); do
  if docker exec "$database" pg_isready -h 127.0.0.1 -U kairn_admin -d kairn >/dev/null; then
    break
  fi
  sleep 1
done

export KAIRN_TEST_MIGRATION_DATABASE_URL="postgresql://kairn_migrator:temporary-bootstrap-migrator@127.0.0.1:$port/kairn"
export KAIRN_TEST_DATABASE_URL="postgresql://kairn_runtime:temporary-bootstrap-runtime@127.0.0.1:$port/kairn"
MIGRATION_DATABASE_URL="$KAIRN_TEST_MIGRATION_DATABASE_URL" pnpm db:migrate
PGBOSS_DATABASE_URL="$KAIRN_TEST_MIGRATION_DATABASE_URL" pnpm db:queue
KAIRN_INTEGRATION=1 KAIRN_AUTH_RECOVERY_TEST=isolated pnpm exec vp test run tests/integration/identity.test.ts
