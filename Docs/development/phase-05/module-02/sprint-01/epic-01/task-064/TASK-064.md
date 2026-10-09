# TASK-064 — Implement Retry Ladder, Delivery Watchdog and Integrity Sweep

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-064 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-02 — Delivery Engine](../../../MOD-05-02.md) |
| Sprint | [SPR-05-02-01 — Scheduler, Channel Ladder, Watchdog & Integrity Sweep](../../SPR-05-02-01.md) |
| Epic | [EPIC-05-02-01-01 — Scheduler & Channel Delivery](../EPIC-05-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-063` |
| Blueprint refs | `§18.4`, `§12.6`, `ADR-020` |

---

## 1. Objective

Implement day-scale retry backoff, the watchdog that pages a human on any missed unlock, and the monthly integrity sweep.

---

## 2. Context

Blueprint §18.4 items 5–7: retries "with exponential backoff over days, not minutes — a bounced mailbox may come back, and there is no hurry once the date has arrived"; a watchdog that "alerts a human if any capsule is past `unlock_at` with no successful attempt" and "must never be routine"; and a monthly sweep verifying job rows, media checksums, and contact freshness.

---

## 3. Problem Statement

These three pieces are what convert the delivery mechanism into a guarantee. The retry ladder handles the ordinary failures. The watchdog catches the extraordinary ones. The sweep catches the silent ones — a capsule whose job row was lost, or whose media was corrupted, would otherwise be discovered only on the delivery date, which for a twenty-year capsule means twenty years too late.

---

## 4. Expected Outcome

Day-scale retries with a bounded window, an hourly watchdog wired to a paging alert, and a monthly sweep that reports orphaned jobs, checksum failures, and stale contacts.

---

## 5. Requirements

### Functional Requirements

- Retry backoff measured in hours and days with a documented maximum window.
- Escalation to notifying the sender when every channel is exhausted.
- Hourly watchdog: any capsule past `unlock_at` with no successful attempt raises a paging alert.
- Monthly sweep: every sealed capsule has a valid future job row; media objects exist and match their checksums; recipient contacts are not stale.
- Sweep findings written to a report and surfaced on the admin delivery-health screen.

### Technical Requirements

- Backoff schedule defined in one place and unit-tested.
- The watchdog queries for the condition rather than inferring it from logs, so it cannot be fooled by a missing log line.
- The alert routes to a paging channel, not to an email nobody reads.
- The sweep is chunked so it can run over a large dataset without long transactions.

---

## 6. Implementation Instructions

1. Implement the backoff schedule: minutes for the first couple of attempts, then hours, then daily, with a documented maximum window (recommend fourteen days) after which the sender is notified and the capsule is marked failed rather than retried forever.
2. Implement escalation: when the ladder is exhausted for a recipient, notify the sender with a specific, actionable message naming the recipient and the reason.
3. Implement the watchdog handler running hourly. The query is simple: sealed capsules with `unlock_at < now()` and no `delivery_attempts` row with a successful status. **Route the alert to a paging channel.**
4. Add a deliberate test that injects a missed unlock and asserts the alert fires. This test is the reason the watchdog can be trusted.
5. Implement the monthly integrity sweep: for each sealed capsule, verify a pending job row exists with the right `run_at`; verify each media object exists and its checksum matches; flag recipients whose contact has not been verified within the freshness threshold.
6. Write findings to a report table and surface counts on the admin delivery-health screen (PHASE-08 builds that screen; expose the query now).
7. Write `docs/DELIVERY-GUARANTEE.md` describing the whole mechanism **and its honest limits** — what is guaranteed, what is best-effort, and what depends on the recipient's contact details remaining valid. Blueprint §37 makes publishing this a launch deliverable.

---

## 7. Architecture

```text
RETRY LADDER (per recipient)
  push → email → (R2: SMS → WhatsApp) → notify sender
  backoff: minutes → hours → daily, max 14 days → mark failed + notify

WATCHDOG (hourly)
  SELECT capsules WHERE state='sealed' AND unlock_at < now()
    AND NOT EXISTS (successful delivery_attempt)
  ──▶ PAGE A HUMAN.  This alert must never be routine.

INTEGRITY SWEEP (monthly, chunked)
  every sealed capsule has a pending job with correct run_at?
  every media object exists and checksums correctly?
  recipient contacts verified within the freshness threshold?
  ──▶ report → admin delivery-health screen
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/workers/src/lib/backoff-schedule.ts
apps/workers/src/handlers/delivery-watchdog.ts
apps/workers/src/handlers/integrity-sweep.ts
apps/workers/src/lib/alerting.ts
packages/db/migrations/0011_integrity_reports.sql
docs/DELIVERY-GUARANTEE.md
apps/workers/src/handlers/__tests__/watchdog.test.ts
apps/workers/src/handlers/__tests__/integrity-sweep.test.ts
```

---

## 9. Data Model

Adds an `integrity_reports` table: id, run_at, capsules_checked, orphaned_jobs, checksum_failures, stale_contacts, findings (JSON).

The sweep is chunked so it never holds a long transaction. Findings are retained so a trend is visible — a rising checksum-failure count is an early warning of storage trouble, and blueprint §12.6 asks for exactly that ("an annual integrity sweep verifying stored checksums against the objects, to catch bit rot before a user does").

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **A capsule past its unlock with no successful attempt pages a human.**
- Retries are measured in hours and days, not minutes.
- A capsule is never retried forever; after the maximum window the sender is told.
- The watchdog queries the condition directly and does not rely on logs.
- The guarantee document states the limits as well as the promises.

---

## 13. Edge Cases

- **An injected missed unlock must fire the alert** — the defining test.
- A capsule delivered to two of three recipients — the watchdog must not fire, but the sweep should flag the incomplete one.
- A capsule whose job row was deleted by accident — the sweep detects the orphan; test by deleting one.
- A media object whose checksum no longer matches — flagged, and worth alerting rather than only reporting.
- A capsule cancelled after its unlock passed — must not trigger the watchdog.
- A very large archive making the sweep slow — chunking and a bounded run window; report partial completion rather than silently truncating.
- A transient provider outage lasting days — backoff should still be within the window and eventually succeed rather than escalating prematurely.
- A recipient address that hard-bounced permanently — escalate to the sender rather than retrying for fourteen days.

---

## 14. Error Handling

- A sweep failure must alert, because a silent sweep failure means the safety net is gone without anyone knowing.

---

## 15. Security Considerations

- The alert payload must not contain capsule content — only ids and counts.

---

## 16. Testing Requirements

### Unit Tests

- Backoff schedule matches the documented ladder and is bounded.

### Integration Tests

- **Injected missed unlock fires the paging alert.**
- Partially delivered capsule does not fire the watchdog but is flagged by the sweep.
- Deleted job row is detected as an orphan.
- Corrupted checksum is detected and alerted.
- Cancelled past-unlock capsule does not fire.
- Hard bounce escalates immediately rather than retrying for the full window.
- Sweep chunking handles a large dataset within the run window.

---

## 17. Acceptance Criteria

- [ ] Backoff ladder implemented, bounded, and unit-tested.
- [ ] Escalation notifies the sender with an actionable message.
- [ ] **Watchdog fires on an injected missed unlock, routed to a paging channel.**
- [ ] Sweep detects orphaned jobs, checksum failures, and stale contacts.
- [ ] Findings surfaced for the admin screen.
- [ ] **`docs/DELIVERY-GUARANTEE.md` written, including honest limits, and reviewed.**
- [ ] Alert payloads contain no capsule content.

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
TASK-063
    ↓
TASK-064
```


---

## 20. Implementation Notes

- The guarantee document is a deliverable of this task, not a follow-up. Blueprint §37 makes publishing it a launch item, and writing it here forces the limits to be understood while the mechanism is fresh.
- If the watchdog ever fires in normal operation, something is wrong with the system, not with the alert threshold.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-02-01-01](../EPIC-05-02-01-01.md).
3. Read the parent Sprint — [SPR-05-02-01](../../SPR-05-02-01.md).
4. Read the parent Module — [MOD-05-02](../../../MOD-05-02.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§18.4`, `§12.6`, `ADR-020` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
