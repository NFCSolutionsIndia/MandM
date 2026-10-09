# 06 — Delivery Roadmap & Business Plan

← [Documentation index](README.md)

---

## 1. Where the project stands today

| | |
|---|---|
| **Current phase** | PHASE-01 — Foundation & Architecture |
| **Current module** | MOD-01-01 — Repository, Toolchain & Data Layer |
| **Completed** | 4 of 104 tasks (**4%**) — EPIC-01-01-01-01, Workspace & Package Scaffold |
| **Last completed** | TASK-004 — shared package: result envelope, error registry, domain enums |
| **Next** | TASK-005 — CI pipeline with blocking quality gates |

**What exists in the repository today:** the pnpm + Turborepo monorepo with all six workspaces
· the Next.js 16 app with its five route groups (marketing, auth, app, admin, and the two
token routes) · the independently deployable workers service with its tick loop and health
endpoint · the shared package with the domain enums, the locked error registry and the result
envelope · Playwright end-to-end tests including **a test that asserts the capsule route works
with JavaScript disabled** · and green `typecheck`, `lint`, `test` and `build` from a clean
clone.

**What does not exist yet:** the database schema (`packages/db` is a stub, and the three `db:*`
commands deliberately exit with an explanatory message rather than reporting success without
touching a database), authentication, and every feature surface.

### 1.1 Plan shape

```
12 phases  ·  36 modules  ·  36 sprints  ·  45 epics  ·  104 tasks
```

Release 1 is decomposed to **task level**. Releases 2 and 3 are documented to **module level**
only — deliberately, for four reasons: commerce is staged behind validation, so decomposing a
catalog/orders/logistics system now would be planning work thrown away if that validation
fails; the Legacy Vault is blocked on legal counsel per jurisdiction and its unlock protocol
cannot be specified as tasks before that; music licensing blocks the Release 2 recap editor;
and **task decomposition ages badly** — Release 2 tasks written today would be rewritten after
Release 1 ships and real usage data exists.

---

## 2. The delivery timeline

### 2.1 Release 1 — twelve-phase plan

| Phase | Name | Effort | Tasks | Depends on |
|---|---|---|---:|---|
| **01** | Foundation & Architecture | ~2 wk | 16 | — |
| **02** | Identity, Authorization & Onboarding | ~2.5 wk | 13 | 01 |
| **03** | Core Domain — Members, Occasions, Memories & Timeline | ~4 wk | 16 | 02 |
| **04** | Media Pipeline — Capture, Upload, Processing & Secure Delivery | ~4 wk | 11 | 03 |
| **05** | **Time Capsules & The Delivery Guarantee** | **~5 wk** | 12 | 04 |
| **06** | The apps — offline store, sync & background upload | ~2.5 wk | 7 | 05 |
| **07** | Notifications — Push, Email & The Trigger Matrix | ~1.5 wk | 5 | 06 |
| **08** | Privacy, Data Rights, Billing, Trust & Safety, Admin | ~2.5 wk | 12 | 07 |
| **09** | Hardening — Security, Accessibility, Performance & Resilience | ~3 wk | 7 | 08 |
| **10** | Launch — Marketing Site, Honest Claims & Staged Rollout | ~2 wk | 5 | 09 |
| | **Release 1 total** | **~26–30 weeks** | **104** | |
| **11** | Release 2 — "Together" | ~12–16 wk | *TBD* | 10 |
| **12** | Release 3 — "Gifting & Legacy" | ~16–20 wk | *TBD* | 11 |

**Team assumption:** 2–3 engineers, 1 designer, part-time PM. These are engineering estimates
for that shape of team, **not commitments**.

**Compression.** Phases 03 and 04 can partially overlap once the media-asset contract is
frozen, and PHASE-06 can start during PHASE-05. **Realistic compressed target: ~22–24 weeks.**

### 2.2 The two ordering rules that must not be violated

> **1. PHASE-02 before any content phase.** The authorization chokepoint is built *before any
> content exists.* Building content first and adding authorization later produces exactly the
> cross-tenant leak this product cannot survive.

