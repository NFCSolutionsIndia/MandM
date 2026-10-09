# TASK-030 — Create Member Schema and CRUD Actions

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-030 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-01 — Members & Relationships](../../../MOD-03-01.md) |
| Sprint | [SPR-03-01-01 — Member Model & CRUD](../../SPR-03-01-01.md) |
| Epic | [EPIC-03-01-01-01 — Member Entity & Management Screens](../EPIC-03-01-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-026`, `TASK-027` |
| Blueprint refs | `§34.1`, `§11.1` |

---

## 1. Objective

Create the `members` table per blueprint §34.1 scoped through `lib/authz`, and implement create, update, and delete actions that route through `lib/authz`.

---

## 2. Context

Blueprint §34.1 replaces Part I's thinner `Person` with the designer's richer `Member`. It carries the fields the gift AI and milestone scheduling will later need, plus the self-service token that makes the invite-link import path possible.

---

## 3. Problem Statement

Modelling the full §34.1 shape now — including `self_service_token_hash`, `merged_into_id`, and `interests` — avoids two migrations in the very next sprint. The constraint that matters most is that a member with no contact method must be *allowed* (a grandmother you have no email for is still someone you want in your archive) but must be clearly undeliverable, because a capsule addressed to her cannot be honoured.

---

## 4. Expected Outcome

A migration creating `members` scoped through `lib/authz` and a trigram index, plus three server actions with authz enforcement and a computed undeliverable flag.

---

## 5. Requirements

### Functional Requirements

- Fields per §34.1: id, owner_id, name, relationship, avatar_media_id, phone, phone_verified_at, email, email_verified_at, birthday, birthday_precision, anniversary, notes, interests (text[]), wishlist_url, linked_user_id, self_service_token_hash, deceased_at, merged_into_id, created_at.
- Create, update, and soft-delete actions.
- `isDeliverable` derived: at least one non-null contact method.
- Relationship accepts a preset chip value or a custom string.

### Technical Requirements

- scoped by `owner_id` through `lib/authz`; repository module and matrix cell required.
- `tsvector` + `pg_trgm` index on `name` (ADR-010) for the duplicate detection built next sprint.
- `birthday_precision` mirrors `occurred_precision` semantics — some users know the month but not the day.
- Every action calls `authorize()` before touching data; no query bypasses it (ADR-009).
- Deletion is soft, and must refuse when the member is referenced by a sealed capsule (enforced in PHASE-05; the check hook exists here).

---

## 6. Implementation Instructions

1. Write the schema in `packages/db/src/schema/member.ts` from §34.1 verbatim, and generate the migration; read the SQL.
2. Add the scope enforcement scoped by `owner_id`, with a comment naming its authz counterpart.
3. Add the `tsvector` + `pg_trgm` index on `name` (ADR-010) now, so the duplicate-detection task does not need a second migration.
4. Implement `createMember`, `updateMember`, `deleteMember` in `src/features/member/actions.ts`, each opening with an `authorize()` call.
5. Implement `queries.ts` with `listMembers` and `getMember`, both scoped by the session-resolved owner — **never by an owner id from the request**.
6. Compute `isDeliverable` in a shared helper so the list, detail, and seal flows all agree.
7. Add a `deceased_at` handling note: a deceased member must not be selectable as a capsule recipient (gap G-4), and the copy for that state needs care. Implement the flag now; PHASE-05 enforces it.
8. Extend the seed fixtures with the member cast including one deliberately undeliverable member and one with a non-Latin name.

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
packages/db/src/schema/member.ts
packages/db/migrations/0006_members.sql
apps/api/src/features/member/actions.ts
apps/api/src/features/member/queries.ts
apps/api/src/features/member/schema.ts
apps/api/src/features/member/is-deliverable.ts
packages/db/src/seed/fixtures.ts  (extend)
apps/api/src/features/member/__tests__/actions.test.ts
```

---

## 9. Data Model

`members` per §34.1, scoped by `owner_id` through `lib/authz`; repository module and matrix cell required, `tsvector` + `pg_trgm` index on `name` (ADR-010).

Two fields carry more weight than their size suggests:

- **`self_service_token_hash`** — enables the invite-link import path (§29.11 path 4), which produces the most accurate data in the product because the person fills it in themselves.
- **`deceased_at`** — gap G-4. A capsule addressed to someone who has since died must not simply deliver. The flag exists here; PHASE-05 gates on it, and the copy for that case needs review before it ships.

`birthday_precision` mirrors `occurred_precision`. A user may know "March 1962" and nothing more.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- A member record is private to its owner and is never discoverable by another user (§34.1).
- A member with no contact method is allowed but is undeliverable, and the UI must say so before a user tries to address a capsule to them.
- Queries are scoped by the session-resolved owner, never by an owner id supplied in the request.

---

## 13. Edge Cases

- A name in Devanagari, Tamil, or Arabic script — must store and index correctly; the trigram index must not mangle it.
- A birthday of 29 February — recurrence handling in the event sprint must not crash on non-leap years.
- A member whose birthday year is unknown — `birthday_precision` covers this; the UI must not invent a year.
- A member referenced by a sealed capsule being deleted — must be refused with an explanation naming the capsule.
- Two members with identical names — legitimate; duplicate detection suggests, never auto-merges.
- A `linked_user_id` pointing at a user who later deletes their account — the member row survives as the owner's private record.

---

## 14. Error Handling

- Deletion refused due to a sealed-capsule reference returns a specific, actionable message naming the capsule, not a generic failure.

---

## 15. Security Considerations

- tenant isolation plus authz on every path.
- The self-service token is stored hashed from the first migration, even though it is used next sprint.
- Interests feed the gift AI later; they are personal data and belong in export and deletion.

---

## 16. Testing Requirements

### Unit Tests

- `isDeliverable` true with only an email, only a phone, and false with neither.
- Relationship accepts preset and custom values.

### Integration Tests

- Create, update, and delete each call `authorize()` — asserted with a spy.
- A query cannot be steered to another owner by passing an owner id.

### Database Tests

- tenant isolation: owner B cannot select owner A's members.
- Trigram index used by a similarity query (assert via query plan).

---

## 17. Acceptance Criteria

- [ ] Migration applies scoped through `lib/authz` and the trigram index.
- [ ] CRUD actions all route through `lib/authz`, proven by test.
- [ ] Owner scoping derives from the session, proven by an attempted override.
- [ ] `isDeliverable` correct for all three cases.
- [ ] Non-Latin names store and index correctly.
- [ ] Seed cast includes an undeliverable member and a non-Latin name.

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
TASK-026
    ↓
TASK-027
    ↓
TASK-030
```


---

## 20. Implementation Notes

- Model the full §34.1 shape now. Adding `self_service_token_hash` next sprint would mean a second migration on a table that already holds user data.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-01-01-01](../EPIC-03-01-01-01.md).
3. Read the parent Sprint — [SPR-03-01-01](../../SPR-03-01-01.md).
4. Read the parent Module — [MOD-03-01](../../../MOD-03-01.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§34.1`, `§11.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
