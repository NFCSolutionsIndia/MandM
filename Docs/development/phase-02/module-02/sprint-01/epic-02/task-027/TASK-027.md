# TASK-027 — Implement lib/authz with Executable Permission Matrix

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-027 |
| Phase | [PHASE-02 — Identity, Authorization & Onboarding](../../../../PHASE-02.md) |
| Module | [MOD-02-02 — Authorization Chokepoint & Vault Ownership](../../../MOD-02-02.md) |
| Sprint | [SPR-02-02-01 — Vault Model & Authorization Chokepoint](../../SPR-02-02-01.md) |
| Epic | [EPIC-02-02-01-02 — lib/authz — The Authorization Chokepoint](../EPIC-02-02-01-02.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-026`, `TASK-018` |
| Blueprint refs | `§11.1`, `§11.2`, `§20.2`, `ADR-009` |

---

## 1. Objective

Build `lib/authz` as the single authorization entry point, with the blueprint §11.2 permission matrix encoded as data and a generated test per cell.

---

## 2. Context

Blueprint §11.1 states the rule exactly: every read is authorised by resolving the requester to a vault role, an active share, or a delivered capsule recipient — "there is no fourth path". Section §20.2 adds deny-by-default, session-derived scoping, and one test per matrix cell.

---

## 3. Problem Statement

Gap analysis R-2 ranks cross-tenant leakage as critical. Scattered authorization checks fail in a predictable way: one query written in a hurry omits the vault scope, and there is no single place a reviewer can look to catch it. A chokepoint plus a generated test suite converts a judgement call into a mechanical property.

---

## 4. Expected Outcome

A module exposing `authorize()` and typed capability helpers, backed by a matrix in data form, with a test suite generated from that matrix so every cell is covered and drift is impossible.

---

## 5. Requirements

### Functional Requirements

- `authorize({ subject, action, resource })` returning `{ allowed, role?, reason? }`.
- Actions covering the §11.2 rows: view, download original, create, edit, delete, comment, create share, revoke share, seal capsule, cancel capsule, invite members, delete vault, transfer to heir.
- Subjects covering the §11.2 columns: owner, vault admin, contributor, viewer, share-link holder, capsule recipient.
- Grant resolution order: vault membership → active share → delivered capsule recipient.
- Unknown action or resource type denies with a reason.
- Helpers such as `requireVaultAccess()` for use in queries, so the common case is terse.

### Technical Requirements

- The matrix is a frozen data structure. The runtime check reads it; the test suite iterates it. **Neither hard-codes expectations separately.**
- Deny by default at every branch, including the fall-through.
- Denial reasons are enum values, not strings, so they can be audit-logged and asserted on.
- The share and capsule-recipient branches exist now, return deny, and carry a comment naming the PHASE-05 task that implements them.
- The module performs its own data access for grant resolution and must be efficient enough to sit on every request — a single query for membership resolution, cached per request.

---

## 6. Implementation Instructions

1. Read blueprint §11.2 and transcribe the matrix into `apps/api/src/lib/authz/matrix.ts` exactly. **Do not paraphrase or simplify it.** Where a cell reads "own only", encode that as a distinct value rather than collapsing it to allow.
2. Implement `authorize()` in `apps/api/src/lib/authz/index.ts`. Resolve the subject's relationship to the resource's vault first, then look up the matrix cell, then apply any per-cell qualifier such as "own only".
3. Implement per-request memoisation of membership resolution so a page performing twenty checks issues one query.
4. Add `requireVaultAccess(vaultId)` and `assertCan(action, resource)` helpers that throw or return the result union, so feature code has an ergonomic path and is not tempted to query directly.
5. Add the share and delivered-recipient branches as explicit deny-returning stubs with a TODO naming the PHASE-05 tasks. **Do not omit them** — an absent branch is a redesign later; a stub branch is an edit.
6. Write the test generator: iterate every (subject, action) pair in the matrix and assert the runtime result matches the declared cell, including qualifiers. A pair with no declared cell must fail the test rather than defaulting.
7. Write the drift test: assert the matrix covers every action in the action enum and every subject in the subject enum, so adding an action without a matrix row fails CI.
8. Demonstrate the guard: invert one cell, watch CI fail, revert. Record the demonstration in §20.

---

## 7. Architecture

```text
every read / write in the product
        │
        ▼
lib/authz.authorize({ subject, action, resource })
        │
        ├─ resolve grant  (memoised per request)
        │     1. vault_members  →  role
        │     2. active share            [stub → PHASE-05]
        │     3. delivered capsule recip [stub → PHASE-05]
        │     └─ none → DENY (reason: NO_GRANT)
        │
        ├─ look up matrix[subject][action]
        │     allow | deny | own_only
        │
        └─▶ { allowed, role, reason }
                │
                ▼
        PostgreSQL RLS          ← independent second layer, mirrors these rules
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/lib/authz/index.ts
apps/api/src/lib/authz/matrix.ts
apps/api/src/lib/authz/resolve-grant.ts
apps/api/src/lib/authz/reasons.ts
apps/api/src/lib/authz/__tests__/matrix.generated.test.ts
apps/api/src/lib/authz/__tests__/drift.test.ts
apps/api/src/lib/authz/__tests__/cross-tenant.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal lib/authz/authorize()
```

### Request

```json
{
  "subject": { "userId": "uuid", "sessionId": "uuid" },
  "action": "memory.edit",
  "resource": { "type": "memory", "id": "uuid", "vaultId": "uuid", "authorId": "uuid" }
}
```

### Response

```json
{ "allowed": true, "role": "contributor" }
// or
{ "allowed": false, "reason": "NOT_OWN_RESOURCE" }
```

### Validation

- Action must exist in the action enum
- Resource must declare a vault id
- Subject must carry a validated session

### Error Responses

| Status | Code | When |
|---|---|---|
| 403 | `AUTHZ_DENIED` | No grant, or the matrix cell denies |
| 403 | `AUTHZ_NOT_OWN_RESOURCE` | Cell is own-only and the subject is not the author |
| 500 | `AUTHZ_UNKNOWN_ACTION` | Action absent from the matrix — a programming error, denied and alerted |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **There is no fourth grant path** (§11.1). If a feature seems to need one, that is a design conversation, not a code change.
- Deny by default at every branch including the fall-through.
- Client-supplied ids are filters. The vault id used for scoping is always derived from the session-resolved grant, never taken from the request.
- An unknown action denies and raises an alert — it means code and matrix have diverged.
- scope enforcement mirror this matrix. Changing one without the other is a defect.

---

## 13. Edge Cases

- "Own only" cells — a contributor editing another contributor's memory must be denied; this is the cell most likely to be implemented as a plain allow.
- A resource whose vault has been archived — decide and encode whether archived vaults are read-only; record the decision.
- A member whose membership was revoked mid-session — resolution must consult the current row, not a cached session claim. Per-request memoisation is fine; cross-request caching is not.
- A soft-deleted user with a live session — must deny.
- An owner acting on their own resource where the cell says "own only" — must allow.
- A resource with a null vault id — must deny with a distinct reason, not throw.
- Nested resources such as a media asset whose vault is reached via its memory — the resolution must not silently trust a vault id passed alongside; verify it against the parent.

---

## 14. Error Handling

- A resolution query failure must deny, never allow. Fail closed — a database hiccup must not become an authorization bypass.

---

## 15. Security Considerations

- This module is the highest-value target in the codebase. Every change to it warrants a second reviewer.
- Denial reasons are logged for audit but never returned verbatim to an unauthenticated caller.
- Memoisation is per request only. A cross-request cache would let a revoked membership keep working, defeating the instant-revocation property built in TASK-018.

---

## 16. Testing Requirements

### Unit Tests

- **Generated: one test per (subject, action) cell of the §11.2 matrix, asserting the runtime result matches the declared value including own-only qualifiers.**
- Drift test: every action in the enum has a matrix row; every subject has a column.
- Unknown action denies with the unknown-action reason.
- Null vault id denies with a distinct reason.
- Resolution query failure denies (fail closed).
- Revoked membership denies even within the same session.
- Membership resolution is memoised: twenty checks issue one query.

### Integration Tests

- Cross-tenant suite: user A attempts every action on every resource type belonging to user B, and every attempt is denied.
- The same attempts are independently blocked by tenant isolation with the authz layer bypassed.

---

## 17. Acceptance Criteria

- [ ] Matrix transcribed from §11.2 exactly, including own-only qualifiers.
- [ ] Generated test covers every cell; total count matches the matrix dimensions.
- [ ] **Inverting one cell fails CI — demonstrated and recorded in §20.**
- [ ] Drift test fails when an action is added without a matrix row.
- [ ] Cross-tenant suite passes with all attempts denied.
- [ ] tenant isolation independently blocks the same attempts with authz bypassed.
- [ ] Fail-closed behaviour on resolution error, proven by test.
- [ ] Memoisation is per request only.
- [ ] Share and capsule-recipient branches present as documented stubs referencing PHASE-05.

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
TASK-018
    ↓
TASK-027
```


---

## 20. Implementation Notes

- Transcribe the matrix, do not interpret it. If a cell in §11.2 looks wrong, raise it as a question rather than encoding a different answer.
- The inverted-cell demonstration is the proof that this whole apparatus works. Do it, record it, revert it.
- PHASE-05 will fill the two stub branches. Leaving them present with named TODOs is what makes that an edit rather than a redesign.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-02-02-01-02](../EPIC-02-02-01-02.md).
3. Read the parent Sprint — [SPR-02-02-01](../../SPR-02-02-01.md).
4. Read the parent Module — [MOD-02-02](../../../MOD-02-02.md).
5. Read the parent Phase — [PHASE-02](../../../../PHASE-02.md).
6. Read the relevant blueprint sections: `§11.1`, `§11.2`, `§20.2`, `ADR-009` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
