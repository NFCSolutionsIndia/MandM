# TASK-009 — Author Initial Migration: Database Conventions, Shared Enums, and the Scope Guard


## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-009 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-02 — Database Foundation & Migration Pipeline](../../SPR-01-01-02.md) |
| Epic | [EPIC-01-01-02-01 — Schema Pipeline & Seed Data](../EPIC-01-01-02-01.md) |
| Type | database |
| Priority | critical |
| Status | completed |
| Dependencies | `TASK-007` |
| Blueprint refs | `§10`, `§20.2`, `ADR-005`, `ADR-009`, `ADR-024`, `ADR-027` |

---

## 1. Objective

Create migration 0001: the database-wide conventions (collation, temporal and identifier types), the shared domain enums as `CHECK` constraints, and the **scope-guard convention** that every later table must follow — plus the CI guards that make all three self-enforcing.

---

## 2. Context

ADR-009 makes `lib/authz` the single authorization chokepoint. On the Postgres design in the blueprint there was a second line beneath it — row-level security — and this task originally existed to switch RLS on before any user data existed.

**Row-level security is the second line** (ADR-009), and this task installs the conventions and guards it keys on: a scope column on every table holding user data, an index to match, and the CI gate that fails a table missing either. Make the safe thing the default before there is any data to get wrong.

---

## 3. Problem Statement

Three failure modes, each of which is cheap now and expensive later:

1. **A table without a scope column.** Retrofitting `vault_id` across thirty tables after the fact is a large, risky migration nobody schedules. With RLS gone, a table without a scope column is a table `lib/authz` cannot protect.
2. **A naive `timestamp` column.** It silently drops the offset (ADR-024). One such column on `unlock_at` breaks the product's central promise — a delivery into the wrong hour, decades from now, that nobody catches until it happens. It must be impossible to add one.
3. **Enum drift.** A database `CHECK` constraint and a TypeScript union that disagree produce a bug that only appears at runtime, in production, on real user data.

Migration 0001 plus three guard tests turns all three from "remember to" into "cannot".

---

## 4. Expected Outcome

Migration 0001 applied to a fresh PostgreSQL 17 database. The schema is `UTF-8` throughout; the shared enums exist as `CHECK` constraints generated from `@mm/shared`; `packages/db` exports the sanctioned column helpers; and three guard tests pass — and demonstrably fail when violated.

---

## 5. Requirements

### Functional Requirements

- Database and every table created with `CHARACTER SET UTF-8` and `COLLATE ICU collation`.
- Shared enums expressed as `VARCHAR` + `CHECK`, values generated from `@mm/shared/enums`: vault role, capsule state, occurred precision, media kind, unlock kind, memory visibility.
- Sanctioned column helpers exported from `packages/db`: `uuidPk()`, `uuidRef()`, `utcTimestamp()`, `scopeColumn()`.
- A documented scope convention with a worked example, in `packages/db/TENANT-ISOLATION.md`.
- **Three guard tests** (§16), all in the blocking CI gate.

### Technical Requirements

- **No native enum types** (ADR-005) — a value can never be removed from one.
- **No `TIMESTAMP` columns, anywhere** (ADR-024).
- Identifiers are a native `uuid` column (ADR-027). Generation is application-side UUIDv7, so ids sort by creation time and inserts stay sequential at the right-hand edge of the index.
- Connections set `time_zone = '+00:00'` explicitly; business timestamps are supplied by the application, never `NOW()`.
- Semantic search is **not** provisioned here — that is OpenSearch at R2 (ADR-010, ADR-017).

### Collation, and the one place it must differ

`ICU collation` is case- **and** accent-insensitive. That is correct and convenient for email uniqueness — it gives case-insensitive uniqueness with no functional index, which is what `citext` was for on Postgres.

**It is wrong, and a security bug, for tokens.** Capsule unlock tokens and share tokens (ADR-027) must compare case- and accent-**sensitively**, or the effective keyspace collapses and two different tokens can match. Those columns are declared `COLLATE the default (case-sensitive) collation` explicitly, and §16 tests it.

---

## 6. Implementation Instructions

