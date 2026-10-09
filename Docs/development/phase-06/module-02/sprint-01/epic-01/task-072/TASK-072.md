# TASK-072 — Configure WorkManager / URLSession background sync layer with Per-Route-Class Caching

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-072 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-02 — On-device store, offline reads & sync](../../../MOD-06-02.md) |
| Sprint | [SPR-06-02-01 — On-device store & offline reads](../../SPR-06-02-01.md) |
| Epic | [EPIC-06-02-01-01 — On-device SQLite, caching strategy & offline reads](../EPIC-06-02-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-069` |
| Blueprint refs | `§9.4`, `ADR-013` |

---

## 1. Objective

Configure the background sync layer: precache the app shell, apply a caching strategy per route class, enforce a thumbnail LRU cap, and serve an offline fallback.

---

## 2. Context

Blueprint §9.4 sets the strategy precisely: "app shell precached (stale-while-revalidate); API GETs network-first with a cache fallback; thumbnails cache-first with an LRU cap (~200MB, honouring `navigator.storage.estimate()`); originals never cached automatically... writes always go through the outbox queue, never a naive network-first."

---

## 3. Problem Statement

The wrong strategy on an authenticated endpoint serves one user's cached data or a stale private response. Cache-first is correct for immutable derivatives and actively dangerous for API responses. Making the strategy explicit per class, and testing staleness, is what keeps that distinction from eroding.

---

## 4. Expected Outcome

A background sync layer that makes cold offline launch work, serves media derivatives instantly from cache, never prefers a stale authenticated response while online, and respects a storage cap.

---

## 5. Requirements

### Functional Requirements

- Precache the app shell with a build-time manifest.
- API GETs: network-first with cache fallback.
- Media derivatives (thumb, preview, poster): cache-first with LRU.
- Originals: never cached automatically.
- HLS segments: decide and document (recommend not cached, since they are large and streamed).
- Offline fallback page for uncached navigations.
- LRU cap ~200MB, adjusted against `storage.estimate()`.

### Technical Requirements

- WorkManager / URLSession with a generated precache manifest.
- Strategies declared per route matcher in one file, so the policy is auditable at a glance.
- **No authenticated JSON response is ever served cache-first while online.**
- Signed media URLs are short-lived, so cached derivative responses must be keyed by a stable path rather than the signed query string, or the cache will never hit. Solve this deliberately and document it.

---

## 6. Implementation Instructions

1. Configure WorkManager / URLSession in `apps/site/src/sw/index.ts` with the precache manifest and route-class strategies.
2. Write the strategy table in one module with a comment per class explaining the choice. This file is a security-relevant document as much as a config.
3. **Solve the signed-URL caching problem explicitly:** because URLs carry short-lived signatures, cache keys must normalise to the storage path. Implement a key normaliser and document it — otherwise the media cache silently never hits and offline browsing does not work.
4. Implement the LRU with a byte cap, evicting oldest-accessed first, and check `storage.estimate()` to shrink the cap on constrained devices.
5. Add the offline fallback page for uncached navigations, using the §29.28 copy.
6. Ensure originals are excluded from automatic caching, since a few 4K videos would exhaust any cap.
7. Write the staleness test: with a network available, an updated API response must be served, not the cached one.

---

## 7. Architecture

```text
route class                     strategy
──────────────────────────────  ─────────────────────────────────
app shell (JS/CSS/HTML)         precache + stale-while-revalidate
API GET (authenticated)         NETWORK-FIRST, cache fallback   ← never cache-first
media thumb/preview/poster      cache-first + LRU (~200MB)
media original                  never cached automatically
HLS segments                    not cached (documented)
navigation (uncached)           offline fallback page
all writes                      outbox queue (never network-first)

Signed URLs change every 5 min → cache keys normalise to the storage path,
or the media cache never hits and offline browsing silently fails.
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/sw/index.ts
apps/site/src/sw/strategies.ts
apps/site/src/sw/lru.ts
apps/site/src/sw/cache-key.ts
apps/site/src/app/offline/page.tsx
apps/site/src/sw/__tests__/strategies.test.ts
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

- **No authenticated API response is served cache-first while online.**
- Originals are never cached automatically.
- Cache keys for media normalise away the signature.
- Writes never go through a network-first strategy; they go to the outbox (§9.4).
- The LRU cap adapts to available storage.

---

## 13. Edge Cases

- **A signed URL rotating every five minutes — without key normalisation the cache never hits.** This is the failure that makes offline media silently not work.
- A cache full at the cap — evict least-recently-used, and verify eviction does not remove a thumbnail currently on screen.
- A device with very little free storage — shrink the cap rather than failing writes.
- A user signing out — authenticated caches must be cleared, or the next user on a shared device sees cached content. This is a real risk on a family device.
- A 401 from an API call — must not be cached, and must not be served from cache later.
- An uncached navigation while offline — the fallback page, not a browser error.
- A range request for HLS — must not be partially cached in a way that corrupts playback.

---

## 14. Error Handling

- A cache failure must never break a request; fall through to network and log.

---

## 15. Security Considerations

- **Clear authenticated caches on sign-out** — critical on a shared family device.
- Never cache a 401 or 403 response.
- No tokens or signed URLs persisted in cache keys.

---

## 16. Testing Requirements

### Unit Tests

- Cache-key normalisation strips the signature and produces a stable key.
- LRU evicts oldest-accessed at the cap.

### Integration Tests

- **Online: an updated API response is served, not the cached one.**
- Sign-out clears authenticated caches.
- 401 responses are not cached.
- Cap shrinks on constrained storage.

### E2E Tests

- **Cold launch in airplane mode reaches Home with cached content and the offline banner.**

---

## 17. Acceptance Criteria

- [ ] Strategy declared per route class in one auditable file.
- [ ] **Cold offline launch reaches a usable Home.**
- [ ] Media cache hits despite rotating signed URLs, proven by test.
- [ ] No stale authenticated response served while online.
- [ ] Authenticated caches cleared on sign-out.
- [ ] LRU cap enforced and storage-aware.
- [ ] Offline fallback page present.
- [ ] Cold-launch performance verified on a mid-range device.

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
TASK-069
    ↓
TASK-072
```


---

## 20. Implementation Notes

- The signed-URL cache-key problem is the single most likely cause of "offline works in the demo but not for users". Solve it explicitly and write the test.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-02-01-01](../EPIC-06-02-01-01.md).
3. Read the parent Sprint — [SPR-06-02-01](../../SPR-06-02-01.md).
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
