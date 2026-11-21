#!/usr/bin/env bash
set -euo pipefail
umask 077

release=${1:?Pass the locally built release manifest}
root=$(cd "$(dirname "$0")/../.." && pwd)
source "$root/infra/operations/backup.sh"
temp=$(mktemp -d)
project="kairn-drill-$(date +%s)-$RANDOM"
origin=$project
restored="$project-restored"

compose() {
  docker compose --project-name "$project" --env-file "$temp/settings.env" --env-file "$release" \
    -f "$root/infra/compose/deploy.yml" -f "$temp/fixture.yml" "$@"
}

cleanup() {
  local result=$?
  if [[ "$result" -ne 0 ]]; then
    compose logs --tail 25 db storage server worker edge >&2 || true
  fi
  project=$restored compose down -v >/dev/null 2>&1 || true
  project=$origin compose down -v >/dev/null 2>&1 || true
  docker volume rm "$origin-pg-repository" "$origin-restic-repository" >/dev/null 2>&1 || true
  rm -rf "$temp"
}
trap cleanup EXIT

cat > "$temp/settings.env" <<EOF_SETTINGS
KAIRN_PROJECT=$origin
KAIRN_SITE_ADDRESS=:8080
KAIRN_DB_ENV=$temp/db.env
KAIRN_STORAGE_ENV=$temp/storage.env
KAIRN_SERVER_ENV=$temp/server.env
KAIRN_WORKER_ENV=$temp/worker.env
KAIRN_MIGRATION_ENV=$temp/ops.env
KAIRN_RESTIC_ENV=$temp/restic.env
FIXTURE_PG_REPO=$origin-pg-repository
FIXTURE_RESTIC_REPO=$origin-restic-repository
EOF_SETTINGS

cat > "$temp/fixture.yml" <<'EOF_OVERRIDE'
services:
  edge:
    ports: !override
      - "127.0.0.1::8080"
  storage:
    ports:
      - "127.0.0.1::8333"
  object-backup:
    volumes:
      - restic-fixture:/repository
  object-restore:
    volumes:
      - restic-fixture:/repository
volumes:
  pgbackrest:
    name: ${FIXTURE_PG_REPO}
    external: true
  restic-fixture:
    name: ${FIXTURE_RESTIC_REPO}
    external: true
EOF_OVERRIDE

cat > "$temp/db.env" <<'EOF_DB'
POSTGRES_PASSWORD=fixture-admin-only
KAIRN_MIGRATOR_PASSWORD=fixture-migrator-only
KAIRN_RUNTIME_PASSWORD=fixture-runtime-only
PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc
PGBACKREST_REPO1_CIPHER_PASS=synthetic-postgres-repository-key
EOF_DB
cat > "$temp/storage.env" <<'EOF_STORAGE'
AWS_ACCESS_KEY_ID=kairn-fixture
AWS_SECRET_ACCESS_KEY=fixture-object-only
S3_BUCKET=kairn-private
EOF_STORAGE
cat > "$temp/server.env" <<'EOF_SERVER'
DATABASE_URL=postgresql://kairn_runtime:fixture-runtime-only@db:5432/kairn
BETTER_AUTH_URL=https://kairn.invalid
BETTER_AUTH_SECRET=fixture-authentication-origin-secret
EOF_SERVER
sed -n '/^DATABASE_URL=/p' "$temp/server.env" > "$temp/worker.env"
cat >> "$temp/worker.env" <<'EOF_WORKER'
SMTP_URL=smtps://smtp.kairn.invalid
AUTH_FROM_EMAIL=accounts@kairn.invalid
AUTH_MAIL_KEY=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789
AUTH_JOURNAL_URL=https://journal.kairn.invalid
AUTH_JOURNAL_CREDENTIAL=fixture-journal-only-credential
EOF_WORKER
cat > "$temp/ops.env" <<'EOF_OPS'
MIGRATION_DATABASE_URL=postgresql://kairn_migrator:fixture-migrator-only@db:5432/kairn
PGBOSS_DATABASE_URL=postgresql://kairn_migrator:fixture-migrator-only@db:5432/kairn
EOF_OPS
cat > "$temp/restic.env" <<'EOF_RESTIC'
RESTIC_REPOSITORY=/repository
RESTIC_PASSWORD=synthetic-restic-repository-key
EOF_RESTIC

docker volume create "$origin-pg-repository" >/dev/null
docker volume create "$origin-restic-repository" >/dev/null
compose up -d --wait db storage
compose exec -T -u postgres db pgbackrest --stanza=kairn stanza-create
compose run --rm --no-deps -T ops pnpm --filter @kairn/backend db:migrate
compose run --rm --no-deps -T ops pnpm --filter @kairn/backend db:queue
compose run --rm --no-deps -T --entrypoint sh worker -e < "$root/tests/operations/media.sh"
compose up -d --wait server worker edge
edge=$(compose port edge 8080)
curl -fsS --retry 5 --retry-connrefused "http://$edge/" | grep -q '<title>Kairn</title>'
curl -fsS "http://$edge/api/v1/ready" | jq -e '.status == "ready"'
reader_status=$(curl -sS -D "$temp/reader.headers" -o /dev/null -w '%{http_code}' "http://$edge/read/drill")
if [[ "$reader_status" != 303 ]] ||
  ! grep -Eiq '^location:[[:blank:]]*/account[[:space:]]*$' "$temp/reader.headers" ||
  ! grep -Eiq '^cache-control:[[:blank:]]*private, no-store[[:space:]]*$' "$temp/reader.headers"; then
  printf 'Expected the signed-out reader to redirect to /account with private, no-store (HTTP 303). Got HTTP %s.\n' "$reader_status" >&2
  exit 1
