# 02 — Technology Decisions

← [Documentation index](README.md)

Every technology in this stack was chosen against **this product's specific demands** rather
than against a general notion of what a modern web application uses. Those demands are
unusual, and they are what makes several of these choices look different from a default
2026 SaaS build:

| Demand | Where it bites |
|---|---|
| **Heavy media** — 4K video, re-watched by the person who uploaded it | Storage egress economics dominate the cost base |
| **Mobile-first, poor connections** | Bundle size, resumable uploads, offline-first writes |
| **Offline-tolerant writes** | The client is a real participant, not a thin view |
| **A scheduling guarantee measured in decades** | No vendor's scheduler can be the source of truth |
| **The worst realistic failure is a privacy incident, not downtime** | Authorization is architecture, not middleware |
| **India-first market** | Payments, delivery channels, script and emoji handling, festival date rules |

Each section below states the choice, the reason it fits *these* demands, what was rejected,
and — because no stack choice is permanent — **the exit path** if it stops fitting.

---

## 1. Application layer

### 1.1 Next.js 16 App Router · React 19 · TypeScript strict

**Why.** Three specific reasons, in order of weight:

1. **`/c/[token]` can be fully server-rendered so a capsule opens with no client JavaScript.**
   This is the decisive one. A link that must still work in 2046 cannot depend on a client
   framework's runtime behaviour surviving twenty years of browser evolution. Server-rendered
   HTML is the most durable delivery format the web has.
2. **Server components give a fast first paint on mobile** — the constraint that actually
   governs a media product used on cellular.
3. **Server actions remove an entire API layer** for user-initiated mutations: typed end to
   end, CSRF-protected by origin checking, no hand-written client.

**Industry context.** The App Router is the mainstream React server-rendering model in 2026,
which matters for hiring and for library compatibility. TypeScript `strict` plus
`noUncheckedIndexedAccess` is treated as non-negotiable — on a schema this
permission-sensitive, a type error at build time is cheaper than a privacy incident at runtime.

**A standing rule.** This Next.js release has breaking changes from earlier conventions. Every
framework task requires reading the relevant guide in `node_modules/next/dist/docs/` before
writing code, rather than carrying patterns over from memory. That rule is in the project's
conventions because the alternative is subtle, silent breakage.

**Rejected.** Static export (`output: 'export'`) — the mode the inherited marketing repo uses,
and the exact opposite of what this product needs: it forbids server-side authorization,
signed URLs, webhooks and server rendering of the capsule route. Also rejected: a native-first
build. **Reversed on 2026-09-10**: the three guarantees this product rests on — a notification
years later, an upload that survives the app closing, and storage the OS will not evict — are
all platform APIs, so the shared layer would have stopped exactly where the risk starts.

**Exit path.** Feature modules are framework-agnostic below the component layer; server
actions are thin wrappers over service functions. Moving the rendering layer would not
require rewriting the domain.

### 1.2 Monorepo — pnpm workspaces + Turborepo

**Why.** Six workspaces: `apps/api`, `apps/workers`, and `packages/{shared,db,emails,config}`.
Dependencies flow **packages → apps, never the reverse**. The single most important
consequence: `packages/db` is the **one schema source** shared by the web app and the workers,
so the two cannot drift apart on the shape of the data.

`apps/workers` is **separately deployable**, because the delivery engine and the media pipeline
must keep running while a web deploy is rolling out or being rolled back.

Internal packages export TypeScript source directly, so there is no build step between editing
a package and seeing the change in an app. Turborepo's caching makes a second build print
`FULL TURBO` rather than rebuilding.

**Industry context.** pnpm + Turborepo is the standard, disk-efficient monorepo pairing in
2026, with good remote caching. Nx would work; it brings more machinery than a six-workspace
repo needs.

### 1.3 Modular monolith, not microservices

