# ARCHITECTURE

Status: Draft v0.1. Decisions marked **[DECIDED]** are the default unless changed in MEMORY.md.

## 1. Principles
1. One deployment serves all tenants; updates are continuous.
2. Tenant isolation is enforced by the database, not by application code alone.
3. Money moves only through an append-only ledger.
4. Themes are data, never uploaded code.
5. Every external call (supplier, gateway) is timed out, retried with backoff, and idempotent.
6. Start as a modular monolith; split services only under measured load.

## 2. System overview
```
Browser / PWA / API clients
        |
   CDN + WAF  (wildcard + custom-domain TLS)
        |
   Next.js app (RSC, middleware resolves tenant by host)
        |
   API layer (REST, OpenAPI 3.1, Dhru-compatible shim)
        |
 +------+---------------+----------------+
 |      |               |                |
Domain modules    Job queue         Redis (rate limit, cache)
(tenancy, catalog,  (orders, webhooks,
 orders, ledger,     sync, billing)
 billing, themes)        |
 |                  Supplier adapters ---> external suppliers
PostgreSQL (RLS, PITR)   Payment gateway
Object storage (invoices, exports)
```

## 3. Stack **[DECIDED]**
| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Frontend | Next.js App Router, React Server Components, Tailwind with CSS-variable tokens, Radix/shadcn primitives |
| Backend | Modular monolith in the same repo (Next.js route handlers plus a worker process) |
| Database | PostgreSQL, shared schema, `tenant_id` plus Row-Level Security |
| ORM/migrations | Drizzle or Prisma with SQL migrations reviewed by hand |
| Queue | Postgres-backed (pgmq or Graphile Worker) first; NATS or Kafka only at scale |
| Cache/limits | Redis |
| Auth | Passkeys (WebAuthn), TOTP, sessions in httpOnly cookies, scoped API keys |
| Infra | Containers, IaC (OpenTofu), India-region cloud, multi-AZ Postgres with point-in-time recovery |
| Observability | OpenTelemetry traces, structured logs, error tracking, uptime and supplier-health dashboards |

## 4. Multi-tenancy
- Every tenant-scoped table has `tenant_id uuid not null`.
- RLS enabled with default-deny policies: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- The app connects as a non-owner role without `BYPASSRLS`; each request sets `app.tenant_id` inside a transaction (`SET LOCAL`).
- Tenant resolved from host (subdomain or verified custom domain) in middleware; never from user input.
- CI includes cross-tenant tests: tenant A must not read or write tenant B rows on any table.
- Large tenants can later move to a dedicated database without code changes (connection routing by tenant).

## 5. Core domain modules
| Module | Responsibility |
|---|---|
| tenancy | Tenants, domains, staff, roles, plans |
| identity | Users, credentials, sessions, API keys, scopes |
| catalog | Supplier services, tenant markup, customer groups, price lists |
| orders | Order state machine, bulk import, refunds |
| suppliers | Adapter interface, credentials (encrypted), health score, routing |
| ledger | Accounts, entries, balances derived from entries |
| billing | Subscriptions, invoices (GST), gateway webhooks |
| themes | Token documents, validation, compile to CSS variables |
| notifications | Email, push, webhooks (outbox pattern) |
| audit | Immutable action log |

## 6. Order state machine
`created -> funds_reserved -> dispatched -> accepted -> completed`
Failure paths: `rejected`, `timed_out` and `failed` lead to `refunded`. Every transition is a ledger-safe, idempotent step recorded in an events table. Status polling of suppliers runs as queued jobs with jittered backoff; tenants are notified by signed webhook and in-app update.

## 7. Ledger
- Double-entry: every movement has equal debit and credit entries inside one transaction.
- Entries are append-only; corrections are new reversing entries.
- Balance is a derived value (materialized, verifiable); idempotency key on every write.
- A nightly job reconciles balances against entries and alerts on drift.

## 8. Supplier adapters
```ts
interface SupplierAdapter {
  listServices(): Promise<Service[]>
  placeOrder(req: PlaceOrder, idempotencyKey: string): Promise<SupplierRef>
  getStatus(ref: SupplierRef): Promise<OrderStatus>
  getBalance?(): Promise<Money>
}
```
Wrapper adds timeout, retry with jitter, circuit breaker, and a rolling success score. Routing prefers the healthiest supplier for a service when a tenant maps several. Credentials are field-encrypted with a KMS-held key.

## 9. Theme engine
- Token layers: primitive, semantic, component, following the W3C Design Tokens format.
- A theme is a JSON document validated against a schema; saved per tenant with version history.
- Compiled to CSS variables and served at the edge with long cache plus content-hash busting.
- WCAG AA contrast checked on save; unsafe themes are rejected.
- Advanced layout uses a fixed set of approved blocks (slots), never custom JS.
See [DESIGN.md](DESIGN.md) for the token list.

## 10. Public API
- REST, versioned (`/v1`), OpenAPI 3.1 published.
- Scoped API keys, per-key rate limits, IP allow-list option.
- Webhooks signed with HMAC-SHA256 and a timestamp; retried with backoff; replay window of 5 minutes.
- Dhru-compatible shim lives in its own module and maps to the same domain services.

## 11. Security architecture
- OWASP ASVS Level 2 as baseline.
- Strict CSP, CSRF protection, SameSite cookies, HSTS, secure headers.
- Secrets in KMS/secret manager only; none in the repo.
- Step-up authentication for credit changes, API key creation and payout-sensitive actions.
- Audit log for admin and API actions.
- Supply chain: pinned dependencies and CI actions, SBOM, image signing, provenance.

## 12. Delivery and updates
- Trunk-based development; CI on every PR (lint, typecheck, unit, RLS tests, SAST, dependency scan, secret scan).
- Progressive rollout (1%, 10%, 100%) behind feature flags with automatic rollback on error-budget burn.
- Expand/contract database migrations so every deploy is reversible.
- Patch SLAs: critical 48 hours, high 7 days. Public changelog and security advisories.
- API deprecation: minimum 6 months notice.

## 13. Scalability and reliability targets
| Item | Target |
|---|---|
| API p95 latency | under 400 ms |
| Availability | 99.9% |
| RPO / RTO | 5 minutes / 1 hour |
| Order dispatch latency (queue to supplier call) | under 5 s p95 |

## 14. Future-ready options
- Per-tenant dedicated database for large tenants.
- Event streaming (NATS/Kafka) if queue throughput demands.
- Optional signed-container self-hosted tier for enterprise.
- AI features behind flags (search, support drafts, fraud flags) with no write access to money.
