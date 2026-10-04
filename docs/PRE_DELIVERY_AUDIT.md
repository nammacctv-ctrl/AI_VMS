# Pre-delivery audit

Date: 2026-10-04. Scope: the `panel/` application as it stands on branch `claude/b2b-saas-theme-platform-29zdr7`.
Method: threat-modelling every screen and API route as a hostile or careless user, plus a day-one walkthrough as a GSM reseller. Every fix below has an automated test; most are also covered by the real-browser journey (`npm run e2e`, 39 steps).

## Verdict

**Ready for a supervised pilot delivery to one reseller, once it is installed on a real server and the "before you hand it over" list in `DELIVERY_CHECKLIST.md` is done.**
**Not ready for unattended use or for taking significant money**, mainly because of things that need a real server, a lawyer or a supplier, which no amount of code can settle. See "Still open".

## Found and fixed

| # | Loophole | Why it mattered | Fix | Proof |
|---|---|---|---|---|
| 1 | Removing a reseller who had ever ordered crashed with a database error | The screen promised "history is kept" and then failed; owners could not remove anyone with orders | "Remove" now disables the person (sessions end, API keys revoked, sign-in blocked); history and credit stay; they can be restored | `lifecycle-db.test.ts`, probe reproduced the crash first |
| 2 | No way back after a lost password or lost phone (two-factor) | A reseller locked out forever, or the owner locked out of their own panel | "Reset access" gives a one-time link (new password, 2FA cleared, old sessions ended); the operator tool can do it for an owner | `lifecycle-db.test.ts`, `ops.test.ts`, browser step |
| 3 | Anyone on the internet could create panels, with no limit | Spam, name squatting, filling the database | Off by default (`ALLOW_PUBLIC_SIGNUP`), rate limited when on; panels are created with `npm run ops` | browser phase 2 checks the live server answers 403 |
| 4 | Request bodies were fully read before their size was checked | An endless upload could exhaust memory | Bodies are read in a stream and stopped at the limit | `http-unit.test.ts` (endless stream) |
| 5 | No Content-Security-Policy | One future script-injection bug would have been fully exploitable | Strict policy with per-request nonce; inline script, inline event handlers and connections to other sites are blocked | browser step injects a script and handlers and checks they do not run |
| 6 | A price could change between a reseller looking at it and ordering | Charged more than shown: a dispute and a trust problem | The order carries the price the reseller saw; if it changed the order is refused and the new price is shown | `orders-db.test.ts`, browser step |
| 7 | Nothing limited how fast orders could be placed | A leaked API key could drain credit instantly | 30 orders per minute per person or key | route code, `ratelimit` tests |
| 8 | Cost parser read "12 34" as 1,234 and "1,5" as 15 | A wrong cost in a price list loses money | Ambiguous amounts are refused; rows with more cells than the header are refused | `import-unit.test.ts`, browser step |
| 9 | Panels with hundreds of services had to be typed in one by one | Unusable on day one for a GSM reseller | Spreadsheet import: paste or upload, preview, all-or-nothing apply, unchanged rows detected | `access-db.test.ts`, browser step |
| 10 | No backups | One disk failure would lose every panel and every balance | Daily backup, verified before it is kept, loud failure if the off-server copy fails; restore check proves the books still add up | run against a real database, including a corrupt backup |
| 11 | People could not change their own password | Basic expectation; the only route was a reset | Change password (needs the current one, signs out other devices) | `auth-db.test.ts`, browser step |
| 12 | Staff accounts that can change prices and credit had no nudge to enable 2FA | Weak spot on the most powerful accounts | Banner until two-factor is on | browser step |
| 13 | Theme styling broke after the page refreshed its data (nonce changes per refresh) | Owner's own page would lose its look right after Publish | Theme served as a same-origin, content-versioned stylesheet; preview uses style attributes | browser step checks the owner's page recolours without a reload |
| 14 | Favicon redirect pointed at the wrong address behind a proxy | Blocked by the security policy, console errors | Relative redirect | browser run: zero console errors |
| 15 | A leftover public design-preview page | Needless exposed surface | Removed | n/a |
| 16 | The app could delete people, rename a panel's address, plan or status at database level | A bug could damage records | Database permissions narrowed (no user delete, only name updates) | `brand-db.test.ts`, `lifecycle-db.test.ts` |
| 17 | Nothing prevented a new API route from being added without a login check | One forgotten line exposes data | A test lists every route and fails if one is unprotected (checked with a deliberately open route) | `routes-guard.test.ts` |

Also verified, no change needed: dependency scan (0 known vulnerabilities), secret scan of the repository (none), tenants cannot see each other's data on any table, orders and money cannot be edited or deleted, resellers never receive cost or margin, uploaded logos cannot run as pages, brute-force login is slowed (per address and per account).

Performance probe (local, one user): 1,000 services import in about 0.5 s; the price list loads in about 16 ms; an order takes about 9 ms (p95 14 ms). Fine for tens of resellers. **Not load-tested with many people at once.**

## Still open (be honest with the customer about these)

| Severity | Item | What to do |
|---|---|---|
| Must fix before real money | Docker images have never been built and the cloudflared tunnel has never been tried live (no Docker in the build environment). Packaging was simulated step by step, which passed. | First install on a real server, with the checklist; expect a small amount of fixing |
| Must fix before real money | Off-server backups are not configured by default. The script and the check exist. | Set `BACKUP_UPLOAD_COMMAND` (see `deploy/README.md`) and run the restore check once |
| Must fix before real money | Legal: which services may be listed, terms of service, refund and privacy policies, and whether the staff-managed credit model is acceptable | Lawyer (task T-005) |
| Real limitation | No email: invitations and resets are links you send yourself (WhatsApp is fine) | Works today; email later |
| Real limitation | No automatic supplier connection: your staff fulfil each order by hand in the queue | Needs supplier API details |
| Real limitation | No monitoring or alerts: if the server stops you find out from a reseller | Add an uptime check (free services exist) |
| Accepted risk | Five wrong passwords lock that account for 15 minutes, so someone could lock the owner out briefly | The operator tool resets access; improve later |
| Accepted risk | Rate limits live in memory, so run **one** app instance | Move to Redis before scaling |
| Accepted risk | A leaked API key that can place orders can spend that reseller's credit (up to 30 orders a minute) until revoked | Tell resellers to give bots only the scopes they need and to revoke keys at once if leaked |
| Nice to have | Two-factor is encouraged, not forced | Consider forcing it for owners and admins |
| Nice to have | English only; logos have no cropping; staff tables scroll sideways on phones; no invoices for the panel subscription (T-123) | Later |
