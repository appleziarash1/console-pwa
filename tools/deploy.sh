#!/usr/bin/env bash
# One-command deploy to GitHub Pages.
#
# Creates the repo (if needed), pushes main, and switches Pages on with the
# GitHub Actions source. Needs a token that can create repos and manage Pages:
#   * a classic PAT with  repo + workflow  scopes, or
#   * a fine-grained PAT with Administration: r/w and Pages: r/w
#
#   GH_PAT=ghp_... ./tools/deploy.sh
#
set -euo pipefail

OWNER="${OWNER:-appleziarash1}"
REPO="${REPO:-console-pwa}"
TOKEN="${GH_PAT:-${GITHUB_TOKEN:-}}"
BRANCH=main

if [ -z "$TOKEN" ]; then
  echo "Set GH_PAT to a token that can create repos and enable Pages." >&2
  exit 1
fi

api() { curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

echo "→ Ensuring $OWNER/$REPO exists"
if api "https://api.github.com/repos/$OWNER/$REPO" -o /dev/null 2>/dev/null; then
  echo "  already there"
else
  api -X POST "https://api.github.com/user/repos" \
    -d "{\"name\":\"$REPO\",\"description\":\"An installable PWA for OpenHands Cloud\",\"private\":false,\"has_issues\":true}" \
    -o /dev/null
  echo "  created"
fi

echo "→ Pushing $BRANCH"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:$TOKEN@github.com/$OWNER/$REPO.git"
git push -u origin "$BRANCH" --force

echo "→ Enabling Pages (GitHub Actions source)"
api -X POST "https://api.github.com/repos/$OWNER/$REPO/pages" \
  -d '{"source":{"branch":"main","path":"/"}}' -o /dev/null 2>/dev/null \
  || api -X PUT "https://api.github.com/repos/$OWNER/$REPO/pages" \
       -d '{"build_type":"workflow"}' -o /dev/null

git remote set-url origin "https://github.com/$OWNER/$REPO.git"
echo
echo "✓ Done. The workflow publishes to:"
echo "  https://$OWNER.github.io/$REPO/"
echo
echo "First run takes a minute or two — watch it under the repo's Actions tab,"
echo "and make sure Settings → Pages → Source is 'GitHub Actions'."
