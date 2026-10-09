# TASK-039 — Create Memory Schema with occurred_precision and Full-Text Search

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-039 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-03 — Memories](../../../MOD-03-03.md) |
| Sprint | [SPR-03-03-01 — Memory Model, CRUD & Screens](../../SPR-03-03-01.md) |
| Epic | [EPIC-03-03-01-01 — Memory Model & Date Precision](../EPIC-03-03-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-030`, `TASK-036` |
| Blueprint refs | `§10 Memory`, `§13.1`, `§13.3`, `ADR-010` |

---

## 1. Objective

Create the `memories` table per blueprint §10 with `occurred_at`, `occurred_precision`, a generated `search_text` column with a FULLTEXT index, the vault scope column, and the media placeholder contract PHAS

---

## 2. Context

Blueprint §10 defines the entity and §13.1 explains why precision matters: "a scanned 1974 wedding photo has a *year*, not a timestamp. Without precision, imported archives either lie about their dates or collapse into the upload date."

---

## 3. Problem Statement

This is the field that makes the product credible to the family archivist persona. It also has teeth: a year-precision memory must not match an On This Day query for a specific day, must sort sensibly among exact-dated neighbours, and must never be displayed as though the day were known. Those three consequences are easy to miss and impossible to fix later without re-auditing every date display.

---

## 4. Expected Outcome

A migration creating `memories` scoped through `lib/authz`, a generated `search_text` column with an a tsvector GIN index index, and the `client_id` idempotency key PHASE-06 offline creation depends on.

---

## 5. Requirements

### Functional Requirements

- Fields per §10: id, vault_id, author_id, title, note, occurred_at, occurred_precision, created_at, updated_at, occasion, is_favourite, visibility, cover_media_id, client_id, sync_state, deleted_at.
- Generated `search_text` column over title, note, and occasion, with an a tsvector GIN index index.
- `client_id` unique per author, so an offline retry cannot create a duplicate.
- Soft delete via `deleted_at`.

### Technical Requirements

- scoped by `vault_id` through `lib/authz`; repository module and matrix cell required, mirroring the authz rule.
- `search_text` as a generated (`STORED`) column so it cannot drift from the source text.
- **Typo tolerance ships in R1** via `pg_trgm`, restored with the move back to PostgreSQL (ADR-010). Typo tolerance arrives with OpenSearch at R2 (ADR-010) and must not be claimed in UI copy before then.
- Index on `(vault_id, occurred_at DESC)` for the timeline query, and on `(vault_id, deleted_at)` for Trash.
- `occurred_precision` from the `@mm/shared` enum.

---

## 6. Implementation Instructions

1. Write the schema from §10 verbatim; generate and read the migration.
2. Add the generated `search_text` column combining title, note, and occasion. PostgreSQL `setweight()` gives per-column weighting, so ranking is tuned in the query with a boolean-mode expression that boosts a title match, not in the index.
3. Add the a tsvector GIN index index on `search_text`. There is no trigram index to add; record in §20 that typo tolerance is deferred to R2.
4. Add the composite index for the timeline query. This is the hottest read path in the product after session validation.
5. Add the unique constraint on `(author_id, client_id)` where `client_id` is not null.
6. Add scope enforcement scoped by vault membership, with comments naming their authz counterparts.
7. Write `lib/format/memory-date.ts` — the precision-aware formatter — **in this task**, so every consuming screen inherits it rather than formatting dates ad hoc. It must render "14 March 1998", "March 1998", or "1998" according to precision, and must never fabricate missing components.
8. Extend the seed fixtures with memories at all four precisions, including the 1974 year-precision case.

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
packages/db/src/schema/memory.ts
packages/db/migrations/0008_memories.sql
apps/api/src/lib/format/memory-date.ts
apps/api/src/features/memory/schema.ts
packages/db/src/seed/fixtures.ts  (extend)
apps/api/src/lib/format/__tests__/memory-date.test.ts
packages/db/src/__tests__/memory-rls.test.ts
```

---

## 9. Data Model

`memories` per §10, scoped by `vault_id` through `lib/authz`; repository module and matrix cell required.

**`occurred_at` + `occurred_precision`** is the pair that matters. Consequences that must hold across the whole product:

1. **Display** never fabricates unknown components. `year` precision renders "1998", never "1 January 1998".
2. **Sorting** places a year-precision memory sensibly among exact-dated neighbours — document the rule (recommend: sort by `occurred_at`, which for year precision is the start of the year, and treat that as intentional).
3. **On This Day** must not match a year-precision memory to a specific day (§13.2 lists this as a required test).

**Generated `STORED` column**, not a trigger-maintained one, so the index cannot drift from the text.

**`client_id`** unique per author enables idempotent offline creation in PHASE-06. Adding it later would mean a migration on a populated table.

**Media fields** are placeholders until PHASE-04: `cover_media_id` exists with no foreign key yet. Freeze this contract jointly with PHASE-04 before either phase proceeds far.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- A date display never invents a component the precision does not support.
- The precision formatter is the only way dates are rendered in this module.
- Deletion is soft; hard deletion happens only via the purge job.
- `client_id` makes create idempotent.

---

## 13. Edge Cases

- A memory with year precision and an On This Day query for 14 March — must not match (§13.2).
- A memory with month precision sorted among exact dates in the same month — document and test the ordering.
- A memory dated in the future — allowed (a scheduled memory for an upcoming event), but the timeline must place it correctly relative to the Now divider.
- A memory with an empty note — allowed; the UI must render gracefully rather than showing an empty block.
- A very long note — index and display must both cope; consider truncation with expand.
- A title in a non-Latin script — FTS configuration must not silently fail to index it; verify with a Devanagari title and document the limitation if the chosen text-search configuration cannot handle it.
- Two offline creates with the same `client_id` — the second is a no-op returning the first.

---

## 14. Error Handling

- A duplicate `client_id` returns the existing memory rather than an error, since that is the correct offline-retry semantics.

---

## 15. Security Considerations

- tenant isolation plus authz.
- Default visibility is private (§11.1).

---

## 16. Testing Requirements

### Unit Tests

- Formatter renders each of the four precisions correctly and never fabricates components.
- Sort rule documented and asserted for mixed precisions.

### Database Tests

- tenant isolation: a member of another vault cannot select these rows.
- FTS matches on title and note, with title ranked higher.
- **Documented gap:** a one-character typo in a title search returns nothing in R1. Assert the current behaviour so the R2 change is visible when OpenSearch lands.
- **A year-precision memory does not match a day-specific query.**
- Duplicate `client_id` insert is rejected by the constraint.

---

## 17. Acceptance Criteria

- [ ] Migration applies with the vault scope column and index, the generated `search_text` column, its a tsvector GIN index index, and the timeline composite index.
- [ ] Precision formatter implemented and used, with all four cases tested.
- [ ] Year-precision memory excluded from day-specific matching, proven by test.
- [ ] Sort rule for mixed precisions documented and tested.
- [ ] `client_id` idempotency constraint in place.
- [ ] Non-Latin title indexing verified, with any limitation documented.
- [ ] Seed fixtures cover all four precisions.
- [ ] Media placeholder contract agreed with PHASE-04 and recorded in §20.

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
TASK-030
    ↓
TASK-036
    ↓
TASK-039
```


---

## 20. Implementation Notes

- Write the formatter in this task. If it lands later, three screens will already have formatted dates by hand and one of them will be wrong.
- Freeze the `MediaAsset` contract with PHASE-04 before this migration ships, so `cover_media_id` does not need to change shape.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-03-01-01](../EPIC-03-03-01-01.md).
3. Read the parent Sprint — [SPR-03-03-01](../../SPR-03-03-01.md).
4. Read the parent Module — [MOD-03-03](../../../MOD-03-03.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§10 Memory`, `§13.1`, `§13.3`, `ADR-010` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
