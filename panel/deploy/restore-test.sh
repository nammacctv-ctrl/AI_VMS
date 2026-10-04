#!/bin/sh
# Proves the newest backup can really be restored, and that the books still add up.
# Restores into a throwaway database, runs sanity checks, then drops it. Safe to run on the live server.
# Needs: PGHOST PGUSER PGPASSWORD (a user allowed to create databases). Optional: BACKUP_DIR, DUMP (a specific file).
set -eu
DIR=${BACKUP_DIR:-/backups}
DUMP=${DUMP:-$(ls -1t "$DIR"/panel-*.dump 2>/dev/null | head -1)}
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "no backup found in $DIR" >&2; exit 1; }
SCRATCH="restore_check_$(date +%s)"
trap 'psql -d postgres -qc "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 || true' EXIT

psql -d postgres -qc "CREATE DATABASE $SCRATCH"
pg_restore --no-owner --no-privileges --dbname="$SCRATCH" --exit-on-error "$DUMP"

q() { psql -d "$SCRATCH" -Atc "$1"; }
PANELS=$(q "SELECT count(*) FROM tenants")
MIGS=$(q "SELECT count(*) FROM schema_migrations")
LEDGER=$(q "SELECT coalesce(sum(amount_minor),0) FROM ledger_entries")
ORPHANS=$(q "SELECT count(*) FROM orders o LEFT JOIN ledger_transactions t ON t.id = o.charge_tx_id AND t.tenant_id = o.tenant_id WHERE t.id IS NULL")
NEGATIVE=$(q "SELECT count(*) FROM (SELECT a.id FROM ledger_accounts a JOIN ledger_entries e ON e.account_id = a.id WHERE a.code LIKE 'wallet:%' GROUP BY a.id HAVING sum(e.amount_minor) < 0) x")

echo "restored $DUMP"
echo "  panels: $PANELS | migrations applied: $MIGS | ledger total (must be 0): $LEDGER | orders without a charge (must be 0): $ORPHANS | negative credit balances (must be 0): $NEGATIVE"
[ "$MIGS" -gt 0 ] && [ "$LEDGER" = "0" ] && [ "$ORPHANS" = "0" ] && [ "$NEGATIVE" = "0" ] \
  && echo "RESTORE CHECK PASSED" || { echo "RESTORE CHECK FAILED" >&2; exit 1; }
