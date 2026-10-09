# TASK-075 — Implement Offline Create, Conflict Resolution and Seal Block

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-075 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-02 — On-device store, offline reads & sync](../../../MOD-06-02.md) |
| Sprint | [SPR-06-02-02 — Offline writes, background upload & conflict resolution](../../SPR-06-02-02.md) |
| Epic | [EPIC-06-02-02-01 — Background upload & conflict resolution](../EPIC-06-02-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-074`, `TASK-060` |
| Blueprint refs | `§9.4`, `§33.16`, `§29.15` |

---

## 1. Objective

Route memory creation and edits through the outbox when offline, resolve edit conflicts with a user prompt, and block capsule sealing offline with the documented explanation.

---

## 2. Context

Blueprint §9.4 gives the matrix: creating a memory and editing its metadata are "full" offline, with edits "queued as a patch, last-write-wins with a conflict prompt". Sealing is "**Blocked by design.** Requires server confirmation of the delivery schedule. Draft is saved locally with an honest explanation".

---

## 3. Problem Statement

The seal block is the most interesting decision in the offline design, and it is correct: showing a capsule as sealed when the server has not scheduled it would be a lie about the one thing the product promises. Blocking it and saying why is more trustworthy than optimistically pretending.

---

## 4. Expected Outcome

Offline creation and editing that sync unattended, a conflict prompt that never silently discards a user's words, and a seal action that refuses offline while preserving the draft.

---

## 5. Requirements

### Functional Requirements

- Create a memory offline: optimistic local record with a pending badge, queued for sync.
- Edit title, note, or date offline: queued as a patch.
- Conflict on divergence: prompt the user with both versions rather than silently overwriting.
- Seal blocked offline with the honest explanation; the composed capsule persists as a draft.
- Persistence warning surfaced when `StorageManager.persist()` was denied.

### Technical Requirements

- Optimistic records carry the `client_id` used as the server idempotency key, so a retry cannot duplicate.
- Conflict detection compares the server `updated_at` against the value the patch was based on.
- Last-write-wins is the default, but **a divergence involving note text always prompts**, because a note is irreplaceable in a way a title is not.
- The seal block is enforced in the UI and the action, so a client that bypasses the check still fails.

---

## 6. Implementation Instructions

1. Wire the create flow's optimistic layer (built thin in PHASE-03) to the outbox, replacing the interim local persistence.
2. Implement offline patches for title, note, date, favourite, and occasion.
3. Implement conflict detection on sync: if the server row changed since the patch was based on it, and the fields overlap, prompt. **For note text, always prompt** — offer both versions and let the user choose or merge. Silently discarding someone's written words about a memory is the kind of loss this product cannot afford.
4. Implement the seal block: the seal action checks connectivity and server reachability and refuses offline with the §9.4 explanation, preserving the composed capsule as a draft. Make the copy honest about *why*: the schedule cannot be confirmed.
5. Surface the persistence warning prominently when persistence was denied, since offline creation is exactly when that risk matters.
6. Write the conflict test with two devices editing the same note.

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
apps/api/src/features/memory/offline-create.ts
apps/api/src/lib/offline/conflicts.ts
apps/api/src/features/memory/components/ConflictPrompt.tsx
apps/api/src/features/capsule/components/OfflineSealBlock.tsx
apps/api/src/lib/offline/__tests__/conflicts.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Pending badge** on optimistic records — a small, calm indicator, not a warning.

**Conflict prompt** — both versions shown side by side, with the timestamps, and three actions: keep mine, keep theirs, keep both (creating a second note). Never a silent choice where a note is involved.

**Offline seal block** — honest and specific:

```
We can't seal this while you're offline.

Sealing a capsule means promising it will arrive on a
particular day, and we can only make that promise once
our servers have it. Your draft is saved — try again
when you have a connection.
```

**Persistence warning** — surfaced here too, since offline creation is when it matters most.

---

## 12. Business Rules

- **Sealing offline is blocked, with the reason explained** (§9.4).
- A conflict involving note text always prompts; it is never resolved silently.
- Optimistic records carry the idempotency key.
- The seal block is enforced in the action, not only the UI.

---

## 13. Edge Cases

- Two devices editing the same note offline — both sync; the second gets a conflict prompt.
- A conflict on a non-textual field only (favourite) — last-write-wins silently is acceptable; document the distinction.
- A memory created offline and then deleted offline — the queue should collapse to nothing rather than creating and then deleting server-side.
- A memory created offline whose target vault was deleted server-side — the sync fails; report it clearly rather than retrying forever.
- A capsule draft composed offline and sealed later — the draft must retain every field including recipients.
- A user who goes offline mid-seal (after the check, before the response) — treat the outcome as unknown and reconcile on reconnect rather than assuming failure; **never** show sealed without server confirmation.
- Persistence denied and then the store evicted — the missing-blob path from PHASE-04 reports honest loss.

---

## 14. Error Handling

- Any sync failure that cannot be resolved must surface with the content preserved and an explicit action. Nothing the user wrote may be discarded without their choice.

---

## 15. Security Considerations

- The seal block is a correctness control, not a UX preference; enforce it server-side too.

---

## 16. Testing Requirements

### Integration Tests

- Offline create syncs and produces exactly one memory.
- Offline patch applies on sync.
- **Divergent note edits produce a conflict prompt, not a silent overwrite.**
- Create-then-delete offline collapses to no server operation.
- **Seal offline is refused by the action, not only the UI.**
- Interrupted seal reconciles on reconnect without ever showing sealed prematurely.

### E2E Tests

- Airplane mode: record, create, edit, attempt to seal (blocked), reconnect, and confirm everything syncs with the draft intact.

---

## 17. Acceptance Criteria

- [ ] Offline create and edit work and sync unattended.
- [ ] Note conflicts prompt with both versions and three choices.
- [ ] **Seal blocked offline with the documented explanation, enforced in the action.**
- [ ] Draft preserved with all fields including recipients.
- [ ] Create-then-delete collapses.
- [ ] Interrupted seal never shows as sealed without confirmation.
- [ ] Persistence warning surfaced.

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
TASK-074
    ↓
TASK-060
    ↓
TASK-075
```


---

## 20. Implementation Notes

- The note-conflict rule is deliberately stricter than last-write-wins. A note is the one thing in a memory that cannot be recreated.
- The seal-block copy is worth writing carefully; it is a refusal, and refusals need a reason.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-02-02-01](../EPIC-06-02-02-01.md).
3. Read the parent Sprint — [SPR-06-02-02](../../SPR-06-02-02.md).
4. Read the parent Module — [MOD-06-02](../../../MOD-06-02.md).
5. Read the parent Phase — [PHASE-06](../../../../PHASE-06.md).
6. Read the relevant blueprint sections: `§9.4`, `§33.16`, `§29.15` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
