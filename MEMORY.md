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
| 2026-10-04 | No stored-value wallets in v1. Reseller "credit" is built as bookkeeping only: staff add credit manually after the reseller pays the tenant directly (bank/UPI); the platform never receives, holds or moves money and has no payment gateway for it | Avoid RBI prepaid-instrument rules until legal review (T-005 must confirm this reading, since the tenant still owes services against the credit) | Owner approved (2026-10-04); legal confirmation pending |
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

## Owner update (2026-10-04)
The owner has 15 resellers lined up and 2 suppliers, and asked for the platform to be made end to end ready plus guidance on delivering without looking new. Delivered: docs/LAUNCH_PLAYBOOK.md. Status: catalog, staff, API keys, audit built; orders, wallet, screens and supplier connections not built. Do not take real orders until they are (see playbook go-live checklist). Claude advised against pretending experience; the playbook frames the launch as a small founding-partner rollout.

## Open questions
1. Names of the two suppliers and their API documentation or credentials (needed for T-113 to T-115).
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
- 2026-10-04: Pre-delivery audit and hardening, operator tool, spreadsheet import, backups, change password (199 tests, 39 browser steps). See docs/PRE_DELIVERY_AUDIT.md and docs/DELIVERY_CHECKLIST.md.
- 2026-10-04: Added branding (T-119, T-120): 21 new tests and 9 new browser steps. Found and fixed through the browser run: a per-process cache that pages and API routes did not share, and the tab title ignoring the panel name.
- 2026-10-04: Added all screens (T-121, most of T-122), the e2e journey and fixes found by it.
- 2026-10-04: Added reseller credit (staff-managed) and orders with manual fulfilment (T-116): 108 tests, two real race tests, 16-step HTTP walkthrough. Lesson: row-locking an account needs UPDATE rights the append-only ledger role must not have; use advisory locks instead.
- 2026-10-04: Added staff permissions, invites, API keys, audit log and service catalog (T-108, T-109, T-110, T-112) with 37 new tests and an end-to-end curl run. Invites are shown once and must be shared by the owner; email delivery is not built. Prices: integer paise, basis-point markups, rounded up, never below cost.
- 2026-10-04: Added auth (T-106) with end-to-end curl check against a production build.
- 2026-10-04: Started code in `panel/`. Built and tested: tenancy and RLS, ledger, theme engine, Docker/Compose/cloudflared files. Not verified: Docker image builds (no Docker daemon in the build sandbox), the GitHub Actions workflow, a real cloudflared tunnel.

## Orders and credit (built 2026-10-04)
- One order = one service + one input (IMEI is checked for 15 digits and the Luhn check digit). Charged immediately from the reseller's credit; failure refunds the exact price once, in the same database transaction. Complete requires a result text shown to the reseller.
- Safety nets: retry-safe `reference`, 24-hour duplicate block per reseller+service+input (failed orders excluded), per-reseller advisory lock so simultaneous orders cannot overspend, database triggers enforce the state machine and freeze price/cost snapshots, orders and events cannot be deleted.
- Reseller views never include cost, margin, supplier or staff names. Staff views do.
- Not built: cancel by reseller, bulk ordering, order notifications/webhooks, supplier auto-dispatch (staff fulfil by hand for now), nightly ledger reconciliation, running-balance on statements.
- Balance is summed from ledger entries on every order; fine for thousands of entries per reseller, add a snapshot column before it reaches millions.

## Screens (built 2026-10-04)
- Reseller area `/portal/*` and staff area `/admin/*`; the menu and each page follow the person's permissions, and the API enforces them again. Tables on the reseller side and the order queue turn into stacked cards on phones. Staff screens for customers, catalog and activity log still scroll sideways on a phone.
- Verified with a real Chromium run (`npm run e2e`, 23 steps, desktop and 390px phone, zero console errors) and by eye on screenshots.
- Not built: Hindi or other languages, email, password reset, notifications, in-app help, accessibility audit with a screen reader (keyboard and labels are in place, but only checked by automated clicks).

