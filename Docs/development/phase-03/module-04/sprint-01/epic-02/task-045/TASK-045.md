# TASK-045 — Implement On This Day with Precision-Aware Matching and Home Cards

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-045 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-04 — Timeline & Discovery](../../../MOD-03-04.md) |
| Sprint | [SPR-03-04-01 — Timeline, Search & On This Day](../../SPR-03-04-01.md) |
| Epic | [EPIC-03-04-01-02 — Search, Filters & On This Day](../EPIC-03-04-01-02.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-039`, `TASK-037` |
| Blueprint refs | `§29.7`, `§13.2`, `§14`, `§7.1` |

---

## 1. Objective

Implement On This Day matching, the Home screen cards (On This Day, Up Next, scheduled deliveries), and the weekly notification job with its once-per-week cap.

---

## 2. Context

Blueprint §7.1 calls On This Day the cheapest strong retention mechanic in the product. Section §14 specifies the notification: "once per week maximum, only when there is genuinely something from a past year; 09:00 local". Section §13.2 requires that precision be respected.

---

## 3. Problem Statement

The precision requirement is the substance here. A memory recorded as "1974" must not be surfaced as "on this day in 1974", because it did not happen on this day — we only know the year. Getting this wrong produces a notification that is subtly false, on a product whose entire value is being trustworthy about the past.

---

## 4. Expected Outcome

A Home screen with the §29.7 cards, an On This Day query that respects precision, and a weekly notification capped at one per week and sent at a humane local hour.

---

## 5. Requirements

### Functional Requirements

- On This Day matching month and day across prior years, **excluding memories whose precision is coarser than `day`**.
- Home card with a year badge ("3 years ago today").
- Card suppressed when there is nothing genuinely from a past year.
- Home also shows Up Next (nearest occasion) and the scheduled-deliveries strip (stubbed until PHASE-05).
- Weekly job selecting the best day and enqueuing one notification, at 09:00 in the user's timezone.
- Hard cap of one On This Day notification per user per week.

### Technical Requirements

- Matching compares month and day, and filters on `occurred_precision IN ('exact','day')`.
- The weekly job enqueues; PHASE-07 delivers.
- Cap enforced by recording the last send, so a retry or restart cannot double-send.
- Home cards render from cache first where available, then revalidate (§29.7).

---

## 6. Implementation Instructions

1. Implement the On This Day query with the precision filter. Write the exclusion test first — it is the requirement most likely to be lost.
2. Build the Home screen per §29.7 in priority order: Up Next hero, scheduled-deliveries strip, memory prompts, recent memories, and the banners.
3. Implement the Up Next card from the event module's next-occurrence helper, with the two CTAs (Create memory / Set a reminder — the gift CTA is Release 3).
4. Stub the scheduled-deliveries strip against the same future-band source interface used by the timeline, so PHASE-05 fills both at once.
5. Implement the memory-prompts carousel as the deterministic Release-1 version noted in §29.7 — template-driven, not AI. Reference §15 A10, which upgrades it in Release 2.
6. Implement the weekly job: choose the day with the most or most-favourited matches, enqueue one notification, record the send, and respect the user's timezone for the 09:00 target.
7. Enforce the weekly cap by recording the last send per user and checking it before enqueuing, in the same transaction.
8. Implement the Home empty state with the §29.7 copy: "Your memory box is empty — let's create your first one", plus the secondary import affordance.

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
apps/<ios|android>/features/page.tsx
apps/api/src/features/discovery/on-this-day.ts
apps/api/src/features/discovery/components/OnThisDayCard.tsx
apps/api/src/features/discovery/components/UpNextCard.tsx
apps/api/src/features/discovery/components/MemoryPrompts.tsx
apps/workers/src/handlers/on-this-day.ts
apps/workers/src/handlers/index.ts  (register)
apps/api/src/features/discovery/__tests__/on-this-day.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.7, in priority order: time-aware greeting with bell and search → **Up Next hero** → scheduled deliveries strip → memory prompts → recent memories grid → banners.

**On This Day card** — the memory, a year badge ("3 years ago today"), and a tap into the detail view. Absent entirely when there is nothing true to show; a card saying "nothing from today" is worse than no card.

**Empty state** — §29.7 copy verbatim, plus "Import from your phone".

---

## 12. Business Rules

- **A memory with precision coarser than `day` never appears in On This Day** (§13.2).
- The card is suppressed rather than showing an empty variant.
- One On This Day notification per user per week, maximum (§14).
- Delivered at 09:00 in the user's timezone, not the server's.
- The job enqueues; it does not send.

---

## 13. Edge Cases

- **A 1974 year-precision memory on 14 March — must not match.** This is the defining test.
- A month-precision memory — also excluded.
- 29 February — decide whether it matches on 28 February or 1 March in non-leap years, consistent with the TASK-036 recurrence rule.
- A user with no memories older than a year — no card, no notification.
- Several matches on the same day — pick one deterministically (favourites first, then most media) so the card does not flicker between renders.
- A user in a timezone where 09:00 has already passed when the job runs — send today or wait for tomorrow; decide and document.
- The job running twice in a week after an outage — the cap must hold.
- A memory soft-deleted between selection and send — must not be surfaced.

---

## 14. Error Handling

- A failure computing On This Day must simply omit the card; it must never block the Home screen from rendering.

---

## 15. Security Considerations

- Vault-scoped.
- The notification payload must not contain memory content beyond what is needed to deep-link — push payloads are not a safe place for a private note.

---

## 16. Testing Requirements

### Unit Tests

- **Year-precision memory excluded from a day-specific match.**
- Month-precision memory excluded.
- Exact and day precision included.
- Deterministic selection among several matches.
- 29 February rule consistent with recurrence.

### Integration Tests

- Weekly cap prevents a second enqueue in the same week, including after a job restart.
- 09:00 target respects the user's timezone.
- Soft-deleted memory is not surfaced.

### Component Tests

- Card suppressed when nothing qualifies.
- Home empty state uses the specified copy.

### Accessibility Tests

- axe on Home; cards are reachable and labelled; the year badge is announced.

---

## 17. Acceptance Criteria

- [ ] On This Day respects precision, proven by the exclusion tests.
- [ ] Home screen implemented per §29.7 in priority order, all five states, both themes.
- [ ] Up Next card wired to the event module.
- [ ] Scheduled-deliveries strip stubbed against the shared future-band interface.
- [ ] Weekly job enqueues at most one notification per user per week, proven across a simulated restart.
- [ ] Timezone-correct 09:00 target.
- [ ] Card suppressed when nothing qualifies.
- [ ] Empty-state copy verbatim.
- [ ] axe clean.

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
TASK-039
    ↓
TASK-037
    ↓
TASK-045
```


---

## 20. Implementation Notes

- The precision exclusion is the whole reason this task is not trivial. Write those tests first.
- Record the 29 February and timezone-late decisions in §20.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-04-01-02](../EPIC-03-04-01-02.md).
3. Read the parent Sprint — [SPR-03-04-01](../../SPR-03-04-01.md).
4. Read the parent Module — [MOD-03-04](../../../MOD-03-04.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.7`, `§13.2`, `§14`, `§7.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
