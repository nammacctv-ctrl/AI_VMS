# MEMORY

Living log of decisions, facts and lessons. Read before starting work; append when something is decided or learned. Newest entries at the top of each section.

## Project facts
- Product: hosted multi-tenant B2B reseller panel plus theme platform; modern alternative to Dhru Fusion.
- Legal entity: Namma CCTV Private Limited. Namma CCTV and Namma Power are the brands of that entity.
- Repo: `nammacctv-ctrl/AI_VMS`; development branch `claude/b2b-saas-theme-platform-29zdr7`.
- Owner contact for attribution: nammacctv@gmail.com.
- Owner said they have no preset idea of the business plan and asked for a recommendation (2026-10-04); defaults below were chosen on their behalf and are open to change.

## Decisions
| Date | Decision | Reason | Status |
|---|---|---|---|
| 2026-10-04 | Sell hosted SaaS subscriptions, not a downloadable script | Recurring revenue; control of updates and security | Proposed default |
| 2026-10-04 | Target India resellers first, then South Asia and Middle East | Existing Dhru-style demand | Proposed default |
| 2026-10-04 | TypeScript end to end; Next.js; PostgreSQL with RLS | Single language, strong tenant isolation | Proposed default |
| 2026-10-04 | No stored-value wallets in v1 | Avoid RBI prepaid-instrument rules until legal review | Proposed default |
| 2026-10-04 | Themes are token data, never tenant code | Upgrade safety and security | Proposed default |
| 2026-10-04 | Dhru-compatible API shim built from public docs only | Migration wedge without legal risk | Proposed default |
| 2026-10-04 | India-region hosting | Latency and data residency | Proposed default |

## Assumptions (unverified)
- Pricing tiers: Starter ₹1,999, Pro ₹4,999, Business ₹12,999 per month.
- Dhru weaknesses (manual updates, template breakage, cron sync, weak bulk tools) are hypotheses; dhru.com and help.dhru.com were blocked from the build environment, so they were not confirmed from primary sources.
- 100 panels at about ₹5,000 average is roughly ₹5 lakh per month; this is a target, not a forecast.

## Open questions
1. Which two suppliers first, and do we have credentials?
2. Which payment gateway?
3. Hosting provider and region?
4. What does counsel approve for the allowed service list?
5. Are wallets needed sooner than v1 based on interviews?

## Risks watched
- Some unlock/bypass services may be unlawful depending on device ownership; gate the catalog.
- Demand unproven until founding-member deposits are collected.
- Supplier instability; mitigated by circuit breakers and health-based routing.

## Interview findings
_None yet. Add dated entries from T-003._

## Lessons learned
_None yet._

## Changelog of these docs
- 2026-10-04: Created PRD, ARCHITECTURE, RULES, DESIGN, TASKS, MEMORY from the strategy document.
