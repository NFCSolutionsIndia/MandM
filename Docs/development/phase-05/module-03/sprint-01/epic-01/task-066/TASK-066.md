# TASK-066 — Implement Reply Capture and Sender Notification Loop

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-066 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-03 — Recipient Experience](../../../MOD-05-03.md) |
| Sprint | [SPR-05-03-01 — Recipient Unlock Page & Reply Loop](../../SPR-05-03-01.md) |
| Epic | [EPIC-05-03-01-01 — Recipient Unlock & Reply](../EPIC-05-03-01-01.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-065`, `TASK-047` |
| Blueprint refs | `§34.6`, `§14.1`, `§24.2` |

---

## 1. Objective

Let a recipient reply with text, an emoji reaction, or a voice note — without an account — and deliver that reply into the sender's vault as a memory.

---

## 2. Context

Blueprint §34.6 defines the reaction model and states that a reply "triggers the sender notification (\"Mom loved your video ❤️\") and is copied into the sender's vault as a memory". Section §14.1 calls the opened notification "the single most valuable notification the product sends".

---

## 3. Problem Statement

Blueprint §24.2 identifies this as a product improvement over the original concept: "In the existing concept, delivery is the end. Making it two-way converts a one-way broadcast into a relationship, and converts a recipient into a user." It is also the cheapest acquisition mechanism the product has.

---

## 4. Expected Outcome

A reply affordance on the unlock page that works without an account, produces a memory in the sender's vault, and notifies the sender promptly.

---

## 5. Requirements

### Functional Requirements

- Reply kinds: emoji reaction, text, and voice note.
- No account required.
- Text reply works without JavaScript (a plain form post).
- Voice reply requires JavaScript and is offered only where supported.
- The reply is copied into the sender's vault as a memory attributed to the recipient.
- Sender notified on reply and on first open.
- Rate-limited per token.

### Technical Requirements

- The text reply path is a server-action-free plain form post so it survives a no-JS visitor.
- Voice reply reuses the PHASE-04 capture and upload path, but the recipient has no session — so the upload must be authorised by the capsule token, with tight limits.
- The created memory is owned by the sender's vault but attributed to the recipient in its note.
- Reply content is user input from an unauthenticated party: validate, bound, and never render as markup.

---

## 6. Implementation Instructions

1. Implement the emoji reaction as a plain form post with a set of allowed values — no free-form input, so it works everywhere and cannot carry a payload.
2. Implement the text reply as a plain form post with a bounded length. **This must work without JavaScript**, which means a route handler rather than a client-invoked action.
3. Implement the voice reply behind a capability check. Authorise the upload with the capsule token rather than a session: mint a scoped, single-use upload session with a small size cap and a short expiry. **This is the only place in the product where an unauthenticated party can upload**, so the limits must be tight and explicit.
4. On reply, create a memory in the sender's vault attributed to the recipient, and link it to the capsule so the detail screen can show it.
5. Notify the sender on reply, and separately on first open — the two are different moments and §14.1 lists both.
6. Rate-limit replies per token to prevent a leaked link becoming a spam channel.
7. Treat every reply field as untrusted: bound the length, strip nothing but render as text, and never allow markup.

---

## 7. Architecture

```text
recipient (no account)
  ├─ emoji  ──▶ POST form (allow-list values)     ← works without JS
  ├─ text   ──▶ POST form (bounded length)        ← works without JS
  └─ voice  ──▶ capability-gated; token-scoped upload session
                   small size cap · short expiry · single use
                          │
                          ▼
              capsule_replies row
                          │
                          ├─▶ memory created in SENDER'S vault
                          │     attributed to the recipient
                          └─▶ notify sender  ("Ella replied ❤️")

separately: first open ──▶ notify sender  (§14.1 — the most valuable notification)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/app/c/[token]/reply/route.ts
apps/api/src/features/capsule/reply.ts
apps/api/src/features/capsule/components/ReplyForm.tsx
apps/site/src/app/api/upload/token-session/route.ts
apps/api/src/features/capsule/__tests__/reply.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
POST /c/[token]/reply
```

### Request

```json
kind=text&body=Thank+you+Dad.+I+watched+it+three+times.
```

### Response

```json
302 → /c/[token]?replied=1
```

### Validation

- Token valid and the capsule delivered
- Kind in the allowed set
- Emoji from the allow-list
- Body within length bounds
- Rate limit not exceeded

### Error Responses

| Status | Code | When |
|---|---|---|
| 404 | `CAPSULE_TOKEN_INVALID` | Unknown, revoked, or not yet delivered |
| 422 | `VALIDATION_FAILED` | Body too long or emoji not allowed |
| 429 | `RATE_LIMIT_REPLY` | Too many replies against this token |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- No account is required to reply.
- Emoji and text replies work without JavaScript.
- The reply becomes a memory in the sender's vault, attributed to the recipient.
- The sender is notified on reply and, separately, on first open.
- A token-scoped upload session is single-use, small, and short-lived — it is the only unauthenticated upload path in the product.

---

## 13. Edge Cases

- A reply attempted before delivery — rejected, since the capsule is not open.
- A reply to a cancelled capsule — rejected neutrally.
- Several replies from the same recipient — allowed; each becomes a memory, but notifications should be batched to avoid flooding the sender.
- A very long text reply — bounded with a counter where JavaScript is available, and rejected with a clear message where it is not.
- A voice reply on a browser without `MediaRecorder` — the option is absent, not broken.
- A voice reply exceeding the size cap — rejected before upload with a stated limit.
- A leaked link used to spam replies — rate limits contain it; consider notifying the owner of unusual activity.
- A reply containing markup or a script — stored as text and rendered as text; never interpreted.
- A reply arriving while the sender's account is deleted — the reply has nowhere to go; handle gracefully and do not error on the recipient's side.

---

## 14. Error Handling

- A failed reply must not lose the typed text: re-render the form with the content intact, which matters more here than usual because the recipient may be emotional and may not retype.

---

## 15. Security Considerations

- Reply content is untrusted input from an unauthenticated party — bound it, store it as text, render it as text.
- The token-scoped upload session is tightly limited and single-use.
- Rate-limited per token.
- The created memory must be attributed clearly so the sender knows it came from the recipient, not from themselves.

---

## 16. Testing Requirements

### Integration Tests

- **Text reply posted without JavaScript creates a reply and a memory in the sender's vault.**
- Emoji reply restricted to the allow-list.
- Reply before delivery rejected.
- Sender notified on reply and separately on first open.
- Voice reply upload session is single-use and size-capped.
- Rate limit contains repeated replies.
- Markup in a reply is rendered as text.
- Reply to a deleted sender account handled gracefully.

### Accessibility Tests

- axe on the reply form with and without JavaScript; the form has labels and a clear submit.

---

## 17. Acceptance Criteria

- [ ] All three reply kinds implemented; emoji and text work without JavaScript.
- [ ] Reply creates a memory in the sender's vault, attributed to the recipient.
- [ ] Sender notified on reply and on first open, as separate events.
- [ ] Token-scoped upload session is single-use, size-capped, and short-lived.
- [ ] Rate limits enforced.
- [ ] Reply content stored and rendered as text.
- [ ] Failed reply preserves typed content.
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
TASK-065
    ↓
TASK-047
    ↓
TASK-066
```


---

## 20. Implementation Notes

- The token-scoped upload path is the only unauthenticated write of media in the product. Review its limits carefully; it is worth a second reviewer.
- Batch sender notifications for multiple replies so the payoff moment does not become a flood.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-03-01-01](../EPIC-05-03-01-01.md).
3. Read the parent Sprint — [SPR-05-03-01](../../SPR-05-03-01.md).
4. Read the parent Module — [MOD-05-03](../../../MOD-05-03.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§34.6`, `§14.1`, `§24.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
