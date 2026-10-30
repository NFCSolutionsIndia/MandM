#!/usr/bin/env bash
#
# The only thing the GitHub Actions deploy key can run.
#
# Installed root-owned at /usr/local/bin/mandm-deploy and pinned to the key in
# /srv/mandm/.ssh/authorized_keys with `command="..." restrict`. It lives
# OUTSIDE the repository on purpose: a commit can change what gets deployed,
# but never what the key is allowed to do. Updating it is a root step.
#
# Input: one 40-character commit sha, as SSH_ORIGINAL_COMMAND. Nothing else
# the client sends is read.

set -euo pipefail

# A dropped SSH connection must not kill a deploy halfway through.
trap '' HUP

ROOT=/srv/mandm

sha="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "mandm-deploy: expected a 40-character commit sha" >&2
  exit 2
fi

# One deploy at a time. Held until the deploy script exits, because it
# inherits this descriptor through exec.
exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo "mandm-deploy: another deploy is running" >&2; exit 75; }

mkdir -p "$ROOT/logs" "$ROOT/releases"
exec > >(tee -a --output-error=warn "$ROOT/logs/deploy.log") 2>&1
echo "=== $(date -Is) deploy $sha"

# Only what is on main may go live, whatever the caller claims.
git -C "$ROOT/repo" fetch --quiet origin main
if ! git -C "$ROOT/repo" merge-base --is-ancestor "$sha" origin/main; then
  echo "mandm-deploy: $sha is not on origin/main, refusing" >&2
  exit 3
fi

release="$ROOT/releases/$sha"
if [[ "$(readlink -f "$ROOT/current" 2>/dev/null || true)" == "$release" ]]; then
  echo "=== $sha is already live"
  exit 0
fi

# A fresh tree from git, so nothing left over from a failed attempt or a
# hand edit can ride along into a release.
rm -rf "$release"
mkdir -p "$release"
git -C "$ROOT/repo" archive "$sha" | tar -x -C "$release"

# Run the deploy steps from the release being deployed — a tree nothing will
# modify while it runs.
exec bash "$release/deploy/deploy.sh" "$sha"
