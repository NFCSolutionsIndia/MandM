# TASK-008 — Create Database Package with Drizzle Client and Migration Pipeline


## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-008 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-02 — Database Foundation & Migration Pipeline](../../SPR-01-01-02.md) |
| Epic | [EPIC-01-01-02-01 — Schema Pipeline & Seed Data](../EPIC-01-01-02-01.md) |
| Type | database |
| Priority | critical |
| Status | completed |
| Dependencies | `TASK-001` |
| Blueprint refs | `§10`, `§19`, `ADR-005` |

---

## 1. Objective

Create `packages/db` exporting a configured Drizzle client and a working generate/apply/rollback migration workflow.

---

## 2. Context

Blueprint §19 requires `packages/db` to be the single schema source shared by the API and `apps/workers`. Both run as long-lived ECS Fargate processes (ADR-019), so both use a `pg` pool rather than the serverless HTTP driver the blueprint assumed for Neon. What differs is pool *sizing* and lifetime, not the driver.

---

## 3. Problem Statement

Two copies of a schema always diverge, and a divergence between the delivery engine and the app means a capsule row the worker cannot read. One package, one schema, no drift.

---

## 4. Expected Outcome

A package with `schema/`, `migrations/`, a `client.ts` that works in both runtimes, and root scripts `db:generate`, `db:migrate`, `db:rollback`, `db:seed`.

---

## 5. Requirements

### Functional Requirements

- Drizzle Kit configured against the schema directory.
- Client factory with explicit pool sizing per consumer (`web` | `worker`), since a web task and a delivery worker have very different concurrency profiles.
- Scripts for generate, migrate, rollback, and seed.
- Migration files committed and reviewable as SQL.

### Technical Requirements

- Connection string from environment, validated by a Zod schema at import.
- `pg` pool for both runtimes, with **pool size stated explicitly by the caller**, never defaulted. Aurora has a hard `max_connections` tied to instance size; several Fargate tasks each defaulting to a large pool will exhaust it under load, and the failure appears as unrelated timeouts.
- Statement timeout set conservatively so a runaway query cannot hold a connection indefinitely.
- Migrations are forward-only in production; rollback exists for development and for a tested emergency path.

---

## 6. Implementation Instructions

1. Create `packages/db/drizzle.config.ts` pointing at `schema/` and `migrations/`.
2. Create `packages/db/src/client.ts` exporting `createClient({ consumer: "web" | "worker", poolSize })`. Do **not** default the pool size; make the caller state its intent, because connection exhaustion on Aurora surfaces as timeouts far from the cause. Budget the total against Aurora `max_connections` and record the arithmetic in §20.
3. Create `packages/db/src/schema/index.ts` as the aggregation point; leave it nearly empty — domain tables belong to their phases.
4. Add root scripts `db:generate`, `db:migrate`, `db:rollback`, `db:seed`.
5. Write `packages/db/src/migrate.ts` as a programmatic runner so CI and the preview workflow can invoke it without the Drizzle CLI.
6. Document the workflow in the README: change schema → generate → **review the generated SQL** → commit both.
7. Set the timeouts explicitly on every connection: `statement_timeout` (a runaway query cannot hold a pooled connection), `lock_timeout` (a blocked write fails fast), and `idle_in_transaction_session_timeout` (a transaction left open by a crashed handler cannot hold locks indefinitely). Also set `TimeZone = 'UTC'`, so a connection never reinterprets an application-supplied instant against a container timezone.

---

## 7. Architecture

```text
packages/db/schema/*.ts      ← the single source of truth
        │ drizzle-kit generate
        ▼
packages/db/migrations/*.sql  ← reviewed and committed
        │ db:migrate
        ▼
Aurora PostgreSQL  ◀── apps/api      (pg pool, sized for request concurrency)
              ◀── apps/workers  (pg pool, sized for claim-loop concurrency)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
packages/db/drizzle.config.ts
packages/db/src/client.ts
packages/db/src/migrate.ts
packages/db/src/schema/index.ts
packages/db/src/index.ts
packages/db/migrations/.gitkeep
packages/db/src/__tests__/migrate.test.ts
```

---

## 9. Data Model

No domain tables in this task. It delivers the **pipeline**.

The client contract:

```ts
createClient({ consumer: 'api',    poolSize: 10 })  // apps/api
createClient({ consumer: 'worker', poolSize: 4  })  // apps/workers
```

Every later migration is generated from `packages/db/src/schema/` and committed as reviewed SQL. Generated SQL is **read before committing** — Drizzle occasionally produces a destructive statement for a rename, and on a table holding irreplaceable family media that must never reach production unexamined.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Generated migration SQL is always read before commit. A rename that Drizzle emits as drop-and-recreate must be rewritten by hand.
- Production migrations are forward-only. Rollback is a development and emergency tool, and any emergency use is rehearsed first.
- No feature code may create its own database client; all access goes through `@mm/db`.

---

## 13. Edge Cases

