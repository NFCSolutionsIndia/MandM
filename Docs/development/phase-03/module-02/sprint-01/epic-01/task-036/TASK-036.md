# TASK-036 — Create Event Schema with Recurrence and Reminder Offsets

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-036 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-02 — Occasions & Events Engine](../../../MOD-03-02.md) |
| Sprint | [SPR-03-02-01 — Event Model, Recurrence & Reminders](../../SPR-03-02-01.md) |
| Epic | [EPIC-03-02-01-01 — Event Model & Recurrence](../EPIC-03-02-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-030` |
| Blueprint refs | `§34.2`, `§29.12`, `ADR-024` |

---

## 1. Objective

Create `events`, `event_members`, and `event_reminders` per blueprint §34.2, scoped through `lib/authz` and the indexes reminder scheduling needs.

---

## 2. Context

Blueprint §34.2 specifies the model and makes one design decision explicit: "derived occurrences are computed, not stored — a yearly event does not create 50 rows. `last_fired_for_year` prevents duplicate reminders."

---

## 3. Problem Statement

Materialising occurrences is the obvious approach and the wrong one: it forces a backfill job, it breaks when a user edits the base date, and it produces fifty rows per birthday per user. Computing on read keeps the model small and the edits simple. The `last_fired_for_year` guard is what makes reminders idempotent across worker restarts.

---

## 4. Expected Outcome

Three tables with scope columns, indexes, and matrix cells, a `(recurrence, date)` shape that supports range queries, and reminder rows carrying the once-per-year guard.

---

## 5. Requirements

### Functional Requirements

- `events`: id, owner_id, title, type (birthday | anniversary | festival | custom), date, recurrence (none | yearly | monthly), all_day, notes, festival_id (nullable), created_at, archived_at.
- `event_members`: event_id, member_id — many-to-many, because an anniversary has two people.
- `event_reminders`: id, event_id, offset_days (0, 1, 3, 7), channels, last_fired_for_year.
- Birthdays and anniversaries auto-derive from member records rather than requiring duplicate entry.

### Technical Requirements

- scoped by `owner_id` through `lib/authz`; repository module and matrix cell required on all three tables.
- Index supporting "events with an occurrence in this range" queries.
- `last_fired_for_year` as an integer year, not a timestamp, so the guard is exact and comparison is trivial.
- Dates stored as a date plus the owner's timezone context; all arithmetic on absolute instants (ADR-024).

---

## 6. Implementation Instructions

1. Write the schema from §34.2 verbatim in `packages/db/src/schema/event.ts`; generate and read the migration.
2. Add scope enforcement on all three tables with comments naming their authz counterparts.
3. Decide and document how member-derived occasions are represented: either materialised event rows kept in sync, or virtual events computed from `members.birthday`. **Recommend virtual**, because a materialised copy drifts when the member's birthday is corrected via the self-service page. Record the decision — it affects the calendar query in the next sprint.
4. Add the index for range queries. Because occurrences are computed, the query shape is "events whose recurring date falls in this window", which needs care: for yearly events the comparison is on month and day, not the full date. Encode that in the index or a generated column, and document the approach.
5. Extend the seed fixtures with events spanning past and future, including a 29 February birthday and one event with all four reminder offsets.

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
packages/db/src/schema/event.ts
packages/db/migrations/0007_events.sql
apps/api/src/features/event/schema.ts
packages/db/src/seed/fixtures.ts  (extend)
packages/db/src/__tests__/event-rls.test.ts
```

---

## 9. Data Model

Three tables per §34.2.

**Occurrences are computed, never stored.** A yearly birthday is one row, not one per year. This keeps edits simple and avoids a backfill job.

**`last_fired_for_year`** is an integer year. A reminder for 2027 fires once; a worker restart, a clock adjustment, or a duplicate job cannot re-fire it, because the guard compares years rather than timestamps.

**Member-derived occasions** — recommend virtual (computed from `members.birthday`) rather than materialised event rows, so a birthday corrected through the self-service page does not leave a stale duplicate. Record the decision; the calendar query depends on it.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Occurrences are computed on read, never materialised.
- A reminder fires at most once per occurrence, guarded by `last_fired_for_year`.
- All date arithmetic uses absolute instants with an explicit timezone (ADR-024).

---

## 13. Edge Cases

- 29 February with yearly recurrence — decide and document the non-leap-year behaviour (28 February or 1 March); either is defensible, silence is not.
- 31 January with monthly recurrence — same problem, monthly. Document the rule.
- An event whose base date is in the future with `recurrence: none` — must appear once and then not recur.
- A member-derived birthday where the member is deleted — the derived occasion must disappear cleanly.
- An anniversary linked to two members, one of whom is merged away — must follow the surviving record.
- A user changing their timezone — occurrences must not shift by a day.

---

## 14. Error Handling

- An invalid recurrence configuration must be rejected at write time with a specific message, not discovered at reminder time.

---

## 15. Security Considerations

- tenant isolation plus authz on all three tables.

---

## 16. Testing Requirements

### Unit Tests

- Invalid recurrence rejected at write.
- Reminder offsets constrained to the allowed set.

### Database Tests

- tenant isolation negative tests on all three tables.
- Range query uses the intended index (assert via plan).

---

## 17. Acceptance Criteria

- [ ] Three tables created scoped through `lib/authz` and range-query index.
- [ ] Leap-day and month-end recurrence rules documented in §20 and in code.
- [ ] Member-derived occasion approach decided and recorded.
- [ ] `last_fired_for_year` is an integer year.
- [ ] Seed fixtures include a 29 February birthday and a fully-configured reminder set.

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
TASK-030
    ↓
TASK-036
```


---

## 20. Implementation Notes

- The leap-day and month-end rules are small decisions that will be questioned later. Write them down now.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-02-01-01](../EPIC-03-02-01-01.md).
3. Read the parent Sprint — [SPR-03-02-01](../../SPR-03-02-01.md).
4. Read the parent Module — [MOD-03-02](../../../MOD-03-02.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§34.2`, `§29.12`, `ADR-024` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
