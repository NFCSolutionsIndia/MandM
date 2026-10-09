# TASK-085 — Create Subscription Schema with Denormalised Entitlements

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-085 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-03 — Subscriptions, Entitlements & Quota](../../../MOD-08-03.md) |
| Sprint | [SPR-08-03-01 — Billing, Entitlements & Paywalls](../../SPR-08-03-01.md) |
| Epic | [EPIC-08-03-01-01 — Subscription, Checkout & Entitlement Enforcement](../EPIC-08-03-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-017` |
| Blueprint refs | `§10 Subscription`, `§17.2`, `Appendix C-6` |

---

## 1. Objective

Create the `subscriptions` table with denormalised entitlement columns per blueprint §10, and the entitlement resolution function every gate reads.

---

## 2. Context

Blueprint §10 specifies the entitlement columns and three enforcement notes: pending means sealed and undelivered, the horizon check applies at seal time only, and **there is deliberately no `memories_per_month` field because that limit does not exist**.

---

## 3. Problem Statement

Denormalising entitlements onto the row means every gate is a single read rather than a plan lookup plus a feature-matrix join. More importantly, it makes the seal-time snapshot natural: the values that applied when the promise was made are recorded, and a later change cannot reach back.

---

## 4. Expected Outcome

A subscription table with entitlement columns, a resolution function returning a typed entitlement object, and free-tier defaults sourced from the shared pricing constants.

---

## 5. Requirements

### Functional Requirements

- Fields per §10 including `razorpay_customer_id`, `currency`, `region`.
- Entitlement columns: `storage_quota_bytes`, `max_pending_capsules`, `max_capsule_horizon_days`, `max_video_seconds`, `channels_enabled`, `ai_features_enabled`, `seats`, `broadcast_recipients_per_month`.
- `resolveEntitlements(userId)` returning a typed object, with free-tier defaults when no subscription exists.
- **No `memories_per_month` column.**

### Technical Requirements

- Free-tier values from `packages/shared/src/constants/plans.ts`, created in PHASE-02.
- Scoped by `user_id` through `lib/authz`.
- The resolution function is the only way entitlements are read; no feature queries the table directly.
- Values per §17.2: free = 10 GB, 3 pending capsules, 365-day horizon, 5-minute video, in-app plus email channels.

---

## 6. Implementation Instructions

1. Write the schema from §10 including every entitlement column; generate and read the migration.
2. Add tenant isolation and an index on `user_id`.
3. Populate the free-tier defaults from the shared constants, so the §17.2 decision lives in exactly one place.
4. Implement `resolveEntitlements()` returning free-tier values when no active subscription exists, and the row's values otherwise.
5. **Add a test asserting no `memories_per_month`-style column exists**, and a comment explaining why — this is a decision that will be questioned, and the blueprint (Appendix C-6) gives the reasoning.
6. Wire the PHASE-05 seal gates and the PHASE-04 quota check to this function, replacing any interim constants.
7. Extend the seed fixtures with a free user and a premium user.

---

## 7. Architecture

```text
Clients: iOS (Swift) · Android (Kotlin) · web (marketing, /c/[token], admin)
  ↓ /api/v1
lib/authz  ← every read and write passes here
  ↓
feature service (src/features/*)
  ↓ Drizzle
PostgreSQL + RLS   R2 (media, private, signed URLs only)
  ↑
apps/workers (delivery engine, media pipeline)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
packages/db/src/schema/subscription.ts
packages/db/migrations/0016_subscriptions.sql
apps/api/src/features/billing/entitlements.ts
packages/shared/src/constants/plans.ts  (extend)
apps/api/src/features/billing/__tests__/entitlements.test.ts
```

---

## 9. Data Model

`subscriptions` per §10, with entitlements denormalised onto the row so every gate is one read.

**Free tier (§17.2):** 10 GB storage · **unlimited memories** · 3 pending capsules · 365-day horizon · 5-minute video · in-app + email channels.

**Premium:** 250 GB · unlimited pending · unlimited horizon + age milestones · 30-minute video · all channels.

**There is no `memories_per_month` column.** Appendix C-6 decided against an upload counter: it is a recurring monthly wall that teaches users not to upload, and it saves nothing (10 GB costs roughly \$0.15/month at full use). A test asserts the column's absence.

**Entitlements are snapshotted at seal time** (§17.2 item 4). A downgrade cannot reach back and invalidate a promise.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Entitlements are read only through `resolveEntitlements()`.
- Free-tier values come from the shared constants.
- **No memory-count entitlement exists.**
- A seal snapshots the entitlements it used.

---

## 13. Edge Cases

- A user with no subscription row — free-tier defaults, not an error.
- A subscription in `past_due` — decide whether entitlements still apply during dunning; recommend yes until the grace period ends, and document it.
- A cancelled subscription still within its paid period — entitlements apply until `current_period_end`.
- A region change (India to US) affecting currency — the entitlement values do not change, only price; verify.
- A manual comp granted by an admin — must flow through the same columns so gates behave identically.
- Two subscription rows for one user (a webhook race) — the schema should prevent it or the resolution must pick deterministically; decide and document.

---

## 14. Error Handling

- A resolution failure must fail closed to free-tier limits, never to unlimited.

---

## 15. Security Considerations

- Entitlements resolved server-side only; a client value is never trusted for a gate.

---

## 16. Testing Requirements

### Unit Tests

- No subscription resolves to free-tier defaults.
- Free-tier values match the shared constants.
- **A `memories_per_month`-style column does not exist.**
- Cancelled-but-within-period still resolves to paid entitlements.
- Resolution failure falls back to free, not unlimited.

### Database Tests

- Scoped by `user_id` through `lib/authz`.

---

## 17. Acceptance Criteria

- [ ] Table created with every entitlement column and tenant isolation.
- [ ] Free-tier defaults from shared constants.
- [ ] **Absence of a memory-count column asserted by test, with the reasoning documented.**
- [ ] PHASE-04 quota and PHASE-05 seal gates now read this function.
- [ ] Fail-closed behaviour on resolution error.
- [ ] `past_due` and duplicate-row decisions recorded in §20.

---

## 18. Definition of Done

- [ ] Implementation complete and matches §4 Expected Outcome
- [ ] Tests from §16 implemented
- [ ] All tests passing locally and in CI
- [ ] Error handling from §14 implemented
- [ ] Security considerations from §15 satisfied
- [ ] All §17 acceptance criteria verified
- [ ] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [ ] No regression in existing tests
- [ ] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-017
    ↓
TASK-085
```


---

## 20. Implementation Notes

- The absent column is a deliberate design decision that looks like an omission. The test and the comment are what stop someone adding it in six months.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-03-01-01](../EPIC-08-03-01-01.md).
3. Read the parent Sprint — [SPR-08-03-01](../../SPR-08-03-01.md).
4. Read the parent Module — [MOD-08-03](../../../MOD-08-03.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§10 Subscription`, `§17.2`, `Appendix C-6` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
7. Read [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and confirm the choices this task depends on.
8. **This Next.js release has breaking changes from earlier conventions — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code** (project `AGENTS.md`).

While implementing:

9. Implement **only** the scope of this task. Do not opportunistically refactor unrelated code.
10. Do not modify files owned by other tasks unless this task's §8 lists them.
11. Create or update the tests named in §16.
12. Run `pnpm lint`, `pnpm typecheck`, and the relevant test command.
13. Verify every §17 acceptance criterion explicitly, one at a time.

After implementing:

14. Update §22 of this document to `completed`.
15. Update the counts in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md).
16. Report which acceptance criteria were verified and how.

**Do not mark this task `completed` until every §17 acceptance criterion has been verified.** If a criterion cannot be met, leave the status as `progress` and record the blocker in §20.

---

## 22. Completion Status

```text
pending
```

Allowed statuses: `pending` · `progress` · `completed`