**Why.** The original designer brief proposed **eleven services** (Auth, User & Members,
Events, Memory, Scheduler, Notification, Commerce, Subscription, AI, Moderation, plus an API
gateway). Those are the **right domain boundaries and the wrong deployment topology** for a
pre-launch team.

The resolution: each of those eleven domains becomes an internal module under
`src/features/*`, with its own schema slice and **no cross-module database access**. A module
that needs another domain's data calls that module's read functions. This preserves cheap
extraction later — the boundaries are already drawn — without paying the operational cost of
eleven deployables before there is a single paying user.

Two things *are* separated at the deployment level, because they must be:

- **The web application** (Fargate service)
- **The workers** — and the delivery engine and media pipeline are themselves **two separate
  ECS services with different IAM roles**, for the security reason in §3.4.

**When to extract a real service.** When a measurable boundary demands it. Commerce at
Release 3 is the likeliest first extraction: different scaling profile, different compliance
surface, possibly a different team.

### 1.4 API style — server actions for mutations, route handlers for machine surfaces

The blueprint proposed a GraphQL/REST gateway, which is correct for a native-client
architecture. Since the clients are now native, a versioned REST API at `/api/v1` is required —
but GraphQL is not: it buys nothing for two first-party clients.

| Surface | Mechanism | Why |
|---|---|---|
| User-initiated mutations | **Server actions** | Typed end to end, CSRF-protected by origin checking, no hand-written client |
| Webhooks (Stripe, Razorpay, Resend, Twilio) | **Route handlers** | A real HTTP contract with an external party |
| Upload session / complete, signed-URL minting, push subscribe | **Route handlers** | Called by the background sync layer and by machine clients |
| Anything a future native shell or third party must call | **Route handlers** | Stable, versionable HTTP |

Every boundary validates with a **Zod schema from `packages/shared`**. The client copy is a
convenience; **the server copy is truth.**

All route handlers return a stable envelope — `{ ok: false, error: { code, message } }` with a
machine-stable code — and server actions return a discriminated union rather than throwing for
expected failures, so forms render field-level errors without an error boundary. The error-code
registry is locked by a test: **a code, once shipped, is never renamed or repurposed**, because
those codes travel into logs, support macros and recipients' emails, and renaming one silently
changes what a stored log line from 2029 means.

---

## 2. Clients — native apps, and the web surfaces

### 2.1 WorkManager / URLSession background sync layer + Room / GRDB outbox

**Why.** WorkManager (Android) and background `URLSession` (iOS) are owned by the operating system, so a transfer survives the app being killed or the user switching away. The queue is a table on the device, drained by the OS scheduler rather than by the app, and the upload resumes from the last good part
and integrates with the App Router. The **sync layer is hand-written**, deliberately — the
outbox is core product behaviour, not boilerplate, and a generic library would get the
important details wrong.

The important details:

- **Writes always go through the outbox.** Never a naive network-first write.
- **Idempotency keys (`client_id`) on every mutation**, so a retry after an ambiguous failure
  cannot create a duplicate memory.
- **`StorageManager.persist()` is requested**, with a visible warning to the user if the
  browser denies it — because a silently evictable local store is a data-loss risk the user
  deserves to know about.
- **Sealing a capsule is blocked offline.** A promise that cannot be confirmed server-side
  must not be displayed as sealed.

### 2.2 Tailwind v4 + Radix primitives + Motion

| Choice | Why |
|---|---|
| **Tailwind v4** with CSS custom properties for theming | Small bundle, which matters on 3G. Design tokens live as CSS variables so light/dark is a token swap, not a second stylesheet. |
| **Radix UI** (headless) | Accessibility for free, and non-negotiable when grandparents are core users. No heavyweight component framework. |
| **Motion** for UI, native **View Transitions** for navigation | Keeps the craft at a fraction of the cost. |

