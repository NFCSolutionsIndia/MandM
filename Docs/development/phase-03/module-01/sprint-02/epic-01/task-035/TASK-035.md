# TASK-035 — Implement Duplicate Detection and Member Merge

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-035 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-01 — Members & Relationships](../../../MOD-03-01.md) |
| Sprint | [SPR-03-01-02 — Member Import Paths & Deduplication](../../SPR-03-01-02.md) |
| Epic | [EPIC-03-01-02-01 — Import Paths](../EPIC-03-01-02-01.md) |
| Type | backend |
| Priority | medium |
| Status | pending |
| Dependencies | `TASK-032`, `TASK-034` |
| Blueprint refs | `§29.11`, `gap G-2` |

---

## 1. Objective

Detect likely duplicate members and implement a merge with explicitly defined semantics.

---

## 2. Context

Blueprint §29.11 requires duplicate detection with a side-by-side merge view. Gap analysis G-2 records that the blueprint does not define the merge *semantics* — specifically which capsules follow which record — and assigns that definition to this task.

---

## 3. Problem Statement

Import paths create duplicates; that is unavoidable. Merge without defined semantics is worse than no merge, because silently reassigning or orphaning a capsule addressed to a person is a data-integrity failure on the product's core feature. The rule must be written down and enforced.

---

## 4. Expected Outcome

Similarity-based duplicate suggestions, a side-by-side merge view, and a merge operation whose semantics are documented, implemented, and tested.

---

## 5. Requirements

### Functional Requirements

- Detect duplicates by name similarity (trigram) plus exact contact match, scored.
- Surface suggestions at import time and on the member list.
- Side-by-side merge view showing each conflicting field with a choice.
- Merge is explicit and reversible for a grace period, or clearly irreversible with a confirmation — decide and document.
- Merge semantics per gap G-2: **capsules follow the surviving record; contact history is unioned; an audit entry is written.**

### Technical Requirements

- Similarity via a tsvector GIN index on the indexed name column, combined with exact email or phone matches which score higher.
- `merged_into_id` retains the losing record as a tombstone rather than deleting it, so references remain resolvable.
- Merge runs in a single transaction covering member fields, capsule recipients, memory-person links, and the audit entry.

---

## 6. Implementation Instructions

1. Implement scoring in `features/member/duplicates.ts`: exact email or phone match scores highest, high name similarity next, same-name-different-contact lowest. Return candidates above a threshold with the reason, so the UI can explain *why* two records look alike.
2. Build the side-by-side merge view: each field shows both values with a radio choice, defaulting to the more complete value.
3. Implement `mergeMembers(survivingId, mergedId, fieldChoices)` in one transaction: apply chosen fields, union contact details, repoint every reference to the surviving record, set `merged_into_id` on the loser, and write an audit entry.
4. **Write the semantics into the code as a comment and into the module doc**: capsules follow the surviving record; contact history is unioned; the losing record becomes a tombstone; the operation is audited.
5. Handle the sealed-capsule case explicitly. A capsule sealed to the losing record must resolve to the surviving record and must still deliver. Test this specifically — it is the case gap G-2 exists for.
6. Decide reversibility. Recommend irreversible with a clear confirmation, since a reversible merge on a tombstoned record adds significant complexity; record the decision.
7. Never auto-merge. Detection suggests; the user decides (§29.11).

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
apps/api/src/features/member/duplicates.ts
apps/api/src/features/member/merge.ts
apps/api/src/features/member/components/MergeSheet.tsx
apps/api/src/features/member/__tests__/merge.test.ts
apps/api/src/features/member/__tests__/duplicates.test.ts
```

---

## 9. Data Model

Uses `members.merged_into_id` as a tombstone pointer. No new tables.

**Merge semantics (gap G-2, defined here and binding):**

1. **Capsules follow the surviving record.** A capsule sealed to the merged-away member resolves to the survivor and still delivers. This is non-negotiable: a sealed capsule is a promise (§17.2 item 4).
2. **Contact history is unioned.** Both emails and both phone numbers are retained on the survivor; the user picks the primary.
3. **The losing record becomes a tombstone** via `merged_into_id`, not a deletion, so historical references resolve.
4. **An audit entry is written** recording both ids, the field choices, and the actor.
5. **Merge is never automatic.** Detection suggests; the user decides.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Never auto-merge.
- A sealed capsule addressed to a merged-away member must still deliver, to the surviving record.
- The losing record is tombstoned, not deleted.
- Every merge is audited.

---

## 13. Edge Cases

- Two members who genuinely share a name — detection must not push toward merging; the reason shown must make the distinction clear.
- A merge where both records have a sealed capsule to the same recipient — both must survive and both must deliver.
- A three-way duplicate — merge pairwise; a merged tombstone must not be offered as a merge target again.
- A merge involving a member with a `linked_user_id` — decide which link survives, and do not silently drop one.
- Conflicting birthdays with different precisions — prefer the more precise value, but let the user override.
- A merge attempted concurrently from two devices — the transaction must make the second attempt a clear no-op rather than corrupting either record.
- A member with an outstanding self-service token — the surviving record's token wins; the other is invalidated.

---

## 14. Error Handling

- A merge failure must leave both records untouched. There is no acceptable partial merge.

---

## 15. Security Considerations

- Both records must belong to the same owner, verified through `lib/authz` before anything is read or written.
- The audit entry records the actor and both ids.

---

## 16. Testing Requirements

### Unit Tests

- Scoring: exact email match outranks name similarity; unrelated names score below threshold.
- Field choice defaults favour the more complete value.
- More precise birthday wins by default.

### Integration Tests

- **A sealed capsule addressed to the merged-away member resolves to the survivor and remains deliverable.**
- Contact details are unioned.
- Tombstone set; the merged record is not offered as a future merge target.
- Audit entry written with both ids and the actor.
- Concurrent merge attempts: one succeeds, the other is a clean no-op.
- A merge across owners is refused by authz.

---

## 17. Acceptance Criteria

- [ ] Detection surfaces candidates with a stated reason, at import and on the list.
- [ ] Merge view shows fields side by side with defaults.
- [ ] All five documented semantics implemented and individually tested.
- [ ] **Sealed capsule survives the merge and remains deliverable** — the defining test.
- [ ] Never auto-merges.
- [ ] Semantics documented in code and in the module doc.
- [ ] Reversibility decision recorded in §20.

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
TASK-032
    ↓
TASK-034
    ↓
TASK-035
```


---

## 20. Implementation Notes

- The sealed-capsule case is the reason this task is not trivial. Write that test first.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-01-02-01](../EPIC-03-01-02-01.md).
3. Read the parent Sprint — [SPR-03-01-02](../../SPR-03-01-02.md).
4. Read the parent Module — [MOD-03-01](../../../MOD-03-01.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.11`, `gap G-2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
