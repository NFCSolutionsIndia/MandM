# TASK-040 — Implement Memory CRUD Actions with Soft Delete and Purge

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-040 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-03 — Memories](../../../MOD-03-03.md) |
| Sprint | [SPR-03-03-01 — Memory Model, CRUD & Screens](../../SPR-03-03-01.md) |
| Epic | [EPIC-03-03-01-01 — Memory Model & Date Precision](../EPIC-03-03-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-039`, `TASK-027` |
| Blueprint refs | `§10 Memory`, `§11.5`, `§20.9` |

---

## 1. Objective

Implement create, update, soft-delete, restore, and the 30-day purge job, all routed through `lib/authz`.

---

## 2. Context

Blueprint §11.5 specifies deletion behaviour: "soft for 30 days (recoverable from a Trash view), then media is purged from storage and all replicas".

---

## 3. Problem Statement

Soft delete on a memory product is not a nicety. A user who deletes the wrong photograph of a deceased parent has done something irreversible unless the system protects them from it. The 30-day window is also what makes the account-deletion grace period in PHASE-08 coherent.

---

## 4. Expected Outcome

Five actions plus a purge job. Deletion is recoverable for 30 days; a memory referenced by a sealed capsule cannot be deleted at all.

---

## 5. Requirements

### Functional Requirements

- Create with idempotency by `client_id`.
- Update with field-level validation; contributors may edit only their own (the own-only matrix cell).
- Soft delete setting `deleted_at`; excluded from every list.
- Restore from Trash.
- Purge job hard-deleting rows and media older than 30 days, writing an audit entry.
- **Deletion refused when the memory is referenced by a sealed capsule**, with a message naming the capsule.

### Technical Requirements

- Every action opens with `authorize()`; the own-only cell must be honoured for contributors.
- Purge runs in the workers service and removes storage objects before database rows, so a failure leaves a recoverable row rather than an orphaned object.
- Soft-deleted rows are excluded by the query layer, not by each caller remembering to filter.

---

## 6. Implementation Instructions

1. Implement the five actions in `features/memory/actions.ts`, each beginning with an authz call. For update and delete, pass the author id so the own-only cell can be evaluated.
2. Implement `queries.ts` with a base query that excludes soft-deleted rows by default and an explicit `includeDeleted` option used only by Trash. Making the safe default the easy default prevents deleted memories reappearing in a list someone forgot to filter.
3. Implement the sealed-capsule guard. Since capsules arrive in PHASE-05, define the check as a hook the capsule module registers into, so this module does not read capsule tables directly (ADR-004). Until PHASE-05, the hook has no providers and the guard is inert — document that clearly.
4. Implement the `purge-deleted` handler in the workers service: select rows past their 30-day window, delete storage objects, delete rows, write audit entries. Order matters — objects first.
5. Register the handler and add it to the daily schedule.
6. Write the restore path and make sure a restored memory reappears in the timeline in its correct chronological position, not at the top.

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
apps/api/src/features/memory/actions.ts
apps/api/src/features/memory/queries.ts
apps/api/src/features/memory/delete-guards.ts
apps/workers/src/handlers/purge-deleted.ts
apps/workers/src/handlers/index.ts  (register)
apps/api/src/features/memory/__tests__/crud.test.ts
apps/workers/src/handlers/__tests__/purge.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal features/memory/actions.ts
```

### Request

```json
{
  "clientId": "uuid",
  "title": "Ella's first steps",
  "occurredAt": "1998-03-14",
  "occurredPrecision": "day",
  "note": "She let go of the sofa and just went for it.",
  "occasion": null,
  "memberIds": ["uuid"]
}
```

### Response

```json
{ "ok": true, "data": { "id": "uuid" } }
```

### Validation

- Authz allows create in the target vault
- Title within length bounds
- occurredAt consistent with occurredPrecision
- Note within length bounds

### Error Responses

| Status | Code | When |
|---|---|---|
| 403 | `AUTHZ_DENIED` | No create grant in this vault |
| 403 | `AUTHZ_NOT_OWN_RESOURCE` | Contributor editing another author's memory |
| 409 | `MEMORY_SEALED_CAPSULE_REFERENCE` | Deletion refused — referenced by a sealed capsule |
| 422 | `VALIDATION_FAILED` | Field-level error |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Deletion is soft for 30 days, then irreversible.
- A memory referenced by a sealed capsule cannot be deleted — the promise outranks the deletion.
- Contributors edit and delete only their own memories (the own-only matrix cell).
- Soft-deleted rows are excluded by default at the query layer.
- The purge removes storage objects before database rows.

---

## 13. Edge Cases

- Deleting a memory that is a capsule's only content — refused; the user must cancel the capsule first, and the message should say so.
- Restoring a memory whose media was already purged — must not restore a broken record; check and explain.
- A purge interrupted midway — storage-first ordering means the row survives and is retried, which is the recoverable direction.
- A memory soft-deleted then the whole account deleted — PHASE-08 purge must handle both windows without double-deleting.
- Concurrent delete and edit from two devices — last write wins with the delete taking precedence; document it.
- A vault owner deleting a contributor's memory — allowed by the matrix; make sure the audit entry records who.
- Thirty-day boundary arithmetic across DST — use absolute instants.

---

## 14. Error Handling

- A purge failure must leave a retryable state and alert if the same row fails repeatedly, since a stuck purge is a data-retention compliance issue.

---

## 15. Security Considerations

- Authz on every action, including the own-only evaluation.
- The purge writes an audit entry, because irreversible deletion of user content must be accountable.
- A restore must not resurrect content the user believed gone beyond the window.

---

## 16. Testing Requirements

### Unit Tests

- Create is idempotent by `client_id`.
- Contributor cannot edit another author's memory.

### Integration Tests

- Soft delete removes the memory from all lists but keeps it in Trash.
- Restore returns it to its correct chronological position.
- **Deletion is refused when a sealed capsule references it, with the capsule named.**
- Purge removes storage objects before rows.
- Interrupted purge leaves a retryable row, not an orphaned object.
- Purge writes an audit entry.

---

## 17. Acceptance Criteria

- [ ] All five actions implemented and authz-guarded.
- [ ] Own-only cell honoured for contributors, proven by test.
- [ ] Soft delete, Trash, and restore all work; restore preserves chronology.
- [ ] Sealed-capsule guard implemented as a hook and documented as inert until PHASE-05.
- [ ] Purge job registered, ordered storage-first, and audited.
- [ ] Query layer excludes deleted rows by default.

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
TASK-039
    ↓
TASK-027
    ↓
TASK-040
```


---

## 20. Implementation Notes

- The hook pattern for the sealed-capsule guard keeps module boundaries intact (ADR-004). PHASE-05 registers the provider; do not read capsule tables from here.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-03-01-01](../EPIC-03-03-01-01.md).
3. Read the parent Sprint — [SPR-03-03-01](../../SPR-03-03-01.md).
4. Read the parent Module — [MOD-03-03](../../../MOD-03-03.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§10 Memory`, `§11.5`, `§20.9` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