**A specific theming rule, learned from a real bug in the inherited repo.** The complete light
palette is defined on bare `:root`; only *changed* tokens are redefined under
`@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and again
under `:root[data-theme="dark"]` so an explicit toggle wins in both directions. **Never give a
colour its only definition inside a media query** — the inherited repo's dark mode collapses
the primary brand colour to white and loses the brand entirely. That class of bug must not
recur.

**Rejected for the app surface:** GSAP, Lenis scroll hijacking, a custom cursor, Three.js /
WebGL fluid simulation. Together those are several hundred kilobytes and a measurable battery
cost, for zero in-app value — and they are actively hostile on touch and to assistive
technology. They remain appropriate on a marketing page; they are harmful inside a daily-use
mobile app.

**Accessibility floor, binding:** WCAG 2.2 AA. Contrast 4.5:1 for text, 3:1 for UI. Touch
targets ≥ 44×44px. A visible focus ring. A `prefers-reduced-motion` variant for every
animation. Never colour alone to convey status. One concrete consequence: the brand coral
`#FF6B5E` fails 4.5:1 on white and **must never be used for small text** — it is valid for
large text, icons and fills only.

### 2.3 Client data — TanStack Query + Room / GRDB + Zustand

TanStack Query's cache and mutation model maps directly onto
optimistic-write → offline → sync. Room / GRDB (the on-device store) is the durable local store for the outbox
and cached memories. Zustand handles UI state only. Three libraries, three clearly separated
jobs.

---

## 3. Data and infrastructure

### 3.1 The stack change, stated plainly

The blueprint specified PostgreSQL on Neon, with Vercel and Fly.io for hosting. The system
being built is **PostgreSQL on Amazon Aurora, hosted entirely on AWS.**

| Layer | Blueprint said | Now |
|---|---|---|
| Database | PostgreSQL (Neon / Supabase) | **PostgreSQL 17 — Aurora PostgreSQL Serverless v2** |
| Row-level security | Postgres RLS as a second line of defence | **Restored 2026-09-29.** RLS beneath the chokepoint, with the four compensating controls kept |
| Search | Postgres FTS → pgvector | **a tsvector GIN index (R1) → OpenSearch Serverless with k-NN (R2)** |
| Web hosting | Vercel | **AWS ECS Fargate + ALB + CloudFront** |
| Worker hosting | Fly.io | **AWS ECS Fargate** |
| Preview environments | Neon branch per PR | **Per-PR schema on a shared Aurora preview cluster** |
| Object storage | Cloudflare R2 | **Unchanged — still R2** |

**Why this is documented so prominently rather than quietly absorbed.** The change carries
three real costs, and a future engineer encountering the unusual amount of machinery built to
compensate needs to know it is deliberate:

1. **No row-level security.** PostgreSQL RLS would have been an independent second layer
   beneath the application, so that a single application bug could not leak one family's
   memories to another. Both layers are in place, and the four controls in ADR-009 sit alongside them rather than instead of them. The application's authorization layer is
   now the *only* thing between tenants. That is a material reduction in safety for a product
   where a permission bug is a privacy incident rather than a defect. It is paid for with
   **four compensating controls**, all mandatory — see
   [05 §3](05-SECURITY-AND-COMPLIANCE.md).
2. **`timestamp without time zone` drops the offset** — fatal inside the delivery horizon this product
   sells. Mitigated by a mandatory `timestamptz` rule with three independent CI enforcement
   points — see [04 Level 3](04-DATABASE-ARCHITECTURE.md).
3. **Weaker search.** No trigram typo tolerance, no in-database vector search. Release 2
   semantic search now needs a separate OpenSearch service, which reintroduces index drift and
   moves searchable text outside a single trust boundary. Both are mitigated rather than
   avoided — see §3.5.

Aurora **PostgreSQL** would have delivered the AWS consolidation with zero architectural loss.
The stack change from the blueprint was made at the product-owner level. Everything
below is engineered to make that choice safe.

### 3.2 PostgreSQL 17 on Aurora PostgreSQL Serverless v2, with Drizzle ORM

