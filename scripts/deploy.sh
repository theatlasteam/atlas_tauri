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
#   ./scripts/deploy.sh          # push current main to both remotes
#   ./scripts/deploy.sh "msg"    # commit all changes with $msg, then push
#   ./scripts/deploy.sh --force  # force-push both (history rewrite)
set -euo pipefail
cd "$(dirname "$0")/.."

AMVERA_BRANCH="${AMVERA_BRANCH:-master}"
FORCE=0
MSG=""

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) MSG="$arg" ;;
  esac
done

if [[ -n "$MSG" ]]; then
  git add -A
  git commit -m "$MSG"
fi

echo "==> pushing server/ subtree to Amvera ($AMVERA_BRANCH)"
if [[ "$FORCE" == "1" ]]; then
  TMP_BRANCH="_amvera_deploy_$$"
  git subtree split --prefix=server --branch="$TMP_BRANCH"
  git push --force amvera "$TMP_BRANCH:$AMVERA_BRANCH"
  git branch -D "$TMP_BRANCH"
else
  git subtree push --prefix=server amvera "$AMVERA_BRANCH"
fi

echo "==> pushing repo to GitHub (origin/main)"
if [[ "$FORCE" == "1" ]]; then
  git push --force origin main
else
  git push origin main
fi

echo "==> done"
