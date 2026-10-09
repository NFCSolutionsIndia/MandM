# TASK-041 — Build Memory Create Sheet with Precision Date Picker

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-041 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-03 — Memories](../../../MOD-03-03.md) |
| Sprint | [SPR-03-03-01 — Memory Model, CRUD & Screens](../../SPR-03-03-01.md) |
| Epic | [EPIC-03-03-01-02 — Memory Screens](../EPIC-03-03-01-02.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-040`, `TASK-012` |
| Blueprint refs | `§29.14`, `§29.15`, `§13.1` |

---

## 1. Objective

Build the create sheet: media tray, title, the "When did this happen?" picker with precision, the "What did this mean?" note, people, occasion, and privacy.

---

## 2. Context

Blueprint §29.14 and §29.15 specify the form. The date field is called out explicitly: **"When did this happen?" — defaults to today, but explicitly asks.**

---

## 3. Problem Statement

Every other photo product timestamps by upload. Asking when it happened, and accepting "sometime in 1974" as a complete answer, is what makes this an archive rather than a camera roll. The note field is the other half: blueprint §13.4 says the user is asked for exactly one thing no machine can supply — what it meant.

---

## 4. Expected Outcome

A create sheet that captures a memory with honest dates and real meaning, saving optimistically and dismissible while media uploads continue in the background.

---

## 5. Requirements

### Functional Requirements

- Mode tabs for Photo / Video / Voice / Upload — capture arrives in PHASE-04, so Release-1 tabs may be placeholders wired to the file picker.
- Media tray with reorder and remove.
- Title with an optional date-derived default.
- **"When did this happen?"** picker with a precision selector (exact / day / month / year), defaulting to today at day precision.
- EXIF date pre-fill when available (PHASE-04 supplies it; the field must accept it).
- "What did this mean?" note with a character counter.
- People chips and occasion chips.
- Privacy selector defaulting to private.
- Save is optimistic; the sheet can be dismissed while uploads continue.

### Technical Requirements

- Composed from the PHASE-01 primitives so §33 validation timing is inherited.
- Optimistic insert into local state with a pending badge, in a shape PHASE-06 can promote to a full offline outbox.
- Precision selector changes which date components are collected, and the stored value must match the declared precision.
- The note field offers voice dictation where the browser supports it, as a progressive enhancement.

---

## 6. Implementation Instructions

1. Build the sheet as an intercepted modal route at `/app/new` so Back and swipe-back behave natively (§29.14).
2. Build the precision-aware date control: a segmented precision selector plus the matching input — full date, month and year, or year alone. **When precision is reduced, do not silently retain a hidden day component**; store what is declared.
3. Wire the title default from the date, and let the user overwrite it.
4. Build the note field with a counter, and add voice dictation behind a capability check.
5. Add people and occasion chips, sourced from the member and event modules through their public queries.
6. Implement optimistic save: insert locally with a pending state, call the action, reconcile the server id. Structure this so PHASE-06 can replace the local layer with the Room / GRDB outbox without changing the form.
7. Make the sheet dismissible mid-upload, with the queue surviving — this is the behaviour §29.14 requires and it is easy to get wrong by tying upload state to the component lifecycle.
8. Handle the offline case with the §29.14 copy: "Saved on this device, will upload when you're back". Until PHASE-06, this can be a simpler local persistence; note the handoff.

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
apps/<ios|android>/features/@modal/(.)new/page.tsx
apps/api/src/features/memory/components/CreateSheet.tsx
apps/api/src/features/memory/components/OccurredDateField.tsx
apps/api/src/features/memory/components/MediaTray.tsx
apps/api/src/features/memory/components/NoteField.tsx
apps/api/src/features/memory/hooks/useOptimisticCreate.ts
apps/api/src/features/memory/__tests__/create-sheet.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.14. Bottom sheet on mobile, centred on desktop.

Order: media tray → title → **when did this happen?** → what did this mean? → people → occasion → privacy → save.

**The date control** is the distinctive part:

```
When did this happen?
  [ exact | day | month | year ]
  ┌──────────────────────────┐
  │ 14 March 1998            │   ← input matches the chosen precision
  └──────────────────────────┘
```

Choosing "year" collapses the input to a single year field. The stored value matches what was declared — no hidden day component.

**Note field** — placeholder "What did this mean?", counter, optional dictation. This is the product's one irreplaceable question; give it room.

Save is optimistic. The sheet closes; uploads continue.

---

## 12. Business Rules

- The date field asks when it *happened*, never when it was uploaded.
- Reducing precision discards the components it no longer covers.
- Privacy defaults to private (§11.1).
- The sheet is dismissible while uploads continue.

---

## 13. Edge Cases

- A user setting year precision then switching back to day — the day component was discarded, so the field must be empty rather than restoring a stale value.
- EXIF date disagreeing with a user-entered date — the user always wins; do not silently overwrite.
- A future date — allowed; the timeline places it after the Now divider.
- An empty note — allowed; the product should not nag, but the placeholder should invite.
- A very long note — counter and graceful growth.
- Dismissing the sheet immediately after save — the optimistic record must persist and the upload must continue.
- Offline save — local persistence with an honest pending state.
- Dictation unsupported — the option is absent, not broken.

---

## 14. Error Handling

- A save failure must retain the entered content and offer retry. Losing a written note is the worst possible failure on this screen.

---

## 15. Security Considerations

- Server-side validation is authoritative.
- Privacy default is private and cannot be changed by a client default.

---

## 16. Testing Requirements

### Integration Tests

- Optimistic save reconciles the server id.
- Dismissing the sheet mid-save does not lose the memory.

### Component Tests

- Precision selector changes the input and the stored shape.
- Reducing precision discards finer components.
- Title default derives from the date and is overwritable.
- Note counter behaves; dictation option hidden when unsupported.
- Privacy defaults to private.

### E2E Tests

- Create a memory dated 1974 at year precision and confirm the timeline shows "1974", not a day.

### Accessibility Tests

- axe on the sheet; the precision selector is a labelled radio group; focus enters the sheet and returns on close.

---

## 17. Acceptance Criteria

- [ ] Sheet implemented per §29.14–29.15 with all five states in both themes.
- [ ] Precision picker works for all four precisions and stores what it declares.
- [ ] Note field prominent, with counter and optional dictation.
- [ ] Privacy defaults to private.
- [ ] Sheet dismissible mid-save without losing content.
- [ ] Save failure retains entered content.
- [ ] axe clean; focus management correct.

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
TASK-040
    ↓
TASK-012
    ↓
TASK-041
```


---

## 20. Implementation Notes

- Keep the optimistic-save layer thin and replaceable — PHASE-06 swaps it for the Room / GRDB outbox.
- The note is the product. Do not let it become a small field at the bottom.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-03-01-02](../EPIC-03-03-01-02.md).
3. Read the parent Sprint — [SPR-03-03-01](../../SPR-03-03-01.md).
4. Read the parent Module — [MOD-03-03](../../../MOD-03-03.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.14`, `§29.15`, `§13.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