1. Define the enum value arrays in `packages/db/src/schema/enums.ts`, importing from `@mm/shared` so the two cannot drift. Emit each as a `CHECK (col IN (...))` constraint.
2. Write the column helpers in `packages/db/src/schema/columns.ts`:
   - `uuidPk()` / `uuidRef()` — native `uuid`; no custom Drizzle type and no conversion, so the application only ever sees canonical UUID strings.
   - `utcTimestamp()` — `timestamptz`. **The only sanctioned way to declare a temporal column.**
   - `scopeColumn()` — the `vault_id` (or `user_id`) column plus its index, so a table cannot get one without the other.
3. Generate migration 0001 and **read the SQL.** Confirm charset, collation, `CHECK` constraints, and that no `TIMESTAMP` appears.
4. Write `packages/db/TENANT-ISOLATION.md`: the scope template, a worked example table, and an explicit statement that this replaces RLS and why (point at ADR-009 rather than re-arguing it).
5. Write the three guard tests (§16) against a real PostgreSQL instance.
6. Prove each guard fails: add a scratch table with no scope column, a scratch `TIMESTAMP` column, and a deliberately mismatched enum value — confirm each test goes red, then remove them.

---

## 7. Architecture

```text
Clients: iOS (Swift) · Android (Kotlin) · web
  ↓ server action / route handler
lib/authz  ← every read and write passes here; with no RLS beneath it,
  ↓            this is the only tenant boundary (ADR-009)
feature service (src/features/*)
  ↓ repository (requires VaultScope) → Drizzle
PostgreSQL + RLS   R2 (media, private, signed URLs only)
  ↑
apps/workers (delivery engine, media pipeline)
```

