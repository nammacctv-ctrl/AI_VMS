# B2B Reseller Theme Platform: Competitive Research, Architecture and Update/Security Strategy

Owner: Namma CCTV Private Limited (Namma CCTV / Namma Power)
Status: Draft v0.1. Needs validation (see "Confidence and open items").

## 1. What Dhru Fusion is (and how it serves customers)

Evidence from public pages (dhru.com, help.dhru.com search snippets; those domains were blocked from this environment, so I could not read the full pages):

- Positioned as an "all-in-one platform for digital goods, subscriptions and fulfillment". Historically the de-facto script for IMEI/GSM unlock, server-credit and digital-service resellers.
- **Model: licensed, self-hosted script** plus paid add-ons ("Licensing and add-ons" article). The operator hosts it and installs updates.
- **Two-sided API**: a panel can be a *client* of another Dhru server (buy upstream) and a *provider* (expose its own listener so others resell it). This is the core network effect: a chain of Dhru panels reselling each other.
- Add-ons seen: Supplier Panel (suppliers log in and process assigned services), E-commerce Storefront, custom mobile app, custom template design, messenger notifications, WhatsApp/Call OTP, rewards points.
- Tiered B2B pricing by customer group; API ordering, service lists, order status, balance, funds.
- Order flow uses polling with cron jobs ("connect service to API, add cron job").
- Ecosystem players resell the script and hosting (for example UnlockPrice as a reseller/distributor). Adjacent tools (GSM Tool V2 and similar) consume Dhru-style APIs.

## 2. Likely weaknesses (hypotheses to validate; I could not confirm them from Dhru's own docs)

| Area | Likely gap | Our opportunity |
|---|---|---|
| Architecture | Monolithic PHP script, per-operator install, cron-based sync | Multi-tenant SaaS, event-driven, webhooks plus idempotent API |
| Updates and security | Operator must apply updates by hand; stale installs stay vulnerable; encoded/licensed code limits audits | Continuous delivery to all tenants, signed releases, public security policy |
| Theming | Template overrides edit files; custom design is a paid service; upgrades can break templates | Token-driven themes, data not code, upgrade-safe |
| Supplier integration | Provider API is Dhru-protocol-centric; non-Dhru suppliers need custom modules | Adapter framework with a circuit breaker per supplier |
| Reseller UX | Admin-centric UI; limited bulk tools, analytics, mobile-first flows | Bulk order, saved sheets, live status, PWA, margin analytics |
| Trust and fraud | Basic balance/ledger model | Double-entry ledger, risk scoring, rate limits, per-key scopes |
| Observability | Operator-owned logs | Per-tenant audit log, SLA dashboards, supplier health |
| Data portability | Locked to script/DB | Open export, documented API, OpenAPI spec |
| Compliance | Operator-by-operator | India: GST invoicing/e-invoice, DPDP Act 2023 consent and retention |

Validate with 10 to 15 interviews of real resellers and a teardown of a licensed demo before locking scope.

## 3. Product positioning

"Dhru-compatible, not Dhru-dependent." Ship a **Dhru-compatible API shim** so existing resellers and upstream suppliers can connect with zero rework, then win on the items above. Compatibility is the migration wedge. Check licensing/terms before cloning protocol details; implement from public API docs only.

## 4. Target architecture (2026-ready)

**Frontend**
- Next.js (App Router, React Server Components, streaming), TypeScript strict, Tailwind with CSS-variable design tokens, shadcn/Radix primitives.
- PWA first (installable, push notifications for order status). Native app only after PWA limits are proven.

**Theme engine (the "theme platform")**
- Three token layers: *primitive* (raw palette), *semantic* (surface, text, accent, danger), *component* (button radius, table density).
- A theme is a validated JSON document (W3C Design Tokens format) stored per tenant and compiled to CSS variables at the edge. No code upload, so upgrades never break themes.
- Contrast checker (WCAG AA) runs at save time. Presets: Light, Dark, High-density "trader" mode.
- Custom domains per tenant (wildcard TLS via ACME), tenant resolved in middleware.
- Escape hatch for advanced layouts: a sandboxed, versioned **slot/block system** (tenants pick and order approved blocks), never arbitrary JS.

**Backend**
- Modular monolith first (TypeScript or Go), split services only where load demands (order dispatcher, supplier adapters).
- PostgreSQL with shared schema plus `tenant_id` and **Row-Level Security** as the isolation guarantee (default-deny). Option to move large tenants to dedicated databases later.
- **Double-entry ledger** for wallets/credits: append-only, idempotency keys, no balance column edits.
- Orders as a state machine (created, reserved funds, dispatched, supplier-accepted, completed/refunded) via a durable queue (Postgres-backed such as pgmq/Graphile Worker initially; Kafka/NATS only at scale). Outbox pattern for webhooks.
- Supplier adapters behind one interface with timeouts, retries with jitter, circuit breakers, and a health score that drives automatic routing/failover.
- Redis for rate limits and caching. Object storage for invoices/exports.
- Public API: REST plus OpenAPI 3.1, scoped API keys, HMAC-signed webhooks, per-key rate limits, plus the Dhru-compatible shim.