> **2. PHASE-04 before PHASE-05.** Sealing a capsule is a promise. **A promise over media that
> might not have uploaded is not a promise.**

### 2.3 Critical path

```
01 Foundation      monorepo · design tokens · CI · database connection
     ↓
02 Identity        auth + AUTHORIZATION CHOKEPOINT + onboarding
     ↓
03 Core Domain     Member · Event · Memory · Timeline
     ↓
04 Media Pipeline  capture · resumable upload · transcode · signed delivery
     ↓
05 Capsules        ◄── THE DIFFERENTIATOR. Do not compress this phase.
     ↓
06 The apps        store release · offline reads · offline capture · sync
     ↓
07 Notifications   APNs / FCM + email · trigger matrix · preferences
     ↓
08 Trust/Billing   privacy centre · moderation · Stripe+Razorpay · operator console
     ↓
09 Hardening       permission matrix · tenant isolation · pen test · a11y · restore drill
     ↓
10 Launch          marketing site with corrected claims · staged rollout
```

### 2.4 The demonstrable milestones

Each of these is a moment where the product can be shown to someone outside the team:

| After | You can demonstrate |
|---|---|
| **PHASE-02** | Sign up with a passkey, complete onboarding, land in an empty app. **Authorization is centralised and tested before any content exists.** |
| **PHASE-03** | Create, view, browse, search, edit and delete memories. **The timeline is the app's identity and it feels like an app.** |
| **PHASE-04** | Upload real photos and 4K video from a phone on a poor connection. **Kill the app mid-upload and it resumes. Nothing is ever lost.** Tested explicitly on airplane mode and throttled 3G |
| **PHASE-05** | **Seal a capsule for 60 seconds from now and watch it arrive, open, and be replied to.** Then seal one for 20 years and verify the job row, the integrity sweep and the watchdog |
| **PHASE-06** | An installed app that opens instantly with no network, captures and queues memories offline, and syncs cleanly on reconnect |
| **PHASE-08** | A user can pay, hit a quota, export everything, and delete everything. Operators can see whether deliveries are working |
| **PHASE-09** | A signed-off security review, an accessibility audit, a **verified restore**, and staffed alerting |
| **PHASE-10** | Public launch with honest marketing and measured activation |

### 2.5 How work is tracked

- Statuses are only `pending` · `progress` · `completed`. A parent is `completed` only when
  every child is.
- **A task becomes `completed` only when** implementation exists, tests are written and passing,
  every acceptance criterion is verified explicitly, and no blocking issue remains.
- **Nothing in the plan starts as `completed`.** The blueprint describes what the system should
  become, not what exists.
- **One branch per epic**, one commit per task, merged only when every task in the epic is
  complete — because an epic is the smallest unit that leaves the codebase coherent.
- A blocked task is recorded as blocked. **It is never silently promoted to `completed` to
  unblock a merge** — that is how an acceptance criterion quietly stops meaning anything.

---

## 3. Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **PHASE-05 gets compressed under schedule pressure** | The differentiator ships weak | Medium | Named explicitly as non-compressible. Its acceptance criteria include sealing a 20-year capsule and verifying the watchdog, not just a happy path |
| **A cross-tenant leak reaches production** | Existential | Low | Four compensating controls, a load-bearing CI gate, an external pen test focused on IDOR |
| **Media storage cost outruns revenue** | Margin erosion | Medium | Zero-egress storage; storage-cost-per-paying-user instrumented **from day one**; 24-month tiering to infrequent access |
| **Store review rejects or delays a release** | Schedule slip | Medium | Submit in week three, not the last week; anything that must change fast is server-driven (email as guaranteed fallback; four contact-import paths). Native shells remain available later over the same codebase |
| **Preview-environment regression slows the team** | Velocity | Medium — **already realised** | Per-PR schema on a shared Aurora cluster; real-feel seed fixtures made a convention because previews are seeded rather than branched |
| **No typo tolerance in R1 search** | User friction | High — **accepted** | Generous `search_text`, client-side prefix matching, and **not claiming typo tolerance in UI copy until R2 ships it** |
| **Legacy Vault legal review stalls** | R3 slips | Medium | Already isolated to R3 and documented as legally gated. Nothing in R1/R2 depends on it |
| **Commerce built before demand is proven** | ~19 wasted entities | Medium | Staged: affiliate/dropship links first. The same designs are reused if it graduates |
| **Face recognition slips in accidentally** | **Serious legal exposure** | Low | Named as the largest legal risk in the inherited feature list. Absent from every release covered here |
| **AWS idle cost is higher than needed** | Margin | Medium | Acknowledged. OpenNext on Lambda is the documented alternative, to be revisited **once idle cost is a measured number** |
| **Aurora single-region at R1** | Availability | Low | Backups already cross-region from day one; multi-region active is a post-launch decision |

