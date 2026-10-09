# Project Progress — Moments & Memories

> **Update this document every time a task changes status.** It is the single place that answers "where are we?".

_TASK-001 is complete: the monorepo now exists. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass from a clean clone._

> **Stack, 2026-09-29 — PostgreSQL on AWS.** The database is PostgreSQL 17 on Aurora PostgreSQL Serverless v2; hosting is AWS ECS Fargate. Blueprint §18.1 is superseded; [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) is the authority. The most consequential downstream effects: **row-level security is enforced on every tenant-scoped table** alongside the four controls in ADR-009, and **`timestamp without time zone` is banned** with a CI guard (ADR-024). TASK-006, TASK-008, TASK-009, TASK-017, TASK-039, TASK-062 and TASK-093 reflect this; ~130 planning documents were updated.

> **Palette correction, 2026-09-02 — the §26.3 colours do not pass WCAG AA as text.** Running axe against `/design/components` in a real browser (TASK-012 … TASK-015 §17, "axe clean") measured `--text-tertiary` at **2.75:1** — the token used for every placeholder and every piece of metadata in the product — and found `--success` (3.21), `--error` (3.93), `--warning` (2.02) and `--info` (3.90) all below the 4.5:1 floor §26.8 binds us to. White on the destructive button was 4.13:1. Blueprint §26.8 also records coral as "valid for large text"; at 2.79:1 it is below the 3:1 large-text threshold too, so that claim is wrong.
>
> **The brand fills are unchanged.** Coral on a button is the brand, and it is legible with `--on-primary` on top. What changed: `--text-tertiary` is corrected to `#726E6B`, and there is now a text-safe variant of each accent (`--primary-text`, `--success-text`, `--error-text`, `--warning-text`, `--info-text`) for when one of them is applied to *words* rather than to a fill, plus `--error-strong` for the destructive button. Measurements and reasoning are in `apps/site/src/styles/tokens.css`; `src/styles/__tests__/tokens.test.ts` measures every text token against every surface in both themes, so a future palette edit is measured rather than reviewed.

## Overall Progress

```text
Total Phases:   12
Total Modules:  36
Total Sprints:  36
Total Epics:    45
Total Tasks:    104
```

## Status Breakdown

```text
Pending:    91
Progress:   1
Completed:  12
```

**Overall completion: 12%**  _(12 of 104 tasks completed)_

## Phase Progress

| Phase | Release | Total Tasks | Pending | Progress | Completed | % |
|---|---|---:|---:|---:|---:|---:|
| [PHASE-01](phase-01/PHASE-01.md) — Foundation & Architecture | Release 1 | 16 | 3 | 1 | 12 | 75% |
| [PHASE-02](phase-02/PHASE-02.md) — Identity, Authorization & Onboarding | Release 1 | 13 | 13 | 0 | 0 | 0% |
| [PHASE-03](phase-03/PHASE-03.md) — Core Domain — Members, Occasions, Memories & Timeline | Release 1 | 16 | 16 | 0 | 0 | 0% |
| [PHASE-04](phase-04/PHASE-04.md) — Media Pipeline — Capture, Upload, Processing & Secure Delivery | Release 1 | 11 | 11 | 0 | 0 | 0% |
| [PHASE-05](phase-05/PHASE-05.md) — Time Capsules & The Delivery Guarantee | Release 1 | 12 | 12 | 0 | 0 | 0% |
| [PHASE-06](phase-06/PHASE-06.md) — The apps — offline store, sync & background upload | Release 1 | 7 | 7 | 0 | 0 | 0% |
| [PHASE-07](phase-07/PHASE-07.md) — Notifications — Push, Email & The Trigger Matrix | Release 1 | 5 | 5 | 0 | 0 | 0% |
| [PHASE-08](phase-08/PHASE-08.md) — Privacy, Data Rights, Billing, Trust & Safety, Admin | Release 1 | 12 | 12 | 0 | 0 | 0% |
| [PHASE-09](phase-09/PHASE-09.md) — Hardening — Security, Accessibility, Performance & Resilience | Release 1 | 7 | 7 | 0 | 0 | 0% |
| [PHASE-10](phase-10/PHASE-10.md) — Launch — Marketing Site, Honest Claims & Staged Rollout | Release 1 | 5 | 5 | 0 | 0 | 0% |
| [PHASE-11](phase-11/PHASE-11.md) — Release 2 — "Together" (Shared Vaults, Collaboration, Broadcasts & AI) | Release 2 | 0 | 0 | 0 | 0 | 0% |
| [PHASE-12](phase-12/PHASE-12.md) — Release 3 — "Gifting & Legacy" (Commerce, Group Gifting & Legacy Vault) | Release 3 | 0 | 0 | 0 | 0 | 0% |

