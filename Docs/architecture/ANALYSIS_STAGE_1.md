# Architecture Analysis — Stage 1 Findings

> **Status:** for review. This is an analysis report, not the architecture memory itself.
> **Baseline:** commit `b2d7051` (2026-11-14), branch `main`.
> **Method:** static reading of source, SQL migrations and tests. **No tests, builds, or database
> queries were executed.** CI results could not be read (no `gh` CLI; GitHub connector failed), so
> nothing here is backed by an observed test run.
> **Sensitivity:** §2 describes unpatched security weaknesses. Decide whether this file should be
> committed before it is.

## Evidence classifications

| Tag | Meaning |
|---|---|
| **VERIFIED** | Read in the source at the cited line. |
| **VERIFIED✓** | As above, and re-read independently by the lead analyst during review. |
| **TEST_VERIFIED** | An automated test asserts it. The test was *read*, not *run*. |
| **CODE_INFERRED** | Follows from reading the code; not directly stated, not tested. |
| **DOCUMENTED_ONLY** | Stated only in documentation or planning. |
| **UNVERIFIED** | Not checked. |

---

## 1. What M&M is, as implemented

Three processes built from two npm projects (no workspace tool; root `package.json` uses `npm --prefix`):

| Process | Entry | Role on the database | Evidence |
|---|---|---|---|
| **API** — NestJS 12 on Fastify, prefix `/api/v1` | `backend/src/main.ts` | `mm_app` (`DATABASE_URL`), RLS enforced | VERIFIED `main.ts:12-59`, `db.module.ts:150` |
| **Worker** — standalone Nest context, no HTTP | `backend/src/worker.main.ts` | `mm_worker` (`WORKER_DATABASE_URL`) | VERIFIED `worker.main.ts:17-30`, `db.service.ts:128-145` |
| **Admin console** — Next.js 16 App Router, server components | `admin/src/app` | none directly; calls the API's `/api/v1/admin/v1/*`, which uses `mm_admin` (`ADMIN_DATABASE_URL`) | VERIFIED `admin/src/lib/api.ts:24,114` |

Data: PostgreSQL 17 (Docker locally, `postgres:17-alpine`), Drizzle ORM, **42 tables**, migrations
`0000`–`0020`, RLS enabled on all 42. Media: Cloudflare R2 via the S3 SDK. Mail: SMTP *or* Resend,
used **only for sign-in codes**. Runtime: one VPS, three systemd units, deployed by GitHub Actions
over SSH. **No iOS or Android code exists in this repository** (VERIFIED: no `.swift`, `.kt`,
`.gradle`, `.xcodeproj` tracked). Whether mobile repositories exist elsewhere is an open question (§8).

---

## 2. Priority findings

Ranked by consequence. "Checked" = re-read by the lead analyst (VERIFIED✓).

### 2.1 Security

