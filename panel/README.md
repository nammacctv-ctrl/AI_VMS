# panel

Multi-tenant reseller panel and theme platform. See `../PRD.md`, `../ARCHITECTURE.md`, `../RULES.md`, `../DESIGN.md`.

## What exists
- `db/migrations/0001_init.sql`: tenants, domains, themes, audit log, double-entry ledger. Row-level security on every tenant table, append-only ledger, balance enforced at commit.
- `src/lib/tenancy`: host classification and database tenant resolution.
- `src/lib/db/withTenant.ts`: per-request tenant context (`set_config(..., true)`).
- `src/lib/auth` and `src/app/api/auth`: signup, login (scrypt passwords, 7-day sessions stored as hashes, account lockout, TOTP two-factor with replay protection, encrypted 2FA secrets).
- `src/lib/auth/permissions.ts`, `staff.ts`, `apikeys.ts`: four roles (owner, admin, support, reseller), invitations, role changes, scoped API keys, rate limits.
- `src/lib/audit.ts`: append-only activity log written in the same transaction as each change.
- `src/lib/catalog`: suppliers, services (with cost), customer groups, per-service price overrides, price lists (resellers never see cost).
- `src/lib/ledger`: idempotent balanced postings, derived balances.
- `src/lib/themes`: token schema, contrast checks, safe CSS compiler. `src/lib/brand`: per-panel name, logo (PNG/JPG/WebP only), versioned themes with restore, and the per-request loader that applies a panel's look. Screen: `/admin/branding`.
- `src/app`: screens (`/login`, `/signup`, `/accept-invite`, reseller area `/portal/*`, staff area `/admin/*`), JSON API under `/api`, `/api/health`, `/themes/preview`. Screens are client pages that call the same authenticated API anyone else can use.
- `e2e/`: `npm run e2e` drives a real Chromium through the whole product (signup, catalog, invite, credit, order, complete, fail and refund, two-factor, API key) against a throwaway database. Needs Postgres and a built app.
- `scripts/ops.mjs`: operator tool (create-panel, add-domain, reset-access, suspend, activate, list). `deploy/backup.sh` and `deploy/restore-test.sh`: verified daily backup and a restore check.
- `Dockerfile`, `docker-compose.yml`, `deploy/README.md`: VPS deployment with a cloudflared tunnel.

## Develop
```bash
npm ci
npm run typecheck
TEST_ADMIN_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # DB tests skip without it
npm run dev
```
Delivery: `../docs/DELIVERY_CHECKLIST.md`. What was checked and what is still open: `../docs/PRE_DELIVERY_AUDIT.md`.

## Not built yet
Supplier connections, password reset, email, bulk ordering, notifications, passkeys, billing, orders, supplier adapters, billing, tenant admin UI. See `../TASKS.md`.
