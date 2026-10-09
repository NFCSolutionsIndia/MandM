/* Hand-authored top-level documents. */

exports.projectPlan = ({ ALL, totalTasks }) => `# 00 — Project Plan · Moments & Memories PWA

> **Engineering execution blueprint.** The product source of truth is [MM_PWA_BLUEPRINT.md](../../MM_PWA_BLUEPRINT.md). This directory turns it into an ordered, dependency-aware, implementable plan.

## 1. Starting position — read this first

**There is no codebase.** The repository currently contains:

- \`MM_PWA_BLUEPRINT.md\` — the product/system blueprint
- \`src/\` — a **static marketing site** (Next.js \`output: 'export'\` → GitHub Pages) that is *not* the application and is *not* being converted. It has no auth, no database, no API routes, no service worker, and its only form calls \`preventDefault()\`. Treat it as a **visual reference for the marketing surface only**.
- This \`Docs/development/\` tree

Therefore:

- No API, database, authentication, component, or backend service exists.
- **Nothing in this plan starts as \`completed\`.** The blueprint describes what the system should become.
- Every task below builds something for the first time.

## 2. What we are building

An installable, mobile-first **PWA** where people capture memories today and have them delivered at a chosen future moment — with an occasions engine that knows when those moments are.

The differentiating loop, and the thing every early phase serves:

${'```'}
capture a moment  →  seal it for a person and a date  →  it reliably arrives  →  they open it  →  they reply
${'```'}

Blueprint §37 is the authoritative product summary. Blueprint §27.3 defines three releases; **this plan decomposes Release 1 to task level** and documents Releases 2–3 to module level (see §6 below for why).

## 3. Phase map

| Phase | Name | Release | Effort | Depends on |
|---|---|---|---|---|
${ALL.phases.map(p => `| [${p.id}](${p.file}) | ${p.name} | ${p.release} | ${p.effort} | ${p.deps && p.deps.length ? p.deps.join(', ') : '—'} |`).join('\n')}

**Totals:** ${ALL.phases.length} phases · ${ALL.modules.length} modules · ${ALL.sprints.length} sprints · ${ALL.epics.length} epics · **${totalTasks} tasks**

## 4. Sequencing logic

${'```'}
PHASE-01  Foundation            monorepo, tokens, CI, DB connection
    ↓
PHASE-02  Identity              auth + authz chokepoint + onboarding
    ↓                            (authz is built BEFORE any content exists — retrofitting
    ↓                             authorization is how privacy incidents happen)
PHASE-03  Core Domain           Member, Event, Memory, Timeline
    ↓
PHASE-04  Media Pipeline        capture, resumable upload, transcode, signed delivery
    ↓                            (a capsule cannot be sealed before media is durable)
PHASE-05  Capsules & Delivery   THE DIFFERENTIATOR — seal, scheduler, cascade, unlock page
    ↓
PHASE-06  PWA & Offline         installability, offline reads, offline capture, sync
    ↓
PHASE-07  Notifications         Web Push + email, trigger matrix, preferences
    ↓
PHASE-08  Trust, Billing, Admin privacy centre, moderation, Stripe/Razorpay, operator console
    ↓
PHASE-09  Hardening             permission matrix tests, RLS, pen test, a11y, restore drill
    ↓
PHASE-10  Launch                marketing site with corrected claims, staged rollout
${'```'}

Two ordering rules that must not be violated:

1. **PHASE-02 before any content phase.** \`lib/authz\` is the single authorization chokepoint (blueprint §11.1, §20.2). Every read and write resolves through it. Building content first and adding authorization later produces exactly the cross-tenant leak this product cannot survive.
2. **PHASE-04 before PHASE-05.** Sealing a capsule is a promise. A promise over media that might not have uploaded is not a promise.

## 5. Effort summary (Release 1)

| Phase | Est. effort |
|---|---|
${ALL.phases.filter(p => p.release === 'Release 1').map(p => `| ${p.id} ${p.name} | ${p.effort} |`).join('\n')}
| **Release 1 total** | **~26–30 weeks** for a team of 2–3 engineers + 1 designer |

Phases 03/04 can partially overlap once the \`MediaAsset\` contract is frozen; PHASE-06 can start during PHASE-05. Compressed realistic target: **~22–24 weeks**.

## 6. Why Releases 2 and 3 are not decomposed to task level yet

Deliberate, and recorded in [REQUIREMENT_GAP_ANALYSIS.md](REQUIREMENT_GAP_ANALYSIS.md):

- Blueprint §27.3 stages commerce behind validation — the recommendation is to prove gift intent with affiliate/dropship links before building inventory, fulfilment, and returns. Decomposing a catalog/orders/logistics system now would be planning work thrown away if that validation fails.
- Legacy Vault (§29.25) is **blocked on legal counsel per jurisdiction** (open question A-4). Its unlock protocol, KYC provider, and dispute path cannot be specified as tasks before that.
- Music licensing (A-5) blocks the R2 editor's music library.
- Task decomposition ages badly. R2 tasks written today would be rewritten after R1 ships and real usage data exists.

Phases 11–12 therefore document objective, modules, and sprint/epic outlines, with task decomposition as an explicit gate at the end of Release 1.

## 7. How to execute

${'```'}
Open PROJECT_PROGRESS.md  →  find "Next Task"
    ↓
