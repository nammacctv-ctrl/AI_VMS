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

# Phase 2: with the DEFAULT settings (public signup off), strangers cannot create panels.
pkill -P "$SERVER_PID" 2>/dev/null || true; kill "$SERVER_PID" 2>/dev/null || true; sleep 1
DATABASE_URL=$(echo "$BASE" | sed -E 's#//[^@]*@#//panel_login:e2epw@#')/$DB \
PLATFORM_ROOT_DOMAIN=localhost APP_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  node node_modules/next/dist/bin/next start -p "$PORT" >/tmp/e2e-server2.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 40); do curl -sf "localhost:$PORT/api/health" >/dev/null && break; sleep 0.5; done
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:$PORT/api/auth/signup" -H 'Content-Type: application/json' -H "Origin: http://localhost:$PORT" \
  -d '{"slug":"intruder","name":"Intruder","email":"i@i.test","password":"a-long-test-password"}')
[ "$CODE" = "403" ] && echo "PASS strangers cannot create panels by default (signup API answers 403)" || { echo "FAIL signup API answered $CODE, expected 403"; exit 1; }
curl -s "localhost:$PORT/signup" | grep -q "set up by our team" && echo "PASS the signup page explains panels are set up by the team" || { echo "FAIL signup page"; exit 1; }
curl -s "localhost:$PORT/" | grep -q "Create your panel" && { echo "FAIL home page still offers signup"; exit 1; } || echo "PASS the home page no longer offers signup"
node -e "const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:'$BASE/$DB'});await c.connect();const r=await c.query(\"select count(*)::int n from tenants where slug='intruder'\");await c.end();process.exit(r.rows[0].n===0?0:1)})()" && echo "PASS no intruder panel exists in the database" || { echo "FAIL intruder panel was created"; exit 1; }
