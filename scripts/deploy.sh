#!/usr/bin/env bash
# Deploy the Atlas monorepo:
#   1. git subtree push the server/ subtree to Amvera (prod deployment)
#   2. push the full repo to GitHub (origin/main)
#
# Amvera's remote is a separate repo rooted at `server/` — Amvera builds
# from the Dockerfile + amvera.yml at its root, so the server subtree is
# split out and pushed to its master branch.
#
# Usage:
#   ./scripts/deploy.sh          # commit nothing; push current main to both
#   ./scripts/deploy.sh "msg"    # commit all changes with $msg, then push
set -euo pipefail
cd "$(dirname "$0")/.."

AMVERA_BRANCH="${AMVERA_BRANCH:-master}"

if [[ $# -ge 1 ]]; then
  git add -A
  git commit -m "$1"
fi

echo "==> pushing server/ subtree to Amvera ($AMVERA_BRANCH)"
git subtree push --prefix=server amvera "$AMVERA_BRANCH"

echo "==> pushing repo to GitHub (origin/main)"
git push origin main

echo "==> done"
