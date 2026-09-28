#!/bin/sh
set -eu
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${BACKUP_DIR:-/backups}"
  chown app:app "${BACKUP_DIR:-/backups}"
  exec su-exec app sh "$0" "$@"
fi
node src/lib/server/db/migrate.ts
exec node build
