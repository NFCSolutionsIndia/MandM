# TASK-028 — Add Route Guards, Middleware, and Step-Up Re-Authentication

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-028 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-02 — Authorization Chokepoint & Vault Ownership](../../../MOD-02-02.md) |
| Sprint | [SPR-02-02-01 — Vault Model & Authorization Chokepoint](../../SPR-02-02-01.md) |
| Epic | [EPIC-02-02-01-02 — lib/authz — The Authorization Chokepoint](../EPIC-02-02-01-02.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-027` |
| Blueprint refs | `§20.1`, `§20.2`, `§28.5` |

---

## 1. Objective

Protect the `(app)` and `admin` route groups, redirect unauthenticated users with a preserved destination, and enforce step-up re-authentication for sensitive capabilities.

---

## 2. Context

Blueprint §28.5 requires that an unauthenticated hit on an app route redirects to login with a `next` parameter and lands exactly where intended. Section §20.1 lists the capabilities requiring step-up re-authentication: changing email, adding a passkey, deleting the account, exporting all data, and later sealing a posthumous capsule or assigning an heir.

---

## 3. Problem Statement

Two failure modes are being prevented. The first is a protected page rendering briefly before a client-side redirect, which leaks content. The second is a long-lived session being sufficient to delete an account — a stolen unlocked phone should not be able to destroy someone's archive without re-proving identity.

---

## 4. Expected Outcome

Server-side guards on every authenticated route, a login redirect that preserves the destination, and a step-up mechanism that requires a fresh factor within a bounded window for listed capabilities.

---

## 5. Requirements

### Functional Requirements

- Unauthenticated access to `(app)` or `admin` redirects to login with `next` preserved and honoured after sign-in.
- Verified-email gating on scheduling, per the §29.4 grace state.
- Step-up required for: change email, add or remove a passkey, export all data, delete account.
- Step-up satisfied by a fresh passkey assertion or a fresh OTP, valid for a bounded window.
- The `admin` group requires an admin session, not merely any session.

### Technical Requirements

- Guards run **server-side** before render. No protected content may be sent to the client and then hidden.
- `next` is validated as a relative path on the same origin — an open redirect here is a phishing primitive.
- Step-up freshness recorded on the session with a timestamp and the factor used; the window is short (recommend 10 minutes).
- Guard failures return the ADR-023 result shape for actions, and a redirect for page requests.

---

## 6. Implementation Instructions

1. Implement the guard in the `(app)` layout as a server-side session check, and add a middleware layer for early redirects where it is cheaper.
2. Validate `next` strictly: relative path, same origin, no protocol, no `//` prefix. **Reject anything else and fall back to `/app`.** An unvalidated `next` is an open redirect.
3. Implement `requireStepUp(capability)` checking the session's recorded step-up timestamp and factor, and initiating a step-up challenge when stale.
4. Build the step-up challenge UI as a sheet reusing the passkey and OTP components, so it can appear over any screen without losing context.
5. Add the verified-email gate as a reusable check, and reference it from the PHASE-05 seal action so the §29.4 promise is actually enforced.
6. Guard the `admin` group behind an admin-session check that fails closed; the full admin realm arrives in PHASE-08, so this is a placeholder that denies everyone for now — and it must deny, not allow.
7. Write a test enumerating every route under `(app)` and asserting each redirects when unauthenticated. Automate the enumeration so a new route added without a guard is caught.

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
apps/site/src/middleware.ts
apps/<ios|android>/features/layout.tsx  (server guard)
apps/api/src/lib/auth/guards.ts
apps/api/src/lib/auth/step-up.ts
apps/api/src/features/auth/components/StepUpSheet.tsx
apps/api/src/lib/auth/__tests__/guards.test.ts
apps/api/src/lib/auth/__tests__/next-param.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal lib/auth/step-up.ts
```

### Request

```json
{ "capability": "account.delete" }
```

### Response

```json
{ "satisfied": false, "challenge": { "methods": ["passkey", "otp"] } }
```

### Validation

- Capability must be in the step-up list
- Session must be valid

### Error Responses

| Status | Code | When |
|---|---|---|
| 401 | `AUTH_STEP_UP_REQUIRED` | No fresh factor within the window |
| 403 | `AUTHZ_DENIED` | Session lacks the underlying capability regardless of freshness |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Protected content is never sent to the client before authorization.
- `next` must be a validated same-origin relative path.
- Step-up is required for every capability in the §20.1 list, and the list lives in one constant so it cannot drift.
- The admin guard fails closed until PHASE-08 implements the realm.

---

## 13. Edge Cases

- A `next` value pointing to an external origin, a protocol-relative URL, or an encoded variant — all must be rejected; test each.
- A `next` pointing to a route the user cannot access after signing in — land on `/app` with an explanation rather than a denial loop.
- Step-up satisfied on one device then attempted on another — freshness is per session, so it must not transfer.
- A user with no passkey needing step-up — the OTP path must be available.
- Step-up during an in-progress destructive action — the sheet must preserve the pending action and resume it, or abandon it cleanly; a half-completed deletion is unacceptable.
- A session revoked while a step-up sheet is open — the resumed action must re-check and fail.
- A new route added under `(app)` without a guard — the enumeration test must catch it.

---

## 14. Error Handling

- Guard denial on a page request redirects; on a server action it returns the result union so the UI can show an inline message rather than a crash.

---

## 15. Security Considerations

- **Open redirect prevention is the security-critical part of this task.** Validate `next` strictly and test the bypass attempts.
- Step-up freshness is short and per session.
- Admin guard denies by default.
- Guards run before render, always.

---

## 16. Testing Requirements

### Unit Tests

- `next` validation rejects absolute URLs, protocol-relative URLs, encoded variants, and non-same-origin paths.
- Step-up window expiry requires a fresh factor.
- Step-up freshness does not transfer between sessions.

### Integration Tests

- Enumerated: every `(app)` route redirects when unauthenticated.
- Admin routes deny for a normal user.
- A destructive action interrupted by step-up resumes correctly, or aborts cleanly.

### E2E Tests

- Unauthenticated deep link → login → lands on the originally requested route.

### Security Tests

- Open-redirect attempt suite: every documented bypass form is rejected.

---

## 17. Acceptance Criteria

- [ ] Every `(app)` route is guarded, verified by an enumeration test that would catch a new unguarded route.
- [ ] `next` preserved and honoured; all open-redirect bypass forms rejected.
- [ ] Step-up enforced for every capability in the §20.1 list.
- [ ] Step-up does not transfer between sessions.
- [ ] Admin group denies by default.
- [ ] No protected content reaches the client before authorization, verified by inspecting a response body.

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
TASK-027
    ↓
TASK-028
```


---

## 20. Implementation Notes

- The route-enumeration test is what keeps this correct as thirty more routes are added in later phases. Make it automatic, not a hand-maintained list.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-02-01-02](../EPIC-02-02-01-02.md).
3. Read the parent Sprint — [SPR-02-02-01](../../SPR-02-02-01.md).
4. Read the parent Module — [MOD-02-02](../../../MOD-02-02.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§20.1`, `§20.2`, `§28.5` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
