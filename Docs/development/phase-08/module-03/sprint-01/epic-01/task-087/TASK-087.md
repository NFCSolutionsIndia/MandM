# TASK-087 — Implement Quota Enforcement, Contextual Paywalls and Accounting Reconciliation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-087 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-03 — Subscriptions, Entitlements & Quota](../../../MOD-08-03.md) |
| Sprint | [SPR-08-03-01 — Billing, Entitlements & Paywalls](../../SPR-08-03-01.md) |
| Epic | [EPIC-08-03-01-01 — Subscription, Checkout & Entitlement Enforcement](../EPIC-08-03-01-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-086`, `TASK-049` |
| Blueprint refs | `§29.26`, `§17.2`, `gap G-5` |

---

## 1. Objective

Enforce quota and tier gates, build the four contextual paywall triggers with their specific copy, and add the storage accounting reconciliation job.

---

## 2. Context

Blueprint §29.26 names the four legitimate paywall triggers in expected frequency order, with capsule horizon first and explicitly instrumented separately. It also states two prohibitions: time capsules are never a paywall trigger, and there is no "memories created this month" trigger because that limit does not exist.

---

## 3. Problem Statement

The paywall copy is the pricing model made visible, and §17.2 argued that the horizon gate converts better precisely because it is emotional rather than punitive: *"This one needs to wait until 2044"* lands at peak intent, where "3 of 3 used" is just a wall. Getting the copy right is the commercial substance of this task. The reconciliation job addresses gap G-5, which flags accounting drift as a known risk.

---

## 4. Expected Outcome

Quota enforced before bytes move, four paywalls with distinct copy and separate instrumentation, and a reconciliation job that detects accounting drift.

---

## 5. Requirements

### Functional Requirements

- Quota enforced at upload-session creation (already wired in PHASE-04; now backed by real entitlements).
- Tier gates: video length, channels, pending capsules, horizon.
- Four paywall triggers with the §29.26 copy: horizon, pending cap, storage, feature access.
- **Horizon conversion instrumented separately** (§17.2).
- Storage meter with a 90% warning.
- Reconciliation job comparing counted usage against actual storage.

### Technical Requirements

- All gates read `resolveEntitlements()`.
- Paywall sheets are contextual, never interstitial (§29.26).
- Analytics events distinguish each trigger so the horizon funnel is measurable on its own.
- Reconciliation is chunked and reports drift rather than silently correcting large discrepancies.

---

## 6. Implementation Instructions

1. Back the PHASE-04 quota check with real entitlements, replacing interim constants.
2. Implement the tier gates for video length and channel availability, and confirm the PHASE-05 pending and horizon gates now read entitlements.
3. Build the four paywall sheets with the §29.26 copy **verbatim**. The horizon copy in particular was written deliberately and tested against the pricing argument; do not paraphrase it.
4. Emit a distinct analytics event per trigger so the horizon funnel can be measured separately, as §17.2 requires.
5. Build the storage meter with the human translation ("about 3,000 photos") and the 90% warning.
6. Implement the reconciliation job: sum actual object sizes under each vault prefix, compare against `storage_used_bytes`, and report drift. **Correct small drift automatically; report large drift for investigation** rather than silently adjusting, since a large discrepancy is a symptom.
7. Verify the two prohibitions: no capsule paywall, no memory-count paywall. Assert both by test.

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
apps/api/src/features/billing/gates.ts
apps/api/src/features/billing/components/PaywallSheet.tsx
apps/api/src/features/billing/components/StorageMeter.tsx
apps/<ios|android>/features/settings/plan/page.tsx
apps/workers/src/handlers/reconcile-storage.ts
apps/api/src/features/billing/__tests__/gates.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Four paywall triggers, §29.26 copy verbatim:**

1. **Horizon** (primary) — "This one needs to wait until 2044. Free plans schedule up to a year ahead."
2. **Pending cap** — "You have 3 memories already waiting."
3. **Storage** — "You're at 10 GB. Premium gives you 250 GB." Shown at 90%, **never a hard block mid-upload**.
4. **Feature** — age milestones, WhatsApp/SMS, broadcasts, AI, heirs.

**Storage meter** — percentage plus a human translation: "6.2 of 10 GB — about 1,900 photos".

**Never a paywall:** time capsules themselves, and memories created this month (that limit does not exist).

---

## 12. Business Rules

- **Time capsules are never a paywall trigger** (Appendix C-8).
- **There is no memory-count trigger** (Appendix C-6).
- Storage paywall appears at 90%, never as a hard block mid-upload.
- Paywalls are contextual sheets, never interstitials.
- The horizon trigger is instrumented separately.

---

## 13. Edge Cases

- A user at 89% starting a 2 GB upload — the quota check at session creation catches it before bytes move, per PHASE-04.
- A user who upgrades mid-upload — the reserved session is honoured; the new quota applies to the next one.
- A downgrade leaving the user over quota — **read-only grace, never deletion** (§32.7, Appendix C-18). Verify this is implemented, not just intended.
- Reconciliation finding large drift — report and alert; do not silently correct, because the cause matters.
- Reconciliation on a huge vault — chunk it.
- A paywall shown to a user who is already Premium (a stale client) — the server gate is authoritative; the sheet must not appear.
- A free user at exactly 3 pending capsules cancelling one — the fourth becomes sealable immediately, per §17.2.

---

## 14. Error Handling

- A gate failure fails closed to the free tier. A paywall that fails to load must not block the underlying action if the entitlement actually permits it.

---

## 15. Security Considerations

- All gates evaluated server-side; a client-side gate is a hint only.

---

## 16. Testing Requirements

### Unit Tests

- Each gate reads entitlements and applies the documented limit.
- Video-length and channel gates correct per tier.

### Integration Tests

- Quota blocks before bytes move.
- **Over-quota after downgrade is read-only, not deleting.**
- Cancelling a pending capsule frees a slot immediately.
- Reconciliation reports drift; large drift alerts rather than auto-correcting.
- Horizon trigger emits its own analytics event.

### Component Tests

- Each of the four paywalls renders its §29.26 copy.
- **No capsule paywall and no memory-count paywall exist**, asserted.

---

## 17. Acceptance Criteria

- [ ] All gates backed by real entitlements.
- [ ] Four paywalls with §29.26 copy verbatim, each instrumented separately.
- [ ] **No capsule or memory-count paywall, asserted by test.**
- [ ] Storage meter with human translation and 90% warning.
- [ ] Over-quota downgrade is read-only, never deleting.
- [ ] Reconciliation job reports drift and alerts on large discrepancies.

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
TASK-086
    ↓
TASK-049
    ↓
TASK-087
```


---

## 20. Implementation Notes

- The horizon paywall is the primary conversion event in the whole model (§17.2). Instrument it separately and watch it from day one.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-03-01-01](../EPIC-08-03-01-01.md).
3. Read the parent Sprint — [SPR-08-03-01](../../SPR-08-03-01.md).
4. Read the parent Module — [MOD-08-03](../../../MOD-08-03.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§29.26`, `§17.2`, `gap G-5` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
