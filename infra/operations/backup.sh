#!/usr/bin/env bash
set -euo pipefail

# Sourced by the operations entry point and the isolated restore fixture.
checkpoint_backup() {
  local checkpoint="$1" manifest="$2" checkpoint_file="$3"
  local info backup_label wal snapshot
  compose stop edge worker server
  compose exec -T -u postgres db pgbackrest --stanza=kairn stanza-create >&2
  compose exec -T -u postgres db pgbackrest --stanza=kairn check >&2
  compose exec -T -u postgres db pgbackrest --stanza=kairn --type=full backup >&2
  info=$(compose exec -T -u postgres db pgbackrest --stanza=kairn --output=json info)
  backup_label=$(jq -er '.[0].backup[-1].label' <<< "$info")
  wal=$(database_sql "SELECT pg_walfile_name(pg_create_restore_point('$checkpoint'));")
  database_sql "SELECT pg_switch_wal();" >/dev/null
  compose exec -T -u postgres db pgbackrest --stanza=kairn check >&2
  compose exec -T -u postgres db pgbackrest --stanza=kairn \
    archive-get "$wal" "/tmp/$checkpoint.wal" >&2
  compose exec -T -u postgres db rm "/tmp/$checkpoint.wal"

  compose stop storage
  {
    printf 'KAIRN_CHECKPOINT=%s\nKAIRN_DATABASE_BACKUP=%s\nKAIRN_ARCHIVED_WAL=%s\n' "$checkpoint" "$backup_label" "$wal"
    cat "$manifest"
  } > "$checkpoint_file"
  snapshot=$(compose run --rm --no-deps -T --entrypoint /bin/sh object-backup -ec '
    cat > /checkpoint.env
    exec restic --json backup /objects /checkpoint.env --tag kairn-checkpoint --tag "$1"
  ' sh "$checkpoint" < "$checkpoint_file" |
    jq -er 'select(.message_type == "summary") | .snapshot_id')
  printf '%s\n' "$snapshot"
}

database_sql() {
  compose exec -T -u postgres db psql --no-psqlrc -U kairn_admin -d kairn -v ON_ERROR_STOP=1 -Atc "$1"
}
