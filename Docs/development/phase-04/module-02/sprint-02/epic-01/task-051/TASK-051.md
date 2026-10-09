# TASK-051 — Build the on-device store Upload Outbox with Backoff and Idempotency

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-051 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-02 — Resumable Upload & Outbox](../../../MOD-04-02.md) |
| Sprint | [SPR-04-02-02 — Client Uploader, Outbox & Queue UI](../../SPR-04-02-02.md) |
| Epic | [EPIC-04-02-02-01 — Resumable Client Uploader & Outbox](../EPIC-04-02-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-050` |
| Blueprint refs | `§9.4`, `§12.1`, `ADR-013` |

---

## 1. Objective

Build the durable outbox: per-item state, exponential backoff, idempotency keys, storage-persistence request, and the drain loop.

---

## 2. Context

Blueprint §9.4 specifies "a durable outbox in the on-device store (via Room / GRDB) with per-item state (`pending`, `uploading`, `failed`, `done`), exponential backoff, idempotency keys on every mutation" and requires `StorageManager.persist()` with a clear warning if denied.

---

## 3. Problem Statement

The outbox is what makes the durability promise real, and blueprint §9.4 is explicit that "writes always go through the outbox queue, never a naive network-first". Building it here, with the state machine PHASE-06 will drive from the background sync layer, means that phase relocates the driver rather than redesigning the store.

---

## 4. Expected Outcome

A Room / GRDB-backed outbox holding blobs and pending mutations, with a drain loop, backoff, idempotency, and an honest warning when the browser refuses persistent storage.

---

## 5. Requirements

### Functional Requirements

- Items with state `pending` | `uploading` | `failed` | `done`, attempt count, next-attempt time, and an idempotency key.
- Blob storage alongside metadata so a reload loses nothing.
- Drain loop processing items in order with bounded concurrency.
- Exponential backoff with a cap and a manual retry override.
- `StorageManager.persist()` requested; a warning surfaced if denied.
- Completed items pruned after their asset is confirmed.

### Technical Requirements

- Room / GRDB schema versioned so later phases can migrate the store without data loss.
- Idempotency key is the `client_id` already used by the memory and session APIs, so a retry cannot duplicate.
- The drain loop is a plain function callable from a page or, in PHASE-06, from the background sync layer — no page-only APIs inside it.
- Blob quota awareness: check `navigator.storage.estimate()` and warn before the store is full rather than failing at write time.

---

## 6. Implementation Instructions

1. Create `lib/offline/db.ts` with the Room / GRDB schema: an `outbox` table and a `blobs` table, versioned from the start.
2. Create `lib/offline/outbox.ts` with `enqueue`, `drain`, `retry`, `cancel`, and `prune`. Keep it free of React and free of page-only APIs so PHASE-06 can call it from the background sync layer unchanged.
3. Implement backoff in a shared module reused by the uploader.
4. Request `StorageManager.persist()` on first enqueue. If denied, surface the §29.28 warning: "Your browser may clear unsent memories — connect to finish uploading". **Do not hide this** — it is the one case where the durability promise is genuinely weaker, and the user deserves to know.
5. Check `storage.estimate()` before accepting a large blob, and warn when the store is nearly full.
6. Prune completed items and their blobs once the server has confirmed the asset, so the store does not grow without bound.
7. Write the airplane-mode test as an integration test: enqueue offline, reload, restore connectivity, drain, assert the asset exists.

---

## 7. Architecture

```text
capture ──▶ blobs table (the on-device store)   ← the memory is safe here
              outbox table  { state, attempts, nextAttemptAt, clientId }
                    │
                    ▼
              drain()  ← callable from a page now, from the background sync layer in PHASE-06
                    ├─ pending → uploading → done   (prune blob)
                    └─ failure → failed, backoff, retry

StorageManager.persist() requested; if DENIED, warn the user honestly.
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/lib/offline/db.ts
apps/api/src/lib/offline/outbox.ts
apps/api/src/lib/offline/persistence.ts
apps/api/src/lib/offline/__tests__/outbox.test.ts
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

- Every write goes through the outbox. Never a naive network-first write (§9.4).
- The idempotency key is the `client_id`, shared with the server APIs.
- Persistence denial is surfaced, never hidden.
- The drain loop uses no page-only APIs, so PHASE-06 can relocate it.

---

## 13. Edge Cases

- Persistence denied — warn, and continue; the product still works, it is just less safe.
- Storage quota exhausted mid-write — fail the enqueue with a clear message rather than corrupting the store.
- The browser evicting the store despite persistence (it can happen) — on next load, detect missing blobs for pending items and report the loss honestly rather than retrying forever.
- Two tabs draining concurrently — use a lock or a claim field so an item is not uploaded twice.
- An item stuck in `uploading` after a crash — reclaim it on next load past a timeout.
- A very large number of queued items — drain in order with bounded concurrency, and show a count rather than a wall of rows.
- A pending item whose target memory was deleted — cancel and prune.
- A Room / GRDB schema upgrade with items in flight — versioned schema handles it; test the upgrade path with a populated store.

---

## 14. Error Handling

- A permanently failed item stays visible with a retry and a cancel. It must never disappear silently, and it must never block the rest of the queue.

---

## 15. Security Considerations

- No presigned URLs or session credentials persisted in the outbox.
- Blobs are unencrypted at rest on the device — same disclosure as TASK-047; rely on the app lock and OS encryption, and say so rather than implying more.

---

## 16. Testing Requirements

### Unit Tests

- State transitions follow the documented machine.
- Backoff schedule matches the spec and is capped.
- Idempotency key prevents a duplicate enqueue for the same `client_id`.
- Stuck `uploading` item is reclaimed after the timeout.

### Integration Tests

- **Airplane mode: enqueue, reload, restore connectivity, drain, asset exists.**
- Two tabs draining: each item uploaded exactly once.
- Room / GRDB schema upgrade preserves a populated store.
- Persistence denial surfaces the warning.
- Missing blob for a pending item is reported as a loss, not retried forever.

---

## 17. Acceptance Criteria

- [ ] Outbox implemented with the documented state machine.
- [ ] **Airplane-mode round trip passes.**
- [ ] Backoff, idempotency, and reclaim all proven by test.
- [ ] Persistence requested and denial surfaced with the §29.28 copy.
- [ ] Drain loop free of page-only APIs, verified by calling it from a worker-like context.
- [ ] Store pruned after confirmation.
- [ ] Two-tab safety proven.

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
TASK-050
    ↓
TASK-051
```


---

## 20. Implementation Notes

- Keep `outbox.ts` free of React and of `window`. PHASE-06 moves the driver into the background sync layer, and that should be a one-line change of caller.
- The honest disclosure about unencrypted local blobs belongs in the privacy copy in PHASE-08. Note it there.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-02-02-01](../EPIC-04-02-02-01.md).
3. Read the parent Sprint — [SPR-04-02-02](../../SPR-04-02-02.md).
4. Read the parent Module — [MOD-04-02](../../../MOD-04-02.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§9.4`, `§12.1`, `ADR-013` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