## Branding (built 2026-10-04)
- Owner/admin (`brand.manage`) set business name, logo (PNG/JPG/WebP up to 200 KB, stored in the database, never SVG), brand colour, light/dark/automatic, font (system stacks only), corners, spacing. Live preview in the browser; Publish stores a new immutable version; "Use this look" republishes an old one as a new version. Resellers see the branded login page, menu and colours.
- Safety: a theme is validated data (hex colour, fixed lists), compiled to CSS on the server; no tenant text reaches CSS. The server re-validates on publish (browser preview is only a preview). Logo is checked by its real first bytes, served with nosniff and a sandbox CSP. Theme versions cannot be edited or deleted, even by the database owner; the app role may now rename a panel but not change its address, plan or status.
- Known limits: the per-request brand cache is in memory (15 s) and invalidated through `globalThis`; with more than one app instance a change can take up to 15 s to appear on the others. Branding applies to panel pages only: invitation and notification emails (not built yet) will need it too. Custom domains are resolved but not yet provisioned with TLS (T-202). No logo cropping/resizing; logos are shown at up to 36 px (menu) and 56 px (login) high.

## Pre-delivery audit (2026-10-04)
Full table: `docs/PRE_DELIVERY_AUDIT.md`. Summary: 17 loopholes found and fixed (notably: removing a reseller with orders crashed; no recovery from a lost phone or password; open public signup; no CSP; price could change between viewing and ordering; ambiguous costs in imports; no backups). Verdict: ready for a supervised pilot with one reseller once installed on a real server; not for unattended use or significant money until Docker/tunnel are proven live, off-server backups are configured, legal sign-off is done, and (ideally) supplier connections exist.
- Decisions: removing a person disables them (never deletes); signup is closed by default and panels are created with `scripts/ops.mjs`; CSP has no `strict-dynamic` and no inline `<style>` (theme is a stylesheet); amounts that are ambiguous are refused rather than guessed.
- Operator tool: `scripts/ops.mjs` (create-panel, add-domain, reset-access, suspend, activate, list). Runs with the database owner login on the server only.

## Known gaps in auth (do before real customers)
- Login is limited to 10 tries per minute per visitor and locks an account for 15 minutes after 5 failures (which also lets someone lock a victim out for 15 minutes). The limiter is in memory, per app instance; move to Redis before running more than one instance.
- No password reset or email verification; no passkeys yet.
- Sessions are not revoked when a password or 2FA setting changes (no password-change feature exists yet).
- Losing `APP_ENCRYPTION_KEY` makes stored 2FA secrets unreadable; no key rotation yet.

## Lessons learned (code)
- A strict CSP with a per-request nonce breaks anything that re-renders a nonce'd element after a client refresh (the nonce changes, the document keeps the first one). Serve dynamic styles as same-origin stylesheets or style attributes instead.
- `'strict-dynamic'` lets any script created at run time run, which undermines the point of the policy for injected-script tests. Not needed here.
- CSV: an unquoted comma shifts columns silently. Refuse rows wider than the header; refuse ambiguous amounts ("1,5", "12 34").
- A deliberately failing request in a browser test is reported after the fact; keep the "expected error" flag on until the page is closed, or the test becomes flaky.
- Probe first: reproduce a suspected bug with a throwaway test before fixing (the user-removal crash was confirmed this way).
- Test hygiene: `npx next start` leaves the real `next-server` running when its wrapper is killed, so a later run silently talked to a stale build on the same port and failed in confusing ways. `e2e/run.sh` now starts the server binary directly and kills its children; check with `pgrep -x next-server`.
- Redirecting every unauthenticated request to /login also redirected Next's background prefetch requests, which then 404ed. The proxy now redirects only real page loads.
- Menu highlighting by `startsWith` lit up "New order" and "My orders" together (`/portal/order` is a prefix of `/portal/orders`); fixed with a path-segment match.
- Pages and route handlers are separate bundles: a module-level in-memory cache is NOT shared between them. Use globalThis (or a real shared store) for anything a route must invalidate for pages.
- Browsers may request /favicon.ico on their own; without a route it 404ed intermittently and made the browser journey flaky (1 in ~3 runs). Fixed with a redirect route; verified 6/6 clean runs. When a test flakes, find the cause (print the URL) instead of retrying.
- A table with nine columns clipped the action buttons at normal desktop width; fewer, stacked columns fixed it. Always look at the screenshot, not just the pass/fail.
- A first theme compiler lightened the brand accent for link readability and used that same color for button backgrounds, which broke button-label contrast on dark surfaces. Fixed by separating `--accent` (brand) from `--accent-text` (adjusted), and added a sweep test over 216 accent colors times 3 presets.
- `FORCE ROW LEVEL SECURITY` on `tenants` blocks the SECURITY DEFINER lookup functions, so `tenants` and `tenant_domains` are not forced; the app role is not the owner, so RLS still applies to it.
