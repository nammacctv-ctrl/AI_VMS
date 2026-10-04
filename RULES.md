# RULES

Engineering rules for humans and AI agents working in this repo. If a rule must be broken, record why in MEMORY.md.

## 1. Workflow
1. Work on the designated feature branch; never push to `main` directly.
2. Small, focused commits with clear messages (what and why).
3. Every change links to a task ID in [TASKS.md](TASKS.md).
4. Do not open a pull request unless asked.
5. Update TASKS.md and MEMORY.md in the same commit as the work they describe.

## 2. Code
- TypeScript strict mode; no `any` without a comment explaining why.
- Match the style of surrounding code; formatter and linter must pass before commit.
- Prefer boring, well-known libraries; add a dependency only with a stated reason.
- No dead code, no commented-out blocks, no speculative abstractions.
- Validate all external input with a schema (for example Zod) at the boundary.
- Errors: return typed errors for expected failures; throw only for bugs.

## 3. Multi-tenancy (non-negotiable)
- Every tenant-scoped table has `tenant_id` and an RLS policy. A table without one needs a written exception in MEMORY.md.
- The app database role must not have `BYPASSRLS` and must not own tables.
- Tenant ID comes from host resolution or a verified API key, never from request body or query.
- Each new table ships with a cross-tenant isolation test.

## 4. Money and ledger (non-negotiable)
- No code edits a balance directly. Money moves only through ledger entries.
- Entries are append-only; fix mistakes with reversing entries.
- Every money-moving call takes an idempotency key.
- Use integer minor units (paise) or a decimal type, never floats.
- Money paths require tests for retry, duplicate and partial-failure cases.

## 5. Security
- No secrets in code, logs, tests or commits. Use the secret manager; use `.env.example` for names only.
- Supplier credentials are field-encrypted at rest.
- All endpoints require authentication unless explicitly listed as public.
- Rate limit every public and API endpoint.
- Never log full API keys, passwords, tokens or supplier credentials.
- Dependencies pinned; CI must pass dependency, SAST and secret scans.
- Security fixes: critical within 48 hours, high within 7 days.
- Themes are data only. Never execute tenant-provided code.

## 6. Database
- Migrations are forward-only and use expand/contract (add, backfill, switch, then drop in a later release).
- Never drop or rename a column in the same release that stops using it.
- Review generated SQL by hand before merging.

## 7. API
- Version under `/v1`; breaking changes need `/v2` and 6 months notice.
- Publish OpenAPI 3.1; keep it in sync with code (CI check).
- Webhooks are HMAC-signed with timestamp and are retried with backoff.

## 8. UI and accessibility
- Use design tokens only; no hard-coded colors, spacing or font sizes (see [DESIGN.md](DESIGN.md)).
- WCAG AA contrast, full keyboard operation, visible focus states.
- Every screen has loading, empty, error and success states.
- Mobile-first layouts; test at 360 px width.

## 9. Testing
- Unit tests for domain logic; integration tests for DB and RLS; end-to-end for core flows (signup, order, refund, theme change).
- A bug fix includes a test that fails before and passes after.
- Never skip, disable or quarantine a test to get CI green; fix it.

## 10. Legal and compliance
- Only services on the counsel-approved allowed list may be listed in the catalog.
- Personal data handling follows DPDP Act 2023: collect minimum data, support deletion, log consent.
- Implement the Dhru-compatible API only from public documentation.
- Entity name on invoices and terms: Namma CCTV Private Limited.

## 11. AI agent rules
- Read PRD.md, ARCHITECTURE.md, RULES.md and MEMORY.md before starting a task.
- Make the smallest change that satisfies the task; do not widen scope.
- Report outcomes faithfully, including failing tests and skipped steps.
- Ask before destructive or outward-facing actions (deleting data, pushing to other branches, sending messages, spending money).
- AI features never get write access to balances or ledger.
