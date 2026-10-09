# TASK-059 — Extend lib/authz with Share-Link and Capsule-Recipient Grants

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-059 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-01 — Capsule Creation & Sealing](../../../MOD-05-01.md) |
| Sprint | [SPR-05-01-01 — Capsule Model, Seal Transaction & Authorization](../../SPR-05-01-01.md) |
| Epic | [EPIC-05-01-01-01 — Capsule Model & Transactional Seal](../EPIC-05-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-057`, `TASK-028` |
| Blueprint refs | `§11.1`, `§11.4`, `§20.2` |

---

## 1. Objective

Fill the two grant branches PHASE-02 left as documented stubs: share-link holder and delivered capsule recipient.

---

## 2. Context

Blueprint §11.1 states there are exactly three grant paths and "there is no fourth path". PHASE-02 built the vault-membership branch and left the other two returning deny with TODOs naming this task.

---

## 3. Problem Statement

Filling the stubs rather than adding a parallel check is what keeps the single-chokepoint property true. A separate capsule-access function alongside `authz` would be a fourth path in everything but name, and the matrix tests would no longer cover the real behaviour.

---

## 4. Expected Outcome

Both branches implemented, the matrix extended to cover the two subject columns, and pre-delivery invisibility enforced inside authz rather than in the UI.

---

## 5. Requirements

### Functional Requirements

- Share-link branch: resolve an active, unexpired, unrevoked share for the resource; apply its permission and download flag.
- Capsule-recipient branch: resolve a recipient token; grant content access **only when `delivered_at` is set**.
- Pre-delivery: the recipient may see the sender name and unlock date only.
- Matrix columns for share-link holder and capsule recipient tested per cell.

### Technical Requirements

- Both branches resolve within the same memoised per-request resolution as vault membership.
- Token comparison is constant-time against the stored hash, with `token_version` honoured.
- The pre-delivery restriction is a distinct denial reason, so the unlock page can render a countdown rather than an error.

---

## 6. Implementation Instructions

1. Implement the share branch in `resolve-grant.ts`: look up by token hash, check expiry and revocation, and return the share's permission level.
2. Implement the recipient branch: look up by token hash and version, and return a grant **only if `delivered_at` is set**. Before delivery, return a specific `CAPSULE_NOT_YET_DELIVERED` reason.
3. Extend the matrix in `matrix.ts` with the two subject columns from §11.2, transcribed exactly — including that a share-link holder can comment only if granted, and a capsule recipient can reply.
4. Re-run the generated matrix tests; the count should grow to cover the new columns.
5. Wire the media signed-URL endpoint to this: **pre-delivery capsule media must be unreachable through it.** PHASE-04 left a stub test for this; make it real.
6. Add the negative test suite: a recipient token attempting to read the media before delivery, through every endpoint.

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
apps/api/src/lib/authz/resolve-grant.ts  (fill stubs)
apps/api/src/lib/authz/matrix.ts  (extend)
apps/api/src/lib/authz/__tests__/matrix.generated.test.ts  (regenerated)
apps/api/src/lib/authz/__tests__/pre-delivery.test.ts
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

- **Three grant paths, no more** (§11.1).
- A capsule recipient gains content access only at delivery.
- Pre-delivery denial has its own reason so the UI can be humane rather than alarming.
- The matrix remains the single source; both new columns are transcribed, not interpreted.

---

## 13. Edge Cases

- **A recipient token used before delivery — denied for content, allowed for the countdown view.** The defining test.
- A revoked share used immediately after revocation — denied on the next request.
- An expired share — denied with an expiry-specific reason so the page can offer "ask for a new link".
- A rotated recipient token (version bumped) — the old token denied.
- A share-link holder attempting to download when the share forbids it — denied by the matrix cell.
- A recipient whose capsule was cancelled before delivery — denied with a neutral reason, not an alarming one.
- A token matching nothing — denied identically to a wrong token, with no existence disclosure.
- Both a session and a token present (the recipient is also a user) — decide precedence and document; recommend the stronger grant wins.

---

## 14. Error Handling

- Denials are specific enough for humane UI copy but never disclose whether a capsule or share exists.

---

## 15. Security Considerations

- Constant-time token comparison.
- **Pre-delivery invisibility enforced in authz and at the media endpoint, not in the UI.** This is the property most likely to be implemented only visually.
- No existence disclosure on unknown tokens.

---

## 16. Testing Requirements

### Unit Tests

- Both branches resolve correctly; unknown tokens deny identically to wrong ones.
- Rotated token version denies the old token.

### Integration Tests

- Regenerated matrix tests pass with the two new columns.
- Revoked share denies on the next request.
- Expired share denies with an expiry reason.

### Security Tests

- **A recipient token cannot reach capsule media before delivery through any endpoint** — asserted against the signed-URL endpoint and the unlock page.

---

## 17. Acceptance Criteria

- [ ] Both stub branches implemented inside `lib/authz`; no parallel access function exists.
- [ ] Matrix extended with both columns and regenerated tests passing.
- [ ] **Pre-delivery media unreachable, proven by security test.**
- [ ] Revocation and expiry denials are immediate and specific.
- [ ] Token rotation invalidates old links.
- [ ] Session-plus-token precedence documented.

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
TASK-057
    ↓
TASK-028
    ↓
TASK-059
```


---

## 20. Implementation Notes

- Grep for any capsule or share access that does not route through `authorize()` before marking this done. A single bypass makes the chokepoint a fiction.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-01-01-01](../EPIC-05-01-01-01.md).
3. Read the parent Sprint — [SPR-05-01-01](../../SPR-05-01-01.md).
4. Read the parent Module — [MOD-05-01](../../../MOD-05-01.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§11.1`, `§11.4`, `§20.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
