# TASK-012 — Build Form Primitives: Button, Field, Input, Textarea, Select, OTP

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-012 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-02 — Design System Foundation](../../../MOD-01-02.md) |
| Sprint | [SPR-01-02-01 — Design Tokens, Primitives & App Shell](../../SPR-01-02-01.md) |
| Epic | [EPIC-01-02-01-02 — Core UI Primitives](../EPIC-01-02-01-02.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-010` |
| Blueprint refs | `§26.9`, `§33.1`, `§33.2`, `§33.3` |

---

## 1. Objective

Build the form primitive set with every documented state and the validation behaviour required by blueprint §33.

---

## 2. Context

Blueprint §33 sets binding rules for every form in the product: validate on blur, re-validate on change only after the first error, disable the primary button until valid, show a spinner in place of the label while submitting, and prevent double submission. Encoding those rules in the primitives is the only way they hold across forty screens.

---

## 3. Problem Statement

If each form implements validation timing itself, some will validate on the first keystroke — which §33.1 explicitly forbids because it punishes a user mid-typing. Building the behaviour into `Field` and `Button` makes the correct pattern the easy one.

---

## 4. Expected Outcome

Button (5 variants × 5 states), Field wrapper handling label/hint/error/required, Input, Textarea with character counter, Select, and an OTP input — all themed, accessible, and implementing the §33 timing rules.

---

## 5. Requirements

### Functional Requirements

- Button variants: primary, secondary, tertiary, destructive, icon. States: default, hover, pressed, disabled, loading.
- Loading state replaces the label with a spinner and blocks repeat submission.
- Field renders label, optional hint, error text at 13px, and required marker; associates all of them with the control via `aria-describedby` and `aria-invalid`.
- Input supports leading/trailing adornments and an async-checking state showing a spinner then ✓ or ✕.
- Textarea supports a live character counter.
- OTP input: six boxes, auto-advance, paste of a full code, `autocomplete="one-time-code"`, backspace moving focus back.
- Error state adds a border, an icon, and helper text — never colour alone (§26.8).

### Technical Requirements

- Validation timing implemented in the Field/form layer: on blur first, then on change **only after** an error has been shown.
- Double-submit prevented at the handler, not merely by disabling the button.
- Field shake animation fires only on a submit attempt, never on blur (§33.2), and respects reduced motion.
- OTP uses `autocomplete="one-time-code"` so iOS keyboard autofill works — WebOTP is Chromium-only, so the design must not depend on programmatic auto-fill (§29.0).

---

## 6. Implementation Instructions

1. Build `Button` with variants and states from tokens. The loading state must keep the button width stable so the layout does not jump.
2. Build `Field` as the wrapper owning label, hint, error, and ARIA wiring. Every other input primitive composes inside it rather than duplicating that logic.
3. Build `Input`, `Textarea` (with counter), and `Select` (Radix Select for keyboard and screen-reader behaviour).
4. Build `OtpInput`: six single-character boxes, auto-advance on entry, backspace to the previous box, full-code paste distributed across boxes, and `autocomplete="one-time-code"` on the first box. Test paste explicitly — it is the primary path on iOS.
5. Implement the validation timing rules in a small `useFieldValidation` hook so forms cannot get the timing wrong by accident.
6. Add the async-checking state used later for email uniqueness, promo codes, and PIN serviceability (§33.4): spinner, then ✓ or ✕ with a reason.
7. Write a usage note per primitive showing the correct and incorrect pattern side by side.

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
apps/site/src/components/ui/Button.tsx
apps/site/src/components/ui/Field.tsx
apps/site/src/components/ui/Input.tsx
apps/site/src/components/ui/Textarea.tsx
apps/site/src/components/ui/Select.tsx
apps/site/src/components/ui/OtpInput.tsx
apps/site/src/hooks/useFieldValidation.ts
apps/site/src/components/ui/__tests__/Button.test.tsx
apps/site/src/components/ui/__tests__/Field.test.tsx
apps/site/src/components/ui/__tests__/OtpInput.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Button** — 5 variants × 5 states, in both themes. Loading replaces the label with a spinner at a fixed width. Minimum 44×44px. Disabled primary buttons must still be focusable enough to explain themselves: where a button is disabled pending validity, a tap shows a tooltip or inline message saying what is missing (§29.3 requires exactly this for the terms checkbox) rather than doing nothing.

**Field** — label above, control, then hint or error below at 13px. Error adds border, icon, and text.

**OtpInput** — six boxes, generous spacing, large type. Paste of a six-character code fills all boxes. On error the boxes take an error border and shake **once**, on submit only.

All states designed and tested in light and dark.

---

## 12. Business Rules

- Never validate on the first keystroke (§33.1).
- Error copy states what is wrong and how to fix it (§33.2). The primitive must accept that copy; it must not generate "Invalid input".
- A disabled primary button must be able to explain why it is disabled.
- Never colour alone for state — always an icon or text as well.

---

## 13. Edge Cases

- Paste of a code with spaces or a trailing newline into the OTP input — normalise before distributing.
- Paste of a code longer or shorter than six characters — take the first six digits, ignore non-digits.
- Autofill filling a password field after hydration, leaving internal state stale — read the DOM value on mount.
- A very long validation message wrapping and pushing layout — the Field must reserve or animate space smoothly.
- Rapid double-tap on a slow connection — the handler-level guard, not the disabled attribute, is what prevents the duplicate submission.
- Screen-reader announcement of an error appearing after blur — the error region needs a polite live region so it is announced without stealing focus.

---

## 14. Error Handling

- A submit handler that throws must leave the button recoverable, not stuck in the loading state — reset in a `finally`.

---

## 15. Security Considerations

- No `dangerouslySetInnerHTML`.
- Password inputs must not disable paste — blocking paste actively harms password-manager users.

---

## 16. Testing Requirements

### Component Tests

- Button renders each variant and state; loading state prevents a second click from calling the handler.
- Field associates label, hint, and error with the control, asserted via accessible name and description.
- Validation fires on blur, not on the first keystroke; after an error it re-validates on change.
- OTP: typing advances, backspace retreats, pasting a six-digit code fills all boxes, pasting a spaced code normalises.
- Error state renders an icon in addition to colour.

### Accessibility Tests

- axe check on each primitive in both themes, zero serious or critical violations.
- Full keyboard traversal of a composed form with a visible focus ring at every stop.

---

## 17. Acceptance Criteria

- [x] All six primitives implemented with every documented state in both themes.
- [x] Validation timing matches §33.1, proven by test.
- [x] Double-submit prevented at the handler level, proven by test.
- [x] OTP paste works, including a spaced or padded code.
- [x] Disabled primary buttons can explain themselves.
- [x] axe clean across all primitives.
- [x] Usage note committed for each primitive.

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
TASK-012
```


---

## 20. Implementation Notes

Completed 2026-09-02. `Button`, `Field`, `Input`, `Textarea`, `Select`, `OtpInput` and `useFieldValidation` are in `apps/site/src/components/ui/`; 26 tests in `__tests__/forms.test.tsx`, plus the accessibility suite in `e2e/a11y.spec.ts`.

**A disabled button is `aria-disabled`, never `disabled`.** The native attribute removes the control from the tab order, so a screen-reader user cannot reach it to discover it exists — they are blocked and told nothing. `Button` keeps it focusable, swallows the click, and requires `disabledReason`. Proven by `e2e/a11y.spec.ts`, "a soft-disabled button is still reachable by keyboard".

**Double-submit is a 400ms timestamp window, not a microtask.** The first version released the guard in `queueMicrotask`, which is shorter than the gap between the two clicks of a double-click — so it swallowed nothing and the handler fired twice. Reading the code did not catch that; the test did. 400ms is the conventional double-click threshold: long enough to absorb an accident, short enough that deliberate repeated clicking ("add another") is unaffected because that is always slower.

**Every component had `focus-visible:outline-none` with nothing put back.** `globals.css` defines a global focus ring; each primitive then cancelled it with a Tailwind utility, and utilities beat the base layer. Every control in the library was silently unfocusable-looking. Found by the end-to-end "focus is always visible when tabbing through" test, which tabs 25 stops and requires a computed outline or box-shadow on each — no automated rule can tell a styled ring from a missing one, so the check had to be written. All eight occurrences removed; the base rule now applies.

**Deviation — `Select` is Radix, not native.** §6.3 says Radix Select; recorded here because the reason matters for review. A native `<select>` is better on mobile and cannot be styled, and this product needs option rows carrying a description ("Grandmother · sees everything shared with the family") and a disabled option that states why it is unavailable. Neither fits in an `<option>`.

**Deviation — file layout.** §8 proposes `hooks/useFieldValidation.ts`; it lives at `components/ui/useFieldValidation.ts`, beside the only components that use it. §8 also proposes one test file per primitive; they are grouped as `forms.test.tsx` / `overlays.test.tsx` / `display.test.tsx` / `chips.test.tsx` / `progress.test.tsx`, which keeps a primitive's tests next to the tests of the primitives it composes with.

**Usage notes** (§6.7) are rendered at `/design/components` rather than written as prose: a Do/Don't pair with its reason, shown at the moment someone is deciding. A README is read once, if ever.

The OTP paste path is the primary flow on iOS, where WebOTP does not exist. It is tested for "123 456" and "Your code is 123456", but **it has not yet been tried on a real device** — do that before Release 1.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-02-01-02](../EPIC-01-02-01-02.md).
3. Read the parent Sprint — [SPR-01-02-01](../../SPR-01-02-01.md).
4. Read the parent Module — [MOD-01-02](../../../MOD-01-02.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§26.9`, `§33.1`, `§33.2`, `§33.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
