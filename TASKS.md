# TASKS

Legend: `[ ]` todo, `[~]` in progress, `[x]` done. IDs are stable; reference them in commits.
Phases match the roadmap in [docs/PLATFORM_STRATEGY.md](docs/PLATFORM_STRATEGY.md).

## Phase 0: Discovery (weeks 1-3)
- [x] T-001 Competitive research and strategy document
- [x] T-002 PRD, ARCHITECTURE, RULES, DESIGN, TASKS, MEMORY
- [ ] T-003 Interview 10-15 resellers; record findings in MEMORY.md
- [ ] T-004 Collect founding-member deposits from first 10 tenants
- [ ] T-005 Legal review: allowed service list, acceptable-use terms, wallet rules, API compatibility
- [ ] T-006 Pick two suppliers and obtain test credentials
- [ ] T-007 Choose hosting provider and region; record in MEMORY.md
- [ ] T-008 Choose payment gateway

## Phase 1: Core platform (weeks 4-12)
- [x] T-101 Repo scaffold: Next.js, TypeScript strict, lint, format, test runner
- [~] T-102 CI: lint, typecheck, unit tests, dependency/SAST/secret scans
- [x] T-103 Postgres setup with migrations; app role without BYPASSRLS
- [x] T-104 Tenancy: tenants, domains, host resolution middleware, `SET LOCAL app.tenant_id`
- [x] T-105 RLS policies and cross-tenant isolation test harness
- [ ] T-106 Identity: signup, login, sessions, TOTP
- [ ] T-107 Passkeys (WebAuthn)
- [ ] T-108 Staff roles and permissions
- [ ] T-109 API keys with scopes and rate limits
- [ ] T-110 Audit log
- [~] T-111 Ledger: accounts, entries, idempotency, nightly reconciliation job
- [ ] T-112 Catalog: supplier service sync, markup, customer groups, price lists
- [ ] T-113 Supplier adapter interface, wrapper (timeout, retry, circuit breaker, health score)
- [ ] T-114 Supplier adapter #1
- [ ] T-115 Supplier adapter #2
- [ ] T-116 Orders: state machine, queue worker, refunds
- [ ] T-117 Bulk ordering: paste and CSV with row validation
- [ ] T-118 Webhooks: outbox, HMAC signing, retries
- [~] T-119 Theme engine v1: schema, validation, CSS compile, presets, contrast check
- [ ] T-120 Theme editor UI with preview and rollback
- [ ] T-121 Reseller UI: dashboard, new order, orders, order detail
- [ ] T-122 Tenant admin UI: services/pricing, customers, suppliers, settings
- [ ] T-123 Subscription billing via gateway and GST invoices
- [ ] T-124 OpenAPI 3.1 spec and docs site
- [ ] T-125 Observability: traces, logs, error tracking, supplier-health dashboard
- [~] T-126 Staging and production infrastructure as code

## Phase 2: Compatibility and growth features (weeks 13-18)
- [ ] T-201 Dhru-compatible API shim (public docs only)
- [ ] T-202 Custom domains with automatic TLS
- [ ] T-203 Installable web app and push notifications
- [ ] T-204 Analytics: margin, volume, supplier success rate
- [ ] T-205 Migration importer for Dhru-style exports
- [ ] T-206 Onboard first paying tenants

## Phase 3: Hardening (weeks 19-24)
- [ ] T-301 Third-party penetration test and fixes
- [ ] T-302 Load testing against targets in ARCHITECTURE.md
- [ ] T-303 Backup and disaster-recovery drill (RPO 5 min, RTO 1 h)
- [ ] T-304 Security policy, `security.txt`, disclosure program, status page
- [ ] T-305 Closed beta with 5 tenants and fix list

## Phase 4: Growth (week 25+)
- [ ] T-401 Theme store (30% designer revenue share)
- [ ] T-402 WhatsApp notifications
- [ ] T-403 AI: service search, support drafts, fraud flags (behind flags)
- [ ] T-404 Supplier-facing panel
- [ ] T-405 Optional signed self-hosted tier

## Next up
T-101, T-103, T-104 and T-105 are done (code in `panel/`, 24 tests passing). Next: T-106 (auth), T-107, T-108, then T-112 (catalog). T-111 needs the nightly reconciliation job; T-102 needs the CI workflow to run once on GitHub; T-119 still needs the editor UI (T-120); T-126 has Docker/Compose files but the images have not been built or deployed yet.