Read the TASK doc, then its Epic → Sprint → Module → Phase, then the cited blueprint sections
    ↓
Implement ONLY that task's scope
    ↓
Write the tests named in §16
    ↓
Verify every §17 acceptance criterion explicitly
    ↓
Set §22 to completed · update PROJECT_PROGRESS.md
    ↓
Next task
${'```'}

## 8. Non-negotiables carried from the blueprint

These are not preferences. Violating any of them breaks the product's core promise.

1. **A sealed capsule is delivered.** The scheduler is database-owned (§18.4). No third-party scheduler is the source of truth for a date decades away. A missed unlock pages a human and is treated as Sev-0.
2. **A sealed capsule is never cancelled for non-payment**, and memories are never deleted for non-payment (§17.2 item 4, Appendix C-18).
3. **\`/c/[token]\` is server-rendered and works with JavaScript disabled** (§29.24, §37). A 2046 recipient must not be blocked by a 2026 framework assumption.
4. **The local copy is written before the upload starts** (§12.1 step 3). A memory is never at risk while an upload is pending.
5. **No object in the media bucket is ever publicly readable.** Signed URLs, 5-minute TTL, minted after authorization (§12.5).
6. **Every read resolves through \`lib/authz\`** to a vault role, an active share, or a delivered capsule recipient. There is no fourth path (§11.1).
7. **Originals are never modified, and there is no quality tiering** (§17.2 item 2).
8. **No memory-count limit exists.** Free tier is limited by storage (10 GB) and capsule horizon (3 pending, 12 months) only (§17.2, Appendix C-6/C-8).
9. **Marketing claims must match what is built** (Appendix B). No "unlimited", no fabricated testimonials, no implied end-to-end encryption.
10. **Face recognition is not built** in any release covered here, pending legal review (§11.6).
`;

