# TASK-062 — Implement Delivery Worker with Claim-and-Lock and Recipient Fan-Out

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-062 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-02 — Delivery Engine](../../../MOD-05-02.md) |
| Sprint | [SPR-05-02-01 — Scheduler, Channel Ladder, Watchdog & Integrity Sweep](../../SPR-05-02-01.md) |
| Epic | [EPIC-05-02-01-01 — Scheduler & Channel Delivery](../EPIC-05-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-058`, `TASK-003` |
| Blueprint refs | `§18.4`, `ADR-006`, `gap G-3` |

---

## 1. Objective

Build the delivery handler: claim due jobs with `FOR UPDATE SKIP LOCKED`, fan out per recipient and channel, and record every attempt idempotently.

---

## 2. Context

Blueprint §18.4 items 2–4 specify the mechanism exactly: a tick worker running every minute, `SELECT ... WHERE state='pending' AND run_at <= now() FOR UPDATE SKIP LOCKED LIMIT 100`, fanning out into per-recipient, per-channel attempts "each idempotent by `(capsule, recipient, channel, attempt_no)`".

---

## 3. Problem Statement

The blueprint describes this as "simple, boring, and correct under concurrency", and that is the goal. Every clever optimisation here is a risk to the only promise the product cannot break. Gap G-3 adds one refinement the blueprint does not: the humane delivery window must be resolved **at fire time**, not at seal time, because a recipient may move timezone over twenty years.

---

## 4. Expected Outcome

A handler that delivers each capsule exactly once per recipient per channel, under concurrent workers, with a complete attempt log and no reliance on container clocks.

---

## 5. Requirements

### Functional Requirements

- Claim up to 100 due jobs per tick with locking and a lock expiry.
- For each capsule: load recipients, resolve the humane local window, and decide whether to deliver now or defer within the day.
- Fan out: for each recipient, attempt channels in ladder order.
- Record every attempt with `attempt_no`, provider, and provider message id.
- Set `delivered_at` on the recipient and, when all recipients are delivered, on the capsule.
- Notify the sender on delivery.
- Skip and notify instead of delivering when the recipient member is marked deceased (gap G-4).

### Technical Requirements

- **The claim transaction runs at `READ COMMITTED`** (ADR-006) — PostgreSQL's default, so nothing has to be set. A stricter level takes range locks that make concurrent claim loops block each other on the `WHERE state='pending' AND run_at <= ?` scan instead of skipping. `scripts/verify-db-assumptions.sh` asserts the effective level rather than trusting a server default an operator can change.
- **`run_at` is `timestamptz`, never `TIMESTAMP`** (ADR-024). A `TIMESTAMP` here silently breaks every capsule scheduled past 2038 — the single highest-consequence column in the schema.
- **Database time only.** Never a container clock, for claiming or for window resolution. Use `now()` in the claim predicate, with the connection pinned to `TimeZone = 'UTC'`.
- Lock expiry so a crashed worker's job is reclaimable.
- Idempotency by the attempt uniqueness constraint; a duplicate insert is treated as "already attempted".
- Humane window 09:00–20:00 in the recipient's current timezone, resolved at fire time (gap G-3).
- A job that cannot deliver today defers to the next window rather than failing.

---

## 6. Implementation Instructions

1. Implement the handler in `apps/workers/src/handlers/capsule-delivery.ts`, registered on the PHASE-01 registry.
2. Write the claim query exactly as §18.4 specifies, and confirm via `EXPLAIN` that it uses the partial index `ix_jobs_claim (run_at) WHERE state = 'pending'` (ADR-006) — verify the planner actually chooses it rather than assuming.
3. Resolve the humane window at fire time from the recipient's current timezone where known, falling back to the capsule's `unlock_timezone`. **Do not use the seal-time value if a newer one is available** — that is the gap-G-3 correction.
4. Fan out per recipient. For each, walk the channel ladder: push first (free and instant), then email (guaranteed). Record an attempt row before calling the provider, so a crash mid-call leaves evidence.
5. Treat a duplicate-attempt constraint violation as success-already-recorded, not as an error.
6. Set `delivered_at` per recipient, and on the capsule once every recipient is delivered. Notify the sender.
7. Implement the deceased-recipient skip: do not deliver, notify the owner instead, and record the reason. The copy needs care and review (gap G-4).
8. Ensure no capsule content — note text, media, or recipient address — reaches a log line or Sentry payload.
9. Write the concurrency test with two workers claiming simultaneously and assert exactly one delivery.

---

## 7. Architecture

```text
every minute (apps/workers)
  SELECT ... WHERE state='pending' AND run_at <= now()      ← database time
    FOR UPDATE SKIP LOCKED LIMIT 100                        ← safe concurrency
        │
        ├─ resolve humane window in RECIPIENT'S CURRENT tz   ← at fire time (gap G-3)
        │    outside 09:00–20:00 ? ──▶ defer to next window
        │
        ├─ for each recipient:
        │     insert attempt row (before calling provider)
        │     push ──fail──▶ email ──fail──▶ escalate to sender
        │     set recipient.delivered_at
        │
        ├─ all recipients delivered ? ──▶ capsule.delivered_at
        └─ notify sender

deceased recipient (gap G-4) ──▶ do NOT deliver; notify owner; record reason
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/workers/src/handlers/capsule-delivery.ts
apps/workers/src/lib/humane-window.ts
apps/workers/src/lib/channels/index.ts
apps/workers/src/handlers/index.ts  (register)
apps/workers/src/handlers/__tests__/capsule-delivery.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Database time only** — never a container clock.
- An attempt row is written before the provider is called.
- A duplicate attempt is success-already-recorded, not an error.
- The humane window is resolved at fire time from the recipient's current timezone.
- No capsule content in any log or telemetry payload.
- A deceased recipient is not delivered to; the owner is notified.

---

## 13. Edge Cases

- Two workers claiming the same job — `SKIP LOCKED` prevents it (PostgreSQL 17+); test with genuine concurrency, **and assert the transaction ran at `READ COMMITTED`**. Under the `REPEATABLE READ` default this test can pass at low concurrency and deadlock in production.
- A worker crashing mid-delivery — the lock expires and the job is reclaimed; the attempt log prevents a duplicate send.
- A provider call that times out with the message actually sent — the attempt row exists; on retry, the provider message id or a dedupe key must prevent a second send. Document the approach.
- A recipient whose timezone is unknown — fall back to the capsule's `unlock_timezone`.
- A capsule due at 02:00 local — defer to 09:00 the same day, not the next.
- A capsule already past its window when claimed after an outage — deliver immediately; a late delivery is far better than a missed one. Document this asymmetry against the On This Day rule, which skips late.
- A cancelled capsule whose job was not cancelled — the handler must re-check state and skip.
- A capsule whose media is missing — deliver the note and flag the failure loudly; do not silently deliver an empty capsule.
- Clock skew between workers — irrelevant, because database time is authoritative.

---

## 14. Error Handling

- A provider failure records the attempt with an error code and schedules the next rung. A handler exception is caught per capsule so one bad capsule cannot stall the queue.

---

## 15. Security Considerations

- Worker credentials are scoped; the handler must still verify ownership relationships rather than trusting the payload.
- Content must never reach logs. Add an explicit assertion in the test suite.

---

## 16. Testing Requirements

### Integration Tests

- **Two concurrent workers: exactly one delivery, one attempt row.**
- Crash mid-delivery: job reclaimed after lock expiry, no duplicate send.
- Duplicate attempt insert treated as already-attempted.
- Capsule due at 02:00 defers to 09:00 the same day.
- Late claim after an outage delivers immediately.
- Cancelled capsule is skipped.
- Deceased recipient is skipped and the owner notified.
- Missing media flags loudly rather than delivering empty.
- No capsule content appears in captured log output.

---

## 17. Acceptance Criteria

- [ ] Claim query uses the intended index, verified by plan.
- [ ] **Exactly-once delivery under concurrency, proven by test.**
- [ ] Attempt row written before the provider call.
- [ ] Humane window resolved at fire time from the recipient's current timezone.
- [ ] Late-versus-skip policy documented and consistent with the On This Day decision.
- [ ] Deceased-recipient path implemented with reviewed copy.
- [ ] No content in logs, asserted by test.

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
TASK-058
    ↓
TASK-003
    ↓
TASK-062
```


---

## 20. Implementation Notes

- Keep this handler boring. It is the code that must still be correct when nobody who wrote it is here.
- Record the provider-dedupe approach for the timeout-but-sent case in §20.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-02-01-01](../EPIC-05-02-01-01.md).
3. Read the parent Sprint — [SPR-05-02-01](../../SPR-05-02-01.md).
4. Read the parent Module — [MOD-05-02](../../../MOD-05-02.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§18.4`, `ADR-006`, `gap G-3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