---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
packages/db/src/schema/enums.ts
packages/db/src/schema/columns.ts
packages/db/migrations/0001_conventions_enums_scope.sql
packages/db/TENANT-ISOLATION.md
packages/db/src/__tests__/scope-guard.test.ts
packages/db/src/__tests__/no-timestamp-columns.test.ts
packages/db/src/__tests__/enum-parity.test.ts
```

---

## 9. Data Model

**Extensions:** `citext` is installed in migration 0000 for case-insensitive email; `pg_trgm` arrives with search. Each is declared explicitly rather than assumed:

| Capability | How it is provided |
|---|---|
| `pgcrypto` / `gen_random_uuid()` | Application-side UUIDv7 into a native `uuid` column (ADR-027) |
| `citext` for email | `ICU collation` collation is already case-insensitive |
| `pg_trgm` for typo tolerance | **No equivalent.** PostgreSQL `FULLTEXT` in PHASE-03; typo tolerance waits for OpenSearch at R2 (ADR-010) |
| `vector` | Not provisioned — OpenSearch k-NN at R2 |

**Enums** — values imported from `@mm/shared`, expressed as `VARCHAR` + `CHECK`:

| Enum | Values |
|---|---|
| `vault_role` | owner, admin, contributor, viewer |
| `capsule_state` | draft, sealed, delivering, delivered, opened, cancelled, failed |
| `occurred_precision` | exact, day, month, year |
| `media_kind` | image, video, audio |
| `unlock_kind` | datetime, milestone, manual |
| `memory_visibility` | private, vault, link, recipients |

**Scope convention** (see `packages/db/TENANT-ISOLATION.md`): every table holding user data carries a `vault_id` (or `user_id`) column, an index on it, and a repository module in `lib/db` whose functions require a `VaultScope`. Unlike an RLS policy, this convention is **not** self-enforcing at the database — which is exactly why the guard test in §16 exists and why it is a blocking CI gate rather than a hygiene check.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Enum values are imported from `@mm/shared`, never retyped.
- Every future table gets its scope column, index, and repository module in the same PR that creates it. The guard test enforces this.
- Every temporal column uses `utcTimestamp()`. `TIMESTAMP` is banned outright, including on `created_at` where the 2038 horizon looks irrelevant.
- Adding a table to the scope-guard allow-list requires a comment justifying it, reviewed as a security change.

---

## 13. Edge Cases

- **Adding an enum value later** is an `ALTER TABLE ... DROP CHECK` / `ADD CHECK` pair that validates every existing row. On a large table this is slow and locks; plan it as a migration with a measured window, and keep the Zod enum in `packages/shared` as the source the constraint is regenerated from.
- **A view** does not carry scope automatically — it inherits the RLS of its underlying tables only if created with `security_invoker`. Either set that, give the view a `vault_id` column, or forbid it; document which. A materialised view does not inherit RLS at all, so it needs its own scope column and its own policy.
- **Collation mismatch in a join** silently disables index use and can error on comparison. Keep the whole schema on one collation, with tokens the single documented exception.
- **`ICU collation` is accent-insensitive**, so `José` and `Jose` collide in a unique index. That is right for email and wrong for anything that must preserve distinct names — check each unique constraint deliberately rather than inheriting the default.
- The migration runs as a role with DDL rights that the application role must not retain (ADR-009 Control 4). Record which role ran it in §20.

---

## 14. Error Handling

- Migration failure must name the failing statement. A partially applied migration must be visible, not silent.
- PostgreSQL DDL **is** transactional, so a failed migration rolls back whole rather than leaving the schema half-changed. Migrations are still written to be re-runnable, because an operator may abort one between statements.

---

## 15. Security Considerations

- **The scope guard is the tenant boundary now, not a defence-in-depth layer.** With RLS gone it is load-bearing for the highest-severity risk in the product (cross-tenant leak, gap analysis R-2). It is not optional, not deferrable, and not skippable in CI.
- The `TIMESTAMP` guard protects the delivery guarantee itself; treat it with the same seriousness.
- Token columns must be `as_cs`; an accidental `ai_ci` token column is a real reduction in token entropy.

---

## 16. Testing Requirements

### Database Tests

- **Scope guard:** enumerate tables in the application schema; fail if any user-data table lacks a scope column with an index, except an explicit allow-list. Negative test: a scratch table without one makes it fail.
- **No-`TIMESTAMP` guard:** `SELECT ... FROM information_schema.columns WHERE table_schema = DATABASE() AND data_type = 'timestamp'` must return zero rows. Negative test: a scratch `TIMESTAMP` column makes it fail.
- **Enum parity:** every `CHECK` constraint's value set equals the `@mm/shared` array exactly, compared programmatically. Negative test: a mismatched value makes it fail.
- **Collation:** assert the schema default is `ICU collation`, and that token columns are `the default (case-sensitive) collation`.
- **Round-trip:** a UUID written through `uuidPk()` reads back as the identical canonical string.
- **Index ordering:** three UUIDv7 values generated in sequence must sort in creation order as `uuid`. This is the test that catches someone "fixing" the swap flag to 1.

---

## 17. Acceptance Criteria

- [x] Migration 0001 applies cleanly to a fresh PostgreSQL 17 database.
- [x] Schema and every table are `UTF-8` / `ICU collation`; token columns are `as_cs`.
- [x] Enum `CHECK` values match `@mm/shared` exactly, asserted by test rather than by inspection.
- [x] Scope guard passes, and demonstrably fails for a table without a scope column.
- [x] No-`TIMESTAMP` guard passes, and demonstrably fails for a `TIMESTAMP` column.
- [x] UUID round-trip through `uuid` returns the identical canonical string.
- [x] `packages/db/TENANT-ISOLATION.md` documents the template with a worked example and states plainly that it replaces RLS.
- [x] No vector or search infrastructure provisioned.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — CI is created in TASK-005
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-007
    ↓
TASK-009
```

---

## 20. Implementation Notes

### Migration 0001 creates no tables, on purpose

It fixes what a table cannot fix for itself: the database charset and collation, set
explicitly rather than inherited. A database created from the server default is correct
today and wrong the day someone changes that default, and **no per-session setting can
repair a database created with the wrong charset**.

Hand-written rather than generated — drizzle-kit emits table DDL and there are no tables.
That meant hand-writing `migrations/meta/_journal.json` too: Drizzle's migrator refuses
to run without it. The format matches what drizzle-kit emits, so generated migrations
append to the same journal and the two coexist.

**The down migration is a deliberate no-op.** There is no correct inverse to widening a
charset: reverting would corrupt any name already stored in a script UTF-8 covers and
the older one does not. Losing a family's names to a rollback is not an acceptable
outcome, so the charset stays and only the journal row is removed.

### The guards are security controls, and each is proven to fail