**Why Aurora Serverless v2, specifically.** Multi-AZ, in private VPC subnets, scaling capacity
without a maintenance window. A lifetime vault does not run on a single availability zone.

**Why Drizzle rather than Prisma.** SQL-first, fully typed, no runtime engine binary. On a
schema this permission-sensitive, **seeing the actual SQL is a feature** — and that argument
is *stronger* now that the database enforces none of the permissions itself. Migrations are
plain, reviewable SQL.

**Rejected.** RDS single-AZ (unacceptable durability for this promise). PlanetScale —
good branching DX, but another vendor to depend on for a multi-decade product, and
it sits outside the AWS account boundary this decision exists to consolidate into. Firebase /
Firestore — tempting for offline sync, but document modelling fits this permission model badly,
costs escalate unpredictably at media scale, and the vendor lock-in is a poor fit for a
multi-decade promise.

**The engine forces eight schema rules on us.** These are not style preferences; each exists
each is a decision taken once and enforced, and each has
bitten projects that discovered it late. They are documented in full in
[04 Level 3](04-DATABASE-ARCHITECTURE.md).

### 3.3 The job table is the scheduler — and this is the most important decision in the system

**A capsule due in 2046 must outlive every vendor in the stack.**

The `scheduled_jobs` table **is** the source of truth for the schedule. A worker polls
it with `FOR UPDATE SKIP LOCKED` (supported since PostgreSQL 17.1). EventBridge or a cron may
*execute* the tick; **they are never the record.**

Sealing a capsule writes the capsule state and its job row **in one transaction**, so there is
no window in which a capsule is sealed but unscheduled. PostgreSQL gives us that transaction.

**Rejected: a dedicated queue service as the source of truth.** SQS, Inngest, Trigger.dev and
their peers are all acceptable as *executors* and entirely unacceptable as the system of record
for a delivery promised in 2046. The question is not whether the vendor is good; it is whether
any vendor's product roadmap should be able to break a promise this product sold to a parent
about their child's eighteenth birthday.

Full internals — the claim query, the isolation level, the index, the watchdog, the integrity
sweep: [03 §5](03-SYSTEM-DESIGN.md) and [04 Level 6](04-DATABASE-ARCHITECTURE.md).

### 3.4 Cloudflare R2 for media — and why it stays outside AWS

**Zero egress fees.** This is decisive, not marginal. In a product where users repeatedly
re-watch their own 4K video, **egress on S3 alone can exceed the subscription price** for an
engaged user. R2 is S3-compatible, so migration remains possible, and R2 ↔ AWS transfer is
free in both directions.

Key layout: `vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}` — which makes per-vault
deletion, accounting and export a **prefix operation** rather than a table scan.

**No object is ever publicly readable.** Access is always a 5-minute signed URL (60 minutes for
a download), minted only after an authorization check.

**Media processing runs in containerised workers on ECS Fargate** (FFmpeg + sharp). Video
transcode is long-running and CPU-heavy — the wrong shape for serverless functions. More
importantly, **FFmpeg parsing untrusted media is a known remote-code-execution surface and is
treated as hostile**:

- The transcode task's **IAM role grants object storage access and nothing else** — there is no
  Secrets Manager entry for the database, so there is no database credential to steal.
- It runs in a **private subnet with no NAT gateway**. There is no route to the open internet.
- Security-group egress is default-deny with explicit allows.
- Media arrives and leaves **by object key on the job row**. The worker never learns a vault
  id, a user, or a session.

This is why the delivery engine and the media pipeline are **separate ECS services**: delivery
needs database and email credentials, media must never have them. Separating the services is
what makes that enforceable rather than aspirational.

### 3.5 Search — a tsvector GIN index now, OpenSearch at Release 2

**Release 1.** A `search_text` column maintained by the application (title, caption, people,
place, notes concatenated) with an PostgreSQL `FULLTEXT` index, queried in natural-language mode
and in boolean mode for quoted phrases. Per-user corpora are thousands of documents, not
millions. This is adequate for launch and adds no service.