exports.adr = `# Architecture Decisions

Every decision needed to implement this plan, with reasoning. Where the blueprint specifies a technology, that is cited. Where it does not, a decision is **recommended here and then applied consistently across every task** — flagged so it can be challenged in one place rather than argued per task.

Status legend: **[BLUEPRINT]** specified in MM_PWA_BLUEPRINT.md · **[DECIDED]** decided here, consistent across the plan · **[DEFERRED]** deliberately not decided yet.

---

## ADR-001 — Single installable PWA, not native apps · [BLUEPRINT §35.1, Appendix C-2]

One Next.js codebase serves the marketing site, the app, and the admin panel. Store shells are optional later (§7.3 F10).

**Consequences the plan must handle** (§29.0): no haptics on iOS (Vibration API is Chromium-only) · no SMS auto-read on iOS (WebOTP is Chromium-only) · **no Contact Picker on iOS/Safari**, so member import needs four co-equal paths including vCard/CSV upload and self-service invite links · Web Push on iOS requires an *installed* PWA, making install promotion a functional requirement and email the guaranteed fallback for every critical notification.

**Upside:** web checkout instead of store billing — no 15–30% commission, full pricing control, immediate plan changes.

---

## ADR-002 — Next.js 16 App Router, React 19, TypeScript strict · [BLUEPRINT §18.1]

Server components for fast mobile first paint; server actions remove an API layer for most mutations; and decisively, \`/c/[token]\` can be fully server-rendered so a capsule opens with **no client JavaScript**.

**Mandatory for every framework task:** this Next.js release has breaking changes from earlier conventions. **Read the relevant guide in \`node_modules/next/dist/docs/\` before writing code** (project \`AGENTS.md\`). Do not carry over patterns from memory.

**Note:** the existing \`src/\` uses \`output: 'export'\` (static). The application requires the opposite — a server runtime. The new app does **not** inherit that config.

---

## ADR-003 — Monorepo: \`apps/web\` + \`apps/workers\` + \`packages/*\` · [BLUEPRINT §19, §35.2] · [DECIDED: pnpm + Turborepo]

The blueprint specifies the layout; pnpm workspaces + Turborepo is the decision here (fast, disk-efficient, standard, good remote caching).

\`apps/workers\` is **separately deployable** because the delivery engine and media pipeline must keep running when a web deploy is rolling or rolled back.

---

## ADR-004 — Modular monolith, not microservices · [BLUEPRINT §35.2, Appendix C-12]

The designer brief proposed eleven services. Those are the right *domain boundaries* and the wrong *deployment topology* for a pre-launch team. Domains become internal modules under \`src/features/*\` with their own schema slice and **no cross-module database access**, preserving cheap extraction later. Commerce at R3 is the likeliest first extraction.

---

## ADR-005 — Postgres + Drizzle · [BLUEPRINT §18.1]

Neon (serverless, branch-per-PR). Drizzle for SQL-first, fully typed access with no runtime engine binary — and on a schema this permission-sensitive, seeing the actual SQL is a feature.

\`packages/db\` is the **single schema source** shared by web and workers. No drift.

---

## ADR-006 — Postgres-backed job table is the durable scheduler · [BLUEPRINT §18.4, §35.5]

**The most important architectural decision in the system.** A capsule due in 2046 must outlive every vendor in the stack. \`ScheduledJob\` in Postgres is the source of truth; a worker polls it with \`FOR UPDATE SKIP LOCKED\`. Inngest/Trigger.dev/cron may *execute*; they are never the record.

Sealing writes the capsule state and the job row **in one transaction** — there is no window where a capsule is sealed but unscheduled.

---

## ADR-007 — Cloudflare R2 for media, private buckets only · [BLUEPRINT §12.5, §18.1]

**Zero egress fees** — decisive when users re-watch their own 4K video; on S3, egress alone can exceed the subscription. S3-compatible, so migration stays possible.

Key layout \`vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}\` makes per-vault deletion, accounting, and export a prefix operation. **No object is ever publicly readable**; access is via 5-minute signed URLs minted after an authz check.

---

## ADR-008 — Better Auth: email OTP + passkeys + OAuth · [BLUEPRINT §18.1] · [DECIDED: Better Auth over Auth.js]

Self-hosted so identity is not rented for a product meant to last decades. **No passwords** — nothing to phish, leak, reuse, or forget on a lifetime vault. WebAuthn also supplies the promised biometric app lock.

Sessions are **opaque server-side rows, not stateless JWTs**, so revocation is instant (§20.1).

---

## ADR-009 — \`lib/authz\` is the single authorization chokepoint · [BLUEPRINT §11.1, §20.2]

Every read and write resolves the actor to a **vault role**, an **active share**, or a **delivered capsule recipient**. There is no fourth path; nothing is readable by knowing an id.

- Deny by default. Every query scoped by \`vault_id\` derived from the **session**, never from client input.
- Client-supplied ids are untrusted filters, never authorization.
- Postgres **RLS as a second line of defence**, so an application bug alone cannot leak cross-tenant data.
- The §11.2 permission matrix is encoded as an executable table with **one test per cell**; a failing cell fails CI.

**This is built in PHASE-02, before any content exists.**

---

## ADR-010 — Search: Postgres FTS now, pgvector at R2 · [BLUEPRINT §13.3, Appendix C-13]

\`tsvector\` generated column + GIN + \`pg_trgm\` for typo tolerance. Per-user corpora are thousands of documents, not millions. A separate search service is rejected: it adds an index-drift bug class and moves sensitive content outside one trust boundary. pgvector + HNSW for semantic search at R2, hybrid-fused with keyword results.

---

## ADR-011 — Redis deferred · [BLUEPRINT §35.3, Appendix C-13]

Sessions are rows; the queue is a table. Rate limiting runs at the Cloudflare edge plus an application-level Postgres counter for the R1 volume. Introduce Redis when measured load requires it, not as launch complexity.

---

## ADR-012 — Media processing in containerised workers on Fly.io · [BLUEPRINT §18.1]

FFmpeg + sharp. Video transcode is long-running and CPU-heavy — the wrong shape for serverless. Containers run with **no database credentials and no network egress beyond storage**: FFmpeg parsing untrusted media is a known RCE surface and is treated as hostile.

---

## ADR-013 — Offline: Serwist service worker + Dexie outbox · [BLUEPRINT §9.4, §18.1]

Hand-written sync layer (it is core product behaviour, not boilerplate). Writes **always** go through the outbox — never a naive network-first. Idempotency keys (\`client_id\`) on every mutation. \`StorageManager.persist()\` requested, with a visible warning if denied.

**Sealing a capsule is deliberately blocked offline**: a promise that cannot be confirmed server-side must not be shown as sealed.

---

## ADR-014 — Design system: Tailwind v4 + Radix + Motion · [BLUEPRINT §26]

Tokens from §26.3–26.5 as CSS custom properties. **Complete light palette on bare \`:root\`; only changed tokens redefined under \`@media (prefers-color-scheme: dark)\` guarded as \`:root:not([data-theme="light"])\`, and again under \`:root[data-theme="dark"]\`.** Never give a colour its only definition inside a media query — the existing repo's dark mode collapses \`--primary\` to white and loses the brand entirely; that bug must not recur.

Radix for accessibility (grandparents are core users). **Rejected for the app:** GSAP, Lenis scroll hijacking, custom cursor, Three.js/WebGL — hundreds of KB and real battery cost for zero in-app value, and actively hostile on touch and to assistive tech.

---

## ADR-015 — Payments: Stripe + Razorpay · [BLUEPRINT §35.4, Appendix C-7]

India-first market (₹ pricing, UPI, COD) means Razorpay is not optional; Stripe covers the rest. Hosted checkout keeps PCI scope near zero. Webhooks verified by signature with replay protection (timestamp window + event-id dedupe).

**Entitlements are evaluated at seal time and never re-applied retroactively** — a downgrade cannot invalidate an existing promise (§10 \`Subscription\`).

---

## ADR-016 — Email: Resend primary, SES standing fallback · [BLUEPRINT §18.1]

Deliverability matters more here than anywhere else in the product. Two independent senders is the difference between a promise kept and a promise broken. The capsule delivery email must render in clients that will not exist for 15 years: **table layout, inline CSS, plain-text alternative, no JavaScript, no web fonts**.

---

## ADR-017 — No AI in Release 1 · [BLUEPRINT §15.2]

Deliberate. Every AI feature needs an archive to work on; AI over an empty vault is worthless. The features users *perceive* as intelligent — On This Day, event grouping, auto-titles — are deterministic date logic and ship without a model. AI also adds per-user variable cost before there is revenue to absorb it.

---

## ADR-018 — Testing: Vitest + Playwright + SQL-level tests · [BLUEPRINT §18.1] · [DECIDED]

Vitest (unit/integration, jsdom for components) · Playwright (E2E **including offline and install flows**) · SQL/pgTAP-style assertions for RLS and permission-matrix cells. Testing is embedded per feature; there is no generic "testing task".

---

## ADR-019 — Hosting: Vercel (web) + Fly.io (workers) · [BLUEPRINT §18.1]

Vercel's edge and image handling suit the app; long-running work belongs on real machines. Neon branch per PR gives preview environments with isolated data.

---

## ADR-020 — Observability: Sentry + Axiom + Checkly + a bespoke delivery monitor · [BLUEPRINT §18.1]

The bespoke piece is non-negotiable: **an alert that fires if any capsule passes \`unlock_at\` without a successful delivery attempt.** That alert page is the most important one in the company, and it must never be routine.

---

## ADR-021 — Analytics: PostHog, first-party · [BLUEPRINT §18.1]

No third-party trackers inside the authenticated app. No PII and **never media content** in event payloads. Instrument two ratios from day one: **storage cost per paying user** and **conversion on the capsule-horizon paywall specifically** (§17.2).

---

## ADR-022 — API style: server actions for mutations, route handlers for machine surfaces · [DECIDED]

The blueprint says "GraphQL/REST gateway" for a native-client architecture; with a same-origin PWA that indirection buys nothing.

- **Server actions** for user-initiated mutations — typed end-to-end, CSRF-protected by origin checking, no hand-written client.
- **Route handlers** (\`/api/*\`) only where a real HTTP contract is needed: webhooks (Stripe, Razorpay, Resend, Twilio), upload session/complete, signed-URL minting, push subscribe, and anything a future native shell or third party must call.
- Every boundary validates with a **Zod schema from \`packages/shared\`**; the client copy is convenience, the server copy is truth.

---

## ADR-023 — Error envelope and result type · [DECIDED]

All route handlers return \`{ ok: false, error: { code, message, details? } }\` with a machine-stable \`code\`. Server actions return a discriminated union \`{ ok: true, data } | { ok: false, error }\` — **never throw for expected failures**, so forms can render field-level errors without a boundary.

---

## ADR-024 — Time is stored as UTC + intended timezone · [BLUEPRINT §18.4 item 8, §33.6]

Never a naive local string. \`unlock_at\` (timestamptz) plus \`unlock_timezone\`. Delivery shifts into a humane local window (09:00–20:00). Receiving "for your 18th birthday" at 03:00 is a bug. \`occurred_at\` carries \`occurred_precision\` (\`exact|day|month|year\`) because a scanned 1974 photo has a year, not a timestamp — without it, imported archives either lie about dates or collapse into the upload date.

---

## ADR-025 — Feature flags in Postgres, evaluated server-side · [DECIDED]

\`FeatureFlag\` table with rollout percentage and segment spec. Needed for the staged rollout (PHASE-10) and for per-AI-feature kill switches at R2. No third-party flag vendor at this scale.

---

## ADR-026 — [DEFERRED] Not decided, and must not be invented per task

| Topic | Why deferred | Blocks |
|---|---|---|
| Heir/legacy death-verification model and KYC vendor | Needs legal counsel per jurisdiction (blueprint A-4) | PHASE-12 |
| Licensed music library and provider | Real commercial commitment (A-5) | R2 editor, R3 marketplace |
| Gift fulfilment partner / logistics vendor | Validate demand with affiliate first (A-6, §27.3) | PHASE-12 |
| Company wind-down policy for stored vaults | Product/legal, not engineering — but publishing it is the strongest trust asset available (A-7) | PHASE-10 marketing copy |
| End-to-end encryption tier | Mutually exclusive with server-side AI, thumbnails, transcode, search (§18.2) | post-R3 |
`;

