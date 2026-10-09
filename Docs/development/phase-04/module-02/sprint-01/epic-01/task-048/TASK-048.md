# TASK-048 — Create MediaAsset and UploadSession Schema with Storage Accounting

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-048 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-02 — Resumable Upload & Outbox](../../../MOD-04-02.md) |
| Sprint | [SPR-04-02-01 — Upload Session Server & Presigned Multipart](../../SPR-04-02-01.md) |
| Epic | [EPIC-04-02-01-01 — Media Asset Model & Upload Sessions](../EPIC-04-02-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-039` |
| Blueprint refs | `§10 MediaAsset`, `§12.1`, `§17.2` |

---

## 1. Objective

Create `media_assets` and `upload_sessions` per blueprint §10 and §12.1, scoped through `lib/authz`, and implement transactional per-user storage accounting.

---

## 2. Context

Blueprint §10 defines both entities. `UploadSession` exists specifically so a client that has lost its local state can ask the server which parts are already stored.

---

## 3. Problem Statement

Storage accounting must be transactional with asset creation, because the free tier is limited by storage (§17.2, Appendix C-6) and an accounting drift means either giving away storage or refusing a paying user. Gap G-5 already flags reconciliation as needed; getting the write path right reduces how much reconciliation has to fix.

---

## 4. Expected Outcome

Two tables with scope columns, indexes, and matrix cells, a foreign key from `memories.cover_media_id`, and `users.storage_used_bytes` maintained inside the same transaction as asset creation and purge.

---

## 5. Requirements

### Functional Requirements

- `media_assets` per §10: id, memory_id, owner_id, kind, mime, bytes, width, height, duration_ms, storage_key, thumb_key, preview_key, poster_key, blurhash, checksum_sha256, perceptual_hash (nullable, Release 2), captured_at, exif (JSON), transcode_status, transcode_variants (JSON), sort_order, created_at, deleted_at.
- `upload_sessions` per §12.1: id, user_id, client_id, intended_memory_id, filename, bytes_total, bytes_received, parts (JSON), storage_upload_id, status, expires_at.
- Foreign key from `memories.cover_media_id` to `media_assets.id`.
- `users.storage_used_bytes` incremented on asset finalisation and decremented on purge, transactionally.

### Technical Requirements

- tenant isolation on both tables, scoped through the owning memory's vault for assets and by user for sessions.
- Key layout `vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}` (§12.5) so deletion, accounting, and export are prefix operations.
- Unique on `(user_id, client_id)` for sessions so a retry resumes rather than duplicating.
- `expires_at` on sessions so abandoned multipart uploads can be aborted and their storage reclaimed.
- Accounting counts the **original plus derivatives**; document the rule, because counting only originals understates real cost.

---

## 6. Implementation Instructions

1. Write the schema for both tables from §10 and §12.1; generate and read the migration.
2. Add the foreign key to `memories.cover_media_id`, completing the contract frozen in PHASE-03.
3. Add scope enforcement with comments naming their authz counterparts. Asset visibility resolves through the memory's vault, so the policy needs a join — write it carefully and test it.
4. Implement the key-layout helper in `lib/storage/keys.ts` as the single place keys are constructed. A key built by hand somewhere else is how orphaned objects appear.
5. Implement accounting as a function called inside the finalisation and purge transactions, never as a separate step. Decide and document whether derivatives count toward quota — **recommend yes**, since they are real stored bytes.
6. Add an `abort-stale-uploads` worker handler that aborts multipart uploads past `expires_at`, because an abandoned multipart upload in R2 costs storage indefinitely and is invisible in the database otherwise.
7. Extend the seed fixtures with assets across all three kinds and a couple of pending sessions.

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
packages/db/src/schema/media.ts
packages/db/migrations/0009_media.sql
apps/api/src/lib/storage/keys.ts
apps/api/src/lib/storage/accounting.ts
apps/workers/src/handlers/abort-stale-uploads.ts
packages/db/src/seed/fixtures.ts  (extend)
packages/db/src/__tests__/media-rls.test.ts
```

---

## 9. Data Model

Two tables per §10 and §12.1.

**Key layout** (§12.5): `vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}`. Constructed only by `lib/storage/keys.ts`. This makes per-vault deletion, accounting, and export prefix operations, and it makes orphan detection tractable.

**Accounting** — `users.storage_used_bytes` is updated inside the same transaction as asset finalisation and purge. Derivatives count toward quota, because they are bytes we pay for. Document that decision; a user comparing their photo sizes to their usage meter will ask.

**`upload_sessions.expires_at`** matters more than it looks: an abandoned R2 multipart upload holds storage indefinitely and does not appear in any application query. The abort handler is what prevents a slow, invisible cost leak.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Storage keys are built only by the keys helper.
- Accounting is transactional with asset creation and purge, never a follow-up job.
- Derivatives count toward quota.
- Abandoned multipart uploads are aborted on expiry.

---

## 13. Edge Cases

- An asset finalised twice (duplicate completion request) — accounting must not double-count; make finalisation idempotent.
- A purge that deletes objects but fails before the row update — accounting drifts; the reconciliation job in PHASE-08 is the safety net, and gap G-5 records it.
- A session whose intended memory was deleted before completion — the completion must fail cleanly and the multipart upload must be aborted.
- A very large `parts` manifest for a multi-gigabyte file — keep the JSON bounded, or store parts in a child table if it grows past a sensible size; note the threshold.
- Two devices resuming the same session concurrently — the part manifest must tolerate the same part being confirmed twice.
- An HEIC original with derivatives in AVIF — mime and variant tracking must handle a different type per variant.

---

## 14. Error Handling

- A completion failure must leave the session resumable, not consumed.

---

## 15. Security Considerations

- tenant isolation on both tables; asset access resolves through the memory's vault.
- The storage key must not be guessable from public information — it contains ids, so it must never be treated as a secret, which is why §12.5 requires signed URLs regardless.

---

## 16. Testing Requirements

### Integration Tests

- Accounting increments on finalisation and decrements on purge, in the same transaction.
- Duplicate finalisation does not double-count.
- Stale session abort reclaims the multipart upload.

### Database Tests

- tenant isolation: a user cannot select assets belonging to another vault, including via the join path.
- Unique `(user_id, client_id)` prevents duplicate sessions.

---

## 17. Acceptance Criteria

- [ ] Both tables created scoped through `lib/authz`; asset policy tested through the join.
- [ ] Foreign key from `memories.cover_media_id` in place.
- [ ] Keys built only by the helper.
- [ ] Accounting transactional and idempotent, proven by test.
- [ ] Derivative-counting decision documented.
- [ ] Stale-upload abort handler registered and tested.

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
TASK-039
    ↓
TASK-048
```


---

## 20. Implementation Notes

- Record the derivative-counting decision and the parts-manifest size threshold in §20.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-02-01-01](../EPIC-04-02-01-01.md).
3. Read the parent Sprint — [SPR-04-02-01](../../SPR-04-02-01.md).
4. Read the parent Module — [MOD-04-02](../../../MOD-04-02.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§10 MediaAsset`, `§12.1`, `§17.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
