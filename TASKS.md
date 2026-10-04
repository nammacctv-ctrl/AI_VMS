# TASKS

Legend: `[ ]` todo, `[~]` in progress, `[x]` done. IDs are stable; reference them in commits.
Phases match the roadmap in [docs/PLATFORM_STRATEGY.md](docs/PLATFORM_STRATEGY.md).

## Phase 0: Discovery (weeks 1-3)
- [x] T-001 Competitive research and strategy document
- [x] T-002 PRD, ARCHITECTURE, RULES, DESIGN, TASKS, MEMORY
- [~] T-003 Interview 10-15 resellers; record findings in MEMORY.md (owner has 15 resellers lined up; see docs/LAUNCH_PLAYBOOK.md)
- [ ] T-004 Collect founding-member deposits from first 10 tenants
- [ ] T-005 Legal review: allowed service list, acceptable-use terms, wallet rules, API compatibility
- [~] T-006 Pick two suppliers and obtain test credentials (owner has two suppliers; need names and API docs)
- [ ] T-007 Choose hosting provider and region; record in MEMORY.md
- [ ] T-008 Choose payment gateway

## Phase 1: Core platform (weeks 4-12)
- [x] T-101 Repo scaffold: Next.js, TypeScript strict, lint, format, test runner
- [~] T-102 CI: lint, typecheck, unit tests, dependency/SAST/secret scans
- [x] T-103 Postgres setup with migrations; app role without BYPASSRLS
- [x] T-104 Tenancy: tenants, domains, host resolution middleware, `SET LOCAL app.tenant_id`
- [x] T-105 RLS policies and cross-tenant isolation test harness
- [x] T-106 Identity: signup, login, sessions, TOTP
- [ ] T-107 Passkeys (WebAuthn)
- [x] T-108 Staff roles and permissions (invites, role changes, last-owner protection)
- [x] T-109 API keys with scopes and rate limits
- [x] T-110 Audit log
- [~] T-111 Ledger: accounts, entries, idempotency, nightly reconciliation job
- [x] T-112 Catalog: supplier service sync, markup, customer groups, price lists
- [ ] T-113 Supplier adapter interface, wrapper (timeout, retry, circuit breaker, health score)
- [ ] T-114 Supplier adapter #1
- [ ] T-115 Supplier adapter #2
- [x] T-116 Orders: state machine, manual-fulfilment queue, refunds (supplier integrations will call the same functions)
- [ ] T-117 Bulk ordering: paste and CSV with row validation
- [ ] T-118 Webhooks: outbox, HMAC signing, retries
- [x] T-119 Theme engine v1: schema, validation, CSS compile, presets, contrast check, per-panel storage and live application
- [x] T-120 Branding screen: business name, logo upload, brand colour, light/dark/auto, font, corners, spacing, live preview, publish, version history and restore
- [x] T-121 Reseller UI: dashboard, new order, my orders (expandable detail), credit, API keys, two-factor setup (works on phones)
- [~] T-122 Tenant admin UI: order queue, customers and credit, services/prices/suppliers/groups, activity log and branding done; no general settings screen yet
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
Done in `panel/` (130 tests + a 32-step real-browser journey, `npm run e2e`): T-101, T-103 to T-106, T-108 to T-110, T-112, T-116, T-119 to T-121 and most of T-122. Partly done: T-102 (CI file not yet run on GitHub; e2e not in CI), T-111 (no nightly reconciliation job), T-126 (images never built).
To run the first 15 resellers, build in this order:
1. Supplier connections (T-113 to T-115). Needs the two suppliers' names and API documentation. Until then staff fulfil orders by hand in the queue.
2. Password reset by email (and email for invitations), backups with a tested restore, deployment to a real server with a domain.
3. Bulk ordering (T-117), order notifications (T-118), custom domains (T-202), passkeys (T-107), billing (T-123).
Before real money: legal review T-005 must confirm the staff-managed credit model.
