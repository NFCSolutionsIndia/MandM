# Architecture Decisions

Every decision needed to implement this plan, with reasoning. Where the blueprint specifies a technology, that is cited. Where it does not, a decision is **recommended here and then applied consistently across every task** — flagged so it can be challenged in one place rather than argued per task.

Status legend: **[BLUEPRINT]** specified in MM_PWA_BLUEPRINT.md · **[DECIDED]** decided here, consistent across the plan · **[SUPERSEDES BLUEPRINT]** this document overrides §18.1 · **[DEFERRED]** deliberately not decided yet.

---

## Stack — PostgreSQL on AWS

**This document is now the authority on the data and hosting layers. Where it conflicts with blueprint §18.1, this document wins.** The blueprint is left unedited as the historical product brief; these ADRs record what is actually being built.

> ### The two decisions this document records
>
> **Database and hosting** — PostgreSQL 17 on **Aurora PostgreSQL Serverless v2**, hosting
> on AWS end to end. This supersedes blueprint §18.1, which specified Neon, Vercel and
> Fly.io. Row-level security, `pg_trgm` and `pgvector` are all in use.
>
> **2026-09-10 — the client** moved from a progressive web app to **native iOS (Swift) and
> Android (Kotlin) apps**, with the marketing site, the `/c/[token]` unlock route and the
> admin console remaining on Next.js.

