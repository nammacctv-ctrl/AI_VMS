# panel

Multi-tenant reseller panel and theme platform. See `../PRD.md`, `../ARCHITECTURE.md`, `../RULES.md`, `../DESIGN.md`.

## What exists
- `db/migrations/0001_init.sql`: tenants, domains, themes, audit log, double-entry ledger. Row-level security on every tenant table, append-only ledger, balance enforced at commit.
- `src/lib/tenancy`: host classification and database tenant resolution.
- `src/lib/db/withTenant.ts`: per-request tenant context (`set_config(..., true)`).
- `src/lib/ledger`: idempotent balanced postings, derived balances.
- `src/lib/themes`: token schema, contrast checks, safe CSS compiler.
- `src/app`: placeholder home, `/api/health`, `/themes/preview`.
- `Dockerfile`, `docker-compose.yml`, `deploy/README.md`: VPS deployment with a cloudflared tunnel.

## Develop
```bash
npm ci
npm run typecheck
TEST_ADMIN_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # DB tests skip without it
npm run dev
```
Try `/themes/preview?preset=trader&accent=%23be185d`.

## Not built yet
Auth, catalog, orders, supplier adapters, billing, tenant admin UI. See `../TASKS.md`.