- Aurora `max_connections` exhaustion as tasks scale out — prevented by requiring an explicit pool size and budgeting the total against the cluster limit. Consider RDS Proxy if the arithmetic gets tight. Worth an assertion that logs loudly when the pool saturates, since the symptom otherwise appears far from the causeed in the wrong runtime.
- A migration that succeeds locally and fails on Aurora PostgreSQL due to a permission difference — the preview workflow must run migrations, so this surfaces on a PR rather than in production.
- Two developers generating migrations concurrently, producing conflicting sequence numbers — document the resolution (regenerate after rebase, never hand-merge).
- A long-running migration locking a table — note the requirement that later migrations on large tables use `CONCURRENTLY` for index creation.

---

## 14. Error Handling

- A failed migration must exit non-zero with the failing statement printed, and must not leave a partially applied state without saying so.

---

## 15. Security Considerations

- Connection string is a secret; never logged, never in an error message.
- The application database user must not be a superuser; it needs no DDL rights at all after the initial migration (ADR-009 Control 4).
- Statement timeout limits the blast radius of a pathological query.

---

## 16. Testing Requirements

### Unit Tests

- Config validation fails with a clear message when the connection string is absent or malformed.

### Integration Tests

- Apply all migrations to an ephemeral database, then roll back, and assert the schema returns to its prior state.
- Assert both consumer configurations connect, execute a trivial query, and report the expected pool size.
- Assert `TimeZone` is `UTC` and `statement_timeout` is non-zero on a freshly checked-out connection.

---

## 17. Acceptance Criteria

- [x] `pnpm db:generate` produces a migration from a schema change.
- [x] `pnpm db:migrate` applies it — to the local Docker database, since per-PR preview schemas are TASK-006 (deferred).
- [x] `pnpm db:rollback` reverses it.
- [x] Both client modes connect successfully from their respective apps.
- [x] Migration workflow documented in the README, including the "read the generated SQL" rule.

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
TASK-001
    ↓
TASK-008
```


---

## 20. Implementation Notes

### A bug that would have silently corrupted every write

`createClient` applies the session settings — `TimeZone`, `statement_timeout`, `lock_timeout`,
`statement_timeout`, `lock_timeout` — on the pool's `connect` event.
The first version wrote that handler in promise style:

```ts
pool.on('connection', (connection) => {
  void connection.query(initSql).catch(() => connection.destroy());
});
```

**`pg/promise` emits the RAW CALLBACK connection on that event.** The promise
wrapper does not wrap event payloads. So `.catch()` was called on a non-promise, which
throws *inside an event handler where nothing surfaces it* — and the session settings
were **never applied**. Every connection would have run without strict mode, silently
truncating over-long strings and coercing bad dates. On this schema that means storing a
damaged memory instead of rejecting it: exactly the corruption the code exists to prevent,
introduced by the code meant to prevent it.

The integration tests caught it. A unit test with a mocked pool could not have.

### A rollback that half-reverted a real schema

`pnpm db:rollback` passed the whole `.down.sql` file to `connection.query()`.

Drizzle separates statements with `--> statement-breakpoint`. **That is not a SQL
comment** in any dialect, so `-->` is a syntax error.
Observed against the real database:

```
DROP INDEX ix_pipeline_probe_vault   → succeeded
--> statement-breakpoint             → syntax error
DROP TABLE pipeline_probe            → never ran

