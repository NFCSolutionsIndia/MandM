# TASK-029 — Build Onboarding Carousel and Three-Step Personalization Quiz

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-029 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-03 — Onboarding & Personalization](../../../MOD-02-03.md) |
| Sprint | [SPR-02-03-01 — Onboarding Flow & Personalization Quiz](../../SPR-02-03-01.md) |
| Epic | [EPIC-02-03-01-01 — Onboarding Carousel & Personalization Quiz](../EPIC-02-03-01-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-022`, `TASK-026` |
| Blueprint refs | `§29.2`, `§5.1`, `§27.3` |

---

## 1. Objective

Build the three-slide onboarding carousel and the three-step quiz, persisting answers and mapping the reminder-style answer to real notification defaults.

---

## 2. Context

Blueprint §29.2 specifies the slides and the three quiz questions, and adds a pointed instruction: the quiz must have real, visible consequences, "or it is theatre". Section §27.3 also notes that the third slide advertises the gift shop, which does not exist until Release 3.

---

## 3. Problem Statement

Two things make this task more than a form. First, the third slide must not promise a shop that is not there — the blueprint provides substitute copy ("Seal them until the day that matters") and §30.1 forbids implying unreleased features. Second, the reminder-style answer must actually configure notification defaults, because a quiz that changes nothing trains users to skip everything the product asks.

---

## 4. Expected Outcome

A three-slide carousel and three-step quiz, every step skippable and resumable, with answers persisted and the reminder-style answer demonstrably setting notification defaults.

---

## 5. Requirements

### Functional Requirements

- Slides: capture memories · schedule delivery · **"Seal them until the day that matters"** (Release-1 substitute for the gifts slide).
- Skip in the top right; progress dots; swipe and Next.
- Quiz step 1: who matters most — Family, Friends, Partner, Everyone.
- Quiz step 2: which occasions — Birthdays, Anniversaries, Festivals, Just because (multi-select).
- Quiz step 3: reminder style — Gentle, On-point, Minimal.
- Footnote: "You can change this anytime."
- Answers persisted server-side; flow resumable from the last incomplete step.
- Reminder style maps to notification defaults: Gentle = weekly digest plus 3-day reminders; On-point = day-of plus 1-day; Minimal = day-of only.

### Technical Requirements

- Each step commits its answer on advance, so an abandoned flow retains progress.
- The mapping lives in one constant consumed by PHASE-07, and is asserted by test.
- Funnel events for step viewed, step completed, and skipped — with no PII in the payload (ADR-021).
- Carousel respects reduced motion by cross-fading rather than sliding.

---

## 6. Implementation Instructions

1. Build the carousel at `/welcome` with the three slides. **Use the Release-1 substitute copy for slide three** and add a comment referencing §27.3, so whoever ships commerce knows to restore the original.
2. Build the three quiz steps as separate routes (`/welcome/purpose`, `/welcome/people`, `/welcome/first`) so back and forward behave naturally and the flow is resumable by URL.
3. Persist each answer on advance via a server action. Store purpose and reminder style on the user, and occasions as an array.
4. Create `packages/shared/src/constants/notification-defaults.ts` holding the reminder-style mapping, and write the assertion test that PHASE-07 will rely on.
5. Step 2 collects up to three people. Because member import lands in PHASE-03, keep this to name plus optional birthday, writing rows that PHASE-03 will extend — and check with that phase's schema so this does not need a migration later.
6. Step 3 offers capture or upload and hands off to PHASE-03's create flow. Until that exists, route to the empty Home with the first-memory prompt visible, and note the handoff in §20.
7. Explain camera permission **before** triggering the browser prompt, per §29.2. On denial, offer the upload path immediately rather than dead-ending.
8. Emit funnel events at each step. These are the activation metrics blueprint §31.11 tracks.
9. Handle resume: on entry, redirect to the first incomplete step.

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
apps/<ios|android>/features/auth/welcome/page.tsx
apps/<ios|android>/features/auth/welcome/purpose/page.tsx
apps/<ios|android>/features/auth/welcome/people/page.tsx
apps/<ios|android>/features/auth/welcome/first/page.tsx
apps/api/src/features/onboarding/components/Carousel.tsx
apps/api/src/features/onboarding/components/ChipQuestion.tsx
apps/api/src/features/onboarding/components/PermissionPrimer.tsx
apps/api/src/features/onboarding/actions.ts
packages/shared/src/constants/notification-defaults.ts
packages/db/migrations/0005_user_preferences.sql
apps/api/src/features/onboarding/__tests__/mapping.test.ts
```

---

## 9. Data Model

Adds preference columns (or a `user_preferences` table) for `purpose`, `occasions` (text[]), and `reminder_style`. Scoped by `user_id` through `lib/authz`. Included in the PHASE-08 export and removed on deletion.

**The mapping constant** — the whole point of the quiz:

| Reminder style | Notification defaults |
|---|---|
| Gentle | weekly digest + reminders 3 days before |
| On-point | day-of + 1 day before |
| Minimal | day-of only |

PHASE-07 reads this constant when creating a user's initial notification preferences. The assertion test in this task is what guarantees the two stay connected.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.2. Warm illustrations, one clear value proposition per slide, Skip top-right, progress dots.

Quiz steps use large chips, one question per screen, with the footnote "You can change this anytime." Multi-select on occasions only.

**Permission primer** — a friendly screen before the OS prompt: what is being asked for, why, and a "not now" that does not punish. Blueprint §29.2 requires this ordering, and it matters: a first-contact denial is very hard to recover.

Empty and error states inherited from the PHASE-01 templates.

---

## 12. Business Rules

- **Do not advertise the gift shop before it exists** (§27.3, §30.1). Use the substitute copy.
- Every step is skippable. A user who skips everything must still reach a working Home.
- The quiz must change something observable, or it should not be asked (§29.2).
- Camera permission is explained before it is requested.

---

## 13. Edge Cases

- A user who skips every step — must land on Home with the generic first-memory prompt and no broken personalisation.
- Abandonment mid-quiz then return days later — resume at the first incomplete step, without repeating answered questions.
- Camera permission denied — offer upload immediately; never a dead end.
- A user adding three people with no contact details — allowed here, but PHASE-03 must show the delivery-blocked warning; do not silently create unusable members.
- Reduced motion — carousel cross-fades.
- Browser back mid-flow — must not lose a committed answer.
- A returning verified user who already completed onboarding hitting `/welcome` — redirect to Home rather than restarting.

---

## 14. Error Handling

- A failed answer save must not block advancing; queue it and retry, since losing a quiz answer is less bad than blocking activation. Record this trade-off in §20.

---

## 15. Security Considerations

- Quiz answers are personal data: included in export, deleted with the account.
- Funnel events carry no PII (ADR-021).

---

## 16. Testing Requirements

### Unit Tests

- **Mapping test: each reminder style produces the documented notification defaults.**

### Integration Tests

- Answers persist and are readable after a session restart.
- Resume lands on the first incomplete step.

### Component Tests

- Carousel advances by swipe and button; skip exits at any point.
- Chip questions support single and multi-select as specified.
- Reduced motion cross-fades.

### E2E Tests

- Full flow from verification to Home.
- Skip-everything path reaches a working Home.
- Camera-denied path offers upload.
- Completed user visiting `/welcome` is redirected.

### Accessibility Tests

- axe on carousel and all three steps; chips are keyboard operable with clear selected state.

---

## 17. Acceptance Criteria

- [ ] Carousel and three quiz steps implemented per §29.2, with the Release-1 substitute copy on slide three.
- [ ] All steps skippable; skip-everything reaches a working Home.
- [ ] Answers persisted server-side and resumable.
- [ ] **Reminder-style mapping asserted by test** and consumed from a shared constant.
- [ ] Permission primer precedes the browser prompt; denial offers upload.
- [ ] Funnel events emitted with no PII.
- [ ] Completed users redirected away from the flow.
- [ ] axe clean on every screen.

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
TASK-022
    ↓
TASK-026
    ↓
TASK-029
```


---

## 20. Implementation Notes

- The substitute slide copy must be reverted when commerce ships. Leave the comment that says so.
- The mapping test is small and load-bearing: it is the contract between this phase and PHASE-07.
- Record the answer-save failure trade-off in §20.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-03-01-01](../EPIC-02-03-01-01.md).
3. Read the parent Sprint — [SPR-02-03-01](../../SPR-02-03-01.md).
4. Read the parent Module — [MOD-02-03](../../../MOD-02-03.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§29.2`, `§5.1`, `§27.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