| # | Finding | Evidence | Class |
|---|---|---|---|
| S1 | **Unlimited sign-in code issuance enables online guessing of any user's account.** `POST /admin/v1/auth/request-code` is public, has no rate-limit check, and writes into the same `email_otps` table as user sign-in, for any address. `app_redeem_email_code` (user `/auth/verify`) matches on email + hash only, so a code issued by the admin route is redeemable as a user code. Each code allows 5 guesses; codes can be reissued without limit. It is noisy (each issuance emails the victim) and creates the account if absent. The user route's 5/hour limit is bypassed. No test covers cross-realm use. | `admin/admin-auth.service.ts:72-86`; `migrations/0019:157-160`; user limit `auth/auth.service.ts:57,87-96` | VERIFIED✓ / exploit path CODE_INFERRED |
| S2 | **No attempt limit on admin TOTP.** A pending MFA token lives 8 h; each guess is checked against ~3 TOTP windows + up to 8 backup codes. Requires the email factor first. | `admin/admin-auth.service.ts:155-197`; `migrations/0013:111-124` | VERIFIED / CODE_INFERRED |
| S3 | **`mm_app` can overwrite any admin's TOTP secret or backup codes.** `app_admin_enrol_totp(uuid,…)` and `app_admin_use_backup_code(uuid, text)` take an arbitrary admin id with no session proof and are granted to `mm_app`. Exploitable only by someone who can run arbitrary SQL as `mm_app` (e.g. via an injection bug) — a defence-in-depth gap, not a remote hole today. | `migrations/0013:209-224, 262-264` | VERIFIED✓ |
| S4 | **RLS is not FORCED.** The table owner (the migration credential) bypasses every policy. `drizzle.config.ts` falls back to `DATABASE_URL` when `MIGRATION_DATABASE_URL` is unset, and `DbService.ping` only warns for role `postgres`. Production migrations run as the **`postgres` superuser**. | grep `FORCE ROW` = 0 matches; `drizzle.config.ts:27`; `db.service.ts:172`; `deploy/migrate.sh:22` | VERIFIED✓ |
| S5 | **The actor GUC is not authenticated.** Any connection may `set_config('app.user_id', …)`. `mm_admin` holds S/I/U on most tables, so a console code path issuing arbitrary SQL could impersonate any user and bypass break-glass. Separation relies on application code only. | `migrations/0002:60-65`, `0011:187-188`; `db.service.ts:69-78` | CODE_INFERRED |
| S6 | **Break-glass approval can name any colleague.** The INSERT policy checks only `admin_id = me`; `approved_by` is free, so an admin can self-grant content access by naming another admin. The CHECK only forbids `approved_by = admin_id`. Content opens immediately. Untested. | `migrations/0011:274-275, 208-220` | VERIFIED✓ / CODE_INFERRED |
| S7 | **Co-vault data exposure.** `users_read` returns full rows (email, phone) to anyone sharing a vault, contradicting `0018:3-4`. `capsule_recipients_read` lets any vault role, including viewers, read recipients' email, phone and token hash. `media_update` lets any contributor modify any media row in the vault. | `migrations/0002:185-186`, `0005:383-384`, `0004:293-295` | VERIFIED / CODE_INFERRED |
| S8 | **`seed-dev.ts` would truncate production.** Guards refuse `mm_test` and `NODE_ENV=production` only; a developer `.env` pointing at `mm_prod` (the team's current practice) without that flag would `TRUNCATE users … CASCADE`. `dev-code.ts` uses the safer allowlist (`mm_dev` only). | `backend/scripts/seed-dev.ts:22-34` vs `dev-code.ts:52-55` | VERIFIED✓ |
| S9 | **Admin TOTP secret and backup codes travel in a URL query string** on the enrolment redirect — reaching proxy access logs and browser history. | `admin/src/app/login/actions.ts:79-84` | VERIFIED✓ |
| S10 | **No HTTP-level protections:** no rate limiting, helmet, CORS config, or global exception filter. `trustProxy: true` is unconditional; the code default `HOST=0.0.0.0` would make `req.ip` spoofable if the API were reachable without the proxy. | `main.ts:12-22, 59`; grep of `src` and `package.json` | VERIFIED |
| S11 | Smaller: `app_open_capsule` never revoked from PUBLIC (every role can call it); IP hash is unsalted SHA-256 (reversible over IPv4); backup-code consumption is an unlocked read-modify-write; console endpoints check "is an admin" but never the `permissions` table; CI deploy does not pin the SSH host key; systemd units have no hardening directives. | `0016:105-108`; `auth.controller.ts:190-193`; `admin-auth.service.ts:221-238`; `dashboard.controller.ts`, `app-versions.controller.ts`; `ci.yml:160`; `deploy/systemd/*` | VERIFIED / CODE_INFERRED |

### 2.2 Correctness

| # | Finding | Evidence | Class |
|---|---|---|---|
| C1 | **Capsule delivery cannot succeed in production.** `DeliveryGateway.send` throws whenever `NODE_ENV=production`; no Resend/SES/APNs/FCM sender is wired and `MailService` is not imported by the worker. Every due capsule retries ~15 days and goes `dead`. Each try leaves an orphan `queued` attempt and the capsule stuck in `delivering`; nothing ever writes `failed`. The production branch is untested. | `worker/delivery.gateway.ts:75-80`; `worker.module.ts:18-33`; `capsule-delivery.handler.ts:189-227` | VERIFIED✓ / consequences CODE_INFERRED |
| C2 | **Duplicate-send protection is narrower than documented.** Each reservation uses `max(attempt_no)+1`, so a retry after a crash between "sent" and "recorded" reserves a *new* attempt and sends again. The unique key only stops two concurrent workers on the same attempt number. Leases are never extended and `complete`/`fail` do not check `locked_by`, so a job longer than the lease can be reclaimed while running. | `capsule-delivery.handler.ts:22-30` (claim) vs `:190-200`; `promises.ts:373-378`; `job-queue.service.ts:100-139` | VERIFIED✓ / CODE_INFERRED |
| C3 | **Moving `unlock_at` during the grace window does not move the job.** `PATCH /capsules/:id` updates `unlock_at` but never `scheduled_jobs.run_at` (the API role cannot update that table). Later → the worker refuses ("in the future"), backs off and dies after 5 tries (~15 days). Earlier → delivered late. | `capsules.service.ts:186-200` (only `run_at` reference is the insert at `:457`); `migrations/0005:413-414` | VERIFIED✓ / CODE_INFERRED |
| C4 | **Milestone and manual capsules are sealed but never scheduled**; no code resolves milestones. | `capsules.service.ts:453-461` | CODE_INFERRED |
| C5 | **Recipients are not frozen after sealing.** Owner can add/remove/re-token recipients post-seal (no freeze trigger on `capsule_recipients`); the API blocks it with a 409, the database does not. | `migrations/0005:387-389`; `capsules.service.ts:225-292` | VERIFIED / CODE_INFERRED |
| C6 | Recipients see no media (open-link returns title, note, date only). | `migrations/0016:75-96` | VERIFIED |
| C7 | Reply with a bad token likely returns 500, not 404 (`reply` not wrapped in `translatingPgErrors`). `/health/ready` returns 500, not 503, when the main pool throws; `database.connected: true` is hard-coded. | `capsules.service.ts:617-626`; `health.controller.ts:50-53, 75` | CODE_INFERRED / VERIFIED |
| C8 | Upload quota counts neither concurrent sessions nor in-flight bytes; concurrent uploads can exceed quota. Restarting a completed `clientId` resets status and leads to a 409 on re-completion. | `archive.service.ts:156-171, 230-234, 329-371` | CODE_INFERRED |
| C9 | Mail is either SMTP **or** Resend, never failover; with neither configured in production, `request-code` returns 500 instead of the uniform 202. | `mail/mail.service.ts:44-64, 102-121, 144-168` | VERIFIED |

---

## 3. Capability matrix

Layers: **DB** schema exists · **Svc** backend logic · **API** exposed over HTTP · **App** reachable
from an app in this repo (admin console; mobile not in repo) · **Tests** automated tests exist
(read, not run) · **Plan** documented/planned only.

| Capability | DB | Svc | API | App | Tests | Notes |
|---|---|---|---|---|---|---|
| Email-code sign-in, sessions | Yes | Yes | Yes | No | Yes (`auth.e2e-spec.ts`, ~30 cases) | Access 24 h / refresh 30 d rotating / idle 7 d; reuse detection. Lockout, expiry and rate limit untested. |
| Usernames | Yes (`0018`) | Yes (auto-generated) | Read only (`/auth/me`, verify) | No | Yes | Change-username not built (TEAM_TASKS D-5). |
| Phone OTP / SMS | Column only (`users.phone`) | No | No | No | No | `users.email` NOT NULL. |
| Passkeys, OAuth | Table only (`passkey_credentials`) | No | No | No | No | ADR-008 claims them. |
| App versions | Yes (`0020`) | Yes | Public GET + admin GET/PUT | No console UI | Yes (`app-versions.e2e-spec.ts`) | One test returns early if `TEST_ADMIN_DATABASE_URL` unset. |
| Vaults | Yes | Create + list | Yes | No | Partial | No member/invite/role API. |
| Vault membership & roles | Yes | Owner row at create only | No | No | DB-level | |
| Memories | Yes | Create + list | Partial (no edit/delete) | No | Yes | Soft-delete columns exist; no trash API. |
| Media upload (R2) | Yes | Yes | 3 routes | No | Yes, with fake storage | No MIME allowlist, transcode, thumbnails, checksum, multipart, or expiry sweep. |
| Albums, tagging | Yes | No | No | No | DB-level | |
| Capsules (promises) | Yes | Yes | 9 routes | No (console KPIs only) | Yes | Datetime only; milestone/manual unscheduled (C4). |
| Delivery engine | Yes | Engine yes, **provider stub** | Worker only | Console counters | Yes, dev gateway only | C1, C2. |
| Open link & reply | SQL functions | Yes | Public | No | Yes | No expiry on link; no media (C6); no rate limit. |
| People / members | Yes | No | No | No | DB-level (`people.e2e-spec.ts`) | TEAM_TASKS BE-04. |
| Events & reminders | Yes | No (no job handler) | No | No | DB-level | Job kinds declared in enums only. |
| Sharing links | Yes + SQL functions | No | No | No | DB-level | |
| Notifications | Yes | No | No | No | DB-level | No push provider. |
| Billing / subscriptions / payments | Yes | Entitlement check at seal only | No | No | DB-level | No Stripe/Razorpay dependency. |
| Search | Columns + GIN indexes | **No** — nothing writes `memories.search_text` | No | Placeholder box in console | No | TEAM_TASKS BE-07. |
| Audit log | Yes, append-only trigger | Worker + admin functions write it | No | Console timeline | Yes | |
| Moderation, reports, blocks, feature flags | Yes | No | No | Dashboard counter only | DB-level | |
| Break-glass content access | Yes + policies | No | No | Dashboard counter only | Yes (`roles.e2e-spec.ts`) | S6. |
| Admin console sign-in (email + TOTP) | Yes | Yes | Yes | **Yes** | Yes (`admin-auth.e2e-spec.ts`) | S1, S2, S3, S9. |
| Admin dashboard | Reads ~10 tables | Yes | Yes | **Yes** | **None** | Several rows hard-coded "not wired"; stale copy says no worker runs. |

"DB-level" means a test proves policies or constraints through SQL, not that a feature exists.

---

## 4. Architecture detail (for the memory documents)

### 4.1 Request pipeline — VERIFIED
`Fastify (trustProxy)` → `ActorMiddleware` on every route (hashes `Bearer`, calls
`app_resolve_session`, fails **closed** to "no actor") → `AdminActorMiddleware` on `admin/v1/*`
(separate AsyncLocalStorage) → global `AuthGuard` (401 unless `@Public()`) → per-route
`ZodValidationPipe` (400, or 422 for app-versions) → service → `DbService.tx()` sets
`app.user_id` transaction-locally on the `mm_app` pool → RLS.
Sources: `auth/actor.middleware.ts:47-103`, `auth.module.ts:27-29`, `admin.module.ts:29-31`,
`auth/auth.guard.ts:39-52`, `common/zod.pipe.ts:20-50`, `db/db.service.ts:69-78`.

Admin controllers are `@Public()` at class level plus `@UseGuards(AdminGuard)` — protection is
opt-in per controller.

### 4.2 Database roles — VERIFIED
| Role | Privileges | Identity source |
|---|---|---|
| `mm_app` | S/I/U/D all tables, NOBYPASSRLS | `app.user_id` |
| `mm_worker` | S/I/U, DELETE revoked; state-limited capsule policies | none (no GUC) |
| `mm_admin` | S/I/U; column-only SELECT on capsules, recipients, uploads | `app.admin_id` |
| owner / `postgres` | owns tables, bypasses RLS | migrations only |

`support` is a row in the console `roles` table, not a database role (`0017:19-26`).
`email_otps` and `retired_refresh_tokens` have RLS on and **no policies** — reachable only via
SECURITY DEFINER functions.

### 4.3 Worker — VERIFIED
Loop: `reap()` expired leases → `claim()` with `FOR UPDATE SKIP LOCKED` (batch 25, lease 300 s) →
dispatch. Only kind: `capsule_delivery`. Backoff `min(2^(n-1), 8)` days; `dead` after 5. Delivery
mints a fresh 32-byte token per attempt, stores only its SHA-256, and revokes the previous link.
Sources: `worker.service.ts:39-102`, `job-queue.service.ts:65-185`,
`capsule-delivery.handler.ts:65-263`. TEST_VERIFIED: `worker.e2e-spec.ts` (SKIP LOCKED, reaper,
retry, dead, rotation).

### 4.4 Deployment — VERIFIED
Push to `main` → CI (backend: typecheck, lint, unit, build, e2e on Postgres 17; admin: typecheck,
lint, build — **no admin tests**) → deploy job (only if repo variable `DEPLOY_ENABLED == 'true'`)
→ SSH forced command `mandm-deploy <sha>` (sha must be an ancestor of `origin/main`, `flock`) →
`git archive` into `releases/<sha>` → `npm ci && build` **on the server** → `mandm-migrate` as
superuser → atomic `current` symlink swap → restart 3 units → health probe (API `:4100` ready as
`mm_app`, admin `:4101` → 307, worker active) → automatic code rollback on failure. **No database
rollback.** Sources: `.github/workflows/ci.yml:14-162`, `deploy/ssh-entry.sh:16-56`,
`deploy/deploy.sh:30-99`, `deploy/migrate.sh:14-33`, `deploy/sudoers:5`.

Not in the repository (DOCUMENTED_ONLY in `SETUP.md` §30–31): nginx/TLS, the server's Postgres
compose file, backups (nightly `pg_dump`, same disk), `authorized_keys` pin, log rotation.

---

## 5. Documentation drift register (initial)

Status: **Implemented** · **Superseded** · **Partial** · **Unverified**. No source document has been
edited. All "Recommended action" items await separate approval.

| # | Document § | Claims | Code implements | Evidence | Status | Recommended action |
|---|---|---|---|---|---|---|
| D1 | `ARCHITECTURE_DECISIONS.md` ADR-001 (L48) | Title: "Single native mobile apps, not native apps" | No mobile code in repo; title self-contradictory | repo file listing | Unverified | Fix title; record where mobile code lives. |
| D2 | ADR-003 (L68) | Monorepo `apps/api` + `apps/workers` + `packages/*`, pnpm + Turborepo | `backend/` + `admin/`, npm `--prefix`, no workspace tool | root `package.json` | Superseded | Mark superseded; describe actual layout. |
| D3 | ADR-008 (L155) | Better Auth: email OTP + passkeys + OAuth | Hand-built email OTP + opaque access/refresh tokens; passkeys table only; no OAuth; no `better-auth` dependency | `auth/*`, `migrations/0019` | Superseded | New ADR for the hand-built session model. |
| D4 | ADR-009 (L165) | `lib/authz` single chokepoint; no RLS | RLS on all 42 tables with ~105 policies; no `lib/authz` | `migrations/0002`… | Superseded | Mark superseded by RLS; reference 0002/0011. |
| D5 | ADR-010 (L219) | tsvector GIN search now | Indexes exist; nothing writes `search_text`; no search API | `0004:166-184`; grep | Partial | Keep; note "indexes only". |
| D6 | ADR-012 (L244) | Media processing in ECS Fargate workers | No media processing at all | `archive/README.md:47-56` | Unverified (not built) | Mark as future. |
| D7 | ADR-013 (L259) | Offline sync layer (WorkManager / URLSession, Room / GRDB) | Not in this repo | — | Unverified | Pending mobile-repo answer. |
| D8 | ADR-014 (L267) | Tailwind v4 + Radix + Motion | Tailwind only; no Radix, no Motion | `admin/package.json` | Partial | Update. |
| D9 | ADR-015 (L275) | Stripe + Razorpay | Billing tables only; no SDKs | `billing.ts`; `package.json` | Partial (schema) | Mark as schema-only. |
| D10 | ADR-016 (L283) | Resend primary, SES standing fallback | SMTP **or** Resend, no failover, no SES; sign-in codes only | `mail.service.ts:44-64` | Partial | Update; capsule mail not wired (C1). |
| D11 | ADR-018 (L297) | Vitest + Playwright + service-layer permission tests | Vitest + DB-level RLS tests; no Playwright; admin untested | `package.json`; `backend/test` | Partial | Update. |
| D12 | ADR-019 (L312) | AWS end to end | Single VPS + systemd; AWS planned at ~10k users | `deploy/*`, `ci.yml` | Superseded (for now) | Add "interim hosting" ADR. |
| D13 | ADR-020 (L339) | Sentry + CloudWatch + Checkly + delivery monitor | None of these; dashboard reads job counts | `package.json`; `dashboard.service.ts` | Unverified (not built) | Mark future. |
| D14 | ADR-021 (L347) | PostHog analytics | Not present | `package.json` | Unverified (not built) | Mark future. |
| D15 | ADR-022 (L353) | Server actions for mutations, route handlers for machine surfaces | NestJS REST controllers; server actions only for admin login | `*.controller.ts`; `admin/src/app/login/actions.ts` | Superseded | Mark superseded. |
| D16 | ADR-005, -006, -007, -011, -017 | Postgres + Drizzle; DB job table; R2 private; Redis deferred; no AI in R1 | As claimed | `db/*`, `worker/*`, `storage.service.ts` | Implemented | None. |
| D17 | `MM_BLUEPRINT.md` title | "New PWA Product Blueprint" | PWA dropped for native apps (2026-09) | project decision | Superseded | Add a header note; preserve history. |
| D18 | `DEVELOPMENT_INDEX`, `PROJECT_PROGRESS`, `TRACEABILITY_MATRIX`, `REQUIREMENT_GAP_ANALYSIS`, 240 task docs | Plan state as of 2026-10-09 | Not updated since | `git log` | Unverified (stale) | Decide whether these remain live. |
| D19 | `TEAM_TASKS.md` §2 rows 1–3, 5 | App version, idle logout, access/refresh tokens, usernames "Not built" / "Partly built" | Built in `5b465bd`, `b2d7051` | `migrations/0018-0020` | Superseded by code | Update §2 (file has uncommitted local edits). |
| D20 | `backend/src/db/schema/columns.ts:21, 152-154` | "Thirty-eight tables"; "a CI check enumerates" RLS coverage | 42 tables; no such CI check | grep | Superseded | Fix comments. |
| D21 | `config/env.schema.ts:203` | "SMTP tried first, then Resend" | No fallback | `mail.service.ts:144-155` | Superseded | Fix comment. |
| D22 | `config/env.schema.ts:6-8` | Schema is the complete env inventory | Tests read `TEST_ADMIN_DATABASE_URL`, `TEST_WORKER_DATABASE_URL`, not in schema | `test/support/setup-env.ts:48,56` | Partial | Add or reword. |
| D23 | `auth/auth.service.ts:56` | "Six codes an hour" | Limit is 5 | `:57` | Superseded | Fix comment. |
| D24 | `capsule-delivery.handler.ts:22-30` | Crash cannot cause a resend | It can (C2) | `:190-200` | Superseded | Fix code or comment. |
| D25 | `migrations/0018:3-4` | Email must never be visible to another person | Co-vault members can read it (S7) | `0002:185-186` | Superseded | Fix policy. |
| D26 | `docker-compose.yml:3,28` | Production is Aurora + Secrets Manager | VPS | `deploy/*` | Superseded | Fix comment. |
| D27 | Admin console copy | "No delivery worker is running", "no replica yet" | Worker unit deployed | `panels.tsx:391-392, 553-554`; `incidents.tsx:195` | Superseded | Update UI copy. |
| D28 | `admin/README.md` | Stock create-next-app; port 3000 | Dev 3001, prod 4101 | `admin/package.json:6`; `mandm-admin.service` | Superseded | Replace README. |

Rows D20–D28 are code comments and UI copy rather than design documents. They are listed because
they mislead a reader the same way.

---

## 6. Repository hygiene (for separate review — no action taken)

| Item | Detail |
|---|---|
| H1 | `Docs/client/~$MandM-Growth-Plan.pptx` — Office lock file **tracked** in git. |
| H2 | `Docs/client/~$MandM-Storage-and-AI-Plans.pptx` — untracked lock file in the working tree; `.gitignore` has no `~$*` rule. |
| H3 | Unused leftovers: `ts-loader`, `@types/express` (Fastify is used); `"deploy": "nest deploy"`; `db:push` script; ts-jest reference in `tsconfig.test.json:10`; unused `scopeIndex()` helper. |
| H4 | Root scripts still say `dev:frontend` / `build:frontend` for the admin console. |
| H5 | The server's IP appears as plain text in `Docs/development/SETUP.md` §31.5 and `.github/workflows/ci.yml:138` (not reproduced here). |
| H6 | GitHub Actions pinned to tags, not commit SHAs. |

---

## 7. Coverage ledger

| Area | Status |
|---|---|
| `backend/src/auth`, `admin`, `app-version`, `health`, `common`, `config`, `main.ts`, `app.module.ts` | Read in full (minor comment skips) |
| `backend/src/vaults`, `archive`, `capsules`, `storage`, `worker`, `worker.main.ts` | Read in full |
| `backend/src/mail` | Read (header comment skipped) |
| `backend/src/db/*.ts` (service, module, actor-context) | Read in full |
| `backend/src/db/schema/*.ts` | identity, auth, admin, releases, columns, index in full; others checked by name-level diff against SQL |
| Migrations `0000`–`0020` | Policies, grants, functions and triggers read; DDL diffed against schema. `meta/*.json` snapshots excluded (generated). |
| `backend/test/*` | rls, roles, `support/database.ts` in full; others: test names plus assertions, bodies partly |
| `admin/src/**` | Read, except `form.tsx` (lines 81+ grepped), `icons.tsx`, `globals.css` (partial) |
| `backend/scripts`, `deploy/*`, `.github/workflows/ci.yml`, `docker*` | Read in full |
| `Docs/development/SETUP.md` | §30–31 only |
| `MM_BLUEPRINT.md`, `Docs/client/*`, planning tree, ADR bodies | Headings only — treated as *intended* behaviour |
| Excluded | `node_modules`, `dist`, lockfiles, `*.tsbuildinfo`, migration snapshots, `_generator` (frozen), `.pptx`, `.screenshots` |
| **Not executed** | Any test, build, or query. CI history not accessible. |

---

## 8. Open questions

1. Do iOS and Android codebases exist in other repositories? If so, they should be in scope for a
   later stage.
2. Is the production `production` GitHub environment protected (required reviewers)? Not visible
   from the repo.
3. Do the root-installed copies of the systemd units, sudoers and entry scripts on the server match
   the repo?
4. How is the production database reached by developers? `SETUP.md` §30.3 binds it to loopback;
   project notes describe a firewall allowlist.
5. Is there a way to see CI results, so TEST_VERIFIED can be upgraded to "observed passing"?

---

## 9. Proposed `Docs/architecture/` structure

Each file has a header with the commit it was verified against, and every claim carries an
evidence tag.

| File | Contents | Source sections |
|---|---|---|
| `README.md` | Purpose, evidence tags, how to update, coverage ledger | §7 |
| `01-system-context.md` | Processes, external services, trust boundaries, diagram | §1 |
| `02-request-pipeline-and-auth.md` | Middleware → guard → RLS; user and admin auth flows; token lifecycle | §4.1, auth report |
| `03-data-model.md` | 42 tables by domain, relationships, conventions | DB report §1 |
| `04-rls-and-database-roles.md` | Policy table, roles, SECURITY DEFINER inventory, GUCs | §4.2, DB report §2–4 |
| `05-api-surface.md` | Every route: method, path, auth, validation, response | auth and domain reports |
| `06-capsules-and-delivery.md` | Capsule state machine, scheduling, worker, open link | §4.3 |
| `07-media-and-storage.md` | Upload flow, R2, quotas | domain report §2 |
| `08-admin-console.md` | Pages, sign-in, dashboard data sources, wired vs placeholder | admin report |
| `09-runtime-and-deployment.md` | CI, deploy, systemd, environment variables (names only) | §4.4 |
| `10-capability-matrix.md` | §3, kept current | §3 |
| `11-drift-register.md` | §5, kept current | §5 |
| `12-known-issues.md` | §2 and §6, each with an owner and status | §2, §6 |
| `13-test-coverage.md` | What each suite proves, and the gaps | test mappings |
| `glossary.md` | Vault, capsule, promise, member, break-glass, … | — |

Suggested maintenance rule: any pull request that touches `backend/src/**` or `migrations/**`
updates the affected file and its "verified at" commit. Generated sections (route list, table list)
could later come from a read-only script, after separate approval.