exports.gaps = `# Requirement Gap Analysis

Classification used throughout:

| Tag | Meaning |
|---|---|
**\`[BLUEPRINT]\`** | Explicitly defined in MM_PWA_BLUEPRINT.md — implement as written |
**\`[RECOMMENDED]\`** | Not in the blueprint; proposed here and applied consistently. Challengeable in one place |
**\`[ASSUMPTION]\`** | Taken as true to make the plan executable. If wrong, listed tasks change |
**\`[NEEDS CLARIFICATION]\`** | Cannot be resolved by engineering. Blocks the named work |

---

## 1. Blocking open questions (carried from blueprint Appendix A)

| # | Question | Status | Blocks |
|---|---|---|---|
| A-4 | Heir/legacy death-verification model — how is death verified, who adjudicates a dispute, what waiting period, which KYC vendor? | **\`[NEEDS CLARIFICATION]\`** — requires legal counsel per jurisdiction | PHASE-12 entirely. Cannot be decomposed to tasks |
| A-5 | Licensed music library — which provider, what licence scope, what cost? The blueprint promises "licensed music" | **\`[NEEDS CLARIFICATION]\`** — commercial commitment | R2 memory editor music feature; R3 template marketplace |
| A-6 | Gift fulfilment partner, geography, returns, tax handling | **\`[NEEDS CLARIFICATION]\`** | PHASE-12 commerce. Mitigation: validate with affiliate/dropship first (§27.3) |
| A-7 | Company wind-down policy — what happens to vaults if the company fails? | **\`[NEEDS CLARIFICATION]\`** — product/legal | PHASE-10 marketing and trust copy. **The most important open question in the product** |

**Resolved before this plan:** A-1 pricing (§17.2, Appendix C-6/C-8) · A-2 platform (PWA, ADR-001) · A-3 geography (India-first, global-capable) · A-8 brand identity (§26).

---

## 2. Ambiguities resolved by decision (not invention)

| Topic | Blueprint state | Resolution | Tag |
|---|---|---|---|
| API style | "GraphQL/REST gateway" written for native clients | Server actions + narrow route handlers (ADR-022) | \`[RECOMMENDED]\` |
| Package manager / monorepo tool | Not specified | pnpm + Turborepo (ADR-003) | \`[RECOMMENDED]\` |
| Error envelope | Not specified | Discriminated result union + stable codes (ADR-023) | \`[RECOMMENDED]\` |
| Rate-limit store at R1 | Redis listed but deferred | Cloudflare edge + Postgres counter (ADR-011) | \`[RECOMMENDED]\` |
| Feature flags | Listed for admin, no mechanism | Postgres table, server-evaluated (ADR-025) | \`[RECOMMENDED]\` |
| Session mechanism | "JWT + refresh tokens" in the designer brief | Opaque server-side sessions so revocation is instant (ADR-008, §20.1) — **overrides the brief**; a stateless JWT cannot be revoked, which is unacceptable for a lifetime vault | \`[RECOMMENDED]\` |
| Auth provider | "Better Auth (or Auth.js v5)" | Better Auth (ADR-008) | \`[RECOMMENDED]\` |

---

## 3. Conflicts inside the source material, and how the plan settles them

The blueprint's own Appendix C already reconciles 18 conflicts between Part I and the designer brief. Those resolutions are treated as settled and are not re-litigated here. Three additional conflicts surfaced during decomposition:

1. **"Delivery channels: in-app + email" (free tier, §17.2) vs "In-app → WhatsApp → SMS → Email" (§29.15 channel priority UI).**
   *Resolution:* the drag-to-reorder channel UI ships in R1 but renders only the channels the tier and the recipient's verified contact methods permit; unavailable channels appear greyed with the reason stated. This is exactly what §29.15 specifies for missing contact details, extended to tier gating. \`[RECOMMENDED]\`

2. **Free tier gets "semantic search only" (§17.2 table) but AI ships in R2 (§15.2, ADR-017).**
   *Resolution:* in R1 the free tier's search is Postgres FTS. The table's "semantic search" row becomes accurate at R2. Marketing must not claim semantic search before then (Appendix B principle). \`[ASSUMPTION]\`

3. **Timeline tab present in R1 nav (§28.1) but Gifts replaces it at R3.**
   *Resolution:* build the nav as a configuration-driven component from PHASE-03 so the R3 swap is a config change plus an in-app announcement, not a rewrite. §28.1 requires the change be announced, never silent. \`[RECOMMENDED]\`

---

## 4. Assumptions the plan rests on

| # | Assumption | If wrong |
|---|---|---|
| AS-1 | Team of 2–3 engineers + 1 designer, designer working ahead of engineering per §36 | Timeline in 00_PROJECT_PLAN §5 changes; task content does not |
| AS-2 | Design system tokens (§26) are available at PHASE-01 | PHASE-01 Sprint 2 blocks; mitigate by tokenising from §26.3–26.5 directly, which is fully specified |
| AS-3 | India is the launch market; ₹ is the primary currency; GST applies | Payment tasks change provider priority; DPDP Act 2023 compliance tasks may become GDPR-first |
| AS-4 | 10 GB free tier costs ~\\$0.15/user/month on R2 at full use | Pricing model in §17.2 needs revisiting, not the task plan |
| AS-5 | WhatsApp Business template approval takes weeks and is an R2 concern | If WhatsApp is required at R1, PHASE-07 grows by a sprint and needs a lead time buffer |
| AS-6 | Existing \`src/\` static site is a reference only and is not migrated | PHASE-10 marketing tasks change from "build" to "refactor" |
| AS-7 | Original-quality media retention is affordable at R1 scale | Contradicts nothing in the plan, but §12.6 tiering tasks would move earlier |

---

## 5. Missing requirements the blueprint does not cover, added here

| # | Gap | Where addressed | Tag |
|---|---|---|---|
| G-1 | **Account recovery when the only passkey is lost** and email access is also lost. A lifetime vault needs a documented, abuse-resistant recovery path | PHASE-02 — recovery task with explicit anti-social-engineering rules | \`[RECOMMENDED]\` |
| G-2 | **Duplicate member merge** is mentioned in §29.11 but the merge semantics (which capsules follow which record) are undefined | PHASE-03 — merge task defines: capsules follow the surviving record; contact history is unioned; audit entry written | \`[RECOMMENDED]\` |
| G-3 | **Timezone change by a recipient** between seal and delivery over a multi-year horizon | PHASE-05 — delivery worker resolves the humane window at fire time, not seal time | \`[RECOMMENDED]\` |
| G-4 | **What happens to a capsule whose recipient has died** before delivery | PHASE-05 — \`Member.deceased_at\` gates delivery and notifies the owner instead. **Handled with care; copy needs review** | \`[NEEDS CLARIFICATION]\` on copy, \`[RECOMMENDED]\` on mechanism |
| G-5 | **Storage accounting drift** between counted bytes and actual objects | PHASE-08 — reconciliation job | \`[RECOMMENDED]\` |
| G-6 | **Service-worker update during an active recording or upload** | PHASE-06 — update prompt is explicit and deferred while an upload is in flight (§33.15) | \`[BLUEPRINT §29.28]\` |
| G-7 | **Seed/demo data** for development and for the staged rollout | PHASE-01 — seed script with realistic Indian + global names, never lorem ipsum (§36) | \`[RECOMMENDED]\` |
| G-8 | **Admin break-glass second-approver workflow** is required by §16.3 but no approval mechanism is specified | PHASE-08 — approval request/grant with expiry, and user notification | \`[RECOMMENDED]\` |

---

## 6. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | **The delivery guarantee is not actually durable** — a bug loses a scheduled job and a capsule silently never arrives | **Critical** | DB-owned scheduler (ADR-006), transactional seal, watchdog alert, monthly integrity sweep, Sev-0 classification. Tested with injected failures in PHASE-09 |
| R-2 | **Cross-tenant data leak** | **Critical** | \`lib/authz\` chokepoint built first, RLS second line, one test per permission-matrix cell, external pen test focused on IDOR |
| R-3 | Media pipeline cost outruns revenue | High | Instrument storage cost per paying user from day one; tiering job; no "unlimited" promise |
| R-4 | iOS PWA limitations damage the experience for half the audience | High | Four member-import paths, email as guaranteed notification fallback, install framed as reward. Device-lab testing in PHASE-09 |
| R-5 | Scope creep from R2/R3 into R1 | High | MVP boundary test (§23.4) applied to every scope request: "if this were missing, would the core promise break?" |
| R-6 | FFmpeg RCE via malicious upload | High | Isolated containers, no DB credentials, no egress, magic-byte validation, SVG rejected |
| R-7 | Legal exposure on children's media and biometrics | High | Face recognition not built. CSAM hash-matching from day one. DMCA path staffed at launch |
| R-8 | Long-horizon churn — user forgets the product for years, card expires, capsule orphaned | Medium | Annual reassurance report (R2), contact-freshness prompts, and the never-cancel-for-non-payment policy |
| R-9 | Next.js 16 breaking changes cause repeated rework | Medium | Every framework task requires reading \`node_modules/next/dist/docs/\` first (ADR-002, project \`AGENTS.md\`) |
`;