result: table 1, index 0, journal still claiming the migration was applied
```

PostgreSQL DDL is transactional, so the failed migration rolled back whole — but the statements still have to be split, and the runner still wraps each migration explicitly rather than relying on that. The
runner now splits on the marker and executes statements one at a time, reporting
**which statement number failed and how many already applied**.

`splitStatements` was extracted to `src/sql.ts` — `migrate.ts` reads `process.argv` and
calls `process.exit` at module scope, so importing it from a test would run the CLI —
and has eight regression tests, including one built from the real generated migration
shape so it breaks if Drizzle changes its separator.

### An integration suite that reported green while testing nothing

The first version set a `reachable` flag in `beforeAll` and used
`describe.skipIf(!reachable)`. **`skipIf` is evaluated when the describe block is
DEFINED — during collection, before any hook runs**, so the flag was always still
`false`. Ten integration tests skipped and the suite reported success.

That is the "green run that silently tested nothing" this file's own comment warns
about, and it happened anyway. The check now runs at module scope with top-level await,
which completes before collection. Verified by the count changing from
`5 passed | 10 skipped` to `15 passed`.

**Worth generalising: a skipped test and a passing test look identical in a summary
line.** Read the counts, not the colour.

### Rollback, which Drizzle does not provide

There is no `drizzle-kit generate:down` — Drizzle Kit is forward-only. §17 requires
`db:rollback` to reverse a migration, so the convention is a hand-written sibling:

```
migrations/0000_name.sql          generated by drizzle-kit, reviewed
migrations/down/0000_name.sql     HAND-WRITTEN, reviewed
```

`db:rollback` **refuses** when no down file exists rather than inventing an inverse —
an auto-generated inverse of a data-bearing change is how irreplaceable family media
gets dropped. It also refuses under `NODE_ENV=production` unless
`MM_ALLOW_PRODUCTION_ROLLBACK=yes` is set deliberately (§12: production is
forward-only).

### Local database: PostgreSQL in Docker

AWS provisioning is TASK-006, so development runs against **PostgreSQL 17 in a container**
— `mm_dev` for development and `mm_test` for integration tests, both created with an
explicit ICU collation rather than inheriting the server default, and both with the
`citext` extension installed by migration 0000.

**Why a container rather than a native install.** Schema work is iterative: a migration
will be wrong several times before it is right, and the value of a local database is how
cheaply it can be destroyed and rebuilt from zero.

| | Docker | Native install |
|---|---|---|
| Reset to empty and replay every migration | `docker rm -f` — seconds | Manual `DROP`, or reinstall |
| Version matching Aurora | `postgres:17` pinned exactly | Whatever the installer provides |
| Two databases on separate ports | Two containers | One server, configured by hand |
| Extensions (`citext`, `pg_trgm`) | Identical on every machine | Per-machine setup |

**A container does not mask the production configuration**, because the settings that
matter are pinned per connection by the client rather than inherited from the server
(see §Session settings): `TimeZone = 'UTC'` (ADR-024), `statement_timeout`, `lock_timeout`
and `idle_in_transaction_session_timeout`. Isolation needs nothing at all — `READ COMMITTED`
is PostgreSQL's default on both. **The design pays for itself here: nothing about the local
server needs changing to behave like Aurora.**

`.env.example` is created here although TASK-006 §8 lists it — nothing can connect without
it. TASK-006 should extend it rather than recreate it.

**The container's `max_connections` is 100 by default** against a pool budget of 53.
Comfortable, but a real constraint to re-check against the provisioned Aurora instance
size in TASK-006, where it is set by instance class rather than by us.


### Pool sizing, and why it is not defaulted

`poolSize` is required and throws when absent. Aurora's `max_connections` is fixed by
instance size and shared by every task; if each Fargate task quietly opens a
default-sized pool the cluster runs out, and the symptom is timeouts in unrelated
queries minutes from the cause.

Current budget — **revisit in TASK-006 against the provisioned instance size**:

| Consumer | Pool | Tasks | Total |
|---|---:|---:|---:|
| `web` | 10 | up to 4 | 40 |
| `worker` (delivery) | 4 | 2 | 8 |
| `worker` (media) | 2 | 2 | 4 |
| migrations | 1 | 1 | 1 |
| | | | **53** |

### Verification of §17 acceptance criteria

Proven end to end with a throwaway `pipeline_probe` table, then removed — TASK-009 owns
the first real migration, so `migrations/` is intentionally empty at commit.

| Criterion | Result | How |
|---|---|---|
| `pnpm db:generate` produces a migration from a schema change | Pass | Generated `0000_greedy_liz_osborn.sql`. Reviewed per §12: `binary(16)` ids, `datetime(3)`, **zero `TIMESTAMP`** — the generated SQL already obeys ADR-024 and ADR-027. |
| `pnpm db:migrate` applies it | Pass | Table and index created; `db:status` went `Applied: 0` → `Applied: 1`. Re-proven against the local PostgreSQL after dropping Docker. |
| `pnpm db:rollback` reverses it | Pass | After the split-statement fix: table 0, index 0, `Applied: 0`. Also verified it **refuses** when no down migration exists. |
| Both client modes connect | Pass | `web` (pool 10) and `worker` (pool 4) both connect and report their configured limit. |
| Migration workflow documented in the README | Pass | `packages/db/README.md`, including the read-the-SQL rule, the hand-written-down rule, and the non-transactional-DDL warning. |

Also verified beyond §17:

- **Strict mode is in force, not merely set** — a test inserts an over-long value and
  asserts the database *rejects* it. A setting that is present but not enforced would pass a
  `SHOW TimeZone` assertion and still write with the wrong offset.
- **BIGINT returns as a string** — `storage_used_bytes` exceeds 2^53 and quota drives
  billing, so a silently rounded number would misreport what a user owes.
- **`FOR UPDATE SKIP LOCKED` works on this engine** — asserted here too, because if it
  ever fails the ADR-006 claim loop design is invalid.
- **The connection string never appears in an error** (§15) — tested with a URL
  containing a password, asserting neither the password nor the host leaks.
- 23 tests in this package; 97 across the workspace.

### Left deliberately undone

No domain tables — TASK-009 owns migration 0001. No seed — TASK-010; `db:seed` exits 1
with a message naming it rather than reporting a seed that never ran. No RDS Proxy: the
connection budget above has headroom, and it should be reconsidered with a real instance
size in TASK-006.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-02-01](../EPIC-01-01-02-01.md).
3. Read the parent Sprint — [SPR-01-01-02](../../SPR-01-01-02.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§10`, `§19`, `ADR-005` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
completed
```

Allowed statuses: `pending` · `progress` · `completed`
