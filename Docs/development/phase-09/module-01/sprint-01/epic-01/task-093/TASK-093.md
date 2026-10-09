# TASK-093 — Build Permission Matrix and Tenant-Isolation Assurance Suite

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-093 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-01 — Security Assurance](../../../MOD-09-01.md) |
| Sprint | [SPR-09-01-01 — Authorization Assurance & Platform Security](../../SPR-09-01-01.md) |
| Epic | [EPIC-09-01-01-01 — Authorization & Tenant-Isolation Assurance](../EPIC-09-01-01-01.md) |
| Type | testing |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-059`, `TASK-027` |
| Blueprint refs | `§11.2`, `§20.2`, `ADR-009`, `ADR-018` |

---

## 1. Objective

Complete the generated permission-matrix suite across all grant sources, and add a control-integrity suite that tests each of ADR-009's four compensating controls directly — because with no row-level security beneath them, those controls *are* the tenant boundary.

---

## 2. Context

PHASE-02 built the generated matrix suite for vault membership; PHASE-05 added the share and capsule-recipient columns.

**This task tests both layers independently.** A database-level layer exists — RLS — and it must be proven to hold on its own, not merely to agree with the application (ADR-009). The matrix suite asserts every cell through `lib/authz`, and a second pass asserts that RLS alone would have refused the same cross-tenant reads.

---

## 3. Problem Statement

With RLS, the assurance question was "does the database still refuse when the application is wrong?" — answerable by bypassing the application and querying directly.

That question is now unanswerable, because the honest answer is *no, it does not refuse*. So the question changes to: **"are the four controls that replaced it actually in force, and do they fail closed?"** A control that is merely present in the codebase is not a control; one that has been tested against a deliberate violation is. Each of ADR-009's controls therefore gets a test that violates it on purpose and asserts the violation is caught.

---

## 4. Expected Outcome

A complete matrix suite covering every subject and action with a positive and a negative test per cell, plus a control-integrity suite proving each of ADR-009's four controls fails closed when deliberately violated.

---

## 5. Requirements

### Functional Requirements

- Generated test per (subject, action) cell across all three grant sources, each with a **positive and a negative** assertion against seeded cross-tenant data.
- A drift test failing when an action or subject is added without a matrix entry.
- **Control-integrity tests, one per ADR-009 control** (see §16).
- An inverted-cell demonstration recorded and reverted.
- A table-coverage test asserting every user-data table has a repository module and matrix cells.

### Technical Requirements

- Matrix tests are generated from the matrix data, so they cannot drift from the runtime behaviour.
- Tests run against **real PostgreSQL** (Testcontainers, or a per-job schema on the preview cluster) — never a mock and never SQLite, since collation and `CHECK` behaviour differ.
- The table-coverage test enumerates `information_schema.tables` so a new table with no repository and no matrix cell fails CI, mirroring the PHASE-01 scope guard (TASK-009).
- The Control 2 test is a **compile-time** assertion: calling a repository function without a `VaultScope` must fail typecheck. A runtime test cannot prove this.

---

## 6. Implementation Instructions

1. Extend the generated matrix suite to cover the share-link and capsule-recipient columns added in PHASE-05, and confirm the total cell count matches the §11.2 matrix dimensions.
2. Add the **negative half** of every cell: seed two vaults with real-feel data, and for each "role X may not read Y" assert an empty result *and* that no row from the other vault appears in any field of the response.
3. Write the control-integrity suite (§16), one test per ADR-009 control, each violating its control deliberately.
4. Add the table-coverage test enumerating `information_schema.tables` and failing when a user-data table has no repository module or no matrix cell, with an explicit allow-list for tables that legitimately hold no user data.
5. Perform the inverted-cell demonstration: invert one matrix cell, confirm CI fails, revert, and record it in §20.
6. Perform the **scope-guard demonstration**: issue a deliberately unscoped query through the repository layer, confirm Control 3 fails closed and emits the fatal Sentry event, revert, and record it. This is the direct replacement for the old "disable one RLS policy" drill.
7. Wire both suites into the blocking CI gate.

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
apps/api/src/lib/authz/__tests__/matrix.generated.test.ts   (extend)
apps/api/src/lib/authz/__tests__/matrix-negative.test.ts    (new)
packages/db/src/__tests__/controls/no-direct-db-import.test.ts
packages/db/src/__tests__/controls/scope-required.test-d.ts (type-level)
packages/db/src/__tests__/controls/scope-guard-fires.test.ts
packages/db/src/__tests__/controls/least-privilege.test.ts
packages/db/src/__tests__/table-coverage.test.ts
.github/workflows/ci.yml                                    (gate)
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

- **Every ADR-009 control has a test that violates it on purpose.** An untested control is not a control.
- A new table with no repository module or no matrix cell fails CI.
- Matrix tests are generated, never hand-maintained.
- Both demonstrations are performed and recorded.
- **This suite may never be skipped, quarantined, or marked flaky** (ADR-018). With RLS gone there is nothing behind it.

---

## 13. Edge Cases

- A table with no user data (a job table) — allow-listed with a justification comment, reviewed as a security change.
- **A join-based scope** (media via memory via vault) — test the join path explicitly. This is where an incorrect scope hides, and a policy written against the wrong column will not catch it.
- **A raw SQL escape hatch** used for a genuine performance need — it must still pass through the post-query scope guard, and it needs its own matrix cells. Every such query is listed in the allow-list.
- A table added by a Release-2 migration — the coverage test catches it then.
- A view — a view inherits RLS from its underlying tables only with `security_invoker`; either set that, give the view a `vault_id` column, or forbid it, and document which. A materialised view inherits nothing, so it needs its own scope column and policy.
- **A worker path.** Delivery-engine queries run without a session. They get an explicitly constructed system scope, never an absent one, and those paths need matrix cells too.

---

## 14. Error Handling

- A failing assurance test blocks merge. There is no override for this gate.

---

## 15. Security Considerations

- This suite is the primary control against gap R-2, with RLS as the backstop if it has a hole. It belongs in the blocking gate, not a nightly run — a backstop is not a reason to let the first layer regress.
- A gap in this suite is a latent privacy incident, and should be triaged as a security issue rather than as missing test coverage.

---

## 16. Testing Requirements

### Security Tests

**Matrix**

- **Every matrix cell covered, positive and negative; inverting one fails CI.**
- Join-path scopes tested explicitly.
- Worker/system-scope paths covered.

**Control integrity — one test per ADR-009 control**

| Control | Test | Deliberate violation it must catch |
|---|---|---|
| 1 — feature code cannot reach the DB | Lint rule is active and fails on a fixture | A `drizzle` import added under `src/features/` |
| 2 — scope token is unforgeable | **Type-level** (`.test-d.ts`) | Calling a repository function with no `VaultScope` still typechecks |
| 3 — post-query guard | Runtime | An unscoped query returns rows instead of failing closed + fatal Sentry event |
| 4 — least privilege | Runtime, against real PostgreSQL | The application role can execute DDL, or holds `BYPASSRLS` |

- A table with no repository module or no matrix cell fails the coverage check.

---

## 17. Acceptance Criteria

- [ ] Matrix suite covers every cell across all three grant sources, positive **and** negative; count matches §11.2.
- [ ] All four ADR-009 control-integrity tests implemented, including the type-level one.
- [ ] **Both demonstrations performed and recorded in §20** — the inverted matrix cell, and the scope-guard violation.
- [ ] Coverage test fails for a table with no repository module or no matrix cell.
- [ ] Control 4 verified against real PostgreSQL: the application user cannot execute DDL.
- [ ] Both suites in the blocking CI gate, with no skip or quarantine path.

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
TASK-059
    ↓
TASK-027
    ↓
TASK-093
```


---

## 20. Implementation Notes

- The direct-SQL suite is the part that is easy to skip and the only part that actually tests tenant isolation. Do not let it become an application-level test in disguise.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-01-01-01](../EPIC-09-01-01-01.md).
3. Read the parent Sprint — [SPR-09-01-01](../../SPR-09-01-01.md).
4. Read the parent Module — [MOD-09-01](../../../MOD-09-01.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§11.2`, `§20.2`, `ADR-009`, `ADR-018` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