fi
auth_status=$(curl -sS -o "$temp/auth.json" -w '%{http_code}' "http://$edge/api/auth/get-session")
[[ "$auth_status" == 503 ]]
jq -e '.code == "RECOVERY_REQUIRED"' "$temp/auth.json"

object_request() {
  curl -sS --max-time 20 --retry 3 --retry-all-errors --retry-max-time 45 \
    --aws-sigv4 aws:amz:us-east-1:s3 --user kairn-fixture:fixture-object-only "$@"
}

printf 'Synthetic original object for the recovery drill.\n' > "$temp/original"
checksum=$(openssl dgst -sha256 -r "$temp/original" | cut -d ' ' -f 1)
storage=$(compose port storage 8333)
object_request --fail --upload-file "$temp/original" "http://$storage/kairn-private/before"
upload_id=$(object_request --fail -X POST "http://$storage/kairn-private/partial?uploads" |
  sed -n 's|.*<UploadId>\([^<]*\)</UploadId>.*|\1|p')
[[ -n "$upload_id" ]]
upload_query="uploadId=$(jq -rn --arg id "$upload_id" '$id | @uri')"
object_request --fail --upload-file "$temp/original" -D "$temp/part.headers" -o /dev/null \
  "http://$storage/kairn-private/partial?partNumber=1&$upload_query"
etag=$(awk 'tolower($1) == "etag:" { sub(/\r$/, "", $2); print $2 }' "$temp/part.headers")
[[ -n "$etag" ]]
database_sql "CREATE TABLE release_fixture (object_key text PRIMARY KEY, checksum text);
  INSERT INTO release_fixture VALUES ('before', '$checksum');"
compose run --rm --no-deps -T object-backup init
checkpoint_backup kairn-drill "$release" "$temp/checkpoint.env" > "$temp/snapshot"
snapshot=$(cat "$temp/snapshot")
backup_label=$(sed -n 's/^KAIRN_DATABASE_BACKUP=//p' "$temp/checkpoint.env")

# Write newer data and lose the primary volumes. The independent fixture repos survive.
compose up -d --force-recreate --wait storage
storage=$(compose port storage 8333)
object_request --fail "http://$storage/kairn-private/partial?$upload_query" |
  grep -q '<PartNumber>1</PartNumber>'
printf '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>%s</ETag></Part></CompleteMultipartUpload>' "$etag" > "$temp/complete.xml"
object_request --fail -X POST -H "Content-Type: application/xml" --data-binary "@$temp/complete.xml" \
  "http://$storage/kairn-private/partial?$upload_query" >/dev/null
object_request --fail "http://$storage/kairn-private/partial" -o "$temp/resumed"
cmp "$temp/original" "$temp/resumed"
object_request --fail --upload-file "$temp/original" "http://$storage/kairn-private/after"
database_sql "INSERT INTO release_fixture VALUES ('after', '$checksum'); SELECT pg_switch_wal();"
compose exec -T -u postgres db pgbackrest --stanza=kairn check
compose down -v

project=$restored
compose run --rm --no-deps -T -u postgres db pgbackrest --stanza=kairn \
  --set="$backup_label" --type=name --target=kairn-drill --target-action=promote restore
compose run --rm --no-deps -T object-restore dump "$snapshot" /checkpoint.env > "$temp/recovered.env"
diff -u "$temp/checkpoint.env" "$temp/recovered.env"
compose run --rm --no-deps -T object-restore restore "$snapshot" --target /restore --verify
compose up -d --wait db storage
[[ "$(database_sql 'SELECT object_key FROM release_fixture;')" == before ]]
[[ "$(database_sql 'SELECT pg_is_in_recovery();')" == f ]]

storage=$(compose port storage 8333)
object_request --fail "http://$storage/kairn-private/before" -o "$temp/recovered"
restored_checksum=$(openssl dgst -sha256 -r "$temp/recovered" | cut -d ' ' -f 1)
[[ "$restored_checksum" == "$(database_sql 'SELECT checksum FROM release_fixture;')" ]]
[[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://$storage/kairn-private/before")" == 403 ]]
[[ "$(object_request -o /dev/null -w '%{http_code}' "http://$storage/kairn-private/after")" == 404 ]]
[[ -z "$(compose ps -q edge server worker)" ]]
echo "Recovered the database and private object at the same checkpoint with application access closed."
