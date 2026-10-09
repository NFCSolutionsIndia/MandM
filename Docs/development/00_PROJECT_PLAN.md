# 00 — Project Plan · Moments & Memories

> **Engineering execution blueprint.** The product source of truth is [MM_PWA_BLUEPRINT.md](../../MM_PWA_BLUEPRINT.md). This directory turns it into an ordered, dependency-aware, implementable plan.

## 1. Starting position — read this first

**There is no codebase.** The repository currently contains:

- `MM_PWA_BLUEPRINT.md` — the product/system blueprint
- `src/` — a **static marketing site** (Next.js `output: 'export'` → GitHub Pages) that is *not* the application and is *not* being converted. It has no auth, no database, no API routes, no background sync layer, and its only form calls `preventDefault()`. Treat it as a **visual reference for the marketing surface only**.
- This `Docs/development/` tree

Therefore:

- No API, database, authentication, component, or backend service exists.
- **Nothing in this plan starts as `completed`.** The blueprint describes what the system should become.
- Every task below builds something for the first time.

## 2. What we are building

Native **iOS and Android apps** where people capture memories today and have them delivered at a chosen future moment — with an occasions engine that knows when those moments are.

The differentiating loop, and the thing every early phase serves:

```
capture a moment  →  seal it for a person and a date  →  it reliably arrives  →  they open it  →  they reply
```

Blueprint §37 is the authoritative product summary. Blueprint §27.3 defines three releases; **this plan decomposes Release 1 to task level** and documents Releases 2–3 to module level (see §6 below for why).

## 3. Phase map

| Phase | Name | Release | Effort | Depends on |
|---|---|---|---|---|
| [PHASE-01](phase-01/PHASE-01.md) | Foundation & Architecture | Release 1 | ~2 weeks | — |
| [PHASE-02](phase-02/PHASE-02.md) | Identity, Authorization & Onboarding | Release 1 | ~2.5 weeks | PHASE-01 |
| [PHASE-03](phase-03/PHASE-03.md) | Core Domain — Members, Occasions, Memories & Timeline | Release 1 | ~4 weeks | PHASE-02 |
| [PHASE-04](phase-04/PHASE-04.md) | Media Pipeline — Capture, Upload, Processing & Secure Delivery | Release 1 | ~4 weeks | PHASE-03 |
| [PHASE-05](phase-05/PHASE-05.md) | Time Capsules & The Delivery Guarantee | Release 1 | ~5 weeks | PHASE-04 |
| [PHASE-06](phase-06/PHASE-06.md) | The apps — offline store, sync & background upload | Release 1 | ~2.5 weeks | PHASE-05 |
| [PHASE-07](phase-07/PHASE-07.md) | Notifications — Push, Email & The Trigger Matrix | Release 1 | ~1.5 weeks | PHASE-06 |
| [PHASE-08](phase-08/PHASE-08.md) | Privacy, Data Rights, Billing, Trust & Safety, Admin | Release 1 | ~2.5 weeks | PHASE-07 |
| [PHASE-09](phase-09/PHASE-09.md) | Hardening — Security, Accessibility, Performance & Resilience | Release 1 | ~3 weeks | PHASE-08 |
| [PHASE-10](phase-10/PHASE-10.md) | Launch — Marketing Site, Honest Claims & Staged Rollout | Release 1 | ~2 weeks | PHASE-09 |
| [PHASE-11](phase-11/PHASE-11.md) | Release 2 — "Together" (Shared Vaults, Collaboration, Broadcasts & AI) | Release 2 | ~12–16 weeks | PHASE-10 |
| [PHASE-12](phase-12/PHASE-12.md) | Release 3 — "Gifting & Legacy" (Commerce, Group Gifting & Legacy Vault) | Release 3 | ~16–20 weeks, and a business decision as much as an engineering one | PHASE-11 |

**Totals:** 12 phases · 36 modules · 36 sprints · 45 epics · **104 tasks**

## 4. Sequencing logic

```
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
PHASE-06  The apps            store release, offline reads, offline capture, sync
    ↓
PHASE-07  Notifications         APNs / FCM + email, trigger matrix, preferences
    ↓
PHASE-08  Trust, Billing, Admin privacy centre, moderation, Stripe/Razorpay, operator console
    ↓
PHASE-09  Hardening             permission matrix tests, tenant isolation, pen test, a11y, restore drill
    ↓
PHASE-10  Launch                marketing site with corrected claims, staged rollout
```