| Layer | Blueprint §18.1 said | Now | ADR |
|---|---|---|---|
| Database | Postgres (Neon/Supabase) | **PostgreSQL 17 — Aurora PostgreSQL Serverless v2** | [ADR-005](#adr-005) |
| Row-level security | Postgres RLS as second line | **Restored (2026-09-29).** RLS beneath the chokepoint, and the four compensating controls stay | [ADR-009](#adr-009) |
| Search | Postgres FTS → pgvector | **`tsvector` + `pg_trgm` (R1) → `pgvector` HNSW (R2)** — no second datastore | [ADR-010](#adr-010) |
| Web hosting | Vercel | **AWS — ECS Fargate + ALB + CloudFront** | [ADR-019](#adr-019) |
| Worker hosting | Fly.io | **AWS ECS Fargate** | [ADR-012](#adr-012), [ADR-019](#adr-019) |
| Preview environments | Neon branch per PR | **Per-PR schema on a shared Aurora preview cluster** | [ADR-019](#adr-019) |
| Permission testing | pgTAP / SQL-level | **Service-layer matrix tests against real PostgreSQL, plus RLS assertions** | [ADR-018](#adr-018) |
| Object storage | Cloudflare R2 | **Unchanged — still R2** | [ADR-007](#adr-007) |

**Unchanged and worth stating explicitly:** the Postgres-backed job table (ADR-006) survives the move — PostgreSQL 17 supports `FOR UPDATE SKIP LOCKED`, so the delivery scheduler, the single most important decision in the system, is not affected. Object storage stays on **Cloudflare R2**: the zero-egress argument in ADR-007 is unchanged by moving compute to AWS, and R2→AWS transfer is free in both directions, so R2 remains cost-optimal even from inside AWS.

### The tradeoff, recorded honestly

Three properties of this stack carry most of the engineering weight, and each is the reason a later section exists:

1. **No row-level security.** ADR-009's second line of defence is gone. `lib/authz` is now the *only* thing standing between one family's memories and another's. This is why ADR-009 grew from one page to four compensating controls, and why the permission matrix went from "important" to load-bearing.
2. **`TIMESTAMP` ends in 2038** — inside the delivery horizon this product sells. Mitigated by a mandatory `timestamptz` rule and a CI guard (ADR-024).
3. **Weaker search.** No `pg_trgm` typo tolerance, no pgvector. R2 semantic search now needs OpenSearch, which reintroduces the index-drift bug class §13.3 rejected and moves searchable text outside the single trust boundary (ADR-010).

These are written down so that a future reader encountering the unusual amount of machinery in ADR-009 and ADR-024 understands it is deliberate compensation, not over-engineering.

---

## ADR-001 — Single native mobile apps, not native apps · [BLUEPRINT §35.1, Appendix C-2]

One Next.js codebase serves the marketing site, the app, and the admin panel. Store shells are optional later (§7.3 F10).

**Consequences the plan must handle** (§29.0): store review sits between a fix and its users, so anything that must change quickly is server-driven · an old app version never fully disappears, so the API is versioned with a minimum-supported-client gate · **member import keeps four co-equal paths on iOS/Safari**, so member import needs four co-equal paths including vCard/CSV upload and self-service invite links · a push token is only issued to an installed app and the permission can be declined, making email the guaranteed fallback for every critical notification.

**Upside:** web checkout instead of store billing — no 15–30% commission, full pricing control, immediate plan changes.

---

## ADR-002 — Next.js 16 App Router, React 19, TypeScript strict · [BLUEPRINT §18.1]

Server components for fast mobile first paint; server actions remove an API layer for most mutations; and decisively, `/c/[token]` can be fully server-rendered so a capsule opens with **no client JavaScript**.

**Mandatory for every framework task:** this Next.js release has breaking changes from earlier conventions. **Read the relevant guide in `node_modules/next/dist/docs/` before writing code** (project `AGENTS.md`). Do not carry over patterns from memory.

**Note:** the existing `src/` uses `output: 'export'` (static). The application requires the opposite — a server runtime. The new app does **not** inherit that config.

---

## ADR-003 — Monorepo: `apps/api` + `apps/workers` + `packages/*` · [BLUEPRINT §19, §35.2] · [DECIDED: pnpm + Turborepo]

The blueprint specifies the layout; pnpm workspaces + Turborepo is the decision here (fast, disk-efficient, standard, good remote caching).

`apps/workers` is **separately deployable** because the delivery engine and media pipeline must keep running when a web deploy is rolling or rolled back.

---

## ADR-004 — Modular monolith, not microservices · [BLUEPRINT §35.2, Appendix C-12]

The designer brief proposed eleven services. Those are the right *domain boundaries* and the wrong *deployment topology* for a pre-launch team. Domains become internal modules under `src/features/*` with their own schema slice and **no cross-module database access**, preserving cheap extraction later. Commerce at R3 is the likeliest first extraction.

---

<a id="adr-005"></a>

## ADR-005 — PostgreSQL + Drizzle · [SUPERSEDES BLUEPRINT §18.1]

**Aurora PostgreSQL Serverless v2** (PostgreSQL 17-compatible), multi-AZ, in a private VPC subnet. Drizzle via the `pg` driver, for SQL-first, fully typed access with no runtime engine binary — on a schema this permission-sensitive, seeing the actual SQL is a feature, and that argument is *stronger* now that the database enforces none of the permissions itself.

`packages/db` is the **single schema source** shared by web and workers. No drift.

**Verify engine versions at provisioning time** (TASK-006): Aurora PostgreSQL supports PostgreSQL 17; RDS PostgreSQL 17 is the alternative if Aurora is not used. Do not assume the newest PostgreSQL features are available on a managed engine — check before designing anything around them.

### Schema rules — the eight, revisited

These are not style preferences. Each one is a decision taken once, written down, and
enforced — because each has bitten projects that discovered it late.

| # | Rule | Why |
|---|---|---|
| 1 | `DATETIME(3)`, never `TIMESTAMP` | **Dissolved** | `timestamptz` everywhere. No 2038 boundary. The rule is *repointed*, not retired: `timestamp without time zone` is banned instead, because it drops the offset (ADR-024). |
| 2 | **Primary keys are a native `uuid`**, generated application-side as UUIDv7 | UUIDv7 carries a big-endian millisecond timestamp in its leading bytes, so new keys land at the right-hand edge of the index instead of scattering through it. This schema inserts constantly (ADR-027). |
| 3 | **An explicit ICU collation**, and `citext` for email | UTF-8 is the default and needs no declaring, but ordering does: ICU makes Indic collation linguistically correct rather than byte-wise. `citext` gives case-insensitive email uniqueness without a functional index. |
| 4 | No `ENUM` — `VARCHAR` + `CHECK` | **Kept, by choice** | PostgreSQL enums exist and `ADD VALUE` is cheap, but a value can never be *removed* from one. A `CHECK` can be dropped and re-added in a transaction, and the Zod enum in `packages/shared` stays the source of truth. |
| 5 | No arrays — join tables | **Kept, by choice** | PostgreSQL has arrays. Tags, recipient lists and channel ladders stay join tables anyway, because they carry foreign keys and per-row state an array cannot express. |
| 6 | No partial indexes — composite instead | **Dissolved — and this one pays** | `CREATE INDEX ... WHERE state = 'pending'` indexes only live rows. On the job table that is the difference between an index over every job ever scheduled and one over the few hundred currently due (ADR-006). |
| 7 | JSON needs a generated column to be indexed | **Dissolved** | `jsonb` with a GIN index. No shadow columns. |
| 8 | `READ COMMITTED` on the claim loop | **Kept — and now free** | PostgreSQL already defaults to `READ COMMITTED`, so `FOR UPDATE SKIP LOCKED` behaves correctly with no isolation override. |

**Two rules PostgreSQL adds:**

9. **Row-level security is mandatory on every tenant-scoped table.** A table holding
   `vault_id` without a policy is a silent hole, so policy presence is asserted in CI.
   The actor is set as a *transaction-local* setting (`SET LOCAL`), never session state.
10. **Transaction-mode connection pooling, and no session state.** PostgreSQL connections
    are heavier; a transaction-mode pooler sits in front of Aurora, which is compatible
    with transaction-local settings and incompatible with anything session-scoped.

### Rejected

- **Engines without row-level security**, without a 64-bit timestamp, or without in-database trigram and vector search. Each of those three is load-bearing here.
- **RDS PostgreSQL single-AZ** — a lifetime vault does not run on one availability zone.
- **PlanetScale / Neon** — good branching DX, but another vendor to depend on for a multi-decade product, and it sits outside the AWS account boundary this decision is meant to consolidate into.

---

<a id="adr-006"></a>

## ADR-006 — A database-backed job table is the durable scheduler · [BLUEPRINT §18.4, §35.5]

**The most important architectural decision in the system, and it survived both engine changes intact.** A capsule due in 2046 must outlive every vendor in the stack. `scheduled_job` is the source of truth; a worker polls it with `FOR UPDATE SKIP LOCKED`. EventBridge/cron may *execute* the tick; they are never the record.

Sealing writes the capsule state and the job row **in one transaction** — there is no window where a capsule is sealed but unscheduled. PostgreSQL gives us that transaction.

**Three engine-specific requirements**, all of which must be implemented in TASK-062:

1. **`run_at` is `timestamptz`.** If it is ever `TIMESTAMP`, every capsule past 2038 silently breaks. This is the single highest-consequence column in the schema.
2. **The claim transaction runs at `READ COMMITTED`** — PostgreSQL's default, so no override is needed. A stricter isolation level would take range locks that make concurrent claim loops block each other instead of skipping, turning a horizontally-scalable worker pool into a serialised one.

   **Use `SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED` on the worker connection.** The bare `SET TRANSACTION ISOLATION LEVEL ...` form is a trap: it applies to the *next single transaction only* and leaves `@@transaction_isolation` at `REPEATABLE-READ`. Verified against PostgreSQL 17.46 — see `scripts/verify-db-assumptions.sh`.
3. **Partial index `WHERE state = 'pending'`** — the index covers only the jobs awaiting dispatch rather than every job ever scheduled, which on a table that accumulates for twenty years is the difference between a small hot index and an enormous cold one.

The watchdog (ADR-020) and the monthly integrity sweep are unchanged.

---

---

## ADR-007 — Cloudflare R2 for media, private buckets only · [BLUEPRINT §12.5, §18.1]

**Zero egress fees** — decisive when users re-watch their own 4K video; on S3, egress alone can exceed the subscription. S3-compatible, so migration stays possible.

Key layout `vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}` makes per-vault deletion, accounting, and export a prefix operation. **No object is ever publicly readable**; access is via 5-minute signed URLs minted after an authz check.

---

## ADR-008 — Better Auth: email OTP + passkeys + OAuth · [BLUEPRINT §18.1] · [DECIDED: Better Auth over Auth.js]

Self-hosted so identity is not rented for a product meant to last decades. **No passwords** — nothing to phish, leak, reuse, or forget on a lifetime vault. WebAuthn also supplies the promised biometric app lock.

Sessions are **opaque server-side rows, not stateless JWTs**, so revocation is instant (§20.1).

---

<a id="adr-009"></a>

## ADR-009 — `lib/authz` is the single authorization chokepoint · [BLUEPRINT §11.1, §20.2] · [SUPERSEDES BLUEPRINT — no RLS]

Every read and write resolves the actor to a **vault role**, an **active share**, or a **delivered capsule recipient**. There is no fourth path; nothing is readable by knowing an id.

- Deny by default. Every query scoped by `vault_id` derived from the **session**, never from client input.
- Client-supplied ids are untrusted filters, never authorization.
- The §11.2 permission matrix is encoded as an executable table with **one test per cell**; a failing cell fails CI.

### Row-level security: removed in 2026-08, restored in 2026-09

There are two independent layers: application authorization, and PostgreSQL row-level security beneath it, so that a single application bug cannot leak one family's memories to another. **Neither is permitted to justify relaxing the other** — a team that loosens the application check because "the database will catch it" has converted two layers into one.

That is a material reduction in safety for a product where a permission bug is a privacy incident, not a defect. It is accepted deliberately (see the stack-change note at the top of this document), and it is paid for with four compensating controls. **All four are mandatory. None of them is individually as good as RLS; the argument is that together they fail independently.**

#### Control 1 — Feature code physically cannot reach the database

No `db.select()`, `db.insert()`, `db.update()` or `db.delete()` anywhere outside `lib/db` and `lib/authz`. Feature modules call repository functions that require a scope token.

Enforced mechanically, not by review: an ESLint rule (`no-restricted-imports`) bans importing the Drizzle client from `src/features/**`, and CI fails on violation. A reviewer who misses it does not matter; the build stops.

#### Control 2 — The scope token is unforgeable at the type level

`lib/authz` is the only module that can construct a `VaultScope`. Its constructor is private to the module and it carries a branded type, so a repository function signature reads:

```ts
function listMemories(scope: VaultScope, filters: MemoryFilters): Promise<Memory[]>
```

There is no way to call it without having passed through authorization first. A forgotten `WHERE vault_id = ?` becomes a *type* error rather than a data leak, because the scope is what supplies the predicate.

#### Control 3 — Every result set is re-checked after the query

A cheap post-query guard asserts that every returned row's `vault_id` matches the scope. It is redundant by design — it only ever fires if Control 2 was subverted or a raw query slipped through.

On mismatch: **fail closed** (throw, return nothing), emit a Sentry event at fatal severity, and write an `audit_log` row. This is the closest available substitute for RLS's "the database refused", and unlike RLS it produces an alert rather than silence. Cost is one comparison per row; it is not negotiable on read paths.

#### Control 4 — Least-privilege database users

The application connects as a PostgreSQL role with `SELECT/INSERT/UPDATE/DELETE` and **no DDL**. Migrations run as a separate user in CI only. Media workers (ADR-012) get no database credentials at all. Admin/operator paths use a distinct connection whose every statement is audit-logged.

### Considered and rejected: emulating RLS with session variables and views

RLS could be driven from a *session*-scoped setting rather than a transaction-scoped one. Rejected: with a connection pool, session state outlives the request that set it. A connection returned to the pool carrying a stale `@app_vault_id`, then reused by another tenant's request, produces a cross-tenant leak that looks exactly like correct behaviour. **A security control that fails silently and leaks the wrong way is worse than no control**, because it invites the team to relax Controls 1–3 on the strength of it.

### What this means for testing

The permission matrix moves from pgTAP/SQL assertions to service-layer tests against a real PostgreSQL instance (ADR-018). It also goes from important to **load-bearing**: with RLS gone, this suite is the only automated proof the system isolates tenants. Every cell of §11.2 gets a test, and the suite runs on every PR.

**This is built in PHASE-02, before any content exists.**

---

<a id="adr-010"></a>

## ADR-010 — Search: a tsvector GIN index now, OpenSearch at R2 · [SUPERSEDES BLUEPRINT §13.3]

**R1 — PostgreSQL `tsvector` + `pg_trgm`.** A `search_text` column maintained by the application (title, caption, people, place, notes concatenated), with a `FULLTEXT` index queried in natural-language mode and boolean mode for quoted phrases. Per-user corpora are thousands of documents, not millions, so this is adequate for launch.

**What is lost versus the blueprint's plan, stated plainly:** there is no `pg_trgm` equivalent, so **there is no typo tolerance in R1.** A user searching "Divali" will not find "Diwali". `SOUNDEX` is not a substitute — it is English-phonetic and actively wrong for the Indian names this product is full of. The honest mitigations are (a) search across a generous `search_text` including alternate spellings the user typed themselves, (b) prefix matching on people and album names client-side over the cached Room / GRDB corpus, and (c) not claiming typo tolerance in the UI copy until R2 ships it.

**R2 — Amazon OpenSearch Serverless**, using its k-NN vector support for semantic search and its analyzers for typo tolerance, hybrid-fused with keyword results. This replaces the blueprint's pgvector + HNSW.

Two consequences the blueprint's ADR explicitly rejected, now reintroduced and mitigated rather than avoided:

- **Index drift.** Mitigated by making indexing a job kind in the same `scheduled_job` table (ADR-006) — so it is durable, retryable and replayable — plus a nightly reconciliation sweep that compares row counts and checksums per vault and re-enqueues divergences.
- **Content leaving the single trust boundary.** Mitigated by indexing **only** titles, captions, tags, people names and places — never media bytes, never transcripts of private capsules before delivery. The domain runs inside the VPC with no public endpoint, encrypted at rest with a customer-managed KMS key, and is covered by the same deletion path as the primary record (a vault deletion must purge its OpenSearch documents in the same job).

---

<a id="adr-011"></a>

## ADR-011 — Redis deferred · [BLUEPRINT §35.3, Appendix C-13]

Sessions are rows; the queue is a table. Rate limiting runs at **CloudFront + AWS WAF rate-based rules** at the edge, plus an application-level counter in the database for the R1 volume. Introduce ElastiCache when measured load requires it, not as launch complexity.

---

<a id="adr-012"></a>

## ADR-012 — Media processing in containerised workers on ECS Fargate · [SUPERSEDES BLUEPRINT §18.1]

FFmpeg + sharp. Video transcode is long-running and CPU-heavy — the wrong shape for serverless functions. Containers run with **no database credentials and no network egress beyond storage**: FFmpeg parsing untrusted media is a known RCE surface and is treated as hostile.

On AWS this posture is easier to enforce than it was on Fly.io, and the plan should take the win:

- The transcode task's **IAM task role grants object storage access and nothing else** — no Secrets Manager entry for the database, so there is no credential to steal.
- The task runs in a **private subnet with no NAT gateway**. Reaching R2 goes through a controlled egress path; there is no route to the open internet.
- Security group egress is default-deny with explicit allows.
- Media arrives and leaves by object key passed on the job row. The worker never learns a `vault_id`, a user, or a session.

Delivery-engine workers are a **separate ECS service** from media workers, with a different task role — delivery needs database and email credentials, media must never have them. Separating the services is what makes that possible.

---

## ADR-013 — Offline: WorkManager / URLSession background sync layer + Room / GRDB outbox · [BLUEPRINT §9.4, §18.1]

Hand-written sync layer (it is core product behaviour, not boilerplate). Writes **always** go through the outbox — never a naive network-first. Idempotency keys (`client_id`) on every mutation. `StorageManager.persist()` requested, with a visible warning if denied.

**Sealing a capsule is deliberately blocked offline**: a promise that cannot be confirmed server-side must not be shown as sealed.

---

## ADR-014 — Design system: Tailwind v4 + Radix + Motion · [BLUEPRINT §26]

Tokens from §26.3–26.5 as CSS custom properties. **Complete light palette on bare `:root`; only changed tokens redefined under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.** Never give a colour its only definition inside a media query — the existing repo's dark mode collapses `--primary` to white and loses the brand entirely; that bug must not recur.

Radix for accessibility (grandparents are core users). **Rejected for the app:** GSAP, Lenis scroll hijacking, custom cursor, Three.js/WebGL — hundreds of KB and real battery cost for zero in-app value, and actively hostile on touch and to assistive tech.

---

## ADR-015 — Payments: Stripe + Razorpay · [BLUEPRINT §35.4, Appendix C-7]

India-first market (₹ pricing, UPI, COD) means Razorpay is not optional; Stripe covers the rest. Hosted checkout keeps PCI scope near zero. Webhooks verified by signature with replay protection (timestamp window + event-id dedupe).

**Entitlements are evaluated at seal time and never re-applied retroactively** — a downgrade cannot invalidate an existing promise (§10 `Subscription`).

---

## ADR-016 — Email: Resend primary, SES standing fallback · [BLUEPRINT §18.1]

Deliverability matters more here than anywhere else in the product. Two independent senders is the difference between a promise kept and a promise broken. The capsule delivery email must render in clients that will not exist for 15 years: **table layout, inline CSS, plain-text alternative, no JavaScript, no web fonts**.

---

## ADR-017 — No AI in Release 1 · [BLUEPRINT §15.2]

Deliberate. Every AI feature needs an archive to work on; AI over an empty vault is worthless. The features users *perceive* as intelligent — On This Day, event grouping, auto-titles — are deterministic date logic and ship without a model. AI also adds per-user variable cost before there is revenue to absorb it.

---

<a id="adr-018"></a>

## ADR-018 — Testing: Vitest + Playwright + service-layer permission tests · [SUPERSEDES BLUEPRINT §18.1]

Vitest (unit/integration, jsdom for components) · Playwright (E2E for the web surfaces) · XCUITest and Compose UI tests for the apps · **permission-matrix tests at the `lib/authz` service layer against a real PostgreSQL instance**. Testing is embedded per feature; there is no generic "testing task".

**pgTAP is still not used.** The §11.2 permission matrix is now tested by executing every cell through `lib/authz` against a disposable PostgreSQL database — Testcontainers locally and in CI, or a per-job schema on the preview cluster. This is a weaker guarantee than the blueprint's SQL-level assertions, because it tests the layer that could be wrong rather than a layer beneath it. Two things partially close the gap:

- **A negative test per cell, not just a positive one.** For every "role X may read Y", there is a "role X may *not* read Z", executed against seeded cross-tenant data. Absence of a leak is asserted explicitly.
- **A raw-SQL escape-hatch test.** A test that deliberately issues an unscoped query proves Control 3 (ADR-009) fires — so the guard itself is covered, not assumed.

CI gate: any failing matrix cell fails the build. Per ADR-009 this suite is load-bearing; it is not permitted to be skipped, quarantined, or marked flaky.

---

<a id="adr-019"></a>

## ADR-019 — Hosting: AWS end to end · [SUPERSEDES BLUEPRINT §18.1]

| Component | Service | Notes |
|---|---|---|
| Web (`apps/api`) | **ECS Fargate + ALB, CloudFront in front** | Next.js 16 needs a server runtime (ADR-002). Fargate keeps the deploy primitive identical to workers and avoids Lambda cold starts on `/c/[token]` — the capsule-unlock path, where a slow first byte is the worst possible place to be slow. |
| Workers (`apps/workers`) | **ECS Fargate**, two services | Delivery engine and media pipeline separated by IAM task role (ADR-012). |
| Database | **Aurora PostgreSQL Serverless v2**, multi-AZ, private subnets | ADR-005. |
| Object storage | **Cloudflare R2** — unchanged | ADR-007. Zero egress still wins; R2↔AWS transfer is free both ways. |
| CDN / WAF | **CloudFront + AWS WAF** | Replaces Cloudflare's edge role for the app. Rate-based rules per ADR-011. |
| Secrets | **AWS Secrets Manager**, rotated | No secret in an env var in a task definition. |
| IaC | **AWS CDK in TypeScript**, in a new `infra/` workspace | Same language and monorepo as the app; reviewed like application code. Provisioned in TASK-006. |
| CI → AWS | **GitHub Actions with OIDC role assumption** | No long-lived AWS access keys in GitHub, ever. |

**The alternative worth knowing about:** Next.js via **OpenNext** on Lambda + CloudFront is materially cheaper at low traffic and is the right answer if the app sits idle most of the day. It was not chosen because cold starts land on the capsule-unlock path and because two deploy models cost more in operator attention than the savings are worth pre-launch. Revisit if idle cost becomes a real number.

### Preview environments — the real regression

Neon's branch-per-PR gave every pull request an isolated database with real data in seconds. **Aurora has no equivalent, and this is the sharpest DX loss in the move to AWS.**

The plan: a **shared Aurora preview cluster, one schema per PR**, created and dropped by CI. Fast, cheap, and isolated enough for the tests that run in CI. Aurora **fast cloning** is reserved for the rare case that genuinely needs production-shaped data volume — it is minutes, not seconds, and costs real money, so it is opt-in per PR via a label rather than automatic.

Consequence to accept: preview environments are seeded, not branched. Seed quality therefore matters more than it did — see CONVENTIONS on real-feel fixtures.

---

<a id="adr-020"></a>

## ADR-020 — Observability: Sentry + CloudWatch + Checkly + a bespoke delivery monitor · [BLUEPRINT §18.1]

**Sentry** (errors, client and server) · **CloudWatch Logs + Metrics** for infrastructure, with log groups per ECS service · **Checkly** for synthetic checks, kept deliberately *outside* AWS so an AWS-region event does not take down the thing that tells you AWS is down.

The bespoke piece is non-negotiable and unaffected by the stack change: **an alert that fires if any capsule passes `unlock_at` without a successful delivery attempt.** On AWS it is a CloudWatch alarm on a custom metric emitted by the hourly watchdog job, routed through SNS to PagerDuty. That alert page is the most important one in the company, and it must never be routine.

---

## ADR-021 — Analytics: PostHog, first-party · [BLUEPRINT §18.1]

No third-party trackers inside the authenticated app. No PII and **never media content** in event payloads. Instrument two ratios from day one: **storage cost per paying user** and **conversion on the capsule-horizon paywall specifically** (§17.2).

---

## ADR-022 — API style: server actions for mutations, route handlers for machine surfaces · [DECIDED]

The blueprint says "GraphQL/REST gateway" for a native-client architecture. Since 2026-09 the clients *are* native, so a versioned REST API at `/api/v1` is required — but GraphQL is not: the query flexibility buys nothing for two first-party clients and makes the ADR-009 chokepoint harder to keep in one place.

- **Server actions** for user-initiated mutations — typed end-to-end, CSRF-protected by origin checking, no hand-written client.
- **Route handlers** (`/api/*`) only where a real HTTP contract is needed: webhooks (Stripe, Razorpay, Resend, Twilio), upload session/complete, signed-URL minting, push subscribe, and anything a future native shell or third party must call.
- Every boundary validates with a **Zod schema from `packages/shared`**; the client copy is convenience, the server copy is truth.

---

## ADR-023 — Error envelope and result type · [DECIDED]

All route handlers return `{ ok: false, error: { code, message, details? } }` with a machine-stable `code`. Server actions return a discriminated union `{ ok: true, data } | { ok: false, error }` — **never throw for expected failures**, so forms can render field-level errors without a boundary.

---

<a id="adr-024"></a>

## ADR-024 — Time is stored as UTC `timestamptz` + intended timezone · [BLUEPRINT §18.4 item 8, §33.6] · [AMENDED 2026-09 for PostgreSQL]

Never a naive local string. `unlock_at` plus `unlock_timezone`. Delivery shifts into a humane local window (09:00–20:00). Receiving "for your 18th birthday" at 03:00 is a bug. `occurred_at` carries `occurred_precision` (`exact|day|month|year`) because a scanned 1974 photo has a year, not a timestamp — without it, imported archives either lie about dates or collapse into the upload date.

### The 2038 rule — the highest-consequence line in this document

`timestamp without time zone` silently discards the offset. This product delivers a message into a recipient's local morning on a date that may be twenty years out, so a dropped offset is a wrong-hour delivery nobody will catch until it happens.

**Every temporal column in this schema is `timestamptz` storing UTC. `TIMESTAMP` is banned outright** — not "discouraged", banned, including on columns like `created_at` where the horizon looks irrelevant today, because the failure is silent and the ban is only enforceable if it has no exceptions to argue about.

`timestamptz` stores an absolute instant, which is necessary but not sufficient: "09:00 on her eighteenth birthday" is a *local* intention. That is why the schema stores UTC **plus a separate intended-timezone column** — the application is the thing interpreting the zone, and the pair is what makes a humane delivery window possible.

**Enforcement is mechanical, in three places** (TASK-009):

1. A migration lint in CI that greps every generated SQL migration for `TIMESTAMP` and fails the build.
2. A schema test that queries `information_schema.columns` for `DATA_TYPE = 'timestamp'` in the application schema and asserts zero rows.
3. A `packages/db` helper (`utcTimestamp()`) that is the only sanctioned way to declare a temporal column, so the correct thing is also the easy thing.

Additionally: never rely on the database session timezone for anything. Connections set `time_zone = '+00:00'` explicitly, and `NOW()` is not used for business timestamps — the application supplies the value so that behaviour is testable.

---

<a id="adr-025"></a>

## ADR-025 — Feature flags in the database, evaluated server-side · [DECIDED]

`feature_flag` table with rollout percentage and segment spec. Needed for the staged rollout (PHASE-10) and for per-AI-feature kill switches at R2. No third-party flag vendor at this scale.

---

## ADR-026 — [DEFERRED] Not decided, and must not be invented per task

| Topic | Why deferred | Blocks |
|---|---|---|
| Heir/legacy death-verification model and KYC vendor | Needs legal counsel per jurisdiction (blueprint A-4) | PHASE-12 |
| Licensed music library and provider | Real commercial commitment (A-5) | R2 editor, R3 marketplace |
| Gift fulfilment partner / logistics vendor | Validate demand with affiliate first (A-6, §27.3) | PHASE-12 |
| Company wind-down policy for stored vaults | Product/legal, not engineering — but publishing it is the strongest trust asset available (A-7) | PHASE-10 marketing copy |
| End-to-end encryption tier | Mutually exclusive with server-side AI, thumbnails, transcode, search (§18.2) | post-R3 |

---

<a id="adr-027"></a>

## ADR-027 — Identifiers are `uuid` UUIDv7-style, canonical strings at every boundary · [DECIDED]

Identifier strategy needs deciding once rather than per table.

**In the database:** a native `uuid` column — 16 bytes, indexable, readable in a query result, with no conversion in either direction. **UUIDv7 rather than v4** matters because randomly-ordered ids cause page splits and index fragmentation on every insert, and this schema inserts constantly (memories, jobs, delivery attempts, audit rows).

### The swap flag is 0, not 1 — verified, and the opposite of the obvious choice

**The property to preserve: ids must sort by creation time.**

**UUIDv7 puts a 48-bit big-endian timestamp in its first six bytes**, so lexical order is
creation order and inserts stay sequential at the right-hand edge of the B-tree. UUIDv4 is
random throughout and fragments every index it appears in. `scripts/verify-db-assumptions.sh`
asserts that generated ids sort by creation time, so a regression to v4 fails CI rather than
degrading insert performance silently months later.

Measured on PostgreSQL 17.46 with two UUIDv7 values one timestamp tick apart:

```
swap 0   A = 018F2C4A1111 7ABC …    B = 018F2C4A2222 7012 …    A < B   ordered by time
swap 1   A = 7ABC 1111 018F2C4A …   B = 7012 2222 018F2C4A …   A > B   ordered by random
```

Run `bash scripts/verify-db-assumptions.sh` to reproduce. If the project ever switches to UUIDv1, this decision inverts.

**At every boundary** — server actions, route handlers, URLs, Zod schemas, `packages/shared` types, log lines — an id is the canonical 36-character string. The binary form never escapes `packages/db`.

**Implementation:** no custom column type and no conversion helper — the column is a native `uuid`. Generation is application-side UUIDv7, which keeps id creation testable and lets the offline outbox mint `client_id` values without a round trip (ADR-013).

**Tokens are not ids.** Capsule unlock tokens (`/c/[token]`) and share tokens are separate high-entropy random values with their own column and unique index — never a primary key, never derivable from one. An id being time-ordered must not make a token guessable.

---

<a id="adr-028"></a>

## ADR-028 — AWS account topology and the delivery blast radius · [DECIDED — new with AWS]

Three accounts under an Organization: **production**, **staging/preview**, **shared services** (CI roles, ECR, log archive). A preview environment must never hold a credential that reaches production data.

**The delivery engine gets its own ECS service, its own task role, and its own deployment pipeline** — this is ADR-003's "workers are separately deployable" requirement expressed in AWS terms. A web deploy, a web rollback, or a bad web task definition must not be able to stop capsule delivery. Concretely: separate ECS services, separate GitHub Actions workflows, and no shared task definition or scaling policy.

**Region:** single region at R1 with automated cross-region backup of Aurora snapshots and the R2 bucket inventory. A multi-region active setup is not justified pre-launch, but the *backups* must already be multi-region, because the promise being sold is measured in decades and the cheapest insurance is taken early.

**What is deliberately not on AWS:** object storage (R2, ADR-007) and synthetic monitoring (Checkly, ADR-020). Both are held outside the account on purpose — one for egress economics, one so the watchdog survives the thing it watches.