exports.conventions = `# Conventions

Applies to every task. Where a task's §6 conflicts with this document, the task wins and the conflict should be recorded in its §20.

## Repository layout

Per blueprint §19/§37 and ADR-003:

${'```'}
apps/web            the PWA (marketing + app + admin route groups)
apps/workers        delivery engine, media pipeline, scheduled jobs
packages/shared     zod schemas, domain types, constants (web <-> workers)
packages/db         drizzle schema + migrations — SINGLE SOURCE
packages/emails     react-email templates
packages/config     eslint, tsconfig, tailwind preset
Docs/development    this plan
${'```'}

## Naming

| Thing | Convention | Example |
|---|---|---|
| Directories | kebab-case | \`src/features/capsule/\` |
| React components | PascalCase file + named export | \`CapsuleCountdown.tsx\` |
| Hooks | \`use\` prefix | \`useUploadQueue.ts\` |
| Server actions | verb-first, \`Action\` suffix | \`sealCapsuleAction\` |
| Zod schemas | \`Schema\` suffix | \`SealCapsuleSchema\` |
| DB tables | snake_case plural | \`capsule_recipients\` |
| DB columns | snake_case | \`occurred_precision\` |
| Enums | snake_case values | \`'sealed' | 'delivering'\` |
| Env vars | SCREAMING_SNAKE | \`R2_BUCKET_MEDIA\` |
| Test files | co-located \`__tests__\` | \`features/capsule/__tests__/seal.test.ts\` |

## Feature module shape

Every \`src/features/<domain>/\` contains:

${'```'}
components/     UI owned by this domain
actions.ts      server actions (mutations)
queries.ts      read functions — ALL go through lib/authz
schema.ts       zod schemas (re-exported from packages/shared where shared)
hooks/          client hooks
types.ts
__tests__/
${'```'}

