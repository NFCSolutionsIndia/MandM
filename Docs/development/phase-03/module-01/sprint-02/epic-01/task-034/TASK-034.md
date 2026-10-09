# TASK-034 — Build Self-Service Member Invite Link and Public Fill Page

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-034 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-01 — Members & Relationships](../../../MOD-03-01.md) |
| Sprint | [SPR-03-01-02 — Member Import Paths & Deduplication](../../SPR-03-01-02.md) |
| Epic | [EPIC-03-01-02-01 — Import Paths](../EPIC-03-01-02-01.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-030` |
| Blueprint refs | `§29.11`, `§34.1` |

---

## 1. Objective

Let an owner send a link so the member fills in their own name, photo, birthday, and contact details on a public page requiring no account.

---

## 2. Context

Blueprint §29.11 calls this "the highest-quality data path in the product — self-reported details are accurate and self-maintaining — and it doubles as an acquisition loop. It exists *because* of the web contact-picker limitation, and it is genuinely better than what the native brief proposed."

---

## 3. Problem Statement

Two reasons this matters more than it looks. Data quality: a birthday the person entered themselves is right, and they can correct it later. Acquisition: the recipient sees the product, in a warm context, doing something useful for someone who cares about them — which is the cheapest introduction available.

---

## 4. Expected Outcome

A shareable link per member, a public no-account page where they complete their own details, and the owner's record updating on submission with an optional review step.

---

## 5. Requirements

### Functional Requirements

- Generate a link per member; regenerate to invalidate the previous one.
- Public page at `/m/[token]` showing only the owner's display name and a warm explanation.
- Fields the member can fill: preferred name, photo, birthday (with precision), anniversary, email, phone, and interests.
- Submission updates the member record; the owner is notified.
- Token expires (recommend 30 days) and is single-use per submission, with the owner able to reissue.
- Owner can require review before changes apply — decide the default and record it.

### Technical Requirements

- Token: 32 bytes CSPRNG, stored hashed, compared in constant time — the same pattern as share links.
- The page is server-rendered and works without JavaScript for the basic form path, matching the philosophy applied to `/c/[token]`.
- `noindex, nofollow, noarchive` headers.
- Rate-limited by token to prevent brute-force enumeration.

---

## 6. Implementation Instructions

1. Add token generation to the member actions: create, hash, store, and return the plaintext once for sharing.
2. Build `/m/[token]` as a server component with a progressively-enhanced form. Validate server-side with the shared schemas.
3. Write the page copy carefully. The visitor did not ask for this: it must explain who is asking, why, and what happens to what they enter, in two sentences. **Disclose nothing about the owner beyond their display name** — not their email, not their other members, not their memory count.
4. On submission, update the member and notify the owner. Implement the review-before-apply option; recommend defaulting to auto-apply for contact fields and review for the photo, and record the reasoning in §20.
5. Add the share affordance in the member detail screen using Web Share where available, with copy-link as the fallback.
6. Add expiry and reissue. An expired token shows a page inviting the visitor to ask the owner for a fresh link — never a bare error.
7. Rate-limit by token and by IP.

---

## 7. Architecture

```text
owner                                     member (no account)
  │ generate link                            │
  ├─▶ token (shown once) ──── share ────────▶│
  │                                          ▼
  │                              GET /m/[token]  (server-rendered, no JS needed)
  │                                   ├─ verify hashed token, unexpired
  │                                   ├─ show owner display name ONLY
  │                                   └─ form: name, photo, birthday, contact
  │◀── notified ───────────────── POST submit
  ▼
member record updated (auto-apply or review, per setting)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/app/m/[token]/page.tsx
apps/site/src/app/m/[token]/actions.ts
apps/api/src/features/member/self-service.ts
apps/api/src/features/member/components/InviteLinkSheet.tsx
apps/api/src/features/member/__tests__/self-service.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
POST /m/[token]
```

### Request

```json
{
  "name": "Priya Sharma",
  "birthday": "1962-03",
  "birthdayPrecision": "month",
  "email": "priya@example.com",
  "phone": "+919876543210"
}
```

### Response

```json
{ "ok": true, "data": { "message": "Thanks — Riya will see this." } }
```

### Validation

- Token valid, unexpired, unconsumed
- Name non-empty and Unicode-safe
- Email and phone validated by the shared validators
- Birthday precision consistent with the supplied value

### Error Responses

| Status | Code | When |
|---|---|---|
| 404 | `MEMBER_TOKEN_INVALID` | Unknown, expired, or already used |
| 429 | `RATE_LIMIT_TOKEN` | Too many attempts against this token |
| 422 | `VALIDATION_FAILED` | Field-level validation error |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- The page discloses only the owner's display name. Nothing else about the owner or their archive.
- No account is required, ever, on this page.
- The token is hashed at rest and rate-limited in use.
- `noindex` — this page must never be indexed.

---

## 13. Edge Cases

- The visitor is suspicious of the link — the copy must be reassuring and specific enough to be credible without over-explaining.
- The visitor submits and then wants to correct something — a reissued link should be possible; document whether the same token allows a second submission.
- The member is already a user of the product — offer to link accounts, but do not require it.
- An expired token — a warm page inviting them to ask for a new link.
- The owner deletes the member while the link is outstanding — the token must stop working.
- JavaScript disabled — the form must still submit.
- The visitor submits a photo — size and type limits stated up front; this touches PHASE-04 storage, so gate the photo field behind that dependency or accept it as a deferred field and note it.

---

## 14. Error Handling

- Every failure state is a designed page, not a stack trace: invalid, expired, revoked, and rate-limited each have their own warm copy.

---

## 15. Security Considerations

- Constant-time token comparison; hashed at rest.
- No owner information leaked beyond the display name.
- Rate-limited by token and IP.
- `noindex, nofollow, noarchive`.
- Server-side validation is authoritative; the page works without JavaScript, so client validation cannot be relied upon.

---

## 16. Testing Requirements

### Integration Tests

- Valid token renders the form; submission updates the member and notifies the owner.
- Expired, revoked, and unknown tokens each render their designed state.
- Deleting the member invalidates the token.
- Rate limit triggers after repeated attempts.

### E2E Tests

- **Submit the form with JavaScript disabled and confirm the member updates.**

### Security Tests

- Response contains no owner data beyond the display name — asserted against the rendered HTML.

---

## 17. Acceptance Criteria

- [ ] Link generation, sharing, expiry, and reissue all work.
- [ ] Public page renders and submits with JavaScript disabled.
- [ ] Only the owner's display name is disclosed, asserted by test against the HTML.
- [ ] All four failure states have designed copy.
- [ ] Token hashed, rate-limited, `noindex`.
- [ ] Owner notified on submission.
- [ ] Photo-field dependency on PHASE-04 resolved or explicitly deferred in §20.

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
TASK-030
    ↓
TASK-034
```


---

## 20. Implementation Notes

- This is the first public tokenised page in the product and it establishes the pattern that `/c/[token]`, `/s/[token]`, and `/j/[token]` all follow. Get the shape right here.
- Record the auto-apply versus review default in §20.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-01-02-01](../EPIC-03-01-02-01.md).
3. Read the parent Sprint — [SPR-03-01-02](../../SPR-03-01-02.md).
4. Read the parent Module — [MOD-03-01](../../../MOD-03-01.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.11`, `§34.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
