#!/usr/bin/env bash
#
# Build a release, migrate, switch, prove it, and roll back if it cannot be
# proved. Started by /usr/local/bin/mandm-deploy, as mandm, from inside the
# release it is deploying.
#
# The previous release keeps serving through the whole build. Users see one
# restart — a few seconds — and only once the new release is fully built.
#
# ═══════════════════════════════════════════════════════════════════════════
#  Rollback restores the code, never the database.
# ═══════════════════════════════════════════════════════════════════════════
#
# Migrations have already run when the health check decides. So every
# migration must leave the schema usable by the PREVIOUS release: add a column
# in one deploy, start using it in the next; stop using one in one deploy, drop
# it in a later one. A migration that breaks the old code makes rollback a lie.

set -euo pipefail

sha="$1"
ROOT=/srv/mandm
release="$ROOT/releases/$sha"
previous="$(readlink -f "$ROOT/current" 2>/dev/null || true)"

export PATH="$ROOT/.nvm/versions/node/v24.11.1/bin:$PATH"

step() { echo "--- $*"; }

switch_to() {
  # A symlink replaced by rename is atomic: nothing ever sees it half-written.
  ln -sfn "$1" "$ROOT/current.next"
  mv -Tf "$ROOT/current.next" "$ROOT/current"
}

restart() {
  sudo -n /usr/bin/systemctl restart mandm-api mandm-worker mandm-admin
}

# Ready means: the API answers ready with every pool on its own role, the
# console answers, and the worker is running. Up to a minute, for a cold start.
healthy() {
  local body="" code=""
  for _ in $(seq 1 30); do
    body="$(curl -fsS --max-time 5 http://127.0.0.1:4100/health/ready 2>/dev/null || true)"
    code="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' http://127.0.0.1:4101/ 2>/dev/null || true)"
    if [[ "$body" == *'"status":"ok"'* && "$body" == *'"role":"mm_app"'* && "$code" == 307 ]] \
      && systemctl is-active --quiet mandm-worker; then
      return 0
    fi
    sleep 2
  done
  echo "readiness: ${body:-no answer} · console: ${code:-no answer}"
  return 1
}

step "configuration"
# Secrets live once, outside every release, and each release links to them.
ln -sfn "$ROOT/shared/backend.env" "$release/backend/.env"
ln -sfn "$ROOT/shared/admin.env.local" "$release/admin/.env.local"

step "backend: install and build"
(cd "$release/backend" && npm ci --no-audit --no-fund && npm run build)

step "admin: install and build"
(cd "$release/admin" && npm ci --no-audit --no-fund && npm run build)

step "migrations"
sudo -n /usr/local/sbin/mandm-migrate "$release"

step "switching to $sha"
switch_to "$release"
restart

step "verifying"
if ! healthy; then
  echo "=== $sha failed verification" >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    step "rolling back to $(basename "$previous")"
    switch_to "$previous"
    restart
    if healthy; then
      echo "=== rolled back: $(basename "$previous") is live"
    else
      echo "=== ROLLBACK FAILED TOO: the server needs a person" >&2
    fi
  fi
  exit 1
fi

echo "=== live: $sha"

step "pruning"
# Keep the five newest releases, and never the live one or the one before it.
ls -1t "$ROOT/releases" | tail -n +6 | while read -r old; do
  dir="$ROOT/releases/$old"
  [[ "$dir" == "$release" || "$dir" == "$previous" ]] && continue
  rm -rf -- "$dir"
done
