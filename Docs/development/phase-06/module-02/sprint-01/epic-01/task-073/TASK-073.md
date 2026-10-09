# TASK-073 — Build the Offline Read Layer and the App-Update Prompt

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-073 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-02 — On-device store, offline reads & sync](../../../MOD-06-02.md) |
| Sprint | [SPR-06-02-01 — On-device store & offline reads](../../SPR-06-02-01.md) |
| Epic | [EPIC-06-02-01-01 — On-device SQLite, caching strategy & offline reads](../EPIC-06-02-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-072`, `TASK-051` |
| Blueprint refs | `§9.4`, `§29.28`, `§33.15` |

---

## 1. Objective

Sync recent memories and capsules into the on-device store for offline reads, mark uncached ranges, and build an update prompt that never interrupts work in flight.

---

## 2. Context

Blueprint §9.4 defines what must work offline: "browse recent timeline (last ~90 days + all favourites)", memory text and metadata, cached thumbnails, and capsule countdowns. Section §33.15 adds a rule: "Never auto-reload the app. A background-sync update prompts; it does not interrupt a recording or an upload."

---

## 3. Problem Statement

The read layer is what makes offline useful rather than merely non-broken. The update rule is what prevents the worst possible bug in this product: a new background sync layer activating mid-upload and discarding a memory the user believed was saved.

---

## 4. Expected Outcome

A sync that keeps the last ninety days plus favourites and all capsules available offline, timeline ranges marked when uncached, and an update prompt that defers while the outbox is busy.

---

## 5. Requirements

### Functional Requirements

- Sync memory metadata for the last ~90 days, all favourites, and all capsules into the on-device store.
- Read paths prefer local data when offline and revalidate when online.
- Uncached timeline ranges marked explicitly (§29.12).
- Offline search restricted to cached metadata with the §29.9 chip.
- Update prompt: "A new version is ready" with an explicit Reload.
- **Update deferred while the outbox has pending or in-flight items.**

### Technical Requirements

- Sync runs on app open and opportunistically via `periodicSync` where available.
- Local reads served through the same query interface as remote, so screens do not branch on connectivity.
- Update detection via the WorkManager / URLSession waiting-worker event; activation only on explicit user action.
- The deferral checks the outbox, not merely navigator.onLine.

---

## 6. Implementation Instructions

1. Implement the sync in `lib/offline/sync.ts`: fetch metadata for the defined window, upsert into Room / GRDB, and prune beyond the window while never pruning favourites or capsules.
2. Wire the read layer so the timeline, memory detail, and capsule countdown all read local-first when offline and network-first when online, without each screen implementing its own branch.
3. Implement the uncached-range marker in the timeline: a range with no local data while offline renders a marked placeholder, not an empty stretch (§29.12).
4. Wire offline search to the cached metadata with the explicit local-only chip, completing the PHASE-03 handoff.
5. Implement the update prompt. **Before offering it, check the outbox: if anything is pending or uploading, defer and re-check later.** Never call `skipWaiting` automatically.
6. Relocate the outbox drain trigger into the background sync layer in the next sprint; here, just make sure the update path is aware of it.
7. Write the deferral test with an active upload: the prompt must not appear, and no activation must occur.

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
apps/api/src/lib/offline/sync.ts
apps/api/src/lib/offline/read-layer.ts
apps/<ios|android>/features/update/UpdatePrompt
apps/api/src/features/timeline/components/UncachedRange.tsx
apps/api/src/lib/offline/__tests__/sync.test.ts
apps/<ios|android>/features/update/__tests__/update-prompt
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Offline banner** — §29.7 copy: "Showing your saved memories — new items will sync".

**Uncached range** in the timeline — a marked placeholder reading "Not downloaded", so a gap means "not here" rather than "nothing happened". This distinction matters on a memory product.

**Update prompt** — a quiet, dismissible bar: "A new version is ready" with a Reload action. It never appears while an upload is in flight, and it never reloads on its own.

---

## 12. Business Rules

- **Never auto-reload** (§33.15).
- Update is deferred while the outbox has pending or in-flight work.
- Uncached ranges are marked, never silently empty.
- Favourites and capsules are never pruned from the local store.
- Screens do not branch on connectivity; the read layer does.

---

## 13. Edge Cases

- **An update available during an active upload — deferred, and no activation.** The defining test.
- An update available while the user is recording — also deferred.
- A user who dismisses the prompt — re-offer later, but not repeatedly within a session.
- A sync interrupted midway — partial data is fine; mark what is missing rather than discarding what arrived.
- A 90-day window on a brand-new account — nothing to sync; the offline state must still be coherent.
- A user with 50,000 memories — the window bounds the sync; verify the local store stays a reasonable size.
- A capsule delivered while offline — the local copy is stale; on reconnect the state must reconcile and the countdown must resolve.
- Clock differences making a countdown wrong offline — countdowns are computed from the stored absolute instant, so they stay correct.

---

## 14. Error Handling

- A sync failure leaves existing local data intact and shows nothing alarming; offline is a state, not an error (§33.14).

---

## 15. Security Considerations

- Local metadata is per-account; **sign-out must clear it**, alongside the caches cleared in TASK-073.

---

## 16. Testing Requirements

### Unit Tests

- Pruning respects favourites and capsules.
- Read layer prefers local when offline and network when online.

### Integration Tests

- **Update deferred while an upload is in flight; no activation occurs.**
- Sign-out clears local metadata.
- Partial sync marks missing ranges.
- Delivered-while-offline capsule reconciles on reconnect.

### E2E Tests

- Airplane mode: browse the last 90 days, open a memory, see its note and thumbnail, and see an older range marked as not downloaded.

---

## 17. Acceptance Criteria

- [ ] Recent window, favourites, and capsules available offline.
- [ ] Uncached ranges marked explicitly.
- [ ] Offline search restricted to cache with the local-only chip.
- [ ] **Update prompt deferred during uploads and recordings; never auto-reloads.**
- [ ] Sign-out clears local metadata.
- [ ] Screens do not branch on connectivity.
- [ ] Reconciliation after offline delivery works.

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
TASK-072
    ↓
TASK-051
    ↓
TASK-073
```


---

## 20. Implementation Notes

- The update-deferral rule is the one that prevents a catastrophic bug. Test it with a real in-flight upload, not a mocked flag.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-02-01-01](../EPIC-06-02-01-01.md).
3. Read the parent Sprint — [SPR-06-02-01](../../SPR-06-02-01.md).
4. Read the parent Module — [MOD-06-02](../../../MOD-06-02.md).
5. Read the parent Phase — [PHASE-06](../../../../PHASE-06.md).
6. Read the relevant blueprint sections: `§9.4`, `§29.28`, `§33.15` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
