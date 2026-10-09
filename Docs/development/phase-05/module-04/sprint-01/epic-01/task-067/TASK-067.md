# TASK-067 — Implement Share Link Creation, Public View and Revocation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-067 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-04 — Private Sharing](../../../MOD-05-04.md) |
| Sprint | [SPR-05-04-01 — Share Links & Access Visibility](../../SPR-05-04-01.md) |
| Epic | [EPIC-05-04-01-01 — Share Links & Who-Can-See Panel](../EPIC-05-04-01-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-059`, `TASK-055` |
| Blueprint refs | `§10 Share`, `§11.3` |

---

## 1. Objective

Create the `shares` entity, the share sheet, the public `/s/[token]` view, and instant revocation.

---

## 2. Context

Blueprint §11.3 specifies the mechanism in detail: 32-byte CSPRNG token stored hashed, permission level, optional expiry, optional password, download flag, view counter, `noindex` headers, and "revocation is immediate... because signed media URLs live 5 minutes, real-world exposure after revocation is bounded to minutes rather than forever".

---

## 3. Problem Statement

This is the feature that keeps the archive from being a dead end — a grandmother will not create an account to see a photograph. It is also where the product's privacy claims become concrete: a link that can be killed in one tap, with a bounded exposure window, is a demonstrable control rather than a promise.

---

## 4. Expected Outcome

Share links with all documented options, a public view requiring no account, and revocation that takes effect on the next request.

---

## 5. Requirements

### Functional Requirements

- `shares` per §10: owner_id, resource_type, resource_id, token_hash, permission, allow_download, password_hash, expires_at, revoked_at, view_count, last_viewed_at.
- Share sheet: permission, expiry, download toggle, optional password.
- `/s/[token]` public view rendering the memory per the granted permission.
- Revocation immediate.
- View counting and last-viewed tracking.
- First-view notification to the owner.

### Technical Requirements

- 32-byte CSPRNG token, stored as SHA-256, constant-time comparison.
- Resolution through the `lib/authz` share branch built in TASK-059 — not a separate check.
- Media served via signed URLs minted per request after authz, honouring the download flag.
- `noindex, nofollow, noarchive` headers and `robots.txt` exclusion.
- Rate-limited per token and per IP; share creation limited to 20 per hour (§20.6).

---

## 6. Implementation Instructions

1. Write the `shares` schema from §10; generate and read the migration; add tenant isolation scoped by owner.
2. Implement create and revoke actions through authz, with the creation rate limit.
3. Build the share sheet with permission, expiry, download toggle, and optional password. Default expiry is a product decision — recommend no expiry by default with a prominent option, since a memory shared with family is usually meant to stay. Record the decision.
4. Build `/s/[token]` as a server component resolving through the authz share branch. Render per permission; honour the download flag by simply not minting a download URL when it is off.
5. Implement the optional password gate as a server-side form post so it works without JavaScript, consistent with the other tokenised pages.
6. Increment the view count and record last-viewed on each render, and notify the owner on the **first** view only (§14.1).
7. Add `noindex, nofollow, noarchive` headers and the `robots.txt` exclusion.
8. Write the revocation test: view successfully, revoke, and assert the next request fails.

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
packages/db/src/schema/share.ts
packages/db/migrations/0012_shares.sql
apps/site/src/app/s/[token]/page.tsx
apps/api/src/features/sharing/actions.ts
apps/api/src/features/sharing/components/ShareSheet.tsx
apps/api/src/features/sharing/__tests__/share.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
GET /s/[token]
```

### Request

```json
(no body; optional password via form post)
```

### Response

```json
Server-rendered memory view, or a designed state page
```

### Validation

- Token resolves to an active, unexpired, unrevoked share
- Password matches when set
- Permission covers the requested view

### Error Responses

| Status | Code | When |
|---|---|---|
| 404 | `SHARE_TOKEN_INVALID` | Unknown, revoked, or expired — indistinguishable |
| 401 | `SHARE_PASSWORD_REQUIRED` | Password gate not satisfied |
| 429 | `RATE_LIMIT_SHARE_VIEW` | Too many attempts against this token |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Resolution goes through the `lib/authz` share branch, never a parallel check.
- Revocation is effective on the next request.
- The download flag is enforced by not minting a download URL.
- `noindex, nofollow, noarchive` — a shared memory must never be indexed (§11.3).
- Revoked and expired are indistinguishable from unknown.

---

## 13. Edge Cases

- **Revoke while a viewer has the page open — the next media request fails, and exposure is bounded by the five-minute signed-URL TTL.** Test both halves.
- An expired share — designed state offering "ask for a new link".
- A password-protected share opened without JavaScript — the form post path must work.
- A share whose memory was deleted — neutral state, not an error.
- A share on a memory that is also in a sealed capsule — the share is independent and must not leak the capsule's existence.
- A link posted publicly and hit thousands of times — rate limits contain it, and the owner should be able to see the view count and react.
- A viewer with the download flag off attempting a direct media URL — denied by the matrix at the minting endpoint.
- Several shares on the same memory with different permissions — each resolves independently.

---

## 14. Error Handling

- Every failure is a designed page. Unknown, revoked, and expired render the same neutral state to avoid disclosure.

---

## 15. Security Considerations

- Hashed tokens, constant-time comparison.
- `noindex` plus `robots.txt` exclusion.
- Post-revocation exposure bounded by the signed-URL TTL — assert this in the test rather than assuming it.
- Rate limits on both view and creation.
- The share must not reveal anything about the vault beyond the shared resource.

---

## 16. Testing Requirements

### Integration Tests

- **View, revoke, then the next request fails.**
- Expired share renders the designed state.
- Password gate works without JavaScript.
- Download flag off means no download URL is minted.
- First view notifies the owner; subsequent views do not.
- Deleted memory renders a neutral state.
- Share creation rate limit enforced.

### Accessibility Tests

- axe on the public view and the share sheet.

### Security Tests

- `noindex` headers present and the path excluded in `robots.txt`.
- Response discloses nothing about the vault beyond the shared memory.
- Post-revocation media exposure bounded to the signed-URL TTL.

---

## 17. Acceptance Criteria

- [ ] Share entity created scoped through `lib/authz` and hashed tokens.
- [ ] Share sheet supports permission, expiry, password, and download flag.
- [ ] Public view works without an account and without JavaScript for the password path.
- [ ] **Revocation effective on the next request, with bounded media exposure, both proven by test.**
- [ ] View counting and first-view notification working.
- [ ] `noindex` and `robots.txt` exclusion verified.
- [ ] Default-expiry decision recorded in §20.
- [ ] axe clean.

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
TASK-059
    ↓
TASK-055
    ↓
TASK-067
```


---

## 20. Implementation Notes

- Reuse the tokenised-page shape from `/m/[token]` and `/c/[token]`. Three pages with the same structure is a feature; three different structures is a maintenance problem.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-04-01-01](../EPIC-05-04-01-01.md).
3. Read the parent Sprint — [SPR-05-04-01](../../SPR-05-04-01.md).
4. Read the parent Module — [MOD-05-04](../../../MOD-05-04.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§10 Share`, `§11.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