**AI features (high value, low risk first)**
- Smart service search and fuzzy matching of supplier catalogs (embeddings).
- Support-ticket triage/reply drafts with human approval.
- Fraud/anomaly flags on orders and top-ups; margin and price-change recommendations.
- Keep AI behind feature flags; never give a model write access to balances.

**Infrastructure**
- Containers on managed Kubernetes or a simpler PaaS at the start; IaC (Terraform/OpenTofu); edge CDN/WAF; multi-AZ Postgres with PITR; region in India for latency and data-residency.

## 5. Updates and security patches ("how we push them")

Because it is SaaS, **one deployment serves all tenants**: this is the main structural advantage over self-hosted scripts.

- **Delivery**: trunk-based development, CI on every PR, progressive rollout (canary 1%, 10%, 100%) behind feature flags, automatic rollback on error-budget burn.
- **Database changes**: expand/contract migrations only (backward-compatible), so deploys are zero-downtime and reversible.
- **Dependency security**: Dependabot/Renovate, lockfiles, SBOM (CycloneDX) per release, `npm audit`/OSV scanning, SAST (CodeQL/Semgrep), secret scanning, container scanning. Critical CVE SLA: patch within 48 hours, high within 7 days.
- **Supply chain**: signed commits, signed container images (Sigstore/cosign), provenance (SLSA level 3 target), pinned CI actions, least-privilege CI credentials.
- **Application security**: OWASP ASVS L2 as baseline; strict CSP, CSRF protection, SameSite cookies, passkeys (WebAuthn) plus TOTP for admins and resellers, per-key API scopes, IP allow-lists, withdrawal/top-up step-up auth, encrypted secrets (KMS), field-level encryption for supplier credentials.
- **Testing and disclosure**: annual third-party pentest, `security.txt`, a vulnerability disclosure program, public changelog and security advisories.
- **Self-hosted/white-label tier (optional later)**: if enterprise customers demand on-prem, ship signed container releases with an auto-update agent and mandatory minimum-version enforcement, so patched code is not optional.
- **Tenant communication**: status page, in-app release notes, a deprecation policy (minimum 6 months for API changes, versioned `/v1`, `/v2`).

## 6. Compliance and business notes (India)

- Entity: Namma CCTV Private Limited (also trading as Namma Power).
- GST invoicing and e-invoicing where thresholds apply; TDS/TCS considerations on payouts.
- DPDP Act 2023: consent, purpose limitation, deletion workflow, breach notification.
- Payments: use a licensed gateway (Razorpay/Cashfree/PhonePe or similar). Do not hold customer funds outside a compliant structure; take legal advice on prepaid wallet rules (RBI PPI guidelines) before launching stored-value wallets.
- Legal review of the catalog: confirm every service sold (for example unlock/bypass services) is lawful for the ownership and use cases supported, and include ownership-verification and acceptable-use terms.

## 7. Roadmap

| Phase | Weeks | Deliverable |
|---|---|---|
| 0 Discovery | 1-3 | 10-15 reseller interviews, Dhru teardown, legal review, final scope |
| 1 Core | 4-12 | Tenancy plus RLS, auth/passkeys, ledger, catalog, orders, 2 supplier adapters, theme engine v1, admin and reseller UI |
| 2 Compatibility | 13-18 | Dhru-compatible API shim, webhooks, bulk ordering, custom domains, PWA |
| 3 Hardening | 19-24 | Pentest, load tests, observability, SOC2-style controls, beta with 5 tenants |
| 4 Growth | 25+ | AI features, marketplace of suppliers, analytics, optional white-label tier |

## 8. Confidence and open items

- I could not open dhru.com / help.dhru.com (blocked by the network proxy), and web search returned no verified Dhru security-incident data. Section 2 is therefore hypothesis, not fact.
- Decisions needed: preferred backend language (TypeScript vs Go), hosting provider/region, whether stored-value wallets are in scope for v1, and which suppliers to integrate first.
- Your message ended mid-sentence after "how we will push updates and security patches,". If something followed, send it and I will fold it in.

## Sources

- [Dhru Fusion product page](https://dhru.com/software/dhru-fusion) and [API integration help](https://help.dhru.com/en/articles/10892898-api-integration), [licensing and add-ons](https://help.dhru.com/en/articles/10892838-licensing-and-add-ons) (via search summaries)
- [Makerkit: multi-tenant SaaS with Postgres RLS](https://makerkit.dev/blog/tutorials/multi-tenant-saas-architecture)
- [Edana: tenant isolation with RLS](https://edana.ch/en/2026/06/25/ensuring-multi-tenant-data-isolation-with-postgresql-row-level-security-rls/)
- [Design tokens in 2026](https://www.designsystemscollective.com/design-tokens-in-2026-beyond-colors-and-spacing-d2fd632029e1)
