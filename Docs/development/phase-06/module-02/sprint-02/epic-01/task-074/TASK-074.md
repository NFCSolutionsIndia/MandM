# TASK-074 — Relocate Outbox Drain into background sync layer with Background Sync

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-074 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-02 — On-device store, offline reads & sync](../../../MOD-06-02.md) |
| Sprint | [SPR-06-02-02 — Offline writes, background upload & conflict resolution](../../SPR-06-02-02.md) |
| Epic | [EPIC-06-02-02-01 — Background upload & conflict resolution](../EPIC-06-02-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-073`, `TASK-051` |
| Blueprint refs | `§9.4`, `ADR-013` |

---

## 1. Objective

Register Background Sync, invoke the PHASE-04 outbox drain from the background sync layer, and add `periodicSync` where available.

---

## 2. Context

PHASE-04 deliberately kept `outbox.ts` free of React and page-only APIs so that "PHASE-06 moves the driver into the background sync layer, and that should be a one-line change of caller".

---

## 3. Problem Statement

Draining only from an open page means an upload stops when the user closes the tab — which on mobile is most of the time. Background Sync lets the browser finish the work after the app is gone, which is the difference between "it uploads while you watch" and "it just uploads".

---

## 4. Expected Outcome

Uploads that complete after the app is closed, with the same outbox code, plus opportunistic periodic draining where the browser supports it.

---

## 5. Requirements

### Functional Requirements

- Register a Background Sync tag when an item is enqueued.
- Background sync layer `sync` handler invokes the existing drain.
- Register `periodicSync` where available for opportunistic draining.
- Progress and completion reflected in the UI when a page is open, via a message channel.
- No duplicate uploads when both a page and the background sync layer drain.

### Technical Requirements

- Import the existing outbox module into the background sync layer unchanged — if it needs modification, the PHASE-04 separation failed and that should be recorded.
- A claim field or lock so page and worker drains cannot process the same item.
- Post progress to open clients via `postMessage`.
- Background Sync is unavailable on iOS — the page drain remains the fallback and must stay functional.

---

## 6. Implementation Instructions

1. Register the sync tag on enqueue and add the `sync` event handler in the background sync layer.
2. Import and call the PHASE-04 `drain()`. **If it requires changes, record what and why in §20** — that is useful feedback on the PHASE-04 boundary.
3. Add the claim mechanism so concurrent drains are safe, extending the two-tab safety already built in PHASE-04.
4. Post progress and completion messages to open clients so the queue tray updates live.
5. Register `periodicSync` behind a permission and capability check.
6. **On iOS, where Background Sync does not exist, the page drain must remain fully functional** — verify explicitly, since this is the platform where most users will be.
7. Write the backgrounded test on a real Android device: enqueue, background the app, restore network, and confirm completion without reopening.

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
apps/site/src/sw/background-sync.ts
apps/site/src/sw/index.ts  (register handler)
apps/api/src/lib/offline/outbox.ts  (claim field only, if needed)
apps/site/src/sw/__tests__/background-sync.test.ts
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

- The outbox module is shared, not duplicated.
- Page and worker drains cannot process the same item.
- The page drain remains fully functional where Background Sync is unavailable.
- No duplicate uploads, ever — idempotency keys plus claims.

---

## 13. Edge Cases

- iOS with no Background Sync — the page drain covers it; verify the experience is still acceptable and document the difference.
- The browser firing `sync` while a page is already draining — claims prevent double work.
- A sync event firing with no network — the drain fails fast and the browser retries.
- The browser limiting `sync` retries — after exhaustion, the page drain must pick up on next open.
- `periodicSync` permission denied — omit silently.
- A very large queue draining in the background — bounded concurrency so the device is not overwhelmed.
- An item failing permanently in the background — recorded as failed and surfaced next time a page opens.

---

## 14. Error Handling

- A background failure must be visible next time the user opens the app; silent background failure is worse than none.

---

## 15. Security Considerations

- The background sync layer relies on the browser attaching the session cookie; no credential is stored in the worker.

---

## 16. Testing Requirements

### Integration Tests

- Sync handler drains the outbox.
- Concurrent page and worker drains process each item once.
- Permanent failure surfaces on next page open.

### E2E Tests

- **Real Android: enqueue offline, background the app, restore network, and confirm upload completes without reopening.**

---

## 17. Acceptance Criteria

- [ ] Background Sync registered and draining the shared outbox.
- [ ] **Backgrounded upload completes on a real Android device.**
- [ ] Page drain remains functional on iOS, verified.
- [ ] No duplicate uploads under concurrent drains.
- [ ] `periodicSync` behind capability and permission checks.
- [ ] Background failures surface on next open.
- [ ] Any change needed to the PHASE-04 outbox recorded in §20.

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
TASK-073
    ↓
TASK-051
    ↓
TASK-074
```


---

## 20. Implementation Notes

- If `outbox.ts` needed changes to run in the worker, note it — it is a useful signal about how well the PHASE-04 boundary held.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-02-02-01](../EPIC-06-02-02-01.md).
3. Read the parent Sprint — [SPR-06-02-02](../../SPR-06-02-02.md).
4. Read the parent Module — [MOD-06-02](../../../MOD-06-02.md).
5. Read the parent Phase — [PHASE-06](../../../../PHASE-06.md).
6. Read the relevant blueprint sections: `§9.4`, `ADR-013` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
