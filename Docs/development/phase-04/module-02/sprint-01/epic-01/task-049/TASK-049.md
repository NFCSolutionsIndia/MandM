# TASK-049 — Implement Presigned Multipart Upload Endpoints with Quota Enforcement

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-049 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-02 — Resumable Upload & Outbox](../../../MOD-04-02.md) |
| Sprint | [SPR-04-02-01 — Upload Session Server & Presigned Multipart](../../SPR-04-02-01.md) |
| Epic | [EPIC-04-02-01-01 — Media Asset Model & Upload Sessions](../EPIC-04-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-048` |
| Blueprint refs | `§12.1`, `§12.5`, `§20.4`, `ADR-007` |

---

## 1. Objective

Build the upload session, presign, resume, and complete endpoints, enforcing quota and size caps before any bytes move and verifying checksums on completion.

---

## 2. Context

Blueprint §12.1 mandates presigned direct-to-storage multipart with resume, and states that "the client never uploads through the application server". Section §12.5 requires that no bucket object is ever publicly readable.

---

## 3. Problem Statement

Enforcing the quota before presigning is what makes a rejected upload free. Checking afterwards means paying for the transfer and then telling the user it does not count — which is both a cost leak and an infuriating experience. Checksum verification on completion is what lets the product claim originals are preserved byte-for-byte.

---

## 4. Expected Outcome

Four endpoints — create session, presign parts, get session state, complete — with quota and cap enforcement up front, magic-byte validation, SVG rejection, and checksum verification.

---

## 5. Requirements

### Functional Requirements

- Create session: validates quota, per-tier size cap, and mime; creates the R2 multipart upload; returns the session and part plan.
- Presign: returns presigned PUT URLs for a requested range of parts, short-lived.
- Get session: returns confirmed parts so a client with no local state can resume.
- Complete: verifies the part list, completes the multipart upload, validates magic bytes, verifies the client-declared SHA-256, creates the `media_asset`, updates accounting, and enqueues derivative jobs.
- Abort: cancels a session and its multipart upload.

### Technical Requirements

- Presigned URLs expire quickly (recommend 15 minutes for parts) and are re-requestable, so a slow client refreshes rather than failing.
- Part size 5–10 MB per §12.1.
- Magic-byte validation on the completed object, not on the client-declared mime.
- **SVG rejected outright** (§20.4) — it is an XSS vector disguised as an image.
- Checksum computed server-side over the assembled object and compared to the client value; mismatch aborts and does not create an asset.
- Rate-limited per user (§20.6: upload-session creation 60/min).

---

## 6. Implementation Instructions

1. Create `lib/storage/r2.ts` wrapping the S3-compatible client, with the bucket configured private and no public access policy.
2. Implement create-session: check authz on the target memory, check quota using the accounting helper, check the per-tier size cap and video duration limit, validate the declared mime against an allow-list, then create the multipart upload and persist the session.
3. Implement presign for a part range. Keep the URL lifetime short and make re-requesting cheap — a client on a slow link will need to refresh.
4. Implement get-session returning the confirmed part list, which is what makes resume possible after the client loses its state entirely.
5. Implement complete: assemble, then **validate magic bytes** against the declared kind, **reject SVG**, verify the checksum, create the asset, update accounting, and enqueue thumbnail and transcode jobs — all in one transaction where the database is involved.
6. Implement abort, and make sure it is called by the stale-session handler.
7. Write the test asserting a direct request to a bucket object URL returns 403. This is a security invariant and belongs in the automated suite, not in a checklist.
8. Add the rate limits from §20.6.

---

## 7. Architecture

```text
client                          API                          R2
  │ create session ──────────────▶ authz
  │                                quota + size cap + mime      ← BEFORE any bytes
  │                                create multipart ───────────▶ uploadId
  │ ◀──────── session + part plan
  │ presign parts ───────────────▶ presigned PUT urls (15 min)
  │ PUT part 1..n ──────────────────────────────────────────────▶ (direct, 3 parallel)
  │ (interrupted)
  │ get session ─────────────────▶ confirmed parts ◀── resume from here
  │ complete ────────────────────▶ assemble ──────────────────▶ object
  │                                magic bytes · reject SVG
  │                                verify SHA-256
  │                                create asset + accounting (one txn)
  │                                enqueue derivative jobs
  │ ◀──────── asset id
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/app/api/upload/session/route.ts
apps/site/src/app/api/upload/presign/route.ts
apps/site/src/app/api/upload/[id]/route.ts
apps/site/src/app/api/upload/complete/route.ts
apps/api/src/lib/storage/r2.ts
apps/api/src/lib/storage/validate-magic-bytes.ts
apps/site/src/app/api/upload/__tests__/upload.test.ts
apps/api/src/lib/storage/__tests__/bucket-private.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
POST /api/upload/session
```

### Request

```json
{
  "clientId": "uuid",
  "memoryId": "uuid",
  "filename": "IMG_4821.MOV",
  "mime": "video/quicktime",
  "bytesTotal": 214748364,
  "checksumSha256": "hex",
  "durationMs": 62000
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "sessionId": "uuid",
    "partSizeBytes": 8388608,
    "partCount": 26,
    "confirmedParts": []
  }
}
```

### Validation

- Authz allows create on the target memory
- Quota has room for bytesTotal plus estimated derivatives
- bytesTotal within the per-tier cap
- durationMs within the per-tier video limit
- mime in the allow-list; SVG rejected

### Error Responses

| Status | Code | When |
|---|---|---|
| 403 | `AUTHZ_DENIED` | No create grant on the memory |
| 413 | `UPLOAD_TOO_LARGE` | Exceeds the per-tier size cap |
| 409 | `QUOTA_EXCEEDED` | Not enough storage remaining — returned before any bytes move |
| 415 | `UPLOAD_MIME_REJECTED` | Type not allowed, or SVG |
| 429 | `RATE_LIMIT_UPLOAD` | More than 60 sessions per minute |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Quota and caps are enforced before presigning.** A rejected upload must cost nothing.
- Magic bytes decide the type, not the client-declared mime.
- **SVG is rejected outright.**
- A checksum mismatch aborts and creates no asset.
- No bucket object is ever publicly readable.
- The client never uploads through the application server.

---

## 13. Edge Cases

- A client declaring a smaller `bytesTotal` than it uploads — the assembled size is checked on completion and a mismatch aborts.
- A part uploaded twice — the ETag list must tolerate it; R2 keeps the last write per part number.
- Presigned URL expiring mid-part — the client re-requests; make that path cheap and obvious.
- Completion called twice — idempotent: the second returns the existing asset.
- Completion called with a missing part — reject with a list of missing parts so the client can finish rather than restart.
- A quota that becomes insufficient between session creation and completion (another upload finished first) — decide the behaviour; **recommend honouring the reserved session** and letting the user go slightly over rather than discarding uploaded bytes, then blocking the next upload. Record the decision.
- An HEIC file declared as `image/heic` — allow; the worker converts.
- A file whose magic bytes say ZIP but whose name says MP4 — reject.
- A memory deleted between session creation and completion — abort cleanly.

---

## 14. Error Handling

- Every failure names what the client should do: retry, re-request URLs, finish missing parts, or upgrade.

---

## 15. Security Considerations

- **Automated test asserting a direct bucket URL returns 403.**
- Magic-byte validation; SVG rejected.
- Presigned URLs are short-lived and scoped to a single part.
- Rate limits on session creation and presigning.
- The checksum is what substantiates the originals-preserved claim; do not make it optional.

---

## 16. Testing Requirements

### Integration Tests

- Full flow against a test bucket: create, presign, upload parts, interrupt, get session, resume, complete.
- Stored object checksum matches the source file byte-for-byte.

### API Tests

- Quota exceeded returns 409 **before** any presigned URL is issued (assert no storage call was made).
- Oversized file returns 413 pre-presign.
- SVG rejected.
- Magic-byte mismatch rejected on completion.
- Checksum mismatch aborts and creates no asset.
- Completion is idempotent.
- Missing part returns the list of missing parts.
- Rate limit enforced.

### Security Tests

- **Direct bucket object URL returns 403.**

---

## 17. Acceptance Criteria

- [ ] All five endpoints implemented with the documented validation and errors.
- [ ] Quota and caps enforced before presigning, proven by asserting no storage call occurs on rejection.
- [ ] Magic bytes validated; SVG rejected.
- [ ] Checksum verified; mismatch creates no asset.
- [ ] Resume works from server-held part state.
- [ ] Completion idempotent.
- [ ] **Direct bucket access returns 403, asserted by automated test.**
- [ ] Quota-race decision recorded in §20.

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
TASK-048
    ↓
TASK-049
```


---

## 20. Implementation Notes

- Record the quota-race decision. It is a small call with a visible consequence for users near their limit.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-02-01-01](../EPIC-04-02-01-01.md).
3. Read the parent Sprint — [SPR-04-02-01](../../SPR-04-02-01.md).
4. Read the parent Module — [MOD-04-02](../../../MOD-04-02.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§12.1`, `§12.5`, `§20.4`, `ADR-007` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
