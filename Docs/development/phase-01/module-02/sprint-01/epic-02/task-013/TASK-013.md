# TASK-013 — Build Overlay & Feedback Primitives: Sheet, Dialog, Toast, Snackbar

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-013 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-02 — Design System Foundation](../../../MOD-01-02.md) |
| Sprint | [SPR-01-02-01 — Design Tokens, Primitives & App Shell](../../SPR-01-02-01.md) |
| Epic | [EPIC-01-02-01-02 — Core UI Primitives](../EPIC-01-02-01-02.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-010` |
| Blueprint refs | `§26.9`, `§33.5`, `§33.17`, `§29.13` |

---

## 1. Objective

Build the bottom sheet, confirmation dialog, toast, and undo snackbar with correct focus management and the destructive-action confirmation pattern.

---

## 2. Context

Blueprint §28.1 makes sheets the primary pattern for quick actions on mobile so context is never lost, and §33.5 requires every destructive action to show a confirmation stating its consequence — with typed confirmation for irreversible ones.

---

## 3. Problem Statement

Focus management is the part of overlay UI that is almost always wrong and is invisible to sighted mouse users. Getting it right in the primitive means every sheet in the product is usable by keyboard and screen reader, rather than each one being fixed after an audit.

---

## 4. Expected Outcome

Sheet (bottom on mobile, centred on desktop), Dialog with a confirm variant supporting typed confirmation, Toast with variants, and an undo Snackbar — all with correct focus behaviour and reduced-motion variants.

---

## 5. Requirements

### Functional Requirements

- Sheet: swipe-to-dismiss on touch, backdrop click, Escape; snaps to content height.
- Dialog: confirm variant taking a consequence description and an optional required typed phrase.
- Toast: success, error, info variants; auto-dismiss with a pause on hover or focus.
- Snackbar: action button (Undo) with a timeout, and a queue so two undos do not overwrite each other.
- Focus moves in on open, is trapped, and returns to the trigger on close.

### Technical Requirements

- Radix Dialog as the base for both Sheet and Dialog so focus trap, scroll lock, and ARIA are correct.
- Toast and Snackbar render in a portal above the tab bar, respecting safe-area insets.
- Reduced-motion variants substitute a cross-fade for slide animations.
- Route-aware sheets: PHASE-03 will mount the create sheet as an intercepted route, so the Sheet must work both as a controlled component and inside a route boundary.

---

## 6. Implementation Instructions

1. Build `Sheet` on Radix Dialog with bottom positioning on small viewports and centred positioning above the tablet breakpoint. Add swipe-to-dismiss on touch with a velocity threshold, and make sure a swipe attempt that does not dismiss returns smoothly.
2. Build `Dialog`, then a `ConfirmDialog` wrapper taking `title`, `consequence`, `confirmLabel`, and optional `typedConfirmation`. When `typedConfirmation` is supplied, the confirm button stays disabled until the phrase matches exactly.
3. Build `Toast` with a provider and imperative API, variants, and pause-on-hover/focus. Auto-dismiss must not apply to error toasts that require acknowledgement.
4. Build `Snackbar` for undo, with a queue and a clearly labelled action button.
5. Implement focus management explicitly and test it: focus moves to the first focusable element or the sheet container on open, is trapped, and returns to the triggering element on close (§33.17).
6. Ensure the toast layer sits above the bottom tab bar and honours `env(safe-area-inset-bottom)`.

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
apps/site/src/components/ui/Sheet.tsx
apps/site/src/components/ui/Dialog.tsx
apps/site/src/components/ui/ConfirmDialog.tsx
apps/site/src/components/ui/Toast.tsx
apps/site/src/components/ui/ToastProvider.tsx
apps/site/src/components/ui/Snackbar.tsx
apps/site/src/components/ui/__tests__/Sheet.test.tsx
apps/site/src/components/ui/__tests__/ConfirmDialog.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Sheet** — bottom-anchored on mobile with a drag handle, rounded top corners at the card radius, backdrop scrim. Centred modal above the tablet breakpoint. Content scrolls internally; the page behind never scrolls.

**ConfirmDialog** — title, a plain-language consequence sentence, then actions with the destructive action visually distinct but **not** the default focus target. For irreversible actions, a text input requiring an exact typed phrase, with the confirm button disabled until it matches (§33.5).

**Toast** — top on desktop, above the tab bar on mobile. Success auto-dismisses; error persists until dismissed.

**Snackbar** — bottom, with a single Undo action and a visible timeout.

All with reduced-motion variants (cross-fade instead of slide).

---

## 12. Business Rules

- Every destructive action uses ConfirmDialog with a consequence sentence, never a bare "Are you sure?" (§33.5).
- Irreversible actions require typed confirmation.
- Focus always returns to the trigger on close.
- The destructive button is never the initially focused element.

---

## 13. Edge Cases

- Nested overlays — a confirm dialog opened from inside a sheet must trap focus in the dialog and return it to the sheet, not to the page.
- Swipe-to-dismiss conflicting with a scrollable area inside the sheet — only the drag handle and the non-scrolled region should initiate dismissal.
- Two undo snackbars queued in quick succession — the second must not silently discard the first action's undo window.
- A toast appearing while a sheet is open — it must remain visible and reachable.
- Keyboard-only user on mobile viewport — swipe is unavailable, so Escape and an explicit close button must both work.
- Reduced motion plus swipe-to-dismiss — the dismissal must still feel immediate rather than instant-and-jarring.

---

## 14. Error Handling

- A toast triggered from a failed action must carry actionable copy, not "Something went wrong" — the primitive accepts the copy and must not supply a generic default.

---

## 15. Security Considerations

- Overlay content must not be rendered from unsanitised HTML.

---

## 16. Testing Requirements

### Component Tests

- Sheet: opens, traps focus, closes on Escape and backdrop click, returns focus to the trigger.
- ConfirmDialog: confirm disabled until the typed phrase matches exactly, including case.
- Destructive action is not the initially focused element.
- Toast: success auto-dismisses, error persists, hover pauses the timer.
- Snackbar: two queued undos both remain actionable.
- Nested dialog-in-sheet returns focus to the sheet.

### Accessibility Tests

- axe on each overlay, zero serious or critical violations.
- Keyboard-only open, operate, and dismiss for each overlay.

---

## 17. Acceptance Criteria

- [x] All four primitives implemented with both themes and reduced-motion variants.
- [x] Focus enters, is trapped, and returns — proven by test for each overlay.
- [x] Typed confirmation works and is case-exact.
- [x] Toast layer respects safe-area insets and sits above the tab bar.
- [x] Nested overlay focus behaviour correct.
- [x] axe clean.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally and in CI
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-010
    ↓
TASK-013
```


---

## 20. Implementation Notes

Completed 2026-09-02. `Sheet`, `Dialog`, `ConfirmDialog`, `Toast` (with the snackbar API) and `overlay-focus.ts` are in `apps/site/src/components/ui/`; 11 tests in `__tests__/overlays.test.tsx`, plus the overlay cases in `e2e/a11y.spec.ts`.

**Radix loses the focus target when one overlay opens from inside another.** Measured in Chromium: open the memory sheet, press "Delete memory" to raise the confirmation, press Escape. The confirmation closes and the sheet stays open — correct — but focus lands on `document.body`, behind two overlays. A keyboard user has just declined a confirmation and been thrown out of the sheet they were working in. Two focus scopes unwind at once and the outer re-arms with nothing selected.

`useOverlayReturnFocus` fixes it by capturing the opener at `onOpenAutoFocus` — the one moment the trigger is still the active element — and restoring it in `onCloseAutoFocus` inside a `requestAnimationFrame`. The frame matters: focusing synchronously there is undone by the outer scope re-arming immediately afterwards.

**jsdom could not see any of this.** It has no real inertness and reports `document.body` for every overlay, nested or not, so it cannot tell the bug from the correct behaviour. The unit test therefore asserts only what jsdom can prove — that Escape peels one layer and leaves the sheet open — and the focus assertion lives in `e2e/a11y.spec.ts`.

**Deviation — `Snackbar` is an API, not a component.** §8 lists `Snackbar.tsx`. It shares every line of rendering, queueing, timing and pause-on-hover with `Toast`, so a second component would be a copy that drifts. What actually distinguishes a snackbar is the requirement, and that is expressed in the type: `snackbar()` will not compile without an action, so "Memory moved to Trash" cannot ship without the Undo beside it. `ToastProvider.tsx` is likewise folded into `Toast.tsx` — the provider and the item are one mechanism.

**The queue is not cosmetic.** Delete two memories quickly and a single-slot implementation drops the first undo silently: the user believes both are recoverable and one is already gone. On this product that is someone's photograph. Asserted directly.

Auto-dismiss pauses on hover **and on focus** — a keyboard user tabbing towards Undo must not have it vanish as they arrive. An undo gets 8s against a plain toast's 4s, because it has to be noticed, read and decided on.

The toast layer sits at `bottom-[calc(4rem+max(1rem,env(safe-area-inset-bottom)))]`: clear of the 64px tab bar TASK-016 will add, and clear of the iOS home indicator. Without it the Undo button is underneath the tab bar and cannot be tapped at all.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-02-01-02](../EPIC-01-02-01-02.md).
3. Read the parent Sprint — [SPR-01-02-01](../../SPR-01-02-01.md).
4. Read the parent Module — [MOD-01-02](../../../MOD-01-02.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§26.9`, `§33.5`, `§33.17`, `§29.13` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
completed
```

Allowed statuses: `pending` · `progress` · `completed`