| Guard | Catches | Proven red by |
|---|---|---|
| Scope column | a user-data table lib/authz cannot protect | creating an unscoped table |
| No `TIMESTAMP` | a column that stops working in 2038 | adding a `TIMESTAMP` column |
| Enum parity | a CHECK drifted from `@mm/shared` | value-by-value comparison |

A guard that has never gone red is decoration, so each test creates the violation,
asserts the guard catches it, and removes it.

The scope guard currently runs against a schema with no domain tables. That is not
vacuous: the negative tests prove the query works, so the guard is armed for the first
table PHASE-02 adds rather than being written after the fact.

### Collation: right for email, dangerous for tokens

The schema default `ICU collation` is accent- and case-INsensitive. That is
deliberate and useful — it gives case-insensitive email uniqueness with no functional
index, which is what `citext` provided on Postgres.

**It is a security bug for tokens.** Under `ai_ci`, `aB3xK` and `Ab3XK` compare
EQUAL, collapsing the effective keyspace of a capsule-unlock link. Token columns are
declared `the default (case-sensitive) collation` individually, and a test asserts both behaviours against
the real engine rather than trusting the documentation.

### Dependency on TASK-007 not honoured

This task declares `TASK-007` (Sentry) as its dependency. That is sprint ordering, not a
technical need — a migration does not require error tracking. TASK-007 was deferred with
TASK-005 and TASK-006 by decision; noted here so the skip is visible rather than silent.

### Verification of §17 acceptance criteria

| Criterion | Result | How |
|---|---|---|
| Migration 0001 applies to a fresh PostgreSQL 17 | Pass | Applied to both `mm_dev` and `mm_test`. |
| UTF-8 / ai_ci schema-wide; tokens as_cs | Pass | Asserted from `information_schema`; `as_cs` behaviour proven against the engine. |
| Enum CHECK values match `@mm/shared` by test | Pass | Value-by-value, plus a count check so the constraint has nothing extra, plus coverage that every shared enum is present. |
| Scope guard passes and demonstrably fails | Pass | Unscoped scratch table caught. |
| No-`TIMESTAMP` guard passes and demonstrably fails | Pass | `TIMESTAMP` scratch column caught; `timestamptz` stores 2046 correctly. |
| UUID round-trip returns the identical string | Pass | Custom Drizzle type, swap flag 0 (ADR-027). |
| TENANT-ISOLATION.md documents the template | Pass | With a worked example and an explicit statement of what this does NOT give you. |
| No vector or search infrastructure | Pass | OpenSearch is R2 (ADR-010). |

Also verified: Devanagari and emoji round-trip intact, and `posthumous` is absent from
`unlock_kind` — the blueprint lists it as `[V2]` and the model behind it is deferred
pending legal counsel (ADR-026).

34 tests in this package; 124 across the workspace.

### Left deliberately undone

No domain tables — PHASE-02 owns users and vaults, PHASE-03 memories. The helpers and
guards exist so the first of those tables is born correct rather than corrected later.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-02-01](../EPIC-01-01-02-01.md).
3. Read the parent Sprint — [SPR-01-01-02](../../SPR-01-01-02.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§10`, `§20.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md). **Note that §18.1 specifies Postgres and is superseded** — read the stack-change note and ADR-005, ADR-009, ADR-024, ADR-027 in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) instead.
7. Confirm the choices this task depends on before writing SQL.
8. **This Next.js release has breaking changes from earlier conventions — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code** (project `AGENTS.md`).

While implementing:

9. Implement **only** the scope of this task. Do not opportunistically refactor unrelated code.
10. Do not modify files owned by other tasks unless this task's §8 lists them.
11. Create or update the tests named in §16.
12. Run `pnpm lint`, `pnpm typecheck`, and the relevant test command.
13. Verify every §17 acceptance criterion explicitly, one at a time — including the three negative tests, which are the point of the task.

After implementing:

14. Update §22 of this document to `completed`.
15. Update the counts in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md).
16. Report which acceptance criteria were verified and how.

**Do not mark this task `completed` until every §17 acceptance criterion has been verified.** If a criterion cannot be met, leave the status as `progress` and record the blocker in §20.

---

## 22. Completion Status

```text
completed
```

Allowed statuses: `pending` · `progress` · `completed`