**What is lost, stated plainly: there is no typo tolerance in Release 1.** A user searching
"Divali" will not find "Diwali". `SOUNDEX` is not a substitute — it is English-phonetic and
actively wrong for the Indian names this product is full of. The honest mitigations are: a
generous `search_text` that includes alternate spellings the user typed themselves;
client-side prefix matching over the cached local corpus for people and album names; and **not
claiming typo tolerance in the UI copy until Release 2 ships it.**

**Release 2.** Amazon OpenSearch Serverless, using k-NN vector support for semantic search and
its analyzers for typo tolerance, hybrid-fused with keyword results. Two consequences the
original design had explicitly avoided, now reintroduced and mitigated:

| Risk | Mitigation |
|---|---|
| **Index drift** | Indexing becomes a job kind in the same `scheduled_jobs` table — so it is durable, retryable and replayable — plus a nightly reconciliation sweep comparing row counts and checksums per vault and re-enqueuing divergences |
| **Content leaving the single trust boundary** | Index **only** titles, captions, tags, people names and places. Never media bytes. **Never transcripts of private capsules before delivery.** The domain runs inside the VPC with no public endpoint, encrypted at rest with a customer-managed KMS key, and a vault deletion purges its OpenSearch documents in the same job as the primary record |

**Rejected for Release 1:** Elasticsearch as a launch dependency. Unjustified at this corpus
size, and it would put sensitive content in a second system before the first one is proven.

### 3.6 Redis deferred

Sessions are database rows. The queue is a table. Rate limiting runs at **CloudFront + AWS WAF
rate-based rules** at the edge, plus an application-level counter in the database at Release 1 volumes.

ElastiCache gets introduced when **measured** load requires it — not as launch complexity. An
unnecessary cache is an extra failure mode, an extra bill, and an extra source of stale data.

---

## 4. Hosting and operations

### 4.1 AWS end to end

| Component | Service | Reasoning |
|---|---|---|
| Web | **ECS Fargate + ALB, CloudFront in front** | Next.js needs a server runtime. Fargate keeps the deploy primitive identical to workers, and avoids Lambda cold starts on `/c/[token]` — the capsule-unlock path, which is the worst possible place in the product to be slow |
| Workers | **ECS Fargate, two services** | Delivery engine and media pipeline, separated by IAM task role (§3.4) |
| Database | **Aurora PostgreSQL Serverless v2**, multi-AZ, private subnets | §3.2 |
| Object storage | **Cloudflare R2** | §3.4 — deliberately not on AWS |
| CDN / WAF | **CloudFront + AWS WAF** | Rate-based rules at the edge before requests reach the origin |
| Secrets | **AWS Secrets Manager**, rotated | No secret in an environment variable in a task definition |
| IaC | **AWS CDK in TypeScript**, in an `infra/` workspace | Same language and same monorepo as the application, so infrastructure is reviewed like application code |
| CI → AWS | **GitHub Actions with OIDC role assumption** | No long-lived AWS access keys in GitHub, ever |

**The alternative worth knowing about.** Next.js via **OpenNext on Lambda + CloudFront** is
materially cheaper at low traffic and is the right answer if the app sits idle most of the day.
It was not chosen because cold starts land on the capsule-unlock path, and because two deploy
models cost more in operator attention than the savings are worth pre-launch. **This should be
revisited once idle cost is a measured number rather than a guess.**

**Account topology.** Three accounts under an AWS Organization: **production**,
**staging/preview**, and **shared services** (CI roles, container registry, log archive). A
preview environment must never hold a credential that reaches production data.

**Blast radius.** The delivery engine gets its own ECS service, its own task role, and its own
deployment pipeline. A web deploy, a web rollback, or a bad web task definition **must not be
able to stop capsule delivery.** Concretely: separate ECS services, separate GitHub Actions
workflows, no shared task definition and no shared scaling policy.