Two ordering rules that must not be violated:

1. **PHASE-02 before any content phase.** `lib/authz` is the single authorization chokepoint (blueprint §11.1, §20.2). Every read and write resolves through it. Building content first and adding authorization later produces exactly the cross-tenant leak this product cannot survive.
2. **PHASE-04 before PHASE-05.** Sealing a capsule is a promise. A promise over media that might not have uploaded is not a promise.

## 5. Effort summary (Release 1)

| Phase | Est. effort |
|---|---|
| PHASE-01 Foundation & Architecture | ~2 weeks |
| PHASE-02 Identity, Authorization & Onboarding | ~2.5 weeks |
| PHASE-03 Core Domain — Members, Occasions, Memories & Timeline | ~4 weeks |
| PHASE-04 Media Pipeline — Capture, Upload, Processing & Secure Delivery | ~4 weeks |
| PHASE-05 Time Capsules & The Delivery Guarantee | ~5 weeks |
| PHASE-06 The apps — offline store, sync & background upload | ~2.5 weeks |
| PHASE-07 Notifications — Push, Email & The Trigger Matrix | ~1.5 weeks |
| PHASE-08 Privacy, Data Rights, Billing, Trust & Safety, Admin | ~2.5 weeks |
| PHASE-09 Hardening — Security, Accessibility, Performance & Resilience | ~3 weeks |
| PHASE-10 Launch — Marketing Site, Honest Claims & Staged Rollout | ~2 weeks |
| **Release 1 total** | **~26–30 weeks** for a team of 2–3 engineers + 1 designer |

Phases 03/04 can partially overlap once the `MediaAsset` contract is frozen; PHASE-06 can start during PHASE-05. Compressed realistic target: **~22–24 weeks**.

## 6. Why Releases 2 and 3 are not decomposed to task level yet

Deliberate, and recorded in [REQUIREMENT_GAP_ANALYSIS.md](REQUIREMENT_GAP_ANALYSIS.md):

- Blueprint §27.3 stages commerce behind validation — the recommendation is to prove gift intent with affiliate/dropship links before building inventory, fulfilment, and returns. Decomposing a catalog/orders/logistics system now would be planning work thrown away if that validation fails.
- Legacy Vault (§29.25) is **blocked on legal counsel per jurisdiction** (open question A-4). Its unlock protocol, KYC provider, and dispute path cannot be specified as tasks before that.
- Music licensing (A-5) blocks the R2 editor's music library.
- Task decomposition ages badly. R2 tasks written today would be rewritten after R1 ships and real usage data exists.

Phases 11–12 therefore document objective, modules, and sprint/epic outlines, with task decomposition as an explicit gate at the end of Release 1.

## 7. How to execute

```
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
```

## 8. Non-negotiables carried from the blueprint

These are not preferences. Violating any of them breaks the product's core promise.

1. **A sealed capsule is delivered.** The scheduler is database-owned (§18.4). No third-party scheduler is the source of truth for a date decades away. A missed unlock pages a human and is treated as Sev-0.
2. **A sealed capsule is never cancelled for non-payment**, and memories are never deleted for non-payment (§17.2 item 4, Appendix C-18).
3. **`/c/[token]` is server-rendered and works with JavaScript disabled** (§29.24, §37). A 2046 recipient must not be blocked by a 2026 framework assumption.
4. **The local copy is written before the upload starts** (§12.1 step 3). A memory is never at risk while an upload is pending.
5. **No object in the media bucket is ever publicly readable.** Signed URLs, 5-minute TTL, minted after authorization (§12.5).
6. **Every read resolves through `lib/authz`** to a vault role, an active share, or a delivered capsule recipient. There is no fourth path (§11.1).
7. **Originals are never modified, and there is no quality tiering** (§17.2 item 2).
8. **No memory-count limit exists.** Free tier is limited by storage (10 GB) and capsule horizon (3 pending, 12 months) only (§17.2, Appendix C-6/C-8).
9. **Marketing claims must match what is built** (Appendix B). No "unlimited", no fabricated testimonials, no implied end-to-end encryption.
10. **Face recognition is not built** in any release covered here, pending legal review (§11.6).
