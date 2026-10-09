# TASK-019 — Implement OTP Issue and Verify Service with Abuse Controls

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-019 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-01 — Auth Schema, Sessions & Rate Limiting](../../SPR-02-01-01.md) |
| Epic | [EPIC-02-01-01-01 — Authentication Schema & Session Service](../EPIC-02-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-017` |
| Blueprint refs | `§29.3`, `§29.4`, `§20.6` |

---

## 1. Objective

Build the one-time-code service covering issue, verify, expiry, attempt limits, lockout, and resend cooldown.

---

## 2. Context

Blueprint §29.3 and §29.4 specify the rules precisely: six digits, ten-minute expiry, five attempts then lockout, thirty-second resend countdown on mobile and sixty on email, and a non-enumerating success response.

---

## 3. Problem Statement

OTP is the primary signup path and, on iOS, the only auto-fill-assisted one (WebOTP is Chromium-only, §29.0). It is also the most abusable endpoint in the product: unmetered code issuance costs money and can be used to harass a third party by repeatedly texting their number.

---

## 4. Expected Outcome

A service exposing `issueCode` and `verifyCode`, enforcing every documented limit, storing only hashes, and returning results that never reveal whether an account exists.

---

## 5. Requirements

### Functional Requirements

- Six-digit numeric code, cryptographically random.
- Ten-minute expiry; single use; consumed on success.
- Five verification attempts per code, then the code is invalidated and the identifier locked for ten minutes.
- Resend cooldown: 30s for phone, 60s for email.
- Rate limits: three issues per fifteen minutes per identifier, plus a per-IP limit.
- Purposes are distinct: `signup`, `login`, `verify_phone`, `verify_email`, `step_up`. A code for one purpose must not satisfy another.

### Technical Requirements

- Codes stored as SHA-256 with the identifier and purpose as context; compared in constant time.
- A code is invalidated when a newer one is issued for the same identifier and purpose.
- Lockout state derives from the rate-limit table rather than a separate mechanism.
- The verify response shape is identical for wrong code, expired code, and unknown identifier.

---

## 6. Implementation Instructions

1. Create `apps/api/src/lib/auth/otp.ts` with `issueCode({ identifier, channel, purpose })` and `verifyCode({ identifier, purpose, code })`.
2. Generate the code with a CSPRNG and format to exactly six digits, allowing leading zeros — a common bug is generating an integer and losing the leading zero, producing a five-character code.
3. On issue: check the rate limit, invalidate prior unconsumed codes for the same identifier and purpose, insert the new hash, then hand the plaintext to the sender. **The plaintext is never persisted or logged.**
4. On verify: load the newest unconsumed code, check expiry, compare in constant time, increment attempts on failure, invalidate and lock at the fifth failure, and mark consumed on success.
5. Return a discriminated result so the caller can distinguish "locked" (which must be communicated with a countdown) from "invalid" (which must not reveal why) — the caller decides what the user sees, but the service must not leak the distinction into a generic error string.
6. Implement `getResendAvailableAt` so the UI can render an accurate countdown rather than guessing.
7. Write the abuse tests first: they are the point of this task.

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
apps/api/src/lib/auth/otp.ts
apps/api/src/lib/rate-limit/index.ts
apps/api/src/lib/auth/__tests__/otp.test.ts
packages/emails/src/templates/OtpCode.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal lib/auth/otp.ts
```

### Request

```json
{ "identifier": "riya@example.com", "channel": "email", "purpose": "signup" }
```

### Response

```json
{ "ok": true, "resendAvailableAt": "2026-08-26T10:01:00Z" }
```

### Validation

- Identifier valid for the channel (email format or E.164)
- Purpose from the allowed set
- Rate limit not exceeded

### Error Responses

| Status | Code | When |
|---|---|---|
| 429 | `RATE_LIMIT_OTP_ISSUE` | More than three issues in fifteen minutes for this identifier |
| 429 | `AUTH_OTP_LOCKED` | Five failed attempts; identifier locked for ten minutes |
| 400 | `AUTH_OTP_INVALID` | Wrong, expired, consumed, or unknown — deliberately indistinguishable |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- A code satisfies exactly one purpose. A `login` code must not verify an email address.
- Wrong, expired, and unknown are indistinguishable to the caller-facing message.
- Issuing a new code invalidates the previous one, so an attacker cannot accumulate valid codes.
- The plaintext code exists only in the send call. It is never logged, never returned, never stored.

---

## 13. Edge Cases

- A code with leading zeros — must be preserved as a six-character string throughout.
- A user requesting a resend and then entering the *first* code — the first is invalidated, so this fails. The UI must say "use the latest code we sent" rather than a bare error (§33.2).
- Two devices verifying the same code simultaneously — the consume must be atomic so only one succeeds.
- Clock skew between issue and verify — use database time on both sides.
- An attacker enumerating by timing — constant-time comparison plus a uniform response path.
- Harassment via repeated issuance to someone else's phone number — the per-identifier limit is what prevents this, and it must apply before any send occurs, not after.
- Email delivery delayed beyond the expiry window — expiry is ten minutes, so an unusually slow send produces a genuine failure; the resend path must be obvious.

---

## 14. Error Handling

- A send failure after the code is stored must be reported so the user can retry, and must not consume the rate-limit budget for a code that never arrived — decide the ordering and record it in §20.

---

## 15. Security Considerations

- Rate limit is checked **before** sending, so cost and harassment are bounded.
- Constant-time comparison.
- No plaintext code in any log, error, or telemetry payload.
- Purpose separation prevents a login code from being replayed as a step-up confirmation.

---

## 16. Testing Requirements

### Unit Tests

- Six-digit code with leading zeros is preserved.
- Correct code verifies once; a second use fails.
- Expired code fails.
- Five wrong attempts lock the identifier; the sixth returns the locked result.
- Issuing a new code invalidates the previous one.
- A `login` code does not satisfy `verify_email`.
- Rate limit blocks a fourth issue within fifteen minutes, and blocks it before any send is attempted.
- Wrong, expired, and unknown identifiers produce an identical caller-facing message.
- Plaintext code absent from the persisted row.

### Integration Tests

- Concurrent verification of the same code: exactly one succeeds.

---

## 17. Acceptance Criteria

- [ ] All limits from §5 enforced and individually tested.
- [ ] Only hashes persisted.
- [ ] Purpose separation enforced.
- [ ] Rate limit applied before send, proven by asserting the sender was not called.
- [ ] Responses non-distinguishable across failure reasons.
- [ ] Resend availability exposed for accurate UI countdowns.

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
TASK-017
    ↓
TASK-019
```


---

## 20. Implementation Notes

- The abuse controls are the substance of this task; the happy path is trivial by comparison.
- Record the send-failure ordering decision in §20 — it affects whether a user with a flaky mailbox can retry.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-01-01](../EPIC-02-01-01-01.md).
3. Read the parent Sprint — [SPR-02-01-01](../../SPR-02-01-01.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§29.3`, `§29.4`, `§20.6` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
