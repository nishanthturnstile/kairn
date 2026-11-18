#!/usr/bin/env bash
set -euo pipefail

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
pnpm --dir apps/web exec vp build --outDir "$scratch/web" --sourcemap hidden
pnpm --dir apps/mobile exec expo export --platform android --platform ios --output-dir "$scratch/mobile" --dump-sourcemap
node tests/operations/client-bundles.mjs "$scratch"