## Module Progress

| Module | Phase | Tasks | Completed | % |
|---|---|---:|---:|---:|
| [MOD-01-01](phase-01/module-01/MOD-01-01.md) — Repository, Toolchain & Data Layer | PHASE-01 | 10 | 7 | 70% |
| [MOD-01-02](phase-01/module-02/MOD-01-02.md) — Design System Foundation | PHASE-01 | 6 | 5 | 83% |
| [MOD-02-01](phase-02/module-01/MOD-02-01.md) — Authentication & Sessions | PHASE-02 | 9 | 0 | 0% |
| [MOD-02-02](phase-02/module-02/MOD-02-02.md) — Authorization Chokepoint & Vault Ownership | PHASE-02 | 3 | 0 | 0% |
| [MOD-02-03](phase-02/module-03/MOD-02-03.md) — Onboarding & Personalization | PHASE-02 | 1 | 0 | 0% |
| [MOD-03-01](phase-03/module-01/MOD-03-01.md) — Members & Relationships | PHASE-03 | 6 | 0 | 0% |
| [MOD-03-02](phase-03/module-02/MOD-03-02.md) — Occasions & Events Engine | PHASE-03 | 3 | 0 | 0% |
| [MOD-03-03](phase-03/module-03/MOD-03-03.md) — Memories | PHASE-03 | 4 | 0 | 0% |
| [MOD-03-04](phase-03/module-04/MOD-03-04.md) — Timeline & Discovery | PHASE-03 | 3 | 0 | 0% |
| [MOD-04-01](phase-04/module-01/MOD-04-01.md) — In-App Capture | PHASE-04 | 2 | 0 | 0% |
| [MOD-04-02](phase-04/module-02/MOD-04-02.md) — Resumable Upload & Outbox | PHASE-04 | 5 | 0 | 0% |
| [MOD-04-03](phase-04/module-03/MOD-04-03.md) — Derivative Processing & Secure Delivery | PHASE-04 | 4 | 0 | 0% |
| [MOD-05-01](phase-05/module-01/MOD-05-01.md) — Capsule Creation & Sealing | PHASE-05 | 5 | 0 | 0% |
| [MOD-05-02](phase-05/module-02/MOD-05-02.md) — Delivery Engine | PHASE-05 | 3 | 0 | 0% |
| [MOD-05-03](phase-05/module-03/MOD-05-03.md) — Recipient Experience | PHASE-05 | 2 | 0 | 0% |
| [MOD-05-04](phase-05/module-04/MOD-05-04.md) — Private Sharing | PHASE-05 | 2 | 0 | 0% |
| [MOD-06-01](phase-06/module-01/MOD-06-01.md) — Installability & Platform Integration | PHASE-06 | 3 | 0 | 0% |
| [MOD-06-02](phase-06/module-02/MOD-06-02.md) — background sync layer, Offline Reads & Sync | PHASE-06 | 4 | 0 | 0% |
| [MOD-07-01](phase-07/module-01/MOD-07-01.md) — Push Infrastructure & Notification Centre | PHASE-07 | 3 | 0 | 0% |
| [MOD-07-02](phase-07/module-02/MOD-07-02.md) — Trigger Matrix & Email Templates | PHASE-07 | 2 | 0 | 0% |
| [MOD-08-01](phase-08/module-01/MOD-08-01.md) — Privacy Centre, Audit Log & App Lock | PHASE-08 | 2 | 0 | 0% |
| [MOD-08-02](phase-08/module-02/MOD-08-02.md) — Data Rights — Export & Deletion | PHASE-08 | 2 | 0 | 0% |
| [MOD-08-03](phase-08/module-03/MOD-08-03.md) — Subscriptions, Entitlements & Quota | PHASE-08 | 3 | 0 | 0% |
| [MOD-08-04](phase-08/module-04/MOD-08-04.md) — Trust & Safety and the Operator Console | PHASE-08 | 5 | 0 | 0% |
| [MOD-09-01](phase-09/module-01/MOD-09-01.md) — Security Assurance | PHASE-09 | 3 | 0 | 0% |
| [MOD-09-02](phase-09/module-02/MOD-09-02.md) — Quality, Accessibility & Performance | PHASE-09 | 2 | 0 | 0% |
| [MOD-09-03](phase-09/module-03/MOD-09-03.md) — Resilience & Operational Readiness | PHASE-09 | 2 | 0 | 0% |
| [MOD-10-01](phase-10/module-01/MOD-10-01.md) — Marketing Site & Honest Claims | PHASE-10 | 3 | 0 | 0% |
| [MOD-10-02](phase-10/module-02/MOD-10-02.md) — Production Readiness & Staged Rollout | PHASE-10 | 2 | 0 | 0% |
| [MOD-11-01](phase-11/module-01/MOD-11-01.md) — Shared Vaults, Albums & Collaboration | PHASE-11 | 0 | 0 | 0% |
| [MOD-11-02](phase-11/module-02/MOD-11-02.md) — Broadcasts, Festivals & Multi-Channel Delivery | PHASE-11 | 0 | 0 | 0% |
| [MOD-11-03](phase-11/module-03/MOD-11-03.md) — AI Layer — Search, Transcription, Grouping & Recaps | PHASE-11 | 0 | 0 | 0% |
| [MOD-11-04](phase-11/module-04/MOD-11-04.md) — Growth, Retention & Household Plan | PHASE-11 | 0 | 0 | 0% |
| [MOD-12-01](phase-12/module-01/MOD-12-01.md) — Gift Commerce — Validation, Catalog & Checkout | PHASE-12 | 0 | 0 | 0% |
| [MOD-12-02](phase-12/module-02/MOD-12-02.md) — Legacy Vault, Nominees & The Unlock Protocol | PHASE-12 | 0 | 0 | 0% |
| [MOD-12-03](phase-12/module-03/MOD-12-03.md) — Marketplace, Generative Creations & Memorial Pages | PHASE-12 | 0 | 0 | 0% |

