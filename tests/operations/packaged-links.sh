#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
export EXPO_NO_TELEMETRY=1

for variant in staging production; do
  host="$variant.kairn.invalid"
  KAIRN_APP_VARIANT="$variant" KAIRN_ENABLE_INVITATION_APP_LINKS=1 \
    EXPO_PUBLIC_API_ORIGIN="https://$host" \
    pnpm --dir "$root/apps/mobile" exec expo config --type introspect --json |
    jq -e --arg host "$host" --arg identifier "dev.kairn.app.$variant" '
      .ios.bundleIdentifier == $identifier and .android.package == $identifier
      and ._internal.modResults.ios.entitlements["com.apple.developer.associated-domains"] == [("applinks:" + $host)]
      and ([._internal.modResults.android.manifest.manifest.application[].activity[]
        | .["intent-filter"][]?
        | select(."$"["android:autoVerify"] == "true")] == [{
          "$":{"android:autoVerify":"true","data-generated":"true"},
          "action":[{"$":{"android:name":"android.intent.action.VIEW"}}],
          "data":[{"$":{"android:scheme":"https","android:host":$host,"android:path":"/journey-invitations"}}],
          "category":[{"$":{"android:name":"android.intent.category.BROWSABLE"}},
                      {"$":{"android:name":"android.intent.category.DEFAULT"}}]
        }])
    ' >/dev/null
done

KAIRN_APP_VARIANT=production KAIRN_ENABLE_INVITATION_APP_LINKS=0 \
  EXPO_PUBLIC_API_ORIGIN=https://production.kairn.invalid \
  pnpm --dir "$root/apps/mobile" exec expo config --type introspect --json |
  jq -e '
    ._internal.modResults.ios.entitlements["com.apple.developer.associated-domains"] == null
    and ([._internal.modResults.android.manifest.manifest.application[].activity[]
      | .["intent-filter"][]? | select(."$"["android:autoVerify"] == "true")] | length == 0)
  ' >/dev/null
echo "Verified scoped HTTPS links in generated staging and production native configuration, and the disabled fallback."
