# TASK-024 — Implement Google and Apple OAuth with Safe Account Linking

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-024 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery](../../SPR-02-01-02.md) |
| Epic | [EPIC-02-01-02-02 — Passkeys, OAuth & Account Recovery](../EPIC-02-01-02-02.md) |
| Type | backend |
| Priority | medium |
| Status | pending |
| Dependencies | `TASK-018` |
| Blueprint refs | `§29.3`, `§29.5`, `ADR-008` |

---

## 1. Objective

Add Google and Apple sign-in, linking provider identities to accounts without creating an account-takeover path.

---

## 2. Context

Blueprint §29.3 lists both providers, noting Apple is effectively mandatory where an iOS presence is expected. The `accounts` table from TASK-017 keys on provider account id rather than email.

---

## 3. Problem Statement

The dangerous part of social login is linking. If an unverified provider email is trusted to attach to an existing account, anyone who can create a provider account with someone's address can take over their vault. Apple's private-relay addresses, which can change, make email-based linking additionally unreliable.

---

## 4. Expected Outcome

Working sign-in with both providers, correct handling of Apple private relay, and a linking rule that cannot be used for takeover.

---

## 5. Requirements

### Functional Requirements

- Callback routes for both providers; state and PKCE verified.
- New provider identity with no matching account creates a user.
- Provider identity matching an existing `accounts` row signs that user in.
- Provider email matching an existing account but no linked identity requires explicit verified linking.
- Apple private-relay addresses supported, including a later change of relay address.

### Technical Requirements

- Link by `(provider, provider_account_id)`, never by email.
- `state` parameter verified; PKCE where the provider supports it.
- Only a provider-verified email may be used to pre-fill; it never grants a link on its own.
- Apple's name and email are returned only on first authorisation — persist them then or lose them.

---

## 6. Implementation Instructions

1. Configure both providers and implement the callback routes with state and PKCE verification.
2. Implement the linking decision explicitly as a small function with the four documented cases, and unit-test each. This is the part worth writing carefully.
3. For the "email matches, identity does not" case, do **not** auto-link. Require the user to sign in by their existing method and link from settings, or complete an emailed confirmation. Record the chosen approach in §20.
4. Persist Apple's first-authorisation name and email immediately; treat their absence on subsequent sign-ins as normal.
5. Handle a changed Apple relay address by keying on the stable subject identifier, so the account is found regardless.
6. Issue a session through the existing session service so device metadata and revocation behave identically to other paths.

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
apps/site/src/app/api/auth/oauth/[provider]/route.ts
apps/site/src/app/api/auth/oauth/[provider]/callback/route.ts
apps/api/src/lib/auth/oauth.ts
apps/api/src/lib/auth/link-account.ts
apps/api/src/lib/auth/__tests__/link-account.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
GET /api/auth/oauth/[provider]/callback
```

### Request

```json
?code=...&state=...
```

### Response

```json
302 → /app  or  /login?error=LINK_REQUIRED
```

### Validation

- `state` matches the stored value
- PKCE verifier matches
- Provider token exchange succeeds
- Subject identifier present

### Error Responses

| Status | Code | When |
|---|---|---|
| 400 | `AUTH_OAUTH_STATE_MISMATCH` | CSRF protection triggered |
| 409 | `AUTH_OAUTH_LINK_REQUIRED` | Email matches an existing account with no linked identity |
| 502 | `AUTH_OAUTH_PROVIDER_ERROR` | Token exchange or profile fetch failed |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Never auto-link on email alone.** This is the account-takeover vector.
- Provider account id is the identity; email is display data.
- A provider email that is not marked verified by the provider is treated as unverified.

---

## 13. Edge Cases

- Apple private relay changing between sign-ins — the subject identifier keeps the account findable.
- Apple returning name and email only once — persist on first authorisation.
- A user with both Google and Apple wanting one account — supported by multiple `accounts` rows.
- Provider outage mid-flow — fail gracefully back to the login screen with the code path available.
- A provider email colliding with a soft-deleted account — follow the TASK-017 decision.
- A user revoking access at the provider — the next sign-in fails; existing sessions remain valid, which is correct but worth documenting.

---

## 14. Error Handling

- Provider failures return the user to login with a retry and an alternative method, never a stack trace or a blank page.

---

## 15. Security Considerations

- State and PKCE verified on every callback.
- Client secrets in environment configuration only.
- The link-required path must not disclose whether the email is registered — the message should be actionable without confirming existence. This is in tension with usability; record the wording decision in §20.

---

## 16. Testing Requirements

### Unit Tests

- Linking function: all four cases produce the documented outcome.
- **Email match without identity match does not link.**
- Apple subject identifier keys the lookup, not the relay email.

### API Tests

- State mismatch rejected.
- Successful callback issues a session with correct device metadata.

---

## 17. Acceptance Criteria

- [ ] Both providers sign in successfully.
- [ ] Auto-link on email is impossible, proven by test.
- [ ] Apple private-relay change does not orphan the account.
- [ ] Apple first-authorisation name and email persisted.
- [ ] State and PKCE verified.
- [ ] Linking wording decision recorded in §20.

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
TASK-018
    ↓
TASK-024
```


---

## 20. Implementation Notes

- The linking function is small and security-critical. It deserves the most careful test coverage in this epic.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-02-02](../EPIC-02-01-02-02.md).
3. Read the parent Sprint — [SPR-02-01-02](../../SPR-02-01-02.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§29.3`, `§29.5`, `ADR-008` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
