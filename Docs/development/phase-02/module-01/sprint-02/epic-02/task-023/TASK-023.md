# TASK-023 — Implement WebAuthn Passkey Registration and Authentication

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-023 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery](../../SPR-02-01-02.md) |
| Epic | [EPIC-02-01-02-02 — Passkeys, OAuth & Account Recovery](../EPIC-02-01-02-02.md) |
| Type | backend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-018` |
| Blueprint refs | `§20.1`, `§29.0`, `ADR-008` |

---

## 1. Objective

Implement the WebAuthn ceremonies for registering a passkey and signing in with it, including challenge handling, replay rejection, and multi-credential management.

---

## 2. Context

ADR-008 makes passkeys the primary sign-in path. Blueprint §29.0 also notes that WebAuthn is what delivers the "biometric app lock" promised in the original pricing copy — the same primitive serves both.

---

## 3. Problem Statement

A lifetime vault protected by an emailed code is protected by the user's email provider. Passkeys move the factor onto hardware the user physically holds, which is both stronger and faster. Getting the verification wrong, though — skipping origin checks or ignoring the sign counter — turns a strong factor into a decorative one.

---

## 4. Expected Outcome

Endpoints for registration options, registration verification, authentication options, and authentication verification; a credentials list with labels; and the ability to remove a credential safely.

---

## 5. Requirements

### Functional Requirements

- Registration: issue options with a fresh challenge, verify the attestation, store credential id, public key, sign count, transports, and a device label.
- Authentication: issue options, verify the assertion, update the sign count, issue a session.
- Multiple credentials per user; list, label, and remove.
- Removing the last credential is allowed only if another factor remains.

### Technical Requirements

- Challenges are single-use, short-lived, and bound to the session or a cookie — never accepted twice.
- Relying-party id and origin verified strictly against configuration, not derived from the request.
- **A sign count that does not increase is rejected** where the authenticator reports one, as a cloning signal.
- User verification required, so the ceremony is genuinely biometric or PIN-backed rather than presence-only.
- Discoverable credentials (resident keys) preferred so login needs no prior identifier.

---

## 6. Implementation Instructions

1. Add `apps/api/src/lib/auth/webauthn.ts` wrapping a maintained server library; do not hand-roll CBOR or COSE parsing.
2. Store the challenge server-side keyed to a short-lived record, and delete it on use. An unconsumed challenge must expire.
3. Verify origin and RP id against explicit configuration. Note that preview deployments have different origins — handle this by configuration per environment, and record in §20 how preview origins are managed, since a permissive origin check is a real vulnerability.
4. Persist credential id (unique), public key, sign count, transports, and a human label derived from the user agent, editable later.
5. On authentication, look up by credential id, verify the assertion, compare and update the sign count, then issue a session via the PHASE-02 session service.
6. Implement removal with the safety rule: refuse to remove the last remaining factor unless the account has a verified email that can receive a code.
7. Test with a virtual authenticator in Playwright — this is the only practical way to get automated coverage.

---

## 7. Architecture

```text
REGISTER                              AUTHENTICATE
POST /api/auth/passkey/options        POST /api/auth/passkey/login/options
   └─ challenge stored, single use       └─ challenge stored, single use
POST /api/auth/passkey/verify         POST /api/auth/passkey/login/verify
   ├─ verify origin + RP id              ├─ lookup by credential_id
   ├─ store pubkey + sign_count          ├─ verify assertion + origin
   └─ label from user agent              ├─ REJECT if sign_count regressed
                                         └─ issueSession()
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/lib/auth/webauthn.ts
apps/site/src/app/api/auth/passkey/options/route.ts
apps/site/src/app/api/auth/passkey/verify/route.ts
apps/site/src/app/api/auth/passkey/login/options/route.ts
apps/site/src/app/api/auth/passkey/login/verify/route.ts
apps/api/src/features/auth/components/PasskeyManager.tsx
apps/api/src/lib/auth/__tests__/webauthn.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
POST /api/auth/passkey/login/verify
```

### Request

```json
{
  "credentialId": "base64url",
  "clientDataJSON": "base64url",
  "authenticatorData": "base64url",
  "signature": "base64url"
}
```

### Response

```json
{ "ok": true, "data": { "redirectTo": "/app" } }
```

### Validation

- Challenge exists, unconsumed, and unexpired
- Origin and RP id match configuration
- Signature valid for the stored public key
- Sign count not regressed

### Error Responses

| Status | Code | When |
|---|---|---|
| 400 | `AUTH_WEBAUTHN_CHALLENGE_INVALID` | Challenge unknown, reused, or expired |
| 400 | `AUTH_WEBAUTHN_ORIGIN_MISMATCH` | Origin or RP id does not match configuration |
| 401 | `AUTH_WEBAUTHN_VERIFICATION_FAILED` | Signature invalid |
| 409 | `AUTH_WEBAUTHN_COUNTER_REGRESSED` | Possible cloned authenticator |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- A challenge is used exactly once.
- Origin and RP id come from configuration, never from the request.
- A regressed sign count is treated as a security event: reject, log, and notify the user.
- The last remaining factor cannot be removed.

---

## 13. Edge Cases

- Authenticators that always report sign count zero — handle by treating zero as "not reported" rather than rejecting every login from such a device.
- A user registering the same physical authenticator twice — the unique credential id makes this a friendly no-op, not an error.
- Preview-deployment origins differing per PR — configuration-driven, and the mechanism recorded in §20.
- Cross-device passkey (phone authenticating a desktop) — must work; test at least once manually.
- A user cancelling the browser prompt — a normal outcome, not an error state.
- Removing a credential from the very device being used — must sign that device out cleanly rather than leaving a broken session.
- Safari and Chrome differing in attestation formats — the chosen library must handle both; verify rather than assume.

---

## 14. Error Handling

- Verification failures return a generic authentication failure to the client; the specific reason is logged server-side only.

---

## 15. Security Considerations

- User verification required so the factor is genuinely biometric or PIN-backed.
- Sign-count regression is a cloning indicator and must be surfaced to the user, not silently tolerated.
- The public key is not a secret, but the credential mapping is personal data — it is covered by tenant isolation like every other user-scoped table.

---

## 16. Testing Requirements

### Integration Tests

- Removing the last factor is refused when no verified email exists.
- Removing the current device's credential revokes that session.

### API Tests

- Register and authenticate with a virtual authenticator.
- Reused challenge rejected.
- Mismatched origin rejected.
- Regressed sign count rejected.
- Duplicate credential registration is idempotent.

### E2E Tests

- Playwright with a virtual authenticator: register during signup, sign out, sign in with the passkey.

---

## 17. Acceptance Criteria

- [ ] Registration and authentication work end to end with a virtual authenticator.
- [ ] Challenge reuse, origin mismatch, and counter regression all rejected, each proven by test.
- [ ] Multiple credentials supported with labels and safe removal.
- [ ] Verified manually on at least one iOS and one Android device.
- [ ] Preview-origin configuration mechanism recorded in §20.
- [ ] Cancellation handled as a normal outcome.

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
TASK-023
```


---

## 20. Implementation Notes

- Use a maintained WebAuthn library. Hand-rolling attestation parsing is a reliable way to introduce a vulnerability.
- This same primitive becomes the app lock in PHASE-08. Keep the verification function reusable outside the login flow.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-02-02](../EPIC-02-01-02-02.md).
3. Read the parent Sprint — [SPR-02-01-02](../../SPR-02-01-02.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§20.1`, `§29.0`, `ADR-008` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
