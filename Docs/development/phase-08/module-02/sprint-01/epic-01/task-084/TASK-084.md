# TASK-084 — Implement Account Deletion with Capsule Warning, Grace Period and Purge

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-084 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-02 — Data Rights — Export & Deletion](../../../MOD-08-02.md) |
| Sprint | [SPR-08-02-01 — Export & Account Deletion](../../SPR-08-02-01.md) |
| Epic | [EPIC-08-02-01-01 — Data Export & Account Deletion](../EPIC-08-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-083`, `TASK-058` |
| Blueprint refs | `§20.9`, `§11.5`, `§29.10` |

---

## 1. Objective

Build the deletion flow: two-step confirmation with typed input, an explicit list of pending capsules it will cancel, a 30-day grace period, and a complete purge.

---

## 2. Context

Blueprint §20.9 specifies the flow, and §11.5 the retention. The critical detail appears in both: "Pending capsules are surfaced explicitly during the flow, because deleting an account cancels promises the user made to other people — that consequence must never be a surprise."

---

## 3. Problem Statement

This is the one place where a product decision has consequences for people who are not the user. A parent who deletes their account cancels a message their child was going to receive in 2044, and the child will never know it existed. Naming those capsules and their recipients before confirming is the minimum honesty the situation demands.

---

## 4. Expected Outcome

A deletion flow that states its consequences precisely, a 30-day recoverable window, and a purge that leaves nothing behind.

---

## 5. Requirements

### Functional Requirements

- Two-step confirmation with step-up authentication and a typed `DELETE`.
- **A list of pending capsules that will be cancelled, by recipient name and date.**
- Immediate loss of access; `hard_delete_after` set to 30 days out.
- Recovery during the grace period.
- Purge: database rows, all storage variants, search indexes, push subscriptions, then backups on their next cycle.
- Stripe and Razorpay subscriptions cancelled.
- Confirmation emails at initiation and at completion.
- A minimal deletion record retained for compliance.

### Technical Requirements

- Storage-first purge ordering, consistent with the PHASE-03 memory purge.
- The purge is idempotent and resumable, since it touches many objects.
- Cascade order documented so foreign keys do not block the purge.
- Sealed capsules are cancelled, and their recipients are **not** notified — decide this deliberately and document it, because notifying a recipient about a cancelled capsule they never knew existed would be cruel.

---

## 6. Implementation Instructions

1. Build the settings flow with step-up auth and a two-step confirmation requiring the typed word.
2. **Query and display the pending capsules with recipient names and dates.** This is the substance of the screen; make it unmissable rather than a footnote.
3. On confirmation: revoke all sessions, set `deleted_at` and `hard_delete_after`, cancel subscriptions, and email confirmation.
4. Implement recovery during the grace period, restoring access and reactivating nothing that was cancelled — sealed capsules cancelled at deletion stay cancelled unless the user re-seals. Decide and document whether that is right; recommend keeping them cancelled to avoid resurrecting a promise the user withdrew.
5. Implement the purge handler: storage objects first, then rows in documented cascade order, then indexes, push subscriptions, and the local-store signal.
6. Make the purge idempotent and resumable, and alert if a purge repeatedly fails, since incomplete deletion is a compliance problem.
7. Retain a minimal deletion record (id, timestamps, reason) for compliance, containing no personal data.
8. Write the completeness test: purge a seeded account, then scan storage for objects under its vault prefix and assert none remain.

---

## 7. Architecture

```text
request deletion
  ├─ step-up auth
  ├─ SHOW pending capsules: recipient names + dates    ← the consequence
  ├─ typed "DELETE"
  ▼
revoke sessions · cancel subscriptions · cancel sealed capsules
set hard_delete_after = now + 30 days · email confirmation
  │
  │  (30-day grace: recovery restores access; cancelled capsules stay cancelled)
  ▼
purge handler (idempotent, resumable)
  1. storage objects (vault prefix)      ← storage FIRST
  2. database rows (documented cascade)
  3. search indexes · push subscriptions
  4. backups on next cycle
  └─ audit entry + completion email + minimal compliance record
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/features/data-rights/delete-account.ts
apps/api/src/features/data-rights/components/DeleteAccountFlow.tsx
apps/workers/src/handlers/purge-account.ts
packages/db/migrations/0015_deletion_requests.sql
packages/emails/src/templates/AccountDeletionStarted.tsx
apps/api/src/features/data-rights/__tests__/deletion.test.ts
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

- **Pending capsules are named, with recipients, before confirmation.**
- Storage objects are purged before database rows.
- The purge is idempotent and resumable.
- Recipients of cancelled capsules are not notified.
- A minimal deletion record is retained, containing no personal data.

---

## 13. Edge Cases

- A user with a capsule due in three days deleting their account — the warning must make the imminence obvious.
- A user with fifty pending capsules — summarise with a count and list the nearest few, with a full list available.
- A user who recovers during the grace period — access restored; cancelled capsules stay cancelled per the documented decision.
- A shared vault the user owns with other members — decide what happens: transfer, or delete for everyone? **This is a real gap.** Recommend blocking deletion until ownership is transferred or the vault is deleted, and record it.
- A purge interrupted midway — resumable; the storage-first order means a retry is safe.
- A purge that cannot delete a storage object — alert; do not mark deletion complete.
- An export in flight — cancelled.
- A capsule already delivered — the recipient's copy persists; §11.4 says a delivered gift is not retractable, and deletion does not change that. State it in the flow.

---

## 14. Error Handling

- A purge failure must alert and must not mark the account fully deleted. Incomplete deletion reported as complete is a compliance failure.

---

## 15. Security Considerations

- Step-up authentication required.
- All sessions revoked immediately on request.
- The purge is audited.
- The retained compliance record contains no personal data.

---

## 16. Testing Requirements

### Integration Tests

- **Pending capsules listed with recipient names before confirmation.**
- Recovery during grace restores access; cancelled capsules stay cancelled.
- **Purge completeness: no storage objects remain under the vault prefix.**
- Purge is idempotent when run twice.
- Subscriptions cancelled.
- In-flight export cancelled.
- Repeated purge failure alerts and does not mark complete.
- Delivered capsules are unaffected, and the flow says so.

---

## 17. Acceptance Criteria

- [ ] Two-step flow with step-up auth and typed confirmation.
- [ ] **Pending capsules named with recipients and dates.**
- [ ] 30-day grace with working recovery.
- [ ] Purge complete, ordered storage-first, idempotent, resumable, audited.
- [ ] Subscriptions cancelled; in-flight exports cancelled.
- [ ] Delivered-capsule persistence stated in the flow.
- [ ] Shared-vault-ownership decision recorded in §20.

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
TASK-083
    ↓
TASK-058
    ↓
TASK-084
```


---

## 20. Implementation Notes

- The shared-vault ownership case is a genuine gap in the blueprint. Blocking deletion until ownership is resolved is the safest answer, but it needs a product decision — record it.
- The capsule warning is the most important part of this screen. It protects people who are not in the room.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-02-01-01](../EPIC-08-02-01-01.md).
3. Read the parent Sprint — [SPR-08-02-01](../../SPR-08-02-01.md).
4. Read the parent Module — [MOD-08-02](../../../MOD-08-02.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§20.9`, `§11.5`, `§29.10` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