**Region strategy.** Single region at Release 1, with **automated cross-region backup** of
Aurora snapshots and the R2 bucket inventory. A multi-region active setup is not justified
pre-launch — but the *backups* must already be multi-region, because the promise being sold is
measured in decades and the cheapest insurance is the insurance taken early.

### 4.2 The sharpest cost of moving to AWS: preview environments

Neon's branch-per-PR gave every pull request an isolated database with real data in seconds.
**Aurora has no equivalent, and this is the clearest DX regression in the move.**

The plan: a **shared Aurora preview cluster with one schema per pull request**, created and
dropped by CI. Fast, cheap, and isolated enough for the tests CI runs. Aurora **fast cloning**
is reserved for the rare case that genuinely needs production-shaped data volume — it takes
minutes rather than seconds and costs real money, so it is opt-in per PR via a label rather
than automatic.

**The consequence to accept:** preview environments are *seeded*, not *branched*. Seed quality
therefore matters more than it did, which is why the conventions require real-feel fixtures —
real names, realistic dates, genuine copy, never lorem ipsum.

### 4.3 Observability

| Tool | Role |
|---|---|
| **Sentry** | Errors, client and server |
| **CloudWatch Logs + Metrics** | Infrastructure, with a log group per ECS service |
| **Checkly** | Synthetic checks, kept deliberately **outside AWS** so an AWS regional event cannot take down the thing that tells you AWS is down |
| **A bespoke delivery monitor** | **Non-negotiable.** A CloudWatch alarm on a custom metric emitted by the hourly watchdog job, routed through SNS to PagerDuty, that fires if **any capsule passes its unlock time without a successful delivery attempt** |

> That last alert page is the most important one in the company, and it must never be routine.
> The moment it becomes noise, the guarantee is gone.

### 4.4 Analytics — PostHog, first-party

No third-party trackers inside the authenticated app. No PII and **never media content** in
event payloads. Two ratios are instrumented from day one, because they are the two numbers that
decide whether the business model works:

1. **Storage cost per paying user.**
2. **Conversion on the capsule-horizon paywall specifically** — measured separately from the
   storage paywall, because horizon is the primary intended gate and that single funnel step
   decides whether the pricing model holds.

### 4.5 Testing

| Layer | Tool | Rule |
|---|---|---|
| Unit / integration | **Vitest** | Business rules and authorization get direct unit tests |
| Component | Vitest + jsdom + Testing Library | Assert on roles and accessible names, never on class names |
| API | Vitest against route handlers | Every documented error code has a test |
| **Permissions** | **Vitest against the authz layer + real PostgreSQL** (Testcontainers), plus RLS assertions | **Every permission-matrix cell has a positive *and* a negative test** |
| E2E | **Playwright** | The critical path, **plus offline and install flows** |
| Accessibility | axe in Playwright | Zero serious or critical violations on every shipped screen |

**The permission suite is load-bearing.** With row-level security gone, it is the only
automated proof that the system isolates tenants. It runs on every pull request, a failing cell
fails the build, and it is **not permitted to be skipped, quarantined, or marked flaky.**

`pgTAP` disappeared with PostgreSQL, so the matrix moved from SQL-level assertions to
service-layer tests. That is a weaker guarantee — it tests the layer that could be wrong rather
than a layer beneath it. Two things partially close the gap: a **negative** test per cell
executed against seeded cross-tenant data, so the absence of a leak is asserted explicitly
rather than assumed; and a **raw-SQL escape-hatch test** that deliberately issues an unscoped
query to prove the post-query guard actually fires.

---

## 5. Integrations