**No feature module may query another feature's tables directly** (ADR-004). Cross-domain reads go through the owning module's \`queries.ts\`.

## Authorization — the one rule

Every read and every write calls into \`lib/authz\`. No exceptions, including admin paths.

${'```'}
requestor + resource  →  lib/authz  →  { allowed, role, reason }
${'```'}

- Scope every query by \`vault_id\` resolved from the **session**.
- Treat client-supplied ids as filters, never as authorization.
- A new table requires a new RLS policy in the same migration.

## Error handling

Per ADR-023. Server actions return \`{ ok: true, data } | { ok: false, error: { code, message, field? } }\`. **Do not throw for expected failures.** Unexpected failures throw and are captured by Sentry with the user-facing message reduced to a generic apology plus a support reference.

Error copy follows §33.2: **what is wrong + how to fix it.** "PIN code must be 6 digits", never "Invalid input".

## Status vocabulary

Only \`pending\` · \`progress\` · \`completed\`. Set in each document's status field and mirrored in \`PROJECT_PROGRESS.md\`. A parent is \`completed\` only when every child is.

## Testing

| Layer | Tool | Rule |
|---|---|---|
| Unit / integration | Vitest | Business rules and authz get direct unit tests |
| Component | Vitest + jsdom + Testing Library | Assert on roles and accessible names, not class names |
| API | Vitest against route handlers | Every documented error code has a test |
| DB / RLS | SQL assertions | Every permission-matrix cell has a test |
| E2E | Playwright | Critical path, **plus offline and install flows** |
| A11y | axe in Playwright | Zero serious/critical violations on every shipped screen |

## Accessibility floor (blueprint §26.8)

WCAG 2.2 AA. Contrast 4.5:1 text / 3:1 UI. **Coral \`#FF6B5E\` must never be used for small text on white** — it fails 4.5:1; it is valid for large text, icons, and fills only. Touch targets ≥ 44×44px. Visible focus ring. \`prefers-reduced-motion\` variant for every animation. Never colour alone for status.

## Copy rules (blueprint §33.11)

Warm, human, second person. Emoji sparing and purposeful. **Never call a memory a "file", "asset", or "record" in user-facing text.** Real-feel content in all seeds and fixtures — Indian and global names, realistic dates. **Never lorem ipsum.**

## Commits

Conventional commits with the task id: \`feat(capsule): seal transaction + job row [TASK-092]\`. One task per PR wherever practical.
`;

