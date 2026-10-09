# TASK-070 — Build Install Prompt Flow with iOS Walkthrough

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-070 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-01 — Store release & platform integration](../../../MOD-06-01.md) |
| Sprint | [SPR-06-01-01 — Store listings, first launch & share extension](../../SPR-06-01-01.md) |
| Epic | [EPIC-06-01-01-01 — Store listings, icons & first-launch experience](../EPIC-06-01-01-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-069` |
| Blueprint refs | `§9.2`, `§29.28` |

---

## 1. Objective

Capture `store install`, show a custom install card only after the first successful save, and provide a tailored iOS store install walkthrough.

---

## 2. Context

Blueprint §9.2 is specific about timing: "never on first load. Trigger the custom install card only *after* the first successful save — the moment the user has something worth keeping. Store dismissal; ask at most twice."

---

## 3. Problem Statement

Install matters functionally on iOS because push requires it. But an install prompt on arrival is the most-dismissed pattern on the web, and a permanent dismissal costs the notification channel too. Timing it to the moment the user has something worth protecting converts far better and respects them.

---

## 4. Expected Outcome

An install card that appears at the right moment on Android, an equivalent walkthrough on iOS, dismissal persistence with a two-ask limit, and a post-install confirmation.

---

## 5. Requirements

### Functional Requirements

- Capture and defer `store install`.
- Show the card only after the first successful memory save.
- iOS variant: illustrated store install steps, since Safari has no prompt API.
- Persist dismissal; ask at most twice, then never.
- Detect standalone mode and never prompt an installed instance.
- Post-install confirmation, then the contextual notification prompt at first seal (PHASE-07 owns that prompt).

### Technical Requirements

- Standalone detection via `display-mode: standalone` media query plus the iOS `navigator.standalone` fallback.
- Dismissal count in `localStorage`, wrapped in try/catch (a private window can throw).
- Platform detection for the iOS variant should be capability-based where possible rather than user-agent sniffing.

---

## 6. Implementation Instructions

1. Add a listener capturing `store install` and storing the event, preventing the default mini-infobar.
2. Trigger the card from the memory-save success path — not from a route change or a timer.
3. Build the Android card with a single primary action calling `prompt()` on the stored event.
4. Build the iOS walkthrough: a sheet with the Share icon, "Add to Home Screen", and a short explanation of why it helps (notifications). Illustrate the steps; iOS users cannot be prompted, so clarity is the only tool.
5. Persist dismissals and enforce the two-ask limit. Wrap storage access in try/catch and default to "already asked" on failure rather than nagging.
6. Detect standalone and suppress everything.
7. Show a brief post-install confirmation, and hand off to PHASE-07 for the notification permission request at first seal.

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
apps/<ios|android>/features/onboarding/NotificationPrimer
apps/<ios|android>/features/onboarding/FirstLaunch
apps/<ios|android>/features/onboarding/launch-state
apps/site/src/hooks/useInstallPrompt.ts
apps/<ios|android>/features/onboarding/__tests__/first-launch
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Android card** — appears after the first save, inline rather than as a modal interruption: "Keep M&M one tap away" with an Install action and a dismiss. Warm, not urgent.

**iOS walkthrough** — a sheet with three illustrated steps (Share → Add to Home Screen → Add) and one line on why: "Installing lets us tell you the moment your memory arrives."

Both dismissible without penalty. After two dismissals, never shown again.

---

## 12. Business Rules

- Never prompt on first load (§9.2).
- Trigger only after a successful save.
- At most two asks, ever.
- Never prompt an installed instance.
- Storage failure defaults to not asking.

---

## 13. Edge Cases

- A user who installs from the browser menu without the card — standalone detection must suppress the card thereafter.
- Private browsing where `localStorage` throws — default to not asking.
- `store install` never firing (already installed, or unsupported) — the card must not appear with a dead button.
- iOS in a non-Safari browser, where Add to Home Screen is unavailable — detect and omit the walkthrough rather than giving instructions that will not work.
- Desktop Chrome — install is available and worth offering, but the copy should suit desktop rather than talking about a home screen.
- A user who dismisses twice then genuinely wants to install — provide a path in settings so the two-ask limit is not a dead end.

---

## 14. Error Handling

- A failed `prompt()` call must not leave a spinner; return to the card with the option intact.

---

## 15. Security Considerations

- No behavioural nagging; dismissal is respected.

---

## 16. Testing Requirements

### Component Tests

- Card does not render before the first save.
- Card renders after the first save.
- Two dismissals suppress it permanently.
- Standalone mode suppresses it.
- Storage throwing defaults to not asking.
- iOS variant renders instead of the prompt card.
- Non-Safari iOS omits the walkthrough.

### E2E Tests

- Android Chrome: save a memory, see the card, install, and confirm the card never returns.

### Accessibility Tests

- axe on card and walkthrough; dismiss has an accessible name.

---

## 17. Acceptance Criteria

- [ ] Card gated on first successful save, proven by test.
- [ ] iOS walkthrough present, with non-Safari detection.
- [ ] Two-ask limit enforced and storage failure handled.
- [ ] Standalone instances never prompted.
- [ ] Settings path available after dismissal.
- [ ] Verified installing on a real iPhone and a real Android.
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
TASK-069
    ↓
TASK-070
```


---

## 20. Implementation Notes

- On iOS the walkthrough is the only lever, and push depends on it. Make the "why" line concrete rather than generic.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-01-01-01](../EPIC-06-01-01-01.md).
3. Read the parent Sprint — [SPR-06-01-01](../../SPR-06-01-01.md).
4. Read the parent Module — [MOD-06-01](../../../MOD-06-01.md).
5. Read the parent Phase — [PHASE-06](../../../../PHASE-06.md).
6. Read the relevant blueprint sections: `§9.2`, `§29.28` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