| Concern | Choice | Reasoning |
|---|---|---|
| **Auth** | **Better Auth** — email OTP, passkeys (WebAuthn), Google/Apple OAuth | Self-hosted, so **identity is not rented from a vendor for a product meant to last decades.** No passwords means nothing to phish, leak, reuse or forget on a lifetime vault. WebAuthn also supplies the promised biometric app lock. Sessions are **opaque server-side rows, not stateless JWTs**, so revocation is instant. Chosen over Auth.js for a cleaner passkey story. |
| **Payments** | **Stripe + Razorpay** | An India-first market means ₹ pricing and UPI, so **Razorpay is not optional**; Stripe covers the rest of the world. Hosted checkout keeps PCI scope near zero. Webhooks verified by signature with replay protection — a timestamp window plus event-id deduplication. |
| **Email** | **Resend primary, Amazon SES as a standing fallback** | Deliverability matters more here than anywhere else in the product. **Two independent senders is the difference between a promise kept and a promise broken.** The capsule delivery email must render in clients that will not exist for fifteen years: table layout, inline CSS, a plain-text alternative, no JavaScript, no web fonts. |
| **Push** | **APNs and FCM**, self-hosted | No vendor needed. Works on all modern browsers including installed iOS PWAs. |
| **SMS / WhatsApp** (R2) | **Twilio** | The only realistic route to WhatsApp Business plus SMS in one integration. |
| **AI** (R2) | **Claude** for captions, narrative and curation copy; a Whisper-class model for transcripts; an embeddings model for semantic search | Claude for anything touching emotional text — the quality difference is visible in exactly this use case. **Every provider sits behind an internal interface** so any single model can be swapped without touching feature code. |
| **Moderation** | CSAM hash-matching on upload from day one; classifier scores feeding the flag queue | A non-negotiable legal duty for any service hosting user media. |
| **Feature flags** | A database table with rollout percentage and segment spec, evaluated server-side | Needed for the staged launch rollout and for per-AI-feature kill switches at Release 2. No third-party flag vendor is justified at this scale. |

### 5.1 No AI in Release 1 — deliberately

Every AI feature needs an archive to work on. **AI over an empty vault is worthless.** The
features users *perceive* as intelligent — On This Day, event grouping, auto-titles — are
deterministic date logic and ship without a model at all.

AI also adds per-user variable cost before there is revenue to absorb it. Release 2 is the
right time, once archives have density and there is a paying base.

---

## 6. Decisions deliberately deferred

These are recorded as *not decided* so that no individual task invents an answer for them
unilaterally:

| Topic | Why deferred | What it blocks |
|---|---|---|
| Heir / legacy death-verification model and KYC vendor | Needs legal counsel per jurisdiction | Legacy Vault (R3) |
| Licensed music library and provider | A real commercial commitment | R2 recap editor, R3 marketplace |
| Gift fulfilment partner and logistics vendor | Validate demand with affiliate links first | Commerce (R3) |
| Company wind-down policy for stored vaults | Product and legal, not engineering — **but publishing it is the strongest trust asset available** | Launch marketing copy |
| End-to-end encryption tier | Mutually exclusive with server-side AI, thumbnails, transcode and search | Post-R3 |

---

## 7. Summary — the six decisions that matter most

If only six of these are remembered, these are the six, because each one is expensive or
impossible to reverse later:

1. **The database owns the schedule.** No vendor's scheduler is the source of truth for a
   promise measured in decades.
2. **`timestamptz`, never naive `timestamp`.** A naive timestamp drops the offset, and this product
   sells 2046. Enforced by CI, with no exceptions permitted to argue about.
3. **A single authorization chokepoint, with four compensating controls.** There is no
   row-level security beneath it, so it is the whole defence.
4. **Zero-egress object storage.** In a re-watched-media product, egress economics decide
   whether the unit economics work at all.
5. **The capsule page is server-rendered and works with JavaScript disabled.** A 2046
   recipient must not be blocked by a 2026 framework assumption.
6. **Authorization is built in PHASE-02, before any content exists.** Retrofitting it later is
   precisely how privacy incidents happen.

---

← [01 — Product & Features](01-PRODUCT-AND-FEATURES.md) · Next: [03 — System Design](03-SYSTEM-DESIGN.md)