## Current Development Position

```text
Current Phase:  PHASE-01 — Foundation & Architecture
Current Module: MOD-01-02 — Design System Foundation
Current Sprint: SPR-01-02-01 — Design System & Navigation Shell
Current Epic:   EPIC-01-02-01-03 — Application Shell & Navigation (progress)
Last Done:      TASK-016 — the navigation shell. Built and tested; held at
                `progress` for one §17 criterion — safe-area insets have not
                been seen on real hardware, only with a forced 34px value in
                Chromium. Open /app on an iPhone and it is done.
                Before that: TASK-012 / 013 / 014 / 015 — the twelve primitives,
                at /design/components (pnpm --filter @mm/web dev).
Note:           TASK-005 (CI) and TASK-006 (AWS) deferred by decision — the
                data layer was reachable without them. Development uses the
                PostgreSQL installed on the machine (mm_dev / mm_test), not a
                container, until TASK-006 provisions Aurora.
Next Task:      TASK-005 (CI) and TASK-006 (AWS) close PHASE-01, or
                PHASE-02 TASK-017 begins the real product.
```

**Start here → [TASK-016 §20](phase-01/module-02/sprint-01/epic-03/task-016/TASK-016.md) — one criterion outstanding**

## Critical Path

The differentiating capability is the delivery guarantee. The shortest path to a demonstrable product is:

```text
PHASE-01 Foundation & Architecture
  ↓
PHASE-02 Identity, Authorization & Onboarding
  ↓
PHASE-03 Core Domain — Members, Occasions, Memories & Timeline
  ↓
PHASE-04 Media Pipeline — Capture, Upload, Processing & Secure Delivery
  ↓
PHASE-05 Time Capsules & The Delivery Guarantee
  ↓
PHASE-06 The apps — offline store, sync & background upload
  ↓
PHASE-07 Notifications — Push, Email & The Trigger Matrix
  ↓
PHASE-08 Privacy, Data Rights, Billing, Trust & Safety, Admin
  ↓
PHASE-09 Hardening — Security, Accessibility, Performance & Resilience
  ↓
PHASE-10 Launch — Marketing Site, Honest Claims & Staged Rollout
```

Do not reorder PHASE-05 earlier than PHASE-04: a capsule cannot be sealed before media can be durably stored.

## Status Rules

- Allowed statuses: `pending` · `progress` · `completed`
- A task becomes `completed` only when implementation exists, tests are written and passing, acceptance criteria are verified, and no blocking issue remains.
- An epic/sprint/module/phase becomes `completed` only when every child is `completed`.
- **Nothing in this plan starts as `completed`.** The blueprint describes what the system should become, not what exists.
