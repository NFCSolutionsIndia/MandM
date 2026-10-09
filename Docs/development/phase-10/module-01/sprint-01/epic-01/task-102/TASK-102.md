# TASK-102 — Implement Working Contact Form, Waitlist and FAQ Backend

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-102 |
| Phase | [PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout](../../../../PHASE-10.md) |
| Module | [MOD-10-01 — Marketing Site & Honest Claims](../../../MOD-10-01.md) |
| Sprint | [SPR-10-01-01 — Marketing Site, Pricing, Legal & Claim Correction](../../SPR-10-01-01.md) |
| Epic | [EPIC-10-01-01-01 — Marketing Site & Claim Correction](../EPIC-10-01-01-01.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-100` |
| Blueprint refs | `§30.3`, `§2.7` |

---

## 1. Objective

Build a contact form that actually submits, produces a ticket id, and reaches a monitored inbox — replacing the existing repository's inert `preventDefault()` form.

---

## 2. Context

Blueprint §2.7 records the existing state plainly: the only form in the current repository calls `preventDefault()` and "submits nowhere". §30.3 specifies the replacement: name, email, topic, message with a length range, optional attachment, and a success state with a ticket id.

---

## 3. Problem Statement

A contact form that silently discards messages is worse than no form: it teaches users that reaching the company is impossible, and it loses the early feedback a launch depends on. This is a small task with an outsized effect on the first weeks of operation.

---

## 4. Expected Outcome

A working contact form with spam protection, a ticket id, and delivery to a monitored inbox — plus a waitlist capture if pre-launch signup is still needed.

---

## 5. Requirements

### Functional Requirements

- Contact form: name, email, topic dropdown, message 20–1000 chars, optional attachment.
- Success state with a ticket id.
- Spam protection.
- Delivery to a monitored support inbox with an auto-acknowledgement to the sender.
- Waitlist capture with double opt-in where required.
- FAQ searchable, content-managed.

### Technical Requirements

- Server-side validation with the shared Zod schemas.
- Spam protection without a third-party tracker: a honeypot plus rate limiting, and a challenge only on repeated abuse.
- Attachments size- and type-limited and scanned, since this is an unauthenticated upload path.
- Ticket ids are opaque and non-sequential.

---

## 6. Implementation Instructions

1. Build the form with the PHASE-01 primitives so the §33 validation rules are inherited.
2. Implement submission as a route handler with server-side validation, rate limiting, and a honeypot field.
3. Generate an opaque ticket id and show it in the success state, so the user has something to reference.
4. Send to the support inbox and auto-acknowledge the sender with the ticket id.
5. Handle attachments carefully: size and type limits stated up front, validated by magic bytes, **SVG rejected** — this is an unauthenticated upload path and the PHASE-04 rules apply.
6. Implement waitlist capture with double opt-in where the jurisdiction requires it.
7. Make the FAQ searchable and content-managed so support can update answers without a deploy.
8. Verify a submitted message actually arrives, and that the inbox is monitored — an unmonitored inbox is the same failure as the inert form, one step later.

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
apps/site/src/app/contact/page.tsx
apps/site/src/app/api/contact/route.ts
apps/api/src/features/marketing/contact-schema.ts
packages/emails/src/templates/ContactAck.tsx
apps/site/src/app/api/contact/__tests__/contact.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
POST /api/contact
```

### Request

```json
{
  "name": "Riya Sharma",
  "email": "riya@example.com",
  "topic": "account",
  "message": "I cannot find a memory I created last week."
}
```

### Response

```json
{ "ok": true, "data": { "ticketId": "MM-7Q4K2P" } }
```

### Validation

- Name non-empty
- Email valid
- Topic from the list
- Message 20–1000 chars
- Honeypot empty
- Rate limit not exceeded
- Attachment within limits and type-validated

### Error Responses

| Status | Code | When |
|---|---|---|
| 422 | `VALIDATION_FAILED` | Field-level error |
| 429 | `RATE_LIMIT_CONTACT` | Too many submissions |
| 415 | `ATTACHMENT_REJECTED` | Type not allowed, or SVG |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- The form must actually submit and reach a monitored inbox.
- The user receives a ticket id.
- Attachments follow the PHASE-04 validation rules including SVG rejection.
- Spam protection uses no third-party tracker.

---

## 13. Edge Cases

- A message at the 1000-character limit — accepted; at 1001, rejected with a specific message and the content preserved.
- A submission from a user who is signed in — pre-fill name and email, and attach their account id for support context.
- An attachment of 20 MB — rejected before upload with the limit stated.
- A honeypot filled by a bot — silently accepted and discarded, so the bot does not learn.
- A repeat submitter (a genuinely frustrated user) — rate limit generous enough not to punish them; a challenge rather than a block.
- The support inbox unavailable — the submission must still be persisted so nothing is lost; queue and retry.
- A double opt-in waitlist confirmation never clicked — the address is not added; state that on the pending screen.

---

## 14. Error Handling

- A submission that cannot be delivered must still be persisted and retried. Losing a support request is the failure this task exists to fix.

---

## 15. Security Considerations

- Unauthenticated upload path: size, type, and magic-byte validation, SVG rejected.
- No third-party spam service that would introduce a tracker.
- Ticket ids opaque and non-sequential.

---

## 16. Testing Requirements

### API Tests

- Valid submission returns a ticket id and delivers to the inbox.
- Message length boundaries enforced.
- Honeypot submission silently discarded.
- Rate limit enforced.
- SVG attachment rejected.
- **Inbox unavailable: submission persisted and retried, not lost.**

### E2E Tests

- Submit the form and confirm the success state shows a ticket id.

### Accessibility Tests

- axe on the contact page; the form has labels and clear error messaging.

---

## 17. Acceptance Criteria

- [ ] Contact form submits, validates server-side, and returns a ticket id.
- [ ] Message delivered to a monitored inbox with an auto-acknowledgement.
- [ ] Attachments validated per the PHASE-04 rules; SVG rejected.
- [ ] Spam protection without a third-party tracker.
- [ ] Submission persisted and retried if delivery fails.
- [ ] Waitlist double opt-in where required.
- [ ] FAQ searchable and content-managed.
- [ ] A real submission verified end to end, including that the inbox is monitored.

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
TASK-100
    ↓
TASK-102
```


---

## 20. Implementation Notes

- Verify a human actually receives and reads a test submission before marking this done. A working form into an unmonitored inbox is the same failure one step removed.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-10-01-01-01](../EPIC-10-01-01-01.md).
3. Read the parent Sprint — [SPR-10-01-01](../../SPR-10-01-01.md).
4. Read the parent Module — [MOD-10-01](../../../MOD-10-01.md).
5. Read the parent Phase — [PHASE-10](../../../../PHASE-10.md).
6. Read the relevant blueprint sections: `§30.3`, `§2.7` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
