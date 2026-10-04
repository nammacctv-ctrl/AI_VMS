#!/bin/sh
# Daily database backup. Runs inside the `backup` container (see docker-compose.yml) or by hand.
# Needs: PGHOST PGUSER PGPASSWORD PGDATABASE. Optional: BACKUP_DIR (default /backups), KEEP_DAYS (default 14),
# BACKUP_UPLOAD_COMMAND (a command that copies the file named in $1 somewhere OFF this server).
set -eu
DIR=${BACKUP_DIR:-/backups}
KEEP=${KEEP_DAYS:-14}
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$DIR/panel-$STAMP.dump"
TMP="$FILE.partial"

# Custom format: compressed, and lets pg_restore restore selectively.
pg_dump --format=custom --no-owner --file="$TMP"
# A backup that cannot be listed is not a backup. Refuse to keep it.
pg_restore --list "$TMP" > /dev/null
[ "$(wc -c < "$TMP")" -gt 1000 ] || { echo "backup is suspiciously small, keeping the old ones" >&2; rm -f "$TMP"; exit 1; }
mv "$TMP" "$FILE"
echo "backup ok: $FILE ($(wc -c < "$FILE") bytes)"

if [ -n "${BACKUP_UPLOAD_COMMAND:-}" ]; then
  sh -c "$BACKUP_UPLOAD_COMMAND" _ "$FILE" && echo "uploaded off-server" || { echo "UPLOAD FAILED: the backup exists only on this server" >&2; exit 2; }
else
  echo "WARNING: no BACKUP_UPLOAD_COMMAND set: backups exist only on this server. Disk loss would lose everything." >&2
fi

# Keep the newest KEEP days, never delete the newest backup.
find "$DIR" -name 'panel-*.dump' -mtime +"$KEEP" ! -newer "$FILE" -exec sh -c 'for f; do [ "$f" != "'"$FILE"'" ] && rm -f "$f"; done' _ {} +
