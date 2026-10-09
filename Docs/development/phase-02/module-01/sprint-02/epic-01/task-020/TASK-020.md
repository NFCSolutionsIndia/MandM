# TASK-020 — Build Signup Screen with Async Validation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-020 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery](../../SPR-02-01-02.md) |
| Epic | [EPIC-02-01-02-01 — Signup, Verification & Login Screens](../EPIC-02-01-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-011`, `TASK-019` |
| Blueprint refs | `§29.3`, `§33.1`, `§33.3` |

---

## 1. Objective

Build `/signup` per blueprint §29.3: name, email, phone with country picker, terms acceptance, social options, and the documented validation behaviour.

---

## 2. Context

The PHASE-01 form primitives already implement the §33 timing rules. This task composes them into the first real form in the product and adds the async uniqueness checks.

---

## 3. Problem Statement

Signup is where the highest proportion of users abandon. Every unnecessary field, every premature validation error, and every dead disabled button costs a real account. The blueprint specifies the behaviour in detail precisely because these details compound.

---

## 4. Expected Outcome

A working signup screen that creates a user, issues a phone OTP, and routes to verification — with inline async uniqueness feedback, a live password-free flow, and a terms checkbox that explains itself when unchecked.

---

## 5. Requirements

### Functional Requirements

- Fields: full name, email, mobile with country-code picker and flag, terms checkbox.
- Region auto-detected from locale, overridable.
- Async email uniqueness → "This email is already registered — Log in instead?" with an inline link.
- Async phone uniqueness.
- Social buttons for Google and Apple above an "or sign up with email" divider.
- Primary button disabled until valid; tapping a disabled button explains what is missing.
- Submitting locks the fields and shows a spinner in the button.

### Technical Requirements

- Server action returning the result union; field errors mapped onto the corresponding Field components.
- Async checks debounced and cancellable, with the spinner-then-tick pattern from §33.4.
- Name validation accepts Unicode, hyphens, and apostrophes — the `@mm/shared` validator already does this.
- Terms acceptance persisted with a timestamp and a policy version.

---

## 6. Implementation Instructions

1. Build the screen in `apps/<ios|android>/features/auth/signup/page.tsx` composing `Field`, `Input`, `Select`, and `Button`.
2. Build the phone input with a country picker that auto-selects from locale. Validate as E.164 for the selected country using the shared validator.
3. Wire async uniqueness for email and phone: debounce, show the checking spinner, then tick or cross with a reason. Cancel an in-flight check when the value changes.
4. Implement `signUpAction` in `features/auth/actions.ts`: validate, create the user, create the personal vault (depends on the vault task), issue a phone OTP, and return the next step. **Do not sign the user in until at least one factor is verified** — decide and record whether a partial session is issued, because it affects the verify-later state.
5. Handle the unique-violation race by returning the non-enumerating registered-account result rather than a database error.
6. Record terms acceptance with the current policy version, so a future policy change can be re-consented.
7. Add the "skip passwords forever?" passkey offer immediately after successful signup, as a dismissible step rather than a blocker.
8. Build all five states: default, submitting, field-error, rate-limited with a live countdown, and server-error with retry.

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
apps/<ios|android>/features/auth/signup/page.tsx
apps/api/src/features/auth/components/SignupForm.tsx
apps/api/src/features/auth/components/PhoneInput.tsx
apps/api/src/features/auth/actions.ts
apps/api/src/features/auth/schema.ts
apps/api/src/features/auth/__tests__/signup.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.3. Single column, generous spacing, Fraunces headline ("Start your vault"), Inter fields.

Order: name → email → phone → terms → primary. Social row above the divider, because a user who wants Google should not scroll past four fields to find it.

**Disabled primary with unchecked terms:** tapping it shows a tooltip or inline message naming the missing requirement (§29.3 specifies this behaviour explicitly). A silent dead button is the failure mode to avoid.

**Async feedback:** trailing adornment in the email field cycles spinner → ✓ or ✕. The already-registered message includes a link straight to login with the email pre-filled.

**Rate-limited state:** "Too many attempts, try again in 4:52" with a live countdown, not a static message.

All states in both themes.

---

## 12. Business Rules

- No password field exists (ADR-008).
- Terms must be actively checked; pre-checking a consent box is not consent.
- The already-registered message is the one place enumeration is acceptable, because the user typed their own address and the alternative is a confusing dead end — but the *reset* flow must remain non-enumerating (§29.6). Record this asymmetry in §20.

---

## 13. Edge Cases

- A user with a Unicode name in Devanagari or Tamil script — must validate and persist correctly.
- A phone number valid in one country and invalid in another when the picker changes — re-validate on country change.
- Async check in flight when the user submits — submission must wait for or re-run the check server-side; never trust the client result.
- Autofill populating fields after hydration, leaving the button disabled because state is stale — read DOM values on mount.
- A soft-deleted account's email being reused, per the decision recorded in TASK-017.
- Offline submission — block with a clear message; account creation cannot be queued.

---

## 14. Error Handling

- Field errors render inline against the field, never as a toast.
- Rate limiting shows a countdown.
- A server failure keeps the entered values so the user does not retype.

---

## 15. Security Considerations

- The server re-validates everything; the client schema is convenience only (ADR-022).
- Uniqueness is decided by the database constraint, not the async check — the check is a hint to the user, not an authorization.
- No credential or code is ever logged from this screen.

---

## 16. Testing Requirements

### Component Tests

- Validation fires on blur, not on the first keystroke.
- Disabled primary explains itself when tapped with terms unchecked.
- Async uniqueness renders spinner then result, and cancels on change.
- Unicode name accepted; single-character name rejected.
- Country change re-validates the phone number.

### E2E Tests

- Playwright: complete signup and land on phone verification.
- Duplicate email shows the login link and navigates with the email pre-filled.

### Accessibility Tests

- axe clean; every field has an associated label; error text is announced politely.

---

## 17. Acceptance Criteria

- [ ] Screen matches §29.3 including field order and social placement.
- [ ] All five states implemented in both themes.
- [ ] Async uniqueness works with cancellation.
- [ ] Unicode names accepted.
- [ ] Disabled primary explains itself.
- [ ] Terms acceptance persisted with version and timestamp.
- [ ] Passkey offer appears after success and is dismissible.
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
TASK-011
    ↓
TASK-019
    ↓
TASK-020
```


---

## 20. Implementation Notes

- Record in §20 the decision on whether a session is issued before verification, and the enumeration asymmetry between signup and reset.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-02-01](../EPIC-02-01-02-01.md).
3. Read the parent Sprint — [SPR-02-01-02](../../SPR-02-01-02.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§29.3`, `§33.1`, `§33.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
