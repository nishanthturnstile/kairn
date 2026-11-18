#!/usr/bin/env bash
set -euo pipefail
umask 077

operation=${1:?Pass deploy, backup, open, or status}
settings=${2:?Pass the environment settings file}
release=${3:?Pass the release manifest}
candidate=${4:-}
directory=$(cd "$(dirname "$0")" && pwd)
state=$(cd "$(dirname "$settings")" && pwd)
source "$directory/backup.sh"

compose() {
  docker compose --env-file "$settings" --env-file "$release" -f "$directory/../compose/deploy.yml" "$@"
}

# Check the resolved references, including any shell overrides, before service changes.
validate_release() {
  local platform architecture image images
  platform=$(compose config --format json | jq -er '.services.db.platform')
  architecture=$(docker info --format '{{.Architecture}}')
  case "$platform:$architecture" in
    linux/amd64:x86_64|linux/amd64:amd64|linux/arm64:aarch64|linux/arm64:arm64) ;;
    *) echo "Release platform $platform does not match Docker host $architecture" >&2; return 1 ;;
  esac
  images=$(compose --profile ops --profile restore config --images)
  while IFS= read -r image; do
    if [[ ! "$image" =~ @sha256:[0-9a-f]{64}$ ]]; then
      echo "Release requires a digest-pinned image: $image" >&2
      return 1
    fi
  done <<< "$images"
  if ! compose --profile ops config --format json | jq -e '
    (.services.db.environment |
      .PGBACKREST_REPO1_TYPE == "s3" and .PGBACKREST_REPO1_CIPHER_TYPE == "aes-256-cbc")
    and (.services["object-backup"].environment.RESTIC_REPOSITORY | test("^(s3:|rest:https://)"))
  ' >/dev/null; then
    echo "Configure encrypted PostgreSQL and object backup repositories outside the VPS." >&2
    return 1
  fi
}

public_hostname() {
  local hostname
  hostname=$(compose config --format json | jq -er '.services.edge.environment.KAIRN_SITE_ADDRESS')
  [[ "$hostname" =~ ^[A-Za-z0-9.-]+$ && "$hostname" == *.* ]] || {
    echo "A TLS hostname is required to open the application." >&2
    return 1
  }
  printf '%s\n' "$hostname"
}

open_application() {
  local hostname
  hostname=$(public_hostname)
  compose up -d --wait --wait-timeout 120 db storage server worker
  # A restored database must have its new epoch and complete restriction replay.
  compose exec -T server node -e '
    fetch("http://127.0.0.1:3000/api/auth/get-session").then(response => {
      if (!response.ok) throw new Error(`Authentication is closed (${response.status})`);
    });
  '
  compose up -d edge
  if ! curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 5 --retry-max-time 90 \
    --max-time 10 "https://$hostname/api/v1/ready" | jq -e '.status == "ready"'; then
    compose stop edge
    return 1
  fi
}

check_status() {
  local latest age max_age hostname
  max_age=${1:?Pass the maximum checkpoint age in seconds}
  [[ "$max_age" =~ ^[1-9][0-9]*$ ]]
  compose ps
  compose exec -T worker test -f /run/kairn/ready
  compose exec -T -u postgres db pgbackrest --stanza=kairn check
  latest=$(compose run --rm --no-deps -T object-backup --json snapshots --tag kairn-checkpoint |
    jq -er 'max_by(.time).time')
  age=$(( $(date +%s) - $(date --date="$latest" +%s) ))
  if (( age < 0 || age > max_age )); then
    echo "Latest paired checkpoint is $age seconds old (maximum $max_age)." >&2
    return 1
  fi
  hostname=$(public_hostname)
  curl --fail --silent --show-error --max-time 10 "https://$hostname/api/v1/ready" |
    jq -e '.status == "ready"'
}

make_backup() {
  local checkpoint="kairn-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
  local destination="$state/checkpoints/$checkpoint"
  mkdir -p "$destination"
  checkpoint_backup "$checkpoint" "$release" "$destination/checkpoint.env" > "$destination/restic-snapshot"
  printf 'Recovery checkpoint %s, restic snapshot %s\n' "$checkpoint" "$(cat "$destination/restic-snapshot")"
}

case "$operation" in
  deploy|backup|open) ;;
  status) check_status "$candidate"; exit ;;
  *) echo "Unknown operation: $operation" >&2; exit 1 ;;
esac

lock="$state/.operation-lock"
mkdir "$lock" || { echo "An operation is already using $state" >&2; exit 1; }
trap 'rmdir "$lock"' EXIT
validate_release

case "$operation" in
  backup)
    make_backup
    open_application
    ;;
  deploy)
    [[ -n "$candidate" ]] || { echo "Pass the reviewed candidate manifest" >&2; exit 1; }
    previous=$release
    release=$candidate
    validate_release
    compose --profile ops --profile restore pull
    release=$previous
    make_backup
    release=$candidate
    compose up -d --wait --wait-timeout 120 db storage
    compose run --rm --no-deps -T ops pnpm --filter @kairn/backend db:migrate
    compose run --rm --no-deps -T ops pnpm --filter @kairn/backend db:queue
    open_application
    ;;
  open)
    # Used after verified first provisioning, recovery, or a compatible rollback.
    open_application
    ;;
esac