---

## 4. The business model

### 4.1 Structure

**Freemium subscription. The free tier is limited by STORAGE VOLUME and CAPSULE HORIZON — never
by a count of memories created.**

| | **Free** | **Premium** | **Family** |
|---|---|---|---|
| Price | ₹0 / $0 | **₹399/mo · ₹3,199/yr** (≈$8 / $72) | **₹749/mo · ₹5,999/yr** (≈$15 / $120) |
| Storage | **10 GB** | **250 GB** | **2 TB pooled** |
| Memories created per month | **unlimited** | unlimited | unlimited |
| Originals preserved, never compressed | ✓ | ✓ | ✓ |
| Video length per memory | 5 min | 30 min | 30 min |
| **Pending capsules at once** | **3** | unlimited | unlimited |
| **Capsule scheduling horizon** | **up to 12 months** | **unlimited + age milestones** | unlimited + age milestones |
| Capsules already delivered | **unlimited — never counted** | unlimited | unlimited |
| Delivery channels | in-app + email | + SMS, WhatsApp, priority routing | + backup guardian |
| Shared vaults | 1 (up to 3 members) | 5 (up to 10 members) | unlimited |
| Collaborative capsules | contribute only | organise 2/year | unlimited |
| Broadcasts (R2) | ✗ | 100 recipients/mo | 500 recipients/mo |
| AI (R2) | semantic search only | search, transcripts, recaps, prompts | + stories, priority processing |
| Heirs (R3) | ✗ | 1 | up to 5, with document storage |
| Seats | 1 | 1 | **6** |
| Support | community | email | priority |

**Launch recommendation: ship Release 1 with Free and Premium only**, plus Stripe and Razorpay
checkout and the billing portal. Add Family and any lifetime plan once retention data exists.

### 4.2 Why storage, not upload count

Three converging arguments, and this is the single most important pricing decision:

1. **Cost.** 10 GB on R2 costs roughly **$0.15 per month at full usage, with zero egress.** A
   "5 uploads per month" cap saves a rounding error while suppressing **the single behaviour the
   entire product depends on.** It is a wall that costs us revenue and saves us nothing.
2. **Wall shape.** An upload counter is a **recurring** wall, hit in week one of every month,
   forever — it generates monthly resentment and actively teaches the user *not to upload*. A
   storage cap is hit **once, late**, when the user is already attached and upgrading feels
   obviously rational: *"I have built something valuable here and I need more room."* Same
   revenue event, opposite emotional register.
3. **Compounding value.** On This Day, recaps, semantic search and event grouping all improve
   with archive density. A monthly counter caps the exact variable that creates retention and
   switching cost. **We would be charging users to stop us from becoming indispensable.**

### 4.3 Why no quality tiering

"High resolution, no compression, originals preserved" is one of the product's strongest
promises and a real differentiator against every free consumer cloud. Degrading it for free
users contradicts the brand at the exact moment we are asking for trust.

It is also unnecessary: **10 GB already limits 4K naturally** — roughly 20 minutes — so volume
does the gating without a hostile "we hold your 4K, pay to see it" mechanic. Paid
differentiation lives in storage, capsule horizon, channels, AI and seats.

