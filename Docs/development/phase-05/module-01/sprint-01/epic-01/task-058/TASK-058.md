# TASK-058 — Implement Transactional Seal with Immutability and Entitlement Gates

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-058 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-01 — Capsule Creation & Sealing](../../../MOD-05-01.md) |
| Sprint | [SPR-05-01-01 — Capsule Model, Seal Transaction & Authorization](../../SPR-05-01-01.md) |
| Epic | [EPIC-05-01-01-01 — Capsule Model & Transactional Seal](../EPIC-05-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-057`, `TASK-028` |
| Blueprint refs | `§18.4`, `§17.2`, `§29.15`, `ADR-006` |

---

## 1. Objective

Implement the seal operation: validate, evaluate entitlements once, write capsule state and the scheduled job in one transaction, and freeze content thereafter.

---

## 2. Context

Blueprint §18.4 item 1: "Sealing writes a `ScheduledJob(kind='capsule_delivery', run_at=unlock_at)` inside the **same transaction** that flips the capsule to `sealed`. There is no window in which a capsule is sealed but unscheduled."

---

## 3. Problem Statement

This is the single most consequential function in the codebase. If the capsule row commits and the job row does not, the product has silently made a promise it will not keep, and nobody finds out until the date passes. The atomicity test is therefore written first and is an acceptance criterion in its own right.

---

## 4. Expected Outcome

A `sealCapsule()` function that is atomic, enforces the free-tier gates and the verified-email requirement, snapshots entitlements, and makes content immutable.

---

## 5. Requirements

### Functional Requirements

- Validate: at least one recipient, each with a usable contact method; `unlock_at` in the future; memory exists and belongs to the vault.
- Enforce the verified-email gate from §29.4.
- Enforce free-tier gates: at most three **pending** capsules, horizon at most twelve months.
- Snapshot entitlements.
- In one transaction: set `state = sealed`, `sealed_at`, `editable_until`, generate per-recipient tokens, and insert the `capsule_delivery` job.
- After sealing, reject any content mutation; allow cancellation and recipient contact updates.
- Support both `datetime` and `milestone` unlock kinds.

### Technical Requirements

- One database transaction covering every write, including the job row.
- "Pending" is defined as `state = sealed AND delivered_at IS NULL` (§10 `Subscription` note).
- Milestone unlock resolves an absolute `unlock_at` at seal time from the member's birthday and the spec (`age:18`), and stores both.
- Tokens: 32 bytes CSPRNG, hashed, version 1.
- Cancellation sets `cancelled_at` and cancels the job in the same transaction.

---

## 6. Implementation Instructions

1. **Write the atomicity test first**: inject a failure after the capsule update and before the job insert, and assert the capsule is still `draft`.
2. Implement validation. The no-usable-contact case is a **hard block** — §29.15 is explicit that this is the one place friction is correct.
3. Enforce the verified-email gate by calling the PHASE-02 check, honouring the grace state.
4. Enforce the free-tier gates by counting pending capsules and comparing the horizon. Use the shared constants so the pricing decision lives in one place. **Delivered capsules are never counted** (Appendix C-8).
5. Resolve milestone unlocks to an absolute instant at seal time, storing both the spec and the resolved date, so the promise is fixed even if the member's birthday is later corrected. Note that tension in §20 — correcting a birthday after sealing is a real case and the resolution must be deliberate.
6. Perform every write in one transaction, including the job insert. Use the PHASE-01 job table.
7. Implement immutability: a guard on memory and note mutation that refuses when the referenced capsule is sealed, surfaced as a specific error the UI can explain.
8. Implement cancellation, cancelling the job in the same transaction.
9. Register the sealed-capsule provider for the PHASE-03 memory-deletion guard hook.
10. Register the `SealedCapsulesSource` implementation for the PHASE-03 future-band interface.

---

## 7. Architecture

```text
sealCapsule()
  ├─ validate  (recipients · contact · future date · memory)
  ├─ verified-email gate            (PHASE-02)
  ├─ entitlement gates              3 pending · 12-month horizon (free)
  ├─ resolve milestone → absolute unlock_at
  │
  └─ BEGIN ─────────────────────────────────────────────
       capsules      state=sealed, sealed_at, editable_until
       recipients    token_hash, token_version=1
       scheduled_jobs  kind=capsule_delivery, run_at=unlock_at
     COMMIT ────────────────────────────────────────────
        ▲
        └─ both rows, or neither. There is no third outcome.
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/features/capsule/seal.ts
apps/api/src/features/capsule/entitlements.ts
apps/api/src/features/capsule/milestone.ts
apps/api/src/features/capsule/immutability.ts
apps/api/src/features/capsule/actions.ts
apps/api/src/features/capsule/__tests__/seal-atomicity.test.ts
apps/api/src/features/capsule/__tests__/entitlements.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal features/capsule/seal.ts
```

### Request

```json
{
  "memoryId": "uuid",
  "recipients": [{ "memberId": "uuid", "email": "ella@example.com" }],
  "unlockKind": "milestone",
  "milestoneMemberId": "uuid",
  "milestoneSpec": "age:18",
  "unlockTimezone": "Asia/Kolkata",
  "senderNote": "For your eighteenth."
}
```

### Response

```json
{ "ok": true, "data": { "capsuleId": "uuid", "unlockAt": "2044-06-04T00:00:00Z" } }
```

### Validation

- Owner authorized to seal (owner-only cell)
- Email verified (§29.4 gate)
- At least one recipient with a usable contact method
- Resolved unlock_at strictly in the future
- Pending-capsule count within the tier allowance
- Horizon within the tier allowance

### Error Responses

| Status | Code | When |
|---|---|---|
| 403 | `AUTHZ_DENIED` | Not the capsule owner |
| 403 | `CAPSULE_EMAIL_UNVERIFIED` | Scheduling requires a verified email |
| 409 | `CAPSULE_NO_USABLE_CHANNEL` | A recipient has no email or phone — hard block with a fix link |
| 409 | `CAPSULE_PENDING_LIMIT` | Three pending capsules already; delivered ones are not counted |
| 409 | `CAPSULE_HORIZON_LIMIT` | Beyond the twelve-month free horizon |
| 422 | `CAPSULE_UNLOCK_IN_PAST` | Resolved unlock date is not in the future |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Capsule state and job row commit together, or neither commits.**
- Content is frozen once sealed; the owner may still cancel and may update recipient *contact details*, never recipient identity (§10).
- Entitlements are evaluated once, at seal time, and never re-applied (§17.2 item 4).
- Pending means sealed and undelivered. Delivered capsules never count against the cap.
- No usable contact method is a hard block.

---

## 13. Edge Cases

- **Failure between the capsule update and the job insert — must roll back both.** The defining test.
- A milestone whose resolved date is in the past (a member already older than the spec) — reject with a clear message naming the resolved date.
- A member's birthday corrected after sealing — the resolved `unlock_at` stands, because the promise was made against it. Document this; it is a real and arguable case.
- A free user at exactly three pending capsules who cancels one — the fourth becomes sealable immediately.
- A capsule sealed at the horizon boundary (365 days) — boundary inclusive or exclusive; decide and test.
- A recipient with a phone but no email on a tier where SMS is unavailable — treat as no usable channel for this tier, and say which channel is missing.
- A deceased member as recipient (gap G-4) — block at seal time with careful copy, and record the copy decision in §20.
- Concurrent seal attempts on the same memory from two devices — one succeeds; the second sees the sealed state and fails cleanly.
- Sealing while offline — blocked by design (§9.4); the draft persists.

---

## 14. Error Handling

- Every gate failure names the specific limit and the remedy. A generic "cannot seal" is unacceptable on this screen.

---

## 15. Security Considerations

- Owner-only, enforced through authz.
- Tokens generated with a CSPRNG and stored hashed.
- Immutability is enforced server-side; a client that omits the check must still be refused.
- The entitlement snapshot is what prevents a billing state from breaking a promise.

---

## 16. Testing Requirements

### Unit Tests

- Milestone resolution computes the correct absolute date across timezones.
- Past-resolved milestone rejected.
- Pending count excludes delivered capsules.
- Horizon boundary behaves as documented.

### Integration Tests

- **Injected failure after the capsule update leaves the capsule `draft` and no job row** — atomicity.
- Successful seal creates exactly one job row with `run_at = unlock_at`.
- Post-seal content mutation is refused.
- Cancellation cancels the job in the same transaction.
- Unverified email blocks sealing.
- No-usable-channel blocks sealing.
- Concurrent seal: one succeeds, one fails cleanly.
- Deceased recipient blocked.

---

## 17. Acceptance Criteria

- [ ] **Atomicity proven by injected failure in both directions.**
- [ ] All six documented gates enforced with specific errors.
- [ ] Content immutable after seal, enforced server-side.
- [ ] Cancellation atomic with job cancellation.
- [ ] Entitlements snapshotted and never re-evaluated.
- [ ] Milestone resolution correct and fixed at seal time.
- [ ] Memory-deletion guard provider registered.
- [ ] Future-band source registered.
- [ ] Birthday-correction and deceased-recipient decisions recorded in §20.

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
TASK-057
    ↓
TASK-028
    ↓
TASK-058
```


---

## 20. Implementation Notes

- Write the atomicity test before the implementation. It is the reason this task exists.
- The birthday-correction case is genuinely arguable. Whatever is decided, write it down — a user will ask.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-01-01-01](../EPIC-05-01-01-01.md).
3. Read the parent Sprint — [SPR-05-01-01](../../SPR-05-01-01.md).
4. Read the parent Module — [MOD-05-01](../../../MOD-05-01.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§18.4`, `§17.2`, `§29.15`, `ADR-006` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
