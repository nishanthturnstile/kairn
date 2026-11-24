#!/usr/bin/env bash
set -euo pipefail

platform=${1:?Pass linux/amd64 or linux/arm64}
prefix=${2:?Pass a local image prefix}
manifest=${3:?Pass an output manifest path}

case "$platform" in
  linux/amd64|linux/arm64) ;;
  *) echo "Unsupported platform: $platform" >&2; exit 1 ;;
esac

gpx_create=${VITE_GPX_JOURNEY_CREATE:-0}
case "$gpx_create" in
  0|1) ;;
  *) echo "VITE_GPX_JOURNEY_CREATE must be 0 or 1" >&2; exit 1 ;;
esac
case "${VITE_MAPBOX_PUBLIC_TOKEN:-}" in
  ''|pk.*) ;;
  *) echo "VITE_MAPBOX_PUBLIC_TOKEN must be a public Mapbox token (pk.)" >&2; exit 1 ;;
esac

root=$(cd "$(dirname "$0")/../.." && pwd)
revision=${KAIRN_RELEASE_REVISION:-$(git -C "$root" rev-parse HEAD)}
tag=${revision:0:12}-${platform#linux/}
common=(--platform "$platform" --load --label "org.opencontainers.image.revision=$revision")
docker buildx build "${common[@]}" --tag "$prefix-db:$tag" "$root/infra/images/postgres"
app_build_args=(
  "${common[@]}"
  --build-arg "VITE_GPX_JOURNEY_CREATE=$gpx_create"
  --build-arg VITE_MAPBOX_PUBLIC_TOKEN
)
for service in server worker edge ops; do
  docker buildx build "${app_build_args[@]}" --target "$service" --tag "$prefix-$service:$tag" -f "$root/infra/images/app/Dockerfile" "$root"
done

{
  printf 'KAIRN_PLATFORM=%s\nKAIRN_REVISION=%s\n' "$platform" "$revision"
  for service in db server worker edge ops; do
    printf 'KAIRN_%s_IMAGE=%s-%s:%s\n' "$(printf '%s' "$service" | tr '[:lower:]' '[:upper:]')" "$prefix" "$service" "$tag"
  done
} > "$manifest"
