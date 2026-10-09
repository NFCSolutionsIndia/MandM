# TASK-038 — Build Calendar Views (Month, Year, Agenda) with Event CRUD

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-038 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-02 — Occasions & Events Engine](../../../MOD-03-02.md) |
| Sprint | [SPR-03-02-01 — Event Model, Recurrence & Reminders](../../SPR-03-02-01.md) |
| Epic | [EPIC-03-02-01-02 — Calendar Views & Event Management](../EPIC-03-02-01-02.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-037`, `TASK-014` |
| Blueprint refs | `§29.12` |

---

## 1. Objective

Build the three calendar views, the add/edit event form, and the event detail sheet, per blueprint §29.12.

---

## 2. Context

Blueprint §29.12 specifies the views (month grid with type-coloured dots, year heat view, agenda list), the chips (🎂 💍 ✨ ⭐ with a recurrence indicator ↻), the form (title, members, date, recurrence, reminder offsets, notes), and the detail sheet (countdown ring, linked member, planned-items checklist, three CTAs).

---

## 3. Problem Statement

The planned-items checklist in the detail sheet is the quiet centrepiece: it shows whether a memory and a gift exist for this occasion. That single line converts the calendar from information into a prompt, which is the whole reason this module exists.

---

## 4. Expected Outcome

A calendar with three working views, event creation and editing with recurrence and reminders, and a detail sheet that shows what remains to be done for an occasion.

---

## 5. Requirements

### Functional Requirements

- View toggle: Month / Year / Agenda, with the choice remembered.
- Today control returning to the current period.
- Month grid with type-coloured dots; year view as a heat display; agenda as a chronological list.
- Festival events shown by region, toggleable.
- Add/edit: title, linked members, date, recurrence, reminder offsets (multi-select), notes.
- Past one-time date warns "This date has passed — schedule for next year?" **with a one-tap fix rather than a block** (§29.12).
- Detail sheet: countdown ring, linked member, planned-items checklist (memory ✓, gift ✗), CTAs Create memory / Shop gift (hidden until R3) / Edit.
- Empty month: "No occasions this month — add one or import your contacts."

### Technical Requirements

- One query per visible range, using the computed-occurrence function rather than N queries.
- View preference persisted per user.
- The planned-items checklist queries the memory module through its public `queries.ts` (ADR-004).
- Reminder offsets are a multi-select mapping directly to `event_reminders` rows.

---

## 6. Implementation Instructions

1. Build the view container with the three-way toggle and the Today control, persisting the chosen view.
2. Build the month grid using the occurrence function for the visible range plus a small buffer, so scrolling between months feels instant.
3. Build the year heat view and the agenda list from the same data, so switching views is a render change rather than a refetch.
4. Build the add/edit form. The past-date case is a **warning with a one-tap fix**, not a validation block — §29.12 is explicit, and blocking here would be the wrong kind of strictness.
5. Build the detail sheet with the countdown ring (reusing the PHASE-01 Countdown), the linked member, and the planned-items checklist.
6. Hide the "Shop gift" CTA until Release 3 using the release gating established in the navigation config, rather than showing a disabled button (§28.4).
7. Show festival events by region with a toggle, defaulting on. The festival source is the Release 2 admin engine, so for Release 1 use a static regional set and note the handoff.
8. Implement the empty-month state with the §29.12 copy.

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
apps/<ios|android>/features/occasions/page.tsx
apps/<ios|android>/features/occasions/[id]/page.tsx
apps/api/src/features/event/components/MonthGrid.tsx
apps/api/src/features/event/components/YearHeatView.tsx
apps/api/src/features/event/components/AgendaList.tsx
apps/api/src/features/event/components/EventForm.tsx
apps/api/src/features/event/components/EventDetailSheet.tsx
apps/api/src/features/event/components/PlannedItems.tsx
apps/api/src/features/event/actions.ts
apps/api/src/features/event/queries.ts
apps/api/src/features/event/__tests__/calendar.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.12.

**Month grid** — dots coloured by type; a day with several occasions shows a count. Tapping a day opens the agenda for it.

**Year heat view** — twelve compact months, density shaded, for spotting a busy season.

**Agenda** — chronological rows with countdown subtext, grouped by month.

**Chips** — 🎂 birthday · 💍 anniversary · ✨ festival · ⭐ custom, with ↻ for recurring. Colour plus icon, never colour alone.

**Detail sheet** — countdown ring at the top, linked member, then the planned-items checklist:

```
Planned
  ✓ Memory created
  ✗ Gift                     (hidden until Release 3)
```

Then CTAs. Empty month copy verbatim from §29.12.

---

## 12. Business Rules

- A past one-time date warns with a one-tap fix; it never blocks (§29.12).
- Unreleased CTAs are hidden, not disabled (§28.4).
- Chips convey type by icon as well as colour.

---

## 13. Edge Cases

- A day with eight occasions — the grid cell must degrade gracefully to a count.
- A month with no occasions — the empty state, not a blank grid.
- An event linked to a member who was merged away — must resolve to the survivor.
- A recurring event whose next occurrence is years away, in the agenda — must sort sensibly rather than dominating the list.
- Timezone change while the calendar is open — occurrences must not shift a day.
- A very long event title in a grid cell — truncate with full value available.
- Reduced motion — the countdown ring must not animate.
- Rapid month navigation — buffered ranges prevent a fetch per tap.

---

## 14. Error Handling

- A failed range query shows the error template with retry scoped to the calendar, leaving the shell and the view toggle usable.

---

## 15. Security Considerations

- All queries owner-scoped through authz.

---

## 16. Testing Requirements

### Component Tests

- Three views render the same underlying occurrences.
- Today control returns to the current period.
- Past one-time date shows a warning with a working one-tap fix, and does not block submission.
- Planned-items checklist reflects whether a memory exists.
- "Shop gift" CTA absent at Release 1.
- Empty month renders the specified copy.

### E2E Tests

- Create a yearly birthday with two reminder offsets, see it in all three views, open detail, and confirm the countdown.

### Accessibility Tests

- axe on all three views and the form; grid cells are keyboard navigable with dates announced.

---

## 17. Acceptance Criteria

- [ ] Three views implemented per §29.12 with all five states in both themes.
- [ ] Event CRUD works including recurrence and multi-select reminder offsets.
- [ ] Past-date case warns with a one-tap fix rather than blocking.
- [ ] Planned-items checklist accurate.
- [ ] Release-3 CTA hidden, not disabled.
- [ ] Empty-month copy verbatim.
- [ ] One query per range, verified.
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
TASK-037
    ↓
TASK-014
    ↓
TASK-038
```


---

## 20. Implementation Notes

- The planned-items checklist is the part that makes this screen useful. Do not let it slip to a later task.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-02-01-02](../EPIC-03-02-01-02.md).
3. Read the parent Sprint — [SPR-03-02-01](../../SPR-03-02-01.md).
4. Read the parent Module — [MOD-03-02](../../../MOD-03-02.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.12` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
