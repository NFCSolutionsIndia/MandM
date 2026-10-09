# TASK-025 — Design and Implement Account Recovery Policy and Flow

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-025 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery](../../SPR-02-01-02.md) |
| Epic | [EPIC-02-01-02-02 — Passkeys, OAuth & Account Recovery](../EPIC-02-01-02-02.md) |
| Type | backend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-023`, `TASK-019` |
| Blueprint refs | `gap G-1`, `§20.1`, `§20.9` |

---

## 1. Objective

Define and implement a recovery path for a user who has lost their passkey and their access to the registered email, without creating a social-engineering route into a family archive.

---

## 2. Context

Gap analysis G-1 records this as a requirement the blueprint does not cover. It matters because the product is passwordless and is explicitly sold as a lifetime vault: "you have permanently lost everything" and "support can let you back in" are both unacceptable answers.

---

## 3. Problem Statement

A recovery path is the exact point where security and compassion conflict. Too strict and a grieving user cannot reach their late parent's messages. Too loose and the recovery path becomes the easiest way to steal an account — and on this product, the thing stolen is someone's family history. The answer must be written down *before* the first support request, because improvising it under emotional pressure is how accounts get handed to the wrong person.

---

## 4. Expected Outcome

A written policy committed to the repository, plus an implemented flow: recovery codes generated at signup, a secondary contact option, and a documented manual escalation with a waiting period and multi-signal verification.

---

## 5. Requirements

### Functional Requirements

- Ten single-use recovery codes generated when the first passkey is created; displayed once; stored hashed.
- A recovery code plus the registered phone allows re-establishing access.
- An optional secondary email or trusted contact can be added in settings.
- Where no automated factor remains, a manual escalation exists: identity signals, a mandatory waiting period, notification to every known contact method, and an owner cancellation window.
- Every recovery attempt is written to the audit log.

### Technical Requirements

- Recovery codes are 128-bit, formatted for legibility, hashed with a slow KDF because they are long-lived and low-entropy relative to a key.
- A used code is consumed; the count remaining is shown; regeneration invalidates all previous codes.
- Manual escalation is a state machine with recorded evidence and an owner-cancellable waiting period — deliberately mirroring the legacy-vault unlock protocol shape (§29.25).
- Recovery never bypasses the waiting period, regardless of who asks.

---

## 6. Implementation Instructions

1. Write `docs/ACCOUNT_RECOVERY.md` **first**. It must state: what counts as sufficient evidence, the waiting period, who may approve, what is notified, what is logged, and — explicitly — that support staff cannot shorten or bypass the process. The document is the deliverable; the code enforces it.
2. Implement recovery-code generation at first passkey creation: ten codes, shown once with a copy and download affordance, stored hashed.
3. Implement redemption: code plus a verified phone OTP re-establishes access and forces enrolment of a new factor.
4. Add secondary contact in settings, verified on entry.
5. Implement the manual escalation state machine: request, evidence recorded, waiting period (recommend 14 days), notification to every known contact at every step, and an owner cancellation that immediately terminates it.
6. Write every state transition to the audit log, including which admin acted.
7. Add a rate limit so recovery cannot be used to spam a user with alarming notifications.

---

## 7. Architecture

```text
AUTOMATED
recovery code + phone OTP  ──▶ access restored ──▶ must enrol a new factor

MANUAL ESCALATION (no factor remains)
request ──▶ evidence recorded ──▶ notify ALL known contacts
        ──▶ 14-day waiting period  (owner can cancel at any point)
        ──▶ second approver
        ──▶ access restored + full audit trail shown to the owner

