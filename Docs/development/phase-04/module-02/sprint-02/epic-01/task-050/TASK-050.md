# TASK-050 — Build Resumable Chunked Uploader with Parallel Parts

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-050 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-02 — Resumable Upload & Outbox](../../../MOD-04-02.md) |
| Sprint | [SPR-04-02-02 — Client Uploader, Outbox & Queue UI](../../SPR-04-02-02.md) |
| Epic | [EPIC-04-02-02-01 — Resumable Client Uploader & Outbox](../EPIC-04-02-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-049`, `TASK-046` |
| Blueprint refs | `§12.1`, `§12.7` |

---

## 1. Objective

Build the client uploader: chunk the blob, upload three parts in parallel, track ETags, resume from the last confirmed part, and respect connection conditions.

---

## 2. Context

Blueprint §12.1 specifies "PUT chunks (5–10MB) directly, 3 in parallel, resumable, ETags recorded" and "on interruption: resume from the last confirmed part (never restart)".

---

## 3. Problem Statement

This is the single most important piece of client code in the product for user trust. The blueprint is explicit that retrofitting resumability "means rewriting the client, the API, and the queue" — which is why it is built now rather than after launch.

---

## 4. Expected Outcome

An uploader that survives interruption, network change, and app termination, and that finishes a large video on a poor connection without user attention.

---

## 5. Requirements

### Functional Requirements

- Chunk into parts matching the server-declared part size.
- Three concurrent part uploads, with a queue for the rest.
- Record each part's ETag on confirmation.
- On resume, fetch server-confirmed parts and upload only what is missing.
- Per-part retry with exponential backoff.
- Overall progress from confirmed bytes, not from optimistic in-flight bytes.
- Respect `Save-Data` and `effectiveType`: defer or reduce concurrency on a metered or slow connection.

### Technical Requirements

- Part upload via `fetch` with the presigned URL; capture the ETag from the response.
- Presigned URL expiry handled by re-requesting rather than failing the part.
- Concurrency of three, reduced to one on a slow connection.
- Progress reported from the outbox so it survives a component unmount.
- Cancellation via `AbortController`, releasing in-flight requests promptly.

---

## 6. Implementation Instructions

1. Create `lib/upload/uploader.ts` with a `startUpload(sessionId, blob)` returning an observable progress stream, and internal functions for part slicing, part upload, and retry.
2. Slice using `Blob.slice`, which does not read the whole file into memory — important for a multi-gigabyte video on a phone.
3. Implement the three-way pool. On a `slow-2g` or `2g` `effectiveType`, drop to one concurrent part; on `Save-Data`, ask before starting rather than deciding for the user.
4. Handle a 403 on a part PUT as "URL expired": re-request presigned URLs and continue. Do not treat it as a fatal error, because it is the normal consequence of a slow upload.
5. Record ETags as parts confirm, persisting them to the outbox so a reload does not lose them.
6. Implement resume: on start, call get-session and skip confirmed parts.
7. Report progress from confirmed bytes only. Optimistic progress that jumps backward after a failure is worse than slower honest progress.
8. Wire cancellation through `AbortController` and make sure a cancelled upload aborts the server session too.
9. Test on a real device with genuinely poor signal — a throttled desktop profile does not reproduce the way mobile radios behave.

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
apps/api/src/lib/upload/uploader.ts
apps/api/src/lib/upload/part-pool.ts
apps/api/src/lib/upload/backoff.ts
apps/api/src/lib/upload/connection.ts
apps/api/src/lib/upload/__tests__/uploader.test.ts
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

- Never restart an upload from zero when server state exists.
- Progress reflects confirmed bytes only.
- An expired presigned URL is a routine event, not an error.
- A metered connection is the user's decision, not the app's.

---

## 13. Edge Cases

- A presigned URL expiring mid-part — re-request and continue.
- The device switching from Wi-Fi to cellular mid-upload — continue, but re-check `Save-Data` and consider pausing with a prompt rather than silently consuming data.
- A part failing repeatedly — after N attempts, mark the item failed with a retry affordance rather than looping forever.
- A blob that no longer exists in the local store (cleared by the browser) — fail with an honest message; this is why persistence is requested.
- The server reporting a part confirmed that the client thinks failed — trust the server.
- A file larger than the remaining quota discovered mid-upload — the session was reserved, so honour it per the TASK-050 decision.
- Two tabs uploading the same session — detect and defer to one, or tolerate duplicate part writes; document which.
- A very large file producing thousands of parts — cap part count by increasing part size, and verify the server agrees on the size.

---

## 14. Error Handling

- Every failure state is recoverable and explains itself: expired URL (automatic), network (automatic retry), quota (upgrade path), missing blob (honest loss message).

---

## 15. Security Considerations

- Presigned URLs are held only in memory for the duration of a part, never persisted to the outbox — they are short-lived credentials.

---

## 16. Testing Requirements

### Unit Tests

- Part slicing produces the expected count and sizes for a given blob and part size.
- Backoff grows as documented and is capped.
- Concurrency drops to one on a slow `effectiveType`.
- A 403 on a part triggers re-presign rather than failure.
- Progress derives from confirmed bytes only.

### Integration Tests

- **Interrupt at part 12 of 26, restart, and confirm parts 1–12 are not re-uploaded.**
- Cancellation aborts in-flight requests and the server session.
- Repeated part failure marks the item failed rather than looping.

### E2E Tests

- Upload a 100 MB file with the network dropped twice; the upload completes without user action.

---

## 17. Acceptance Criteria

- [ ] Chunked parallel upload works with ETag tracking.
- [ ] **Resume skips confirmed parts, proven by test and on a real device.**
- [ ] Expired URLs handled automatically.
- [ ] Connection-aware concurrency and `Save-Data` respect.
- [ ] Progress honest (confirmed bytes only).
- [ ] Cancellation aborts both client and server state.
- [ ] Verified on a real device with poor signal, with the observation recorded in §20.

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
TASK-049
    ↓
TASK-046
    ↓
TASK-050
```


---

## 20. Implementation Notes

- Test on a real phone in a genuinely bad signal area. Throttled desktop profiles do not reproduce mobile radio behaviour, and this is the code where that difference matters most.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-02-02-01](../EPIC-04-02-02-01.md).
3. Read the parent Sprint — [SPR-04-02-02](../../SPR-04-02-02.md).
4. Read the parent Module — [MOD-04-02](../../../MOD-04-02.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§12.1`, `§12.7` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