### 4.4 Why the capsule gate is HORIZON, not count

Free users get **3 pending capsules at a time** and a **12-month horizon**. Delivered capsules
never count against the cap. Four reasons this beats "3 capsules then pay":

1. **It never breaks the growth loop.** A lifetime cap of 3 kills the viral engine after three
   events. Counting only *pending* capsules lets a free user run the loop indefinitely — seal,
   deliver, recipient opens, recipient replies, recipient seals their own. **Every delivered
   capsule is distribution we did not pay for. Capping lifetime capsules is capping our own
   acquisition channel.**
2. **The gate matches the actual cost.** A capsule due in 20 years is a 20-year liability:
   storage, scheduling, contact-freshness operations, cross-provider backup, and a delivery
   obligation we must honour long after the subscription may have lapsed. A capsule due next
   month costs almost nothing. **Charging for horizon is charging for what genuinely costs us**
   — the fairest gate available, and the only one defensible out loud on a pricing page.
3. **The upgrade prompt becomes emotional instead of punitive.** *"You've used 3 of 3"* is a
   wall. *"This one needs to wait until 2044 — that's what Premium is for"* is the product
   telling its own story, and it lands at the moment of highest emotional intent: someone
   trying to reach a child's eighteenth birthday.
4. **Three concurrent is still a real constraint.** Wanting capsules pending for Mum, Dad and
   both children at once is a natural, frequent family moment. **The cap converts — it simply
   does not teach restraint.**

### 4.5 A sealed promise is never cancelled for non-payment

**Non-negotiable.** If a Premium subscription lapses while capsules are scheduled beyond the
free horizon, **those capsules are still delivered.** New long-horizon capsules require an
active subscription; existing ones are honoured.

Enforced by **evaluating entitlements at seal time and storing nothing that would allow a later
downgrade to invalidate the promise.**

This costs a little and is **the single most trust-building line in the entire pricing model** —
and it is the only position consistent with a product that sells permanence. It extends the
policy that memories are never deleted for non-payment. **Both must be written into the Terms,
not left as implementation behaviour.**

### 4.6 What was rejected, and why

| Rejected | Reason |
|---|---|
| **Advertising** | Contradicts the stated promise and the product's whole reason to exist |
| **Data monetisation** | The same |
| **Paid social features** | There are none, by design |
| **Charging for data export** | An export tax on a memory vault is indefensible |
| **"Unlimited" storage** | Unsurvivable. A single user with 2 TB of 4K video costs real money every month, forever, against a modest subscription — and this product's users **never delete anything, by design.** Generous honest tiers beat an unlimited promise that must later be broken. **Breaking a storage promise is fatal for a company whose product is trust** |
| **A single paid tier** | Leaves no upgrade path. Family sharing and heirs are the natural high-tier hooks, and **households pay far more readily than individuals** |

**Annual pricing is discounted ~25%.** Annual commitment is the right instinct for a product
about permanence, and it materially improves cash flow against storage costs paid monthly.

**A lifetime plan is worth offering — carefully.** A "Forever" one-time purchase (~$399, capped
storage, transferable) matches the product's emotional promise better than any subscription.
But it must be funded properly: **the cash goes into a segregated reserve** sized to cover, say,
50 years of that account's storage at conservative cost assumptions. Offer it only once unit
economics are measured. **Do not launch with it.**

**Additional revenue lines (R2/R3):** printed photo books and posters (high margin, emotionally
aligned) · physical greeting-card fulfilment · a paid extra-storage add-on.

---

## 5. Unit economics and the two ratios that decide everything

### 5.1 The cost shape

The database is roughly **~300 GB at 100,000 users** — a rounding error. **Media is the cost
base**, at roughly ~1.4 PB on the same assumptions
([04 Level 7.3](04-DATABASE-ARCHITECTURE.md) has the model and its assumptions).

Which is why three structural decisions are not optimisations but requirements:

1. **Zero-egress object storage.** In a re-watched-media product, egress on a conventional cloud
   can exceed the subscription price outright for an engaged user.
