# TASK-090 — Build Admin Authentication Realm with Mandatory Hardware MFA

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-090 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-04 — Trust & Safety and the Operator Console](../../../MOD-08-04.md) |
| Sprint | [SPR-08-04-02 — Operator Console — Delivery Health, Jobs & Break-Glass](../../SPR-08-04-02.md) |
| Epic | [EPIC-08-04-02-01 — Admin Realm, Delivery Health & Break-Glass Access](../EPIC-08-04-02-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-028`, `TASK-081` |
| Blueprint refs | `§16.3`, `§31.1`, `§20` |

---

## 1. Objective

Build the admin authentication realm: separate subdomain, mandatory TOTP with backup codes, role separation, short sessions, IP allowlisting, and full auditing.

---

## 2. Context

Blueprint §16.3 specifies the model: "A separate authentication realm with mandatory hardware-key MFA · role separation (support / operator / engineer / owner), with support having no content access at all · every action audited · break-glass content access requiring a second approver and notifying the user · IP allowlisting · a session timeout of 30 minutes · and admin routes served on a distinct subdomain with independent rate limits."

---

## 3. Problem Statement

Admin access is the most concentrated risk in the system: one compromised account with content access could read every family's archive. Making support roles structurally unable to see content, rather than merely instructed not to, is what limits the blast radius of both compromise and curiosity.

---

## 4. Expected Outcome

An admin realm that is separate, strongly authenticated, role-limited, short-lived, and completely audited — with the PHASE-02 placeholder guard replaced by a real implementation.

---

## 5. Requirements

### Functional Requirements

- Admin login with email and password plus mandatory TOTP; backup codes issued once.
- Roles: support, operator, engineer, owner, with a permission matrix.
- **Support has no content access at all.**
- 30-minute session timeout.
- IP allowlisting.
- Lockout after five failures; CAPTCHA.
- Every login and action audited.
- Served on a distinct subdomain with independent rate limits.

### Technical Requirements

- A separate session cookie scoped to the admin subdomain; an admin session must never be usable on the app subdomain or vice versa.
- TOTP secrets encrypted at rest; backup codes hashed.
- The permission matrix is a data structure with a test per cell, mirroring the `lib/authz` approach.
- The PHASE-02 fail-closed admin guard is replaced, not bypassed.

---

## 6. Implementation Instructions

1. Write the schema for `admin_users`, `roles`, and permissions per §34.12; add tenant isolation and encryption for TOTP secrets.
2. Build the login flow: credentials, then mandatory TOTP. Issue backup codes once, hashed, with a clear warning about storage.
3. Scope the admin session cookie to the admin subdomain and assert in a test that it cannot authenticate on the app subdomain.
4. Implement the role permission matrix as data with a test per cell. **Support must have no content-access permission at all** — not a denied one, an absent one.
5. Implement the 30-minute timeout, lockout, CAPTCHA, and IP allowlisting. Record the allowlist mechanism in §20, since it is operational configuration.
6. Audit every login attempt and every action, flushing synchronously for content access per the PHASE-08 audit rules.
7. Replace the PHASE-02 placeholder guard with the real check, and re-run the PHASE-02 guard tests.

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
packages/db/src/schema/admin.ts
packages/db/migrations/0019_admin.sql
apps/admin/src/app/login/page.tsx
apps/api/src/lib/admin/auth.ts
apps/api/src/lib/admin/permissions.ts
apps/api/src/lib/admin/__tests__/permissions.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Support roles have no content-access permission.**
- Admin sessions are scoped to the admin subdomain only.
- TOTP is mandatory, not optional.
- Every admin action is audited.
- 30-minute timeout, no exceptions.

---

## 13. Edge Cases

- **An admin session cookie presented on the app subdomain must not authenticate** — the defining test.
- An admin who loses their TOTP device — backup codes; if those are also lost, another owner must re-provision, never a self-service reset.
- An admin whose IP is outside the allowlist — denied with a clear message, and the attempt audited.
- A role changed while a session is active — re-resolve permissions per request, not from a session claim.
- An admin account deactivated mid-session — the next request fails.
- The last owner account being deactivated — prevent it, or the system becomes unadministrable.
- A shared admin account — prohibit by policy and note that audit attribution depends on it.

---

## 14. Error Handling

- Admin auth failures are generic to the client and specific in the audit log.

---

## 15. Security Considerations

- Separate subdomain, separate cookie, independent rate limits.
- TOTP mandatory; secrets encrypted; backup codes hashed.
- Permissions re-resolved per request.
- Support role structurally unable to reach content.

---

## 16. Testing Requirements

### Integration Tests

- **Admin cookie does not authenticate on the app subdomain.**
- TOTP required; login without it fails.
- Support role has no content permission (matrix test).
- 30-minute timeout enforced.
- Role change takes effect within an active session.
- Last owner cannot be deactivated.
- Every login audited.

---

## 17. Acceptance Criteria

- [ ] Admin realm on a separate subdomain with its own cookie and rate limits.
- [ ] Mandatory TOTP with hashed backup codes.
- [ ] Permission matrix with a test per cell; support has no content permission.
- [ ] 30-minute timeout, lockout, CAPTCHA, IP allowlisting.
- [ ] Every action audited.
- [ ] PHASE-02 placeholder guard replaced and its tests re-run.

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
TASK-028
    ↓
TASK-081
    ↓
TASK-090
```


---

## 20. Implementation Notes

- The subdomain cookie-scoping test is small and important. A shared cookie between app and admin would collapse the whole separation.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-04-02-01](../EPIC-08-04-02-01.md).
3. Read the parent Sprint — [SPR-08-04-02](../../SPR-08-04-02.md).
4. Read the parent Module — [MOD-08-04](../../../MOD-08-04.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§16.3`, `§31.1`, `§20` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