Support staff cannot shorten or bypass any step. That is the point.
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
docs/ACCOUNT_RECOVERY.md
packages/db/src/schema/recovery.ts
packages/db/migrations/0003_recovery.sql
apps/api/src/lib/auth/recovery.ts
apps/api/src/features/auth/components/RecoveryCodes.tsx
apps/<ios|android>/features/auth/recover/page.tsx
apps/api/src/lib/auth/__tests__/recovery.test.ts
```

---

## 9. Data Model

**`recovery_codes`** — id, user_id, code_hash, consumed_at, created_at, batch_id. Scoped by `user_id` through `lib/authz`.

**`recovery_requests`** — id, user_id, state (`requested` | `waiting` | `approved` | `cancelled` | `rejected`), evidence (JSON), requested_at, waiting_until, notified_at[], approved_by, second_approver, cancelled_by_owner_at, resolved_at.

Both tables get tenant isolation. `recovery_requests` is additionally readable by the admin role, and every read is audit-logged (PHASE-08).

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **The waiting period cannot be shortened by anyone, for any reason.** If it can be waived, it provides no protection.
- Every step notifies every known contact method for the account.
- The owner can cancel at any point during the waiting period, and cancellation is immediate and final for that request.
- Using a recovery code forces enrolment of a new factor before normal access resumes.
- Regenerating codes invalidates the entire previous batch.

---

## 13. Edge Cases

- A legitimate user who lost their phone *and* their codes *and* their email — this is precisely what manual escalation exists for; the policy must describe it without promising a guaranteed outcome.
- A deceased user's family attempting recovery — **this is not recovery, it is legacy transfer**, and it must be routed to that process (R3, blocked on legal counsel) rather than handled here. The flow must detect and redirect this case, because handling it as recovery would be both wrong and legally exposed.
- An attacker initiating recovery to harass — rate-limit and make the notification copy calm rather than alarming, while still being clear.
- The owner cancelling, then genuinely needing recovery later — a new request must be possible without prejudice.
- Recovery codes screenshotted into an unencrypted photo album, then that account compromised — worth a line of guidance in the UI about where to keep them.
- A recovery request outstanding when the account is deleted — the request must terminate.

---

## 14. Error Handling

- Any failure in the flow must leave the account in its prior state. A partially completed recovery must never grant partial access.

---

## 15. Security Considerations

- Codes hashed with a slow KDF, not a bare SHA-256, because they are long-lived bearer secrets.
- Every transition audit-logged with the acting identity.
- Second approver required for manual approval; a single admin cannot restore an account alone.
- The notification content must not itself leak information to whoever initiated the request.

---

## 16. Testing Requirements

### Unit Tests

- Ten codes generated, shown once, stored hashed.
- A consumed code cannot be reused.
- Regeneration invalidates the previous batch.
- Waiting period cannot be set below the policy minimum, even by an admin path.
- Owner cancellation terminates the request immediately.
- A deceased-user request is detected and routed away from recovery.

### Integration Tests

- Full manual escalation: request → notify → wait → second approval → restore, with an audit entry at every step.

### Security Tests

- A single admin cannot approve alone.
- Recovery attempts are rate-limited per account.

---

## 17. Acceptance Criteria

- [ ] `docs/ACCOUNT_RECOVERY.md` written, reviewed, and committed **before** the code.
- [ ] Recovery codes generated, displayed once, hashed at rest.
- [ ] Code plus phone OTP restores access and forces new-factor enrolment.
- [ ] Manual escalation implemented with an unshortenable waiting period.
- [ ] Owner cancellation immediate.
- [ ] Deceased-user case detected and redirected, not handled as recovery.
- [ ] Two approvers required; single-admin approval impossible, proven by test.
- [ ] Every transition audit-logged.

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
TASK-023
    ↓
TASK-019
    ↓
TASK-025
```


---

## 20. Implementation Notes

- Write the policy document first and get it reviewed by someone who is not the implementer. The code is the easy half.
- The shape of this flow is deliberately the same as the legacy-vault unlock protocol in §29.25. Reuse the pattern there rather than inventing a second one.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-02-02](../EPIC-02-01-02-02.md).
3. Read the parent Sprint — [SPR-02-01-02](../../SPR-02-01-02.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `gap G-1`, `§20.1`, `§20.9` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
