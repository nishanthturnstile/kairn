#!/usr/bin/env bash
set -euo pipefail

platform=${1:?Pass linux/amd64 or linux/arm64}
prefix=${2:?Pass a local image prefix}
manifest=${3:?Pass an output manifest path}

case "$platform" in
  linux/amd64|linux/arm64) ;;
  *) echo "Unsupported platform: $platform" >&2; exit 1 ;;
esac

root=$(cd "$(dirname "$0")/../.." && pwd)
revision=${KAIRN_RELEASE_REVISION:-$(git -C "$root" rev-parse HEAD)}
tag=${revision:0:12}-${platform#linux/}
common=(--platform "$platform" --load --label "org.opencontainers.image.revision=$revision")
docker buildx build "${common[@]}" --tag "$prefix-db:$tag" "$root/infra/images/postgres"
for service in server worker edge ops; do
  docker buildx build "${common[@]}" --target "$service" --tag "$prefix-$service:$tag" -f "$root/infra/images/app/Dockerfile" "$root"
done

{
  printf 'KAIRN_PLATFORM=%s\nKAIRN_REVISION=%s\n' "$platform" "$revision"
  for service in db server worker edge ops; do
    printf 'KAIRN_%s_IMAGE=%s-%s:%s\n' "$(printf '%s' "$service" | tr '[:lower:]' '[:upper:]')" "$prefix" "$service" "$tag"
  done
} > "$manifest"