exports.mvpCoverage = [
  ['M1 Email + passkey/OTP auth', 'PHASE-02 / MOD-02-01'],
  ['M2 Personal vault', 'PHASE-02 / MOD-02-02'],
  ['M3 Create memory', 'PHASE-03 / MOD-03-03'],
  ['M4 In-app capture', 'PHASE-04 / MOD-04-01'],
  ['M5 Resumable offline-tolerant upload', 'PHASE-04 / MOD-04-02'],
  ['M6 Timeline (Past → Present → Future)', 'PHASE-03 / MOD-03-04'],
  ['M7 Memory detail view', 'PHASE-03 / MOD-03-03'],
  ['M8 Time capsule seal + schedule', 'PHASE-05 / MOD-05-01'],
  ['M9 Durable delivery engine', 'PHASE-05 / MOD-05-02'],
  ['M10 Recipient unlock experience', 'PHASE-05 / MOD-05-03'],
  ['M11 Private share link', 'PHASE-05 / MOD-05-04'],
  ['M12 On This Day', 'PHASE-03 / MOD-03-04'],
  ['M13 Push + email notifications', 'PHASE-07'],
  ['M14 Installable PWA + offline shell', 'PHASE-06'],
  ['M15 Privacy controls + audit trail', 'PHASE-08 / MOD-08-01'],
  ['M16 Account: profile, export, delete', 'PHASE-08 / MOD-08-02'],
  ['M17 Storage quota + Stripe checkout', 'PHASE-08 / MOD-08-03'],
  ['Occasions/Events engine (Part II addition)', 'PHASE-03 / MOD-03-02'],
  ['Members with four import paths (Part II)', 'PHASE-03 / MOD-03-01'],
  ['Onboarding personalization quiz (Part II)', 'PHASE-02 / MOD-02-03'],
  ['Reactions + voice reply (Part II)', 'PHASE-05 / MOD-05-03'],
  ['Trust & safety: report/block, moderation queue', 'PHASE-08 / MOD-08-04'],
  ['Design system + component library (§26)', 'PHASE-01 / MOD-01-02'],
  ['Admin operator console (§31 R1 slice)', 'PHASE-08 / MOD-08-04'],
  ['Marketing site (§30)', 'PHASE-10 / MOD-10-01'],
];

exports.coverageGaps = [
  '**Releases 2 and 3 are documented to module level only.** Task decomposition is an explicit gate at the end of Release 1 — see [00_PROJECT_PLAN.md](00_PROJECT_PLAN.md) §6 for the reasoning (commerce awaits demand validation; Legacy Vault awaits legal counsel; music library awaits licensing).',
  '**Face recognition (§15 A7) is intentionally unmapped.** It is not built in any release covered by this plan, pending legal review (blueprint §11.6).',
  '**End-to-end encryption (§7.3 F11) is intentionally unmapped.** It is mutually exclusive with server-side thumbnails, transcode, search, and AI.',
  '**Blueprint §24 (competitive improvements) is guidance, not requirements** — the five UX and five product improvements are absorbed into the phases they affect rather than tracked as separate tasks.',
  '**Blueprint §36 design deliverables are tracked in the design file, not here.** PHASE-01 / MOD-01-02 consumes them; it does not produce them.',
];
