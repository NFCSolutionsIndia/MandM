# TASK-022 — Build Login and Password Reset Screens with Non-Enumerating Responses

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-022 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery](../../SPR-02-01-02.md) |
| Epic | [EPIC-02-01-02-01 — Signup, Verification & Login Screens](../EPIC-02-01-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-019`, `TASK-021` |
| Blueprint refs | `§29.5`, `§29.6` |

---

## 1. Objective

Build `/login` with email-or-mobile entry plus passkey quick-login, and the forgot/reset flow whose responses never reveal whether an account exists.

---

## 2. Context

Blueprint §29.5 and §29.6 specify both screens, including the deliberately vague failure message and the "always show success" behaviour on reset.

---

## 3. Problem Statement

Account enumeration on this product is worse than usual: confirming that a given email has a Moments & Memories account reveals something personal about that person. The blueprint's insistence on identical responses is a privacy requirement, not just a security convention.

---

## 4. Expected Outcome

A login screen defaulting to the fastest available method, and a reset flow that behaves identically for existing and non-existing accounts, with a clear expired-token state.

---

## 5. Requirements

### Functional Requirements

- Segmented control: Email / Mobile.
- Passkey quick-login button shown when a credential exists for this device.
- Social login row.
- "Forgot?" link; failure message is "Email or password is incorrect" style — non-specific.
- CAPTCHA after five failed attempts.
- Deactivated account: "Your account is deactivated. Contact support" with a support link.
- Reset: always "If an account exists, we've sent a reset link."
- Expired token: "This link has expired — request a new one" with a one-tap re-request.

### Technical Requirements

- Passkey availability detected via conditional mediation where supported, so the browser can surface a credential without a button press.
- Reset responses identical in body, status, and **timing** — an artificial delay may be needed so a database miss is not faster than a hit.
- Post-reset, offer passkey creation since the user has just proven email control.

---

## 6. Implementation Instructions

1. Build the login screen with the segmented control and the passkey button gated on availability.
2. Implement `requestResetAction` returning the same success result regardless of whether the account exists, and **normalise response timing** — a timing difference is a working enumeration oracle even when the body is identical.
3. Build the reset screen reached from the emailed link, with the expired-token state and a re-request action.
4. After a successful reset, offer passkey creation.
5. Implement the CAPTCHA trigger after repeated failures, and make sure it does not appear on the first legitimate mistake.
6. Handle the deactivated-account state per §29.5, which is the one case where a specific message is correct because the user needs to know to contact support.
7. Write the enumeration test as the defining test: assert identical status, body, and comparable timing for a known and an unknown address.

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
apps/<ios|android>/features/auth/login/page.tsx
apps/<ios|android>/features/auth/forgot/page.tsx
apps/<ios|android>/features/auth/reset/[token]/page.tsx
apps/api/src/features/auth/components/LoginForm.tsx
apps/api/src/features/auth/components/PasskeyButton.tsx
apps/api/src/features/auth/actions.ts  (extend)
apps/api/src/features/auth/__tests__/enumeration.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Login.** Segmented Email / Mobile. When a passkey exists for this device, show it as the prominent primary path with the code option below — a returning user should not have to wait for an email.

**Forgot.** One field, one button, then a success panel with the identical message every time.

**Reset.** Reached from the emailed link. Expired state is explanatory with a one-tap re-request. Success routes to login with the address pre-filled, plus the passkey offer.

**Deactivated.** Clear, non-blaming, with a support link.

---

## 12. Business Rules

- Login failure never distinguishes unknown account from wrong credential.
- Reset always reports success.
- Response timing must not leak existence.
- The deactivated message is the deliberate exception, because the user cannot act without it.

---

## 13. Edge Cases

- A reset requested for an unknown address — success shown, no email sent, and the rate limit still consumed so the endpoint cannot be used as an oracle by volume.
- A reset link used twice — second use shows the expired state.
- A reset link opened after the account is deleted — neutral expired state.
- Passkey present on the device but the user wants a different account — the code path must remain reachable, not buried.
- Passkey ceremony cancelled by the user — return to the screen cleanly with no error toast; cancellation is not a failure.
- CAPTCHA appearing for a legitimate user on a shared IP — trigger on identifier plus IP, not IP alone.

---

## 14. Error Handling

- A network failure during a passkey ceremony must fall back to the code path with an explanation, not leave the user stuck.

---

## 15. Security Considerations

- Identical response body, status, and timing on reset — the timing normalisation is a real requirement, not a nicety.
- Reset token single-use, expiring, stored hashed.
- A fresh session token is issued after reset; any prior session for that user is revoked.

---

## 16. Testing Requirements

### Integration Tests

- **Enumeration test: identical status, body, and comparable timing for known and unknown addresses.**
- Reset token single-use.
- Reset revokes prior sessions.

### Component Tests

- Segmented control switches modes and validates appropriately.
- Passkey button hidden when unavailable.

### E2E Tests

- Login by code; login by passkey with a virtual authenticator; reset end to end including the expired state.

### Accessibility Tests

- axe on all three screens.

---

## 17. Acceptance Criteria

- [ ] All three screens implemented with every state in both themes.
- [ ] Enumeration test passes on body, status, and timing.
- [ ] Reset token single-use; prior sessions revoked.
- [ ] Passkey path primary when available, code path always reachable.
- [ ] Passkey cancellation handled without an error state.
- [ ] CAPTCHA triggers on identifier plus IP.
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
TASK-019
    ↓
TASK-021
    ↓
TASK-022
```


---

## 20. Implementation Notes

- The timing normalisation is easy to omit and easy to test. Do both.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-02-01](../EPIC-02-01-02-01.md).
3. Read the parent Sprint — [SPR-02-01-02](../../SPR-02-01-02.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§29.5`, `§29.6` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