2. **Tier originals older than 24 months with no access** into infrequent-access storage, while
   keeping derivatives hot.
3. **Track per-user storage cost against subscription revenue and surface the ratio on the admin
   dashboard.** That number is what decides whether any storage promise is survivable.

### 5.2 The two instrumented ratios

Instrumented from day one, because they are the two numbers that decide whether the model works:

> **1. Storage cost per paying user.** The margin. If this crosses the subscription price for a
> meaningful cohort, the tiers are wrong.

> **2. Conversion on the capsule-horizon paywall, measured *separately* from the storage
> paywall.** Horizon is the primary intended gate, so **this single funnel step decides whether
> the pricing model holds.** Blending it with the storage paywall would hide the answer.

---

## 6. What happens after launch

**Post-launch order** for Release 2 work: shared vaults → suggested capsules and memory prompts
→ semantic search and transcripts → collaborative capsules → multi-channel delivery → recaps.

**Task decomposition for Releases 2 and 3 is an explicit gate at the end of Release 1**, so it
is written against real usage data rather than assumptions.

### 6.1 Three things that would change the plan

| Signal | What it would change |
|---|---|
| **Horizon-paywall conversion is weak** | The pricing gate is wrong. Revisit before building Family or a lifetime plan |
| **Gift-affiliate click-through is strong** | Commerce graduates from affiliate links to owned inventory — the Release 3 decision becomes evidence-backed rather than a bet |
| **Idle AWS cost is material** | Revisit OpenNext on Lambda for the web tier. The alternative is already documented; only the number is missing |

---

## 7. Decisions still open

These are recorded as *not decided* so that no individual task invents an answer unilaterally.

| Topic | Owner | Blocks | Why it is still open |
|---|---|---|---|
| Heir / legacy death-verification model and KYC vendor | Legal + product | Legacy Vault (R3) | Needs counsel per jurisdiction |
| Licensed music library and provider | Business | R2 recap editor, R3 marketplace | A real commercial commitment |
| Gift fulfilment partner and logistics vendor | Business | Commerce (R3) | Validate demand with affiliate links first |
| **Company wind-down policy for stored vaults** | Product + legal | Launch marketing copy | Not engineering — **but publishing it is the strongest trust asset available to this product.** A company selling permanence that will not say what happens if it closes is asking for trust it has not earned |
| End-to-end encryption tier | Product | Post-R3 | Mutually exclusive with server-side AI, thumbnails, transcode and search |
| Policy on who may act for a deceased user | Legal | R3 | Required before posthumous delivery or memorial pages |

---

## 8. The ten non-negotiables

Carried from the blueprint into every phase. Violating any of these breaks the product's core
promise, and they are repeated here because a roadmap under pressure is exactly where
non-negotiables get renegotiated.

1. **A sealed capsule is delivered.** The scheduler is database-owned. A missed unlock pages a
   human and is treated as **Sev-0**.
2. **A sealed capsule is never cancelled for non-payment**, and memories are never deleted for
   non-payment.
3. **`/c/[token]` is server-rendered and works with JavaScript disabled.** A 2046 recipient must
   not be blocked by a 2026 framework assumption.
4. **The local copy is written before the upload starts.** A memory is never at risk while an
   upload is pending.
5. **No object in the media bucket is ever publicly readable.** Signed URLs, 5-minute TTL,
   minted after authorization.
6. **Every read resolves through the authorization chokepoint** to a vault role, an active share,
   or a delivered capsule recipient. **There is no fourth path.**
7. **Originals are never modified, and there is no quality tiering.**
8. **No memory-count limit exists.** The free tier is limited by storage and capsule horizon
   only.
9. **Marketing claims must match what is built.** No "unlimited", no fabricated testimonials, no
   implied end-to-end encryption.
10. **Face recognition is not built** in any release covered here, pending legal review.

---

← [05 — Security, Privacy & Compliance](05-SECURITY-AND-COMPLIANCE.md) · [Documentation index](README.md)
