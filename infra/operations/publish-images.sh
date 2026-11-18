#!/usr/bin/env bash
set -euo pipefail

local_manifest=${1:?Pass the tested local release manifest}
prefix=${2:?Pass a registry repository prefix}
output=${3:?Pass an output manifest path}

# The build workflow creates this file in its private temporary directory.
source "$local_manifest"
tag="${KAIRN_REVISION:0:12}-${KAIRN_PLATFORM#linux/}"
manifest=$(mktemp "${output}.XXXXXX")
trap 'rm -f "$manifest"' EXIT
printf 'KAIRN_PLATFORM=%s\nKAIRN_REVISION=%s\n' "$KAIRN_PLATFORM" "$KAIRN_REVISION" > "$manifest"

for service in db server worker edge ops; do
  key="KAIRN_$(printf '%s' "$service" | tr '[:lower:]' '[:upper:]')_IMAGE"
  repository="$prefix-$service"
  reference="$repository:$tag"
  docker tag "${!key}" "$reference"
  pushed=$(docker push "$reference")
  printf '%s\n' "$pushed" >&2
  digest=$(awk '/digest: sha256:/ { print $3 }' <<< "$pushed")
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  printf '%s=%s@%s\n' "$key" "$repository" "$digest" >> "$manifest"
done

mv "$manifest" "$output"
