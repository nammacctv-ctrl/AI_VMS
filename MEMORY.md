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
| 2026-10-04 | Sell hosted SaaS subscriptions, not a downloadable script | Recurring revenue; control of updates and security | Owner approved (2026-10-04) |
| 2026-10-04 | Target India resellers first, then South Asia and Middle East | Existing Dhru-style demand | Owner approved (2026-10-04) |
| 2026-10-04 | TypeScript end to end; Next.js; PostgreSQL with RLS | Single language, strong tenant isolation | Owner approved (2026-10-04) |
| 2026-10-04 | No stored-value wallets in v1 | Avoid RBI prepaid-instrument rules until legal review | Owner approved (2026-10-04) |
| 2026-10-04 | Themes are token data, never tenant code | Upgrade safety and security | Owner approved (2026-10-04) |
| 2026-10-04 | Dhru-compatible API shim built from public docs only | Migration wedge without legal risk | Owner approved (2026-10-04) |
| 2026-10-04 | India-region hosting | Latency and data residency | Owner approved (2026-10-04) |
| 2026-10-04 | Deployment target is a VPS (DigitalOcean, Linode, Hetzner) with Docker and a cloudflared tunnel; no inbound web ports | Owner request; cheap, portable, no cloud lock-in | Owner decision |
| 2026-10-04 | Container-first: the same OCI images run as (a) our managed multi-tenant cloud and (b) a Docker Compose stack on a customer or reseller VPS | Future-ready: Kubernetes later without code changes; keeps both sales models open | Owner approved (2026-10-04) |
| 2026-10-04 | Core stays TypeScript/Next.js, not PHP. PHP 8.3 only as an optional isolated sidecar if customers need legacy Dhru-style plugins | Docker/cloudflared work with any stack; rewriting in PHP gives up the shared tested core | Owner approved: "go with your suggestion" (2026-10-04) |
| 2026-10-04 | Self-hosted installs must pull signed prebuilt images and enforce a minimum version; no hand-edited copies | Keeps the patch advantage of SaaS even on customer servers | Planned (not built) |

## Assumptions (unverified)
- Pricing tiers: Starter ₹1,999, Pro ₹4,999, Business ₹12,999 per month.
- Dhru weaknesses (manual updates, template breakage, cron sync, weak bulk tools) are hypotheses; dhru.com and help.dhru.com were blocked from the build environment, so they were not confirmed from primary sources.
- 100 panels at about ₹5,000 average is roughly ₹5 lakh per month; this is a target, not a forecast.

## Owner delegation
2026-10-04: the owner said they are not a technical or business expert and asked Claude to pick the best option and proceed. Defaults above are therefore approved as recommended: hosted service first, VPS install later as a premium tier, no PHP, build auth before other features. Anything involving legal, money movement or customer data still goes back to the owner.

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
- 2026-10-04: Added auth (T-106) with end-to-end curl check against a production build.
- 2026-10-04: Started code in `panel/`. Built and tested: tenancy and RLS, ledger, theme engine, Docker/Compose/cloudflared files. Not verified: Docker image builds (no Docker daemon in the build sandbox), the GitHub Actions workflow, a real cloudflared tunnel.

## Known gaps in auth (do before real customers)
- No per-IP rate limiting on login (only per-account lockout, which also lets someone lock a victim out for 15 minutes).
- No password reset or email verification; no passkeys yet.
- Sessions are not revoked when a password or 2FA setting changes (no password-change feature exists yet).
- Losing `APP_ENCRYPTION_KEY` makes stored 2FA secrets unreadable; no key rotation yet.

## Lessons learned (code)
- A first theme compiler lightened the brand accent for link readability and used that same color for button backgrounds, which broke button-label contrast on dark surfaces. Fixed by separating `--accent` (brand) from `--accent-text` (adjusted), and added a sweep test over 216 accent colors times 3 presets.
- `FORCE ROW LEVEL SECURITY` on `tenants` blocks the SECURITY DEFINER lookup functions, so `tenants` and `tenant_domains` are not forced; the app role is not the owner, so RLS still applies to it.
