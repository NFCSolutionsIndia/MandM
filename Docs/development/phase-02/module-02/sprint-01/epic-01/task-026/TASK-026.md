# TASK-026 — Create Vault and Membership Schema with Transactional Provisioning

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-026 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-02 — Authorization Chokepoint & Vault Ownership](../../../MOD-02-02.md) |
| Sprint | [SPR-02-02-01 — Vault Model & Authorization Chokepoint](../../SPR-02-02-01.md) |
| Epic | [EPIC-02-02-01-01 — Vault Ownership Model](../EPIC-02-02-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-017` |
| Blueprint refs | `§10 Vault`, `§10 VaultMember`, `ADR-009` |

---

## 1. Objective

Create `vaults` and `vault_members` scoped through `lib/authz`, and provision a personal vault inside the same transaction that creates a user.

---

## 2. Context

Blueprint §10 makes `Vault` the ownership root: "every authorisation check in the system resolves to vault membership". `VaultMember` carries the role.

---

## 3. Problem Statement

A user without a vault is a broken state that every downstream query must defend against. Creating both in one transaction removes an entire category of null-handling from the rest of the codebase. Doing it after the fact — a nightly job, or lazily on first use — guarantees that some code path eventually encounters a user with no vault.

---

## 4. Expected Outcome

Two tables with scope columns and repository modules, plus a `createUserWithVault` function that is atomic: either both rows exist or neither does.

---

## 5. Requirements

### Functional Requirements

- `vaults`: id, owner_id, name, type (personal | shared | legacy), cover_media_id (nullable), default_visibility, created_at, archived_at.
- `vault_members`: id, vault_id, user_id, role, invited_by, joined_at, revoked_at — unique on (vault_id, user_id) where not revoked.
- Personal vault created with the user, named from their display name, with an owner membership row.
- A personal vault cannot lose its owner membership.

### Technical Requirements

- Single transaction for user, vault, and membership.
- tenant isolation on both tables: a vault row is visible to a session with a non-revoked membership; a membership row is visible to members of the same vault.
- Partial unique index so a revoked membership does not block re-invitation later.
- Role values from the `@mm/shared` enum.

---

## 6. Implementation Instructions

1. Write the Drizzle schema in `packages/db/src/schema/vault.ts` and generate the migration; read the SQL.
2. Write scope enforcement mirroring the intended authz rules, and add a comment on each policy naming the `lib/authz` rule it duplicates. The duplication is deliberate — two independent layers — and the comment prevents a future contributor from "removing the redundancy".
3. Add the partial unique index on (vault_id, user_id) where `revoked_at IS NULL`, so a member can be removed and later re-added.
4. Implement `createUserWithVault` in `packages/db` or in the auth feature, wrapping all three inserts in one transaction. Name the vault from the user's display name with a sensible fallback.
5. Add a database-level guard, or a documented invariant plus test, that a personal vault always retains an owner membership.
6. Extend the seed fixtures so every seeded user has a vault.
7. Write the atomicity test by injecting a failure after the vault insert and asserting no user row remains.

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
packages/db/src/schema/vault.ts
packages/db/migrations/0004_vault.sql
apps/api/src/features/auth/create-user.ts
packages/db/src/seed/fixtures.ts  (extend)
packages/db/src/__tests__/vault-rls.test.ts
```

---

## 9. Data Model

Two tables. `vaults.type` distinguishes `personal` (one per user, created at signup), `shared` (Release 2), and `legacy` (Release 3) — the values exist now so later releases do not need a migration to add them.

**The second layer mirrors this one on purpose.** RLS policies duplicate the `lib/authz` rules deliberately, and the duplication *is* the defence (ADR-009). Neither layer may be relaxed because the other exists — a gap written into both at once has nothing behind it, so review should be proportionally careful.

The partial unique index matters: `UNIQUE (vault_id, user_id) WHERE revoked_at IS NULL` allows a member to be removed and re-invited, which a plain unique constraint would block forever.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- A user always has exactly one personal vault, created atomically with the user.
- A personal vault always has an owner membership.
- Every authorization decision resolves through vault membership (ADR-009).

---

## 13. Edge Cases

- A failure between the user insert and the vault insert — the transaction must roll back both; test this explicitly with an injected failure.
- A user whose display name is empty or non-Latin — vault naming must have a sensible fallback and must not produce an empty string.
- Re-inviting a previously revoked member — the partial index must permit it.
- An attempt to revoke the owner's membership on a personal vault — must be refused.
- A soft-deleted user's vault — must remain invisible to everyone while the account is in its grace period, and must be purged with it in PHASE-08.

---

## 14. Error Handling

- Provisioning failure surfaces as a signup failure with no partial state; the user retries and gets a clean account.

---

## 15. Security Considerations

- tenant isolation on both tables from this migration.
- The membership table is the target of every authz resolution; an incorrect policy here has the widest possible blast radius. It warrants the most careful review in the phase.

---

## 16. Testing Requirements

### Integration Tests

- **Injected failure after the vault insert leaves no user row** — the atomicity test.
- Every seeded user has exactly one personal vault.
- Revoking the owner of a personal vault is refused.

### Database Tests

- tenant isolation: user B cannot select user A's vault or membership rows.
- Partial unique index permits re-invitation after revocation.
- Duplicate active membership rejected.

---

## 17. Acceptance Criteria

- [ ] Migration applies scoped through `lib/authz` enabled and policies present on both tables.
- [ ] Atomic provisioning proven by an injected-failure test.
- [ ] tenant isolation blocks cross-user reads, proven by test.
- [ ] Partial unique index permits re-invitation.
- [ ] Owner membership on a personal vault cannot be revoked.
- [ ] Policy comments name their authz counterparts.

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
TASK-026
```


---

## 20. Implementation Notes

- This is the ownership root. Every query in every later phase is scoped by it, so the scope enforcement here deserve a second reviewer.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-02-01-01](../EPIC-02-02-01-01.md).
3. Read the parent Sprint — [SPR-02-02-01](../../SPR-02-02-01.md).
4. Read the parent Module — [MOD-02-02](../../../MOD-02-02.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§10 Vault`, `§10 VaultMember`, `ADR-009` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
