# TASK-081 — Create Audit Log with Coverage Across All Sensitive Paths

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-081 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-01 — Privacy Centre, Audit Log & App Lock](../../../MOD-08-01.md) |
| Sprint | [SPR-08-01-01 — Audit Log, Access Visibility & App Lock](../../SPR-08-01-01.md) |
| Epic | [EPIC-08-01-01-01 — Audit Log & User-Visible Access Log](../EPIC-08-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-027`, `TASK-055` |
| Blueprint refs | `§20.11`, `§10 AuditLog` |

---

## 1. Objective

Create the `audit_log` table and write entries from every sensitive path: content access, permission change, share lifecycle, capsule transitions, delivery attempts, auth events, and admin actions.

---

## 2. Context

Blueprint §20.11 lists the required coverage exactly and adds two properties: append-only with 24-month retention, and "the user's own access log **visible to the user** in privacy settings".

---

## 3. Problem Statement

Coverage is the hard part. An audit log that misses one access path is worse than none, because it creates false confidence. Writing entries from inside `lib/authz` — which every read already passes through — makes coverage a property of the architecture rather than of everyone remembering.

---

## 4. Expected Outcome

An append-only audit log with entries written from the authorization chokepoint plus the specific non-authz events, tenant isolation letting a user read their own, and a documented retention job.

---

## 5. Requirements

### Functional Requirements

- Fields per §10: id, actor_type (user | recipient | system | admin), actor_id, action, resource_type, resource_id, ip_hash, user_agent, metadata (JSON), created_at.
- Written on: content access, permission change, share create and revoke, capsule state transitions, delivery attempts, auth events, admin actions.
- tenant isolation: a user reads entries about their own resources; admins read via the admin realm.
- 24-month retention with a purge job.

### Technical Requirements

- **Write from `lib/authz` on successful content access**, so coverage follows the chokepoint.
- Append-only in practice: no update or delete paths in application code except the retention purge.
- IP hashed, never raw (consistent with the session table).
- Writes must not block the request path — buffer and flush, but never lose an admin-access entry.

---

## 6. Implementation Instructions

1. Write the schema from §10; generate and read the migration. Index on `(resource_type, resource_id, created_at)` and `(actor_id, created_at)`.
2. **Add the audit write inside `lib/authz`** on a successful authorization for a content-access action. This is the highest-leverage placement: every read already goes through it.
3. Add explicit writes for the non-authz events: auth (login, new device, credential change), share lifecycle, capsule transitions, delivery attempts, and admin actions.
4. Buffer writes to avoid adding latency to the hot read path, but **flush synchronously for admin content access** — that entry must exist before the content is returned.
5. Add tenant isolation so a user can read entries concerning their own resources, and nothing else.
6. Implement the 24-month retention purge as a worker handler.
7. Write the coverage test: exercise each documented path and assert an entry exists. This test is what makes the log trustworthy.

---

## 7. Architecture

```text
every content read ──▶ lib/authz.authorize()
                          │ allowed
                          ├──▶ audit_log entry  ← coverage follows the chokepoint
                          └──▶ data

explicit writes: auth events · share create/revoke · capsule transitions
                 delivery attempts · ADMIN actions (flushed synchronously)

retention: 24 months, purged by a worker handler
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
packages/db/src/schema/audit.ts
packages/db/migrations/0014_audit_log.sql
apps/api/src/lib/audit/write.ts
apps/api/src/lib/authz/index.ts  (add audit write)
apps/workers/src/handlers/purge-audit.ts
apps/api/src/lib/audit/__tests__/coverage.test.ts
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

- Every successful content access writes an entry.
- **Admin content access is flushed synchronously** — the entry exists before the content is returned.
- IP is hashed, never stored raw.
- No application path updates or deletes an entry except the retention purge.

---

## 13. Edge Cases

- A batch media-URL request for 40 assets — write one entry with a count rather than 40 rows, or the log becomes unreadable. Decide and document.
- A recipient viewing a delivered capsule — actor type is `recipient`, with no user id; the schema must accommodate that.
- The audit write failing — for user reads, log and continue; **for admin content access, fail the request**, because unaudited admin access is unacceptable.
- A very high-traffic user making the log enormous — retention plus indexing handles it; verify query performance on a large table.
- A deleted user's audit entries — retain for the compliance window, but they must not be readable by anyone once the account is purged; document the handling.
- System actor entries (delivery attempts) — must not appear in the user-facing log as though a person acted.

---

## 14. Error Handling

- A buffered write failure is logged and alerted; a synchronous admin write failure fails the admin request.

---

## 15. Security Considerations

- The log is a security control; its integrity matters more than its convenience.
- Admin access without an entry must be impossible by construction.
- The log itself must not contain content — ids and actions only, never note text.

---

## 16. Testing Requirements

### Integration Tests

- **Coverage test: each documented path produces an entry.**
- Admin content access without a successful audit write is refused.
- Batch media request produces one entry with a count.
- Recipient actor recorded without a user id.
- Retention purge removes entries past 24 months.

### Database Tests

- tenant isolation: a user reads only entries concerning their own resources.

### Security Tests

- The log contains no note text or media content.

---

## 17. Acceptance Criteria

- [ ] Audit log created scoped through `lib/authz` and the required indexes.
- [ ] Write placed inside `lib/authz` so coverage follows the chokepoint.
- [ ] **Coverage test passes for every documented path.**
- [ ] Admin content access flushed synchronously and refused without an entry.
- [ ] IP hashed; no content in entries.
- [ ] Retention purge implemented.
- [ ] Batch-access aggregation decision recorded in §20.

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
TASK-027
    ↓
TASK-055
    ↓
TASK-081
```


---

## 20. Implementation Notes

- Placing the write inside `authz` is the difference between a log that is complete and one that is merely mostly complete. Resist per-call-site writes for content access.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-01-01-01](../EPIC-08-01-01-01.md).
3. Read the parent Sprint — [SPR-08-01-01](../../SPR-08-01-01.md).
4. Read the parent Module — [MOD-08-01](../../../MOD-08-01.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§20.11`, `§10 AuditLog` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
