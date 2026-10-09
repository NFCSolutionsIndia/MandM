# TASK-017 — Create Authentication Schema Migration with Scope Enforcement

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-017 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-01 — Authentication & Sessions](../../../MOD-02-01.md) |
| Sprint | [SPR-02-01-01 — Auth Schema, Sessions & Rate Limiting](../../SPR-02-01-01.md) |
| Epic | [EPIC-02-01-01-01 — Authentication Schema & Session Service](../EPIC-02-01-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-008` |
| Blueprint refs | `§10 User`, `§20.1`, `ADR-009` |

---

## 1. Objective

Create the `users`, `sessions`, `credentials`, `accounts`, `otp_codes`, and `rate_limits` tables with scope enforcement and correct indexes.

---

## 2. Context

These are the first real tables in the system. PHASE-01 established the scope convention and a guard test that fails if any table lacks a `vault_id` (or `user_id`) column and an index on it; this migration is the first to honour it.

---

## 3. Problem Statement

The shape of `users` constrains everything downstream — the blueprint §10 `User` entity carries plan, storage accounting, timezone, and soft-delete fields that later phases depend on. Getting the email collation wrong (a case-sensitive `as_cs` column instead of the default `ai_ci`) produces duplicate accounts differing only in case, which on a memory product means a user who cannot find their own archive.

---

## 4. Expected Outcome

A migration creating six tables with scope columns, indexes, and matrix cells enabled and policies in place, unique constraints, and the indexes the session hot path needs. The PHASE-01 tenant isolation guard test still passes.

---

## 5. Requirements

### Functional Requirements

- `users`: id, email (`VARCHAR(320)`, `ICU collation`, unique), email_verified_at, phone, phone_verified_at, name, avatar_media_id (nullable, no FK yet), locale, timezone, plan, storage_used_bytes, storage_quota_bytes, created_at, last_seen_at, deleted_at, hard_delete_after.
- `sessions`: id, user_id, token_hash, user_agent, platform, ip_hash, created_at, last_used_at, expires_at, revoked_at.
- `credentials` (WebAuthn): id, user_id, credential_id (unique), public_key, sign_count, transports, label, created_at, last_used_at.
- `accounts` (OAuth): id, user_id, provider, provider_account_id (unique per provider), created_at.
- `otp_codes`: id, identifier, channel, code_hash, purpose, attempts, expires_at, consumed_at, created_at.
- `rate_limits`: key, window_start, count — with a primary key on (key, window_start).

### Technical Requirements

- Email column is `VARCHAR(320)` on the default `ICU collation` collation with a unique index, so case differences collide with no functional index and no extension (ADR-005).
- All timestamps `timestamptz` UTC. Never a naive local timestamp (ADR-024).
- tenant isolation enabled on every table in this migration, with a policy per the `packages/db/TENANT-ISOLATION.md` template.
- Indexes: `sessions(token_hash)`, `sessions(user_id) WHERE revoked_at IS NULL`, `otp_codes(identifier, purpose)`, `users(deleted_at) WHERE deleted_at IS NOT NULL`.
- `storage_quota_bytes` defaults to the free-tier value (10 GB) per blueprint §17.2 — **there is no memory-count column, because that limit does not exist.**

---

## 6. Implementation Instructions

1. Write the Drizzle schema in `packages/db/src/schema/auth.ts`, importing enum values from `@mm/shared`.
2. Generate the migration and **read the SQL** before committing (PHASE-01 rule).
3. Add the scope columns and repository modules. `users` is scoped to the session's own user; `sessions`, `credentials`, and `accounts` are scoped by `user_id`. Each gets an index on its scope column and a repository whose functions require a scope (ADR-009 Control 2). `otp_codes` and `rate_limits` are service-only: they get no repository module a feature can import, and the ESLint boundary rule (ADR-009 Control 1) keeps feature code away from them. Document this explicitly — with no RLS, the boundary is the lint rule and the code review, so it must be written down.
4. Add the indexes listed in §5. Note that `sessions(token_hash)` is the hottest index in the system: it is read on every authenticated request.
5. Set the free-tier quota default from a constant in `@mm/shared`, not a literal, so the pricing decision lives in one place.
6. Extend the PHASE-01 seed fixtures with the three-user cast described in TASK-009.
7. Run the tenant isolation guard test and confirm it still passes with six new tables.

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
packages/db/src/schema/auth.ts
packages/db/src/schema/index.ts  (register)
packages/db/migrations/0002_auth.sql
packages/db/src/seed/fixtures.ts  (extend)
packages/shared/src/constants/plans.ts
```

---

## 9. Data Model

Six tables. The two decisions worth stating explicitly:

**`users.email` relies on the `ICU collation` collation for case-insensitive uniqueness.** Two addresses differing only in case must be the same account. A case-sensitive column plus a lowercasing application layer works until one code path forgets, at which point a user has two archives and can find neither. Note the collation is also *accent*-insensitive; that is acceptable for email and must not be copied to token columns, which are `as_cs` (ADR-005).

**`otp_codes` and `rate_limits` are reachable only from the service path, never from a repository a feature module can call.** They are written and read by the service path only. This is deliberate: an application-layer bug must not be able to read a live OTP hash.

**No `memories_per_month` column exists** — blueprint §17.2 and Appendix C-6 decided the free tier is limited by storage and capsule horizon only. If a later task proposes such a column, that is a scope regression.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Email uniqueness is case-insensitive.
- Every table in this migration gets its scope column, index, and repository module in the same PR that creates it.
- Bearer secrets (session tokens, OTP codes) are stored hashed. The plaintext exists only in transit.

---

## 13. Edge Cases

- Two signups racing on the same email — the unique index must be the arbiter, and the application must handle the constraint violation as a friendly "already registered" rather than a 500.
- A soft-deleted user signing up again with the same email — decide and document: either the address is released on hard delete only, or the soft-deleted row is reclaimed. Record the decision in §20; do not leave it to be discovered.
- Apple private-relay addresses which can change — `accounts` must key on provider account id, not on email.
- A very long user agent string — cap the stored length rather than failing the insert.

---

## 14. Error Handling

- A unique-violation on email must surface as the non-enumerating registered-account code from `@mm/shared`, never as a database error.

---

## 15. Security Considerations

- No password column exists anywhere. If a later task adds one, the design has regressed (ADR-008).
- `ip_hash`, not raw IP — the blueprint audit-log design hashes IPs, and the same reasoning applies here.
- tenant isolation on `otp_codes` with no application policy is a security control, not a convenience.

---

## 16. Testing Requirements

### Unit Tests

- Free-tier quota default equals the constant in `@mm/shared`.

### Database Tests

- Two inserts differing only in email case violate the unique constraint.
- tenant isolation guard test passes with the six new tables.
- A session row for user A is not selectable in a context scoped to user B.
- `otp_codes` has no feature-reachable repository, proven by the Control 1 boundary test.

---

## 17. Acceptance Criteria

- [ ] Migration applies and rolls back cleanly.
- [ ] Case-insensitive email uniqueness proven by test.
- [ ] tenant isolation enabled with policies on all six tables; guard test green.
- [ ] `otp_codes` unreachable from `src/features/**`, proven by the Control 1 boundary test.
- [ ] No password column exists.
- [ ] Quota default sourced from a shared constant.
- [ ] Soft-delete-email-reuse decision recorded in §20.

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
TASK-008
    ↓
TASK-017
```


---

## 20. Implementation Notes

- Record the soft-delete email reuse decision here. It has real consequences for account deletion in PHASE-08.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-01-01-01](../EPIC-02-01-01-01.md).
3. Read the parent Sprint — [SPR-02-01-01](../../SPR-02-01-01.md).
4. Read the parent Module — [MOD-02-01](../../../MOD-02-01.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§10 User`, `§20.1`, `ADR-009` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
