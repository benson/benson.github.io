#!/usr/bin/env bash
# Deploy the biblioplex web app to its Cloudflare Pages project.
#
# biblioplex.bensonperry.com is a DIRECT-UPLOAD Pages project (not git-connected),
# so deploys are manual. This script assembles a clean, self-contained bundle and
# uploads it — codifying the three things that have bitten us:
#   1. include shared/ (minus the 47M boosters/ that only packcracker needs), so
#      /shared/common.css and /shared/mtg.js resolve at the biblioplex root.
#   2. include the root favicon.
#   3. EXCLUDE worker/ (and its .dev.vars secret), cli/, tests, scripts, dotfiles,
#      and docs — never ship server code or secrets to a static site.
#
# Usage:  mtgcollection/deploy-biblioplex.sh
# Requires: wrangler (authenticated), run from anywhere in the repo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/mtgcollection"
STAGE="$(mktemp -d)/biblioplex"
mkdir -p "$STAGE"

echo "==> staging app from $APP_DIR"
rsync -a --delete \
  --exclude 'worker' --exclude 'cli' --exclude '__tests__' --exclude 'scripts' \
  --exclude 'node_modules' --exclude '.*' --exclude '*.md' \
  "$APP_DIR"/ "$STAGE"/

echo "==> staging shared/ (minus boosters)"
mkdir -p "$STAGE/shared"
rsync -a --delete --exclude 'boosters' "$REPO_ROOT/shared"/ "$STAGE/shared"/

echo "==> staging favicon"
cp "$REPO_ROOT/favicon.svg" "$STAGE/favicon.svg" 2>/dev/null || true

# Safety: refuse to deploy if any secret slipped into the bundle.
if find "$STAGE" \( -name '.dev.vars' -o -name '*.vars' -o -name '.env' \) | grep -q .; then
  echo "ERROR: secret file present in staging — aborting." >&2
  exit 1
fi

echo "==> deploying $(find "$STAGE" -type f | wc -l | tr -d ' ') files to Cloudflare Pages (biblioplex)"
npx wrangler pages deploy "$STAGE" --project-name=biblioplex --branch=master --commit-dirty=true

echo "==> done. verify: curl -sI https://biblioplex.bensonperry.com/shared/common.css | grep content-type"
