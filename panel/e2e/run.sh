#!/usr/bin/env bash
# Runs the browser journey against a throwaway database and a fresh production server.
# Needs: Postgres running with a superuser reachable at E2E_ADMIN_URL, and a built app (npm run build).
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN_URL=${E2E_ADMIN_URL:-postgres://postgres:postgres@127.0.0.1:5432/postgres}
PORT=${BASE_PORT:-3115}
DB=e2e_$$
node -e "const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:'$ADMIN_URL'});await c.connect();await c.query('CREATE DATABASE $DB');await c.end()})()"
BASE=${ADMIN_URL%/*}
MIGRATE_DATABASE_URL=$BASE/$DB APP_DB_PASSWORD=e2epw node scripts/migrate.mjs >/dev/null
cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then pkill -P "$SERVER_PID" 2>/dev/null || true; kill "$SERVER_PID" 2>/dev/null || true; fi
  node -e "const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:'$ADMIN_URL'});await c.connect();await c.query('DROP DATABASE IF EXISTS $DB WITH (FORCE)');await c.end()})()" || true
}
trap cleanup EXIT
# Start the real server binary directly so $! is the process that holds the port.
DATABASE_URL=$(echo "$BASE" | sed -E 's#//[^@]*@#//panel_login:e2epw@#')/$DB \
ALLOW_PUBLIC_SIGNUP=true PLATFORM_ROOT_DOMAIN=localhost APP_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  node node_modules/next/dist/bin/next start -p "$PORT" >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 40); do curl -sf "localhost:$PORT/api/health" >/dev/null && break; sleep 0.5; done
BASE_PORT=$PORT node e2e/journey.mjs
