#!/usr/bin/env bash
set -euo pipefail

scratch=$(mktemp -d)
pids=()
cleanup() {
  local result=$?
  if [[ "${#pids[@]}" -gt 0 ]]; then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
  if [[ "$result" -ne 0 ]]; then tail -n 20 "$scratch"/*.log; fi
  rm -rf "$scratch"
}
trap cleanup EXIT

export DATABASE_URL="${KAIRN_TEST_DATABASE_URL:-postgresql://kairn_runtime:local-runtime-only@127.0.0.1:55432/kairn}"
web_port="${KAIRN_TEST_WEB_PORT:-58082}"
export BETTER_AUTH_URL="http://127.0.0.1:$web_port" NODE_ENV=development HOST=127.0.0.1
export PORT="${KAIRN_TEST_API_PORT:-58083}"
export READER_BUILD_DIR="$PWD/apps/web/dist"
export AUTH_FROM_EMAIL=accounts@example.test SMTP_URL=smtp://127.0.0.1:51025
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
AUTH_MAIL_KEY=$(openssl rand -hex 32)
export BETTER_AUTH_SECRET AUTH_MAIL_KEY

suites=(tests/web/identity.playwright.ts tests/web/journeys.playwright.ts)
if [[ "${KAIRN_WEB_ONBOARDING:-0}" == 1 ]]; then
  export ONBOARDING_STARTS_AT=2000-01-01T00:00:00Z
  suites=(tests/web/onboarding.playwright.ts)
fi

node apps/server/dist/index.js >"$scratch/server.log" 2>&1 &
pids+=("$!")
node apps/worker/dist/index.js >"$scratch/worker.log" 2>&1 &
pids+=("$!")
(
  cd apps/web
  export KAIRN_BROWSER_IDENTITY_UPSTREAM="http://127.0.0.1:$PORT"
  exec ./node_modules/.bin/vp preview --host 127.0.0.1 --port "$web_port" --strictPort
) >"$scratch/web.log" 2>&1 &
pids+=("$!")

curl -fsS --retry 10 --retry-all-errors --retry-delay 1 --max-time 3 "$BETTER_AUTH_URL/api/v1/ready" >/dev/null
KAIRN_WEB_ORIGIN="$BETTER_AUTH_URL" KAIRN_WEB_IDENTITY=1 pnpm test:web \
  "${suites[@]}" "$@"
