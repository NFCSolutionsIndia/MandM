#!/usr/bin/env bash
#
# Apply migrations with the superuser credential — which never leaves this
# machine, and never reaches GitHub.
#
# Installed root-owned at /usr/local/sbin/mandm-migrate. The deploy reaches it
# through a single sudoers line, with a single argument that is checked below.
# The password is read here, as root, from /srv/mandm/db/.env, which mandm
# cannot read.

set -euo pipefail

release="${1:-}"
if [[ ! "$release" =~ ^/srv/mandm/releases/[0-9a-f]{40}$ || ! -d "$release/backend" ]]; then
  echo "usage: mandm-migrate /srv/mandm/releases/<sha>" >&2
  exit 2
fi

password="$(sed -n 's/^POSTGRES_PASSWORD=//p' /srv/mandm/db/.env)"

# Exported, never passed as an argument: any user on the machine can read
# another process's arguments in `ps`, but not its environment.
export MIGRATION_DATABASE_URL="postgres://postgres:${password}@127.0.0.1:5433/mm_prod"
unset password

cd "$release/backend"

# The migration code comes from the repository, so it runs as mandm, never as
# root. runuser keeps the environment, which is how the URL reaches it.
exec runuser -u mandm -- env \
  HOME=/srv/mandm \
  PATH=/srv/mandm/.nvm/versions/node/v24.11.1/bin:/usr/bin:/bin \
  npm run db:migrate
