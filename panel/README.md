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
Screens, orders, wallet, supplier connections, passkeys, password reset, email, orders, supplier adapters, billing, tenant admin UI. See `../TASKS.md`.
