# TASK-018 — Implement Session Service with Instant Revocation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-018 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-01 — Auth Schema, Sessions & Rate Limiting](../../SPR-02-01-01.md) |
| Epic | [EPIC-02-01-01-01 — Authentication Schema & Session Service](../EPIC-02-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-017` |
| Blueprint refs | `§20.1`, `ADR-008` |

---

## 1. Objective

Build the session service: issue, validate with sliding refresh, list by device, and revoke individually or wholesale.

---

## 2. Context

ADR-008 chooses opaque server-side sessions over stateless JWTs specifically so revocation is immediate. The designer brief proposed JWT plus refresh tokens; gap analysis §2 records the override and the reason.

---

## 3. Problem Statement

A JWT is valid until it expires. On a product holding family video, "your stolen phone stays signed in for another fifteen minutes" is not an acceptable answer, and a revocation blocklist to fix it is just a slower session table. One row lookup per request buys correctness that is otherwise unobtainable.

---

## 4. Expected Outcome

A service exposing `issueSession`, `validateSession`, `listSessions`, `revokeSession`, and `revokeAllSessions`, with cookie handling, sliding expiry, and constant-time comparison.

---

## 5. Requirements

### Functional Requirements

- Issue: generate a 32-byte token, store its SHA-256, set an HTTP-only cookie, record device metadata.
- Validate: hash the presented token, look up a non-revoked unexpired row, update `last_used_at`, slide `expires_at` when past a refresh threshold.
- List: return sessions for the current user with device, platform, first seen, last used, and a flag for the current session.
- Revoke: set `revoked_at`; revoke-all excludes or includes the current session by parameter.

### Technical Requirements

- Cookie: HTTP-only, Secure, SameSite=Lax, path `/`, no PII in the value.
- Constant-time comparison of the hash to avoid a timing oracle.
- Sliding refresh only when more than a day has elapsed, to avoid a write on every request.
- Validation is a single indexed lookup; the function must not perform more than one query on the hot path.

---

## 6. Implementation Instructions

1. Create `apps/api/src/lib/auth/session.ts` with the five functions and a typed `SessionContext` return.
2. Use `crypto.randomBytes(32)` (or the Web Crypto equivalent) and base64url encoding for the token; hash with SHA-256 before storage.
3. Compare using a constant-time function. Never `===` on a secret.
4. Implement sliding refresh with a threshold so the common path is read-only.
5. Capture device metadata: user agent (truncated), platform hint, and a hashed IP. Do **not** store the raw IP.
6. Add `getCurrentSession()` for server components and server actions, returning `null` rather than throwing when absent, so callers can branch cleanly.
7. Write the revocation test as the primary test: issue, validate successfully, revoke, then assert the very next validation fails.

---

## 7. Architecture

```text
request
  │ cookie: mm_session=<opaque token>
  ▼
validateSession()
  ├─ sha256(token) ──▶ sessions.token_hash  (single indexed lookup)
  ├─ reject if revoked_at IS NOT NULL or expires_at < now()
  ├─ slide expires_at if stale > 24h
  └─▶ SessionContext { userId, sessionId }
          │
          ▼
      lib/authz   ← every read and write continues from here
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/lib/auth/session.ts
apps/api/src/lib/auth/cookies.ts
apps/api/src/lib/auth/__tests__/session.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal lib/auth/session.ts
```

### Request

```json
{ "userId": "uuid", "userAgent": "string", "ip": "string" }
```

### Response

```json
{ "token": "opaque", "expiresAt": "2026-09-25T00:00:00Z" }
```

### Validation

- User must exist and not be soft-deleted
- User agent truncated to a bounded length

### Error Responses

| Status | Code | When |
|---|---|---|
| — | `AUTH_SESSION_INVALID` | Token unknown, revoked, or expired |
| — | `AUTH_USER_DEACTIVATED` | User is soft-deleted or suspended |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- A revoked session fails on the very next request. No grace period.
- A soft-deleted or suspended user's sessions fail validation even if not individually revoked.
- The session cookie carries no user information — only the opaque token.

---

## 13. Edge Cases

- Concurrent requests both triggering a sliding refresh — the update must be idempotent and must not deadlock; an unconditional `SET expires_at = greatest(expires_at, ...)` is safer than read-then-write.
- A token presented for a user deleted between issue and validation — validation must check the user's state, not only the session row.
- Clock skew — always compare against database `now()`, never application time (the same rule as the workers claim loop).
- Cookie absent on a public route — return null quietly, never throw.
- Revoke-all invoked from the session being revoked — decide the default (keep current session alive) and make it explicit in the API.

---

## 14. Error Handling

- Every failure returns the same non-enumerating invalid-session code; the reason is logged server-side but never disclosed.

---

## 15. Security Considerations

- Constant-time comparison.
- Hashed IP only.
- The token must never appear in a log line, an error message, or a Sentry payload — add it to the PHASE-01 scrubbing allow-list check.
- Session fixation: issue a fresh token on privilege change, never reuse one across an authentication boundary.

---

## 16. Testing Requirements

### Unit Tests

- Issue then validate succeeds and returns the correct user.
- **Revoke then validate fails immediately** — the defining test for this task.
- Expired session fails.
- Soft-deleted user's valid session fails.
- Sliding refresh extends expiry only past the threshold.
- Validation performs exactly one query (assert via a query counter).
- Token never appears in a serialised log payload.

### Integration Tests

- Two concurrent validations both succeed without deadlock.

---

## 17. Acceptance Criteria

- [ ] All five functions implemented and typed.
- [ ] Revocation effective on the next request, proven by test.
- [ ] Only the hash is stored; plaintext token absent from the database.
- [ ] Single query on the validation hot path, asserted.
- [ ] Constant-time comparison in use.
- [ ] Cookie flags correct and verified in a browser context.

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
TASK-018
```


---

## 20. Implementation Notes

- This function runs on every authenticated request. Keep it to one query and resist adding joins; other data belongs in the callers.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-01-01](../EPIC-02-01-01-01.md).
3. Read the parent Sprint — [SPR-02-01-01](../../SPR-02-01-01.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§20.1`, `ADR-008` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
