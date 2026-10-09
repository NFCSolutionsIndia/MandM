# TASK-021 — Build Dual Verification Screens (Phone OTP + Email Link)

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-021 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery](../../SPR-02-01-02.md) |
| Epic | [EPIC-02-01-02-01 — Signup, Verification & Login Screens](../EPIC-02-01-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-019`, `TASK-020` |
| Blueprint refs | `§29.4`, `§29.0` |

---

## 1. Objective

Build the two-step verification flow: phone OTP with six boxes and accurate resend countdown, then email verification with a documented verify-later grace state.

---

## 2. Context

Blueprint §29.4 specifies both steps, including the confetti success moment and the amber banner that appears when a user chooses "I'll verify later". Section §29.0 records that WebOTP auto-fill is Chromium-only, so this flow must not depend on it.

---

## 3. Problem Statement

The verify-later path is the interesting part. Blocking a new user entirely until they check their email loses accounts; letting them in with no verification means a capsule can be sealed by an owner nobody can reach. The blueprint resolves this by gating **scheduling specifically** — which is exactly the right trade, and it needs to be implemented as a real gate rather than a note.

---

## 4. Expected Outcome

Step 1 verifies the phone with a six-box OTP input, auto-fill where available, paste everywhere, and an accurate resend countdown. Step 2 offers email verification with a working "verify later" that sets a gate the seal flow will later honour.

---

## 5. Requirements

### Functional Requirements

- Step 1: six auto-advancing boxes, `autocomplete="one-time-code"`, paste support, 30s resend countdown, "Change number" link.
- Error: boxes shake once and show "Incorrect code — 2 attempts left". Lockout after five with a countdown.
- Step 2: masked address ("r•••@gmail.com"), animated envelope, "Open email app", 60s resend, and "I'll verify later".
- Success: full-screen confetti and "You're in! 🎉", then route onward.
- Verify-later sets a persistent amber banner on Home: "Verify email to unlock scheduling."

### Technical Requirements

- WebOTP registered where supported; on iOS rely on keyboard autofill plus paste (§29.0). **The design must work with neither.**
- Resend countdown driven by `getResendAvailableAt` from the OTP service, not a client-side guess, so a page reload shows the true remaining time.
- Confetti respects `prefers-reduced-motion` — a static celebratory badge instead (§33.8, §33.13).
- The verify-later gate is a server-side check on `users.email_verified_at`, not a client flag.

---

## 6. Implementation Instructions

1. Build step 1 using the PHASE-01 `OtpInput`. Register the WebOTP API where available with a feature check, and make sure the manual and paste paths are fully functional without it.
2. Drive the resend countdown from the server-provided timestamp so a refresh does not reset it.
3. Show remaining attempts in the error copy, per §29.4. Do this carefully: it aids a legitimate user and reveals little, since the identifier is already known to them.
4. Build step 2 with the masked address, the resend cooldown, and the verify-later action. Verify-later must persist a state the rest of the app can read — the simplest correct approach is that nothing is persisted at all, since the gate derives from `email_verified_at` being null.
5. Build the banner component and mount it in the app shell so it appears wherever the user goes, not only on Home.
6. Implement the confetti success moment with a reduced-motion variant.
7. Handle the already-verified case idempotently and warmly, since users click old links.

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
apps/<ios|android>/features/auth/verify/phone/page.tsx
apps/<ios|android>/features/auth/verify/email/page.tsx
apps/<ios|android>/features/auth/verify/email/[token]/route.ts
apps/api/src/features/auth/components/VerifyPhoneForm.tsx
apps/api/src/features/auth/components/VerifyEmailPrompt.tsx
apps/site/src/components/layout/VerifyEmailBanner.tsx
apps/api/src/features/auth/components/Celebration.tsx
packages/emails/src/templates/VerifyEmail.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Step 1 of 2 — phone.** Large heading, the number shown so the user can confirm it, six generously spaced boxes, resend countdown, and a "Change number" link that returns to signup with the value pre-filled.

**Step 2 of 2 — email.** Masked address, animated envelope, "Open email app", "Resend (60s)", and "I'll verify later" as a quiet text link — present but not encouraged.

**Success.** Confetti, "You're in! 🎉", auto-advance after a beat. Under reduced motion: a static badge and the same copy.

**Banner (verify-later).** Amber, persistent, one line, with a "Verify now" action: "Verify email to unlock scheduling."

All states both themes.

---

## 12. Business Rules

- Scheduling is gated on email verification. A capsule owner must be reachable, because the delivery promise depends on it.
- Verify-later is allowed and must not feel punitive — the user keeps full read and create access.
- Clicking an already-used verification link shows a friendly already-verified state, never an error.
- Confetti is reserved for this moment and three others (§33.8). Do not add more.

---

## 13. Edge Cases

- iOS with no WebOTP — manual entry and paste must both be smooth; test on a real device.
- Paste of a code containing spaces or a trailing newline — normalise (the primitive already does; assert it here).
- A user who requested a resend entering the older code — show "use the latest code we sent" rather than a bare failure.
- Verification email landing in spam — the resend path and the "change email" affordance must be easy to find.
- A verification link opened on a different device from the one that signed up — must work, and must not require the original session.
- A verification link opened after the account is deleted — neutral message, no leak.
- Lockout during a genuine attempt — the countdown must be accurate and the copy must not accuse.

---

## 14. Error Handling

- Every failure names what to do next: resend, change number, or wait with a countdown.

---

## 15. Security Considerations

- The email verification token is single-use, expiring, and stored hashed.
- Attempt-count disclosure is limited to the code entry screen for an identifier the user has already demonstrated knowledge of.
- The verify-email route must not create a session by itself — clicking a link in an email should not authenticate a different device.

---

## 16. Testing Requirements

### Integration Tests

- Email verification token is single-use and does not create a session.

### Component Tests

- Six-box entry auto-advances; paste of a spaced code fills correctly.
- Resend countdown reflects the server timestamp and survives a remount.
- Error shows remaining attempts; lockout shows a countdown.
- Reduced motion replaces confetti with a static badge.

### E2E Tests

- Full signup → phone verify → email verify → app.
- Verify-later path lands in the app with the banner present.
- Already-verified link shows the friendly state.

### Accessibility Tests

- axe on all three screens; OTP boxes have a group label and per-box accessible names.

---

## 17. Acceptance Criteria

- [ ] Both steps implemented per §29.4 with all five states in both themes.
- [ ] Works on iOS with no WebOTP, using autofill and paste — verified on a real device.
- [ ] Resend countdown accurate across a page reload.
- [ ] Verify-later grants access and shows the persistent banner.
- [ ] Confetti has a reduced-motion variant.
- [ ] Verification link is single-use and does not authenticate a new device.
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
TASK-020
    ↓
TASK-021
```


---

## 20. Implementation Notes

- The verify-later gate is enforced again in PHASE-05 at the seal action. Note the dependency there so it is not forgotten.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-02-01](../EPIC-02-01-02-01.md).
3. Read the parent Sprint — [SPR-02-01-02](../../SPR-02-01-02.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§29.4`, `§29.0` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
