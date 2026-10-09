# TASK-037 — Implement Occurrence Computation and Reminder Scheduling

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-037 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-02 — Occasions & Events Engine](../../../MOD-03-02.md) |
| Sprint | [SPR-03-02-01 — Event Model, Recurrence & Reminders](../../SPR-03-02-01.md) |
| Epic | [EPIC-03-02-01-01 — Event Model & Recurrence](../EPIC-03-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-036` |
| Blueprint refs | `§34.2`, `§14`, `ADR-024` |

---

## 1. Objective

Implement occurrence computation for a date range and the reminder job that fires each offset exactly once per occurrence.

---

## 2. Context

This is the engine behind the calendar, the Home screen's Up Next card, and the member list's next-occasion subtext. It also registers the first real handlers in the PHASE-01 worker registry.

---

## 3. Problem Statement

Date recurrence is a well-known source of subtle bugs: DST shifts, leap days, month-end clamping, and timezone changes all produce off-by-one-day errors that users notice immediately and trust less afterwards. Getting it right once, in a tested pure function, keeps it right everywhere.

---

## 4. Expected Outcome

A pure `occurrencesInRange(events, from, to, timezone)` function plus a reminder job that computes due reminders, sends them once, and records the year.

---

## 5. Requirements

### Functional Requirements

- `occurrencesInRange` returning occurrences with their absolute instant and source event.
- Next-occurrence helper for a single event, used by the member list and Home.
- Reminder job running daily, computing which offsets are due today per the owner's timezone.
- Each reminder fires once per occurrence, guarded by year.
- Reminders enqueue notifications rather than sending directly, so PHASE-07 owns delivery.

### Technical Requirements

- Pure function, no database access, fully unit-testable — this is what makes the edge cases affordable to cover.
- All arithmetic on absolute instants; never add 24-hour days across a DST boundary.
- The job claims through the PHASE-01 loop and is idempotent: running it twice in one day sends nothing twice.
- Owner timezone determines "today", so a user in Mumbai and one in Chicago get their reminders on their own dates.

---

## 6. Implementation Instructions

1. Write `lib/occurrence/compute.ts` as a pure function. Implement the leap-day and month-end rules decided in TASK-036, and reference that decision in a comment.
2. Handle DST by working in absolute instants and converting for display only. Add a test with an event whose occurrence falls on a DST transition date in a timezone that observes it.
3. Write `nextOccurrence(event, now, timezone)` for the single-event case used by the member list and Home card.
4. Implement the `event-reminder` handler in `apps/workers/src/handlers/`. It should: find events with reminders whose offset matches today in the owner's timezone, filter out those whose `last_fired_for_year` already equals the occurrence year, enqueue notifications, and set the guard **in the same transaction as the enqueue**.
5. Register the handler in the worker registry created in PHASE-01.
6. Do not send anything from this handler. It enqueues; PHASE-07 delivers. Note the dependency so the two are not implemented twice.
7. Write the once-only test by running the handler twice and asserting exactly one enqueue.

---

## 7. Architecture

```text
daily tick (apps/workers)
   │
   ├─▶ for each event with reminders
   │      occurrencesInRange(event, today±window, owner.timezone)
   │      offset matches today?             ──── no ──▶ skip
   │      last_fired_for_year == year?      ──── yes ─▶ skip   ← the guard
   │
   └─▶ TRANSACTION
          enqueue notification  (PHASE-07 delivers)
          set last_fired_for_year = year
       COMMIT                              ← enqueue and guard together, or neither
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/lib/occurrence/compute.ts
apps/api/src/lib/occurrence/next.ts
apps/workers/src/handlers/event-reminder.ts
apps/workers/src/handlers/index.ts  (register)
apps/api/src/lib/occurrence/__tests__/compute.test.ts
apps/workers/src/handlers/__tests__/event-reminder.test.ts
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

- A reminder fires at most once per occurrence. The guard and the enqueue commit together.
- All arithmetic on absolute instants (ADR-024).
- "Today" means today in the owner's timezone.
- This handler enqueues; it does not send.

---

## 13. Edge Cases

- DST transition on the occurrence date — no shift by an hour or a day; test in a timezone that observes DST.
- 29 February in a non-leap year — follows the TASK-036 rule.
- 31 January monthly recurrence in February — follows the TASK-036 rule.
- A user changing timezone between the reminder being due and the job running — decide whether the new or old timezone governs, and document it.
- The job not running for three days (outage) — decide whether missed reminders send late or are skipped. **Recommend: a reminder more than one day late is skipped**, because "your mother's birthday was three days ago" is worse than silence. Record the decision.
- An event edited after its reminder fired for the year — changing the date should allow the new occurrence to fire; the guard is per year, so consider whether an edit should reset it.
- An event archived between due and send — must not send.
- Two workers running the same handler concurrently — the transaction plus row locking must make the second a no-op.

---

## 14. Error Handling

- A failure after enqueue but before the guard commits would double-send. The transaction prevents it; test the failure injection explicitly.

---

## 15. Security Considerations

- The handler runs with worker credentials and must still scope by owner — a bug here could enqueue a notification about one user's event to another.

---

## 16. Testing Requirements

### Unit Tests

- Yearly occurrence across a DST transition produces the correct local date.
- 29 February in a non-leap year follows the documented rule.
- Month-end monthly recurrence follows the documented rule.
- `recurrence: none` produces exactly one occurrence.
- Range boundaries are inclusive/exclusive as documented.
- Two owners in different timezones get different "today" results for the same event date.

### Integration Tests

- **Running the handler twice enqueues exactly once.**
- Injected failure after enqueue rolls back the guard, so no notification is lost and none is duplicated.
- Archived event does not send.
- Concurrent handlers: exactly one enqueue.

---

## 17. Acceptance Criteria

- [ ] All documented recurrence cases pass, including DST, leap day, and month-end.
- [ ] Reminder fires exactly once per occurrence, proven by a double-run test.
- [ ] Enqueue and guard commit atomically, proven by failure injection.
- [ ] Timezone-correct "today" per owner.
- [ ] Handler registered in the worker registry.
- [ ] Missed-reminder policy decided and recorded.

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
TASK-036
    ↓
TASK-037
```


---

## 20. Implementation Notes

- The pure function is what makes the edge cases affordable to test. Resist adding database access to it.
- Record the missed-reminder and timezone-change decisions in §20 — both will be asked about.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-02-01-01](../EPIC-03-02-01-01.md).
3. Read the parent Sprint — [SPR-03-02-01](../../SPR-03-02-01.md).
4. Read the parent Module — [MOD-03-02](../../../MOD-03-02.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§34.2`, `§14`, `ADR-024` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
