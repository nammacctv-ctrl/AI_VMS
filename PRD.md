# PRD: B2B Reseller Panel and Theme Platform

Owner: Namma CCTV Private Limited (Namma CCTV / Namma Power)
Status: Draft v0.1
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN.md](DESIGN.md), [RULES.md](RULES.md), [TASKS.md](TASKS.md), [MEMORY.md](MEMORY.md), [docs/PLATFORM_STRATEGY.md](docs/PLATFORM_STRATEGY.md)

## 1. Summary
A hosted, multi-tenant reseller panel for digital-service resellers (unlock, repair and similar services), sold as a monthly subscription. It is a modern alternative to self-hosted scripts such as Dhru Fusion. Tenants get a branded storefront and admin panel from one codebase, with themes delivered as data, so updates and security patches reach everyone at once.

## 2. Problem
- Existing panels are self-hosted scripts. Operators must apply updates by hand, so installs go stale and vulnerable.
- Customizing the look means editing template files, which upgrades can break.
- Order sync relies on cron polling. Bulk tools, analytics and mobile UX are weak.
- Resellers who connect to many suppliers have no health scoring or failover.

## 3. Target users
| Persona | Needs |
|---|---|
| **Panel owner (tenant admin)** | Launch fast, brand it, set prices per customer group, connect suppliers, see margins |
| **Reseller (end customer of the tenant)** | Place single and bulk orders, track status live, top up, use an API, see history and invoices |
| **Supplier (later)** | Receive and process assigned orders |
| **Platform admin (Namma CCTV)** | Manage tenants, billing, security, releases |

Initial market: small and mid-size resellers in India, then South Asia and the Middle East.

## 4. Goals and non-goals
Goals (v1):
1. A tenant can sign up, pick a theme, connect two suppliers and take orders within one day.
2. Zero-downtime updates for all tenants.
3. Dhru-compatible API so existing resellers can migrate without rework.

Non-goals (v1): stored-value wallets, native mobile apps, supplier-facing panel, marketplace of third-party themes, self-hosted edition.

## 5. Functional requirements

### P0 (must ship in v1)
- FR-1 Tenancy: tenant signup, subdomain, staff roles (owner, admin, support).
- FR-2 Auth: email plus password, TOTP, passkeys (WebAuthn); API keys with scopes.
- FR-3 Catalog: services synced from suppliers, tenant-defined markup, customer groups with price lists.
- FR-4 Orders: single and bulk (paste or CSV) ordering, state machine, live status, refunds on failure.
- FR-5 Supplier adapters: a common interface, two real integrations, health score and failover.
- FR-6 Ledger: double-entry credit accounting for tenant-managed balances, manual credit, invoices.
- FR-7 Theme engine: token-based themes, presets (Light, Dark, Trader), contrast check, live preview.
- FR-8 Billing: tenant subscriptions via a licensed payment gateway, GST invoices.
- FR-9 Public API: REST with OpenAPI 3.1, signed webhooks, per-key rate limits.
- FR-10 Audit log of admin and API actions per tenant.

### P1
- Custom domains with automatic TLS.
- Dhru-compatible API shim.
- Installable web app with push notifications.
- Analytics: margin, volume, supplier success rate.
- Migration importer from Dhru-style exports.

### P2
- Theme store and designer revenue share, WhatsApp notifications, AI support drafts, fraud scoring, supplier panel.

## 6. Pricing (assumptions to test)
Starter ₹1,999/mo, Pro ₹4,999/mo, Business ₹12,999/mo; premium themes ₹999–4,999 one-time; migration service ₹5,000–25,000; optional per-order fee on API volume above an allowance.

## 7. Success metrics
- 10 paying founding tenants within 90 days of beta.
- Monthly recurring revenue target: ₹5 lakh at 100 tenants (target, not forecast).
- Onboarding to first order under 24 hours (median).
- Order success rate at or above 97% (excluding supplier-side rejections); API p95 under 400 ms.
- Critical vulnerability patch time under 48 hours; monthly churn under 4%.

## 8. Constraints and compliance
- India: GST invoicing, DPDP Act 2023 (consent, deletion, breach notice).
- Payments only via a licensed gateway; no stored-value wallet until legal review.
- Allowed service list and acceptable-use terms must be approved by counsel before launch.
- Build the Dhru-compatible API only from public documentation.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Services of doubtful legality | Legal review, ownership verification, allowed-list gating |
| Weak demand | Founding-member deposits before full build |
| Supplier instability | Circuit breakers, routing by health score |
| Tenant data leak | Row-level security, isolation tests in CI |
| Compatibility disputes | Public-docs-only implementation, legal check |

## 10. Open questions
- Which two suppliers first, and do we have credentials?
- Final pricing after interviews.
- Gateway choice and wallet rules after legal advice.
- Backend hosting provider and region.
