# TASK-063 — Build Email Channel with Decade-Durable Delivery Template

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-063 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-02 — Delivery Engine](../../../MOD-05-02.md) |
| Sprint | [SPR-05-02-01 — Scheduler, Channel Ladder, Watchdog & Integrity Sweep](../../SPR-05-02-01.md) |
| Epic | [EPIC-05-02-01-01 — Scheduler & Channel Delivery](../EPIC-05-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-062` |
| Blueprint refs | `§14.4`, `ADR-016`, `§29.24` |

---

## 1. Objective

Implement the email delivery channel with Resend and an SES fallback, and the delivery email built to render in clients that do not exist yet.

---

## 2. Context

Blueprint §14.4 gives the design brief in full: the subject names the sender and occasion rather than the brand, there is no marketing, and "the email must render correctly in email clients that will not exist for another 15 years: table-based layout, inline styles, a plain-text alternative, no JavaScript, no web fonts, no external CSS".

---

## 3. Problem Statement

Email is the guaranteed channel (§14.2) because push subscriptions die. That makes this template the most durability-critical piece of markup in the product. It also carries the emotional payload: blueprint §14.4 gives the example subject "Dad recorded this for your 18th birthday", and a template cluttered with branding would undercut the moment it exists to deliver.

---

## 4. Expected Outcome

An email channel with automatic provider failover, and a delivery template that is plain, table-based, inline-styled, and accompanied by a plain-text alternative.

---

## 5. Requirements

### Functional Requirements

- Send via Resend; on failure, fall back to SES automatically and record which provider was used.
- Delivery template: subject names sender and occasion; body is one sentence and one link.
- Plain-text alternative for every send.
- Bounce and complaint webhooks update the attempt status.
- Sender receipt email on delivery and on first open.

### Technical Requirements

- Table-based layout, all styles inline, no web fonts, no external CSS, no JavaScript, no tracking pixel.
- Images referenced only where essential and always with meaningful alt text — many clients block images by default, so the email must read completely without them.
- The unlock link is the durable `/c/[token]` URL with no query parameters that could be stripped.
- No `List-Unsubscribe` on the delivery email itself — it is transactional (§14.4).

---

## 6. Implementation Instructions

1. Implement the channel in `apps/workers/src/lib/channels/email.ts` with Resend primary and SES fallback, recording the provider on the attempt row.
2. Build the template in `packages/emails/src/templates/CapsuleDelivered.tsx` using table layout and inline styles only. **Test it with images disabled and with CSS stripped** — those are the two states old and locked-down clients present.
3. Write the subject from the sender name and the occasion, never the brand.
4. Write the body as one sentence and one link. Resist adding a footer, a logo, or a "download our app" line; §14.4 forbids it and the reason is that this email is the payoff of a decades-old promise.
5. Generate the plain-text alternative from the same content, not as an afterthought.
6. Implement bounce and complaint webhook handling that updates the attempt status, so a bounced address is visible on the capsule detail screen and can trigger the next rung.
7. Implement the sender receipt emails for delivery and first open — the latter is described in §14.1 as "the single most valuable notification the product sends".
8. Verify rendering across a broad client matrix, and record the results in §20.

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
apps/workers/src/lib/channels/email.ts
packages/emails/src/templates/CapsuleDelivered.tsx
packages/emails/src/templates/CapsuleOpened.tsx
packages/emails/src/render-text.ts
apps/site/src/app/api/webhooks/resend/route.ts
packages/emails/src/__tests__/durability.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Subject:** `Dad recorded this for your 18th birthday`

**Body** — one sentence, one link, nothing else:

```
Riya left this for you on 4 June 2026.

    [ Open your memory ]

If the button does not work, open this link:
https://…/c/xxxxxxxx
```

No logo. No footer links. No tracking pixel. No web fonts. Table layout, inline styles.

**Plain-text alternative** carries the same words and the same URL.

---

## 12. Business Rules

- Table layout, inline styles, no web fonts, no external CSS, no JavaScript, no tracking pixel.
- The email must read completely with images disabled.
- Subject names the sender and occasion, not the brand.
- No marketing, no footer clutter.
- Every send has a plain-text alternative.
- No `List-Unsubscribe` on transactional delivery mail.

---

## 13. Edge Cases

- Images blocked — the email must be fully usable; test explicitly.
- CSS stripped entirely — the table layout must still be readable.
- A client that mangles long URLs — keep the token URL short and also present it as text.
- Resend outage — SES fallback engages and is recorded.
- Both providers failing — the attempt records failure and the ladder escalates to notifying the sender.
- A bounced address — status updated, capsule detail shows it, next rung attempted.
- A recipient address that is a shared family mailbox — nothing to do technically, but worth noting in the guarantee document as a limit.
- Dark-mode email clients inverting colours — test; avoid designs that depend on a light background.
- A very long sender name or occasion in the subject — truncate sensibly rather than being cut mid-word by the client.

---

## 14. Error Handling

- A send failure records the provider error code and lets the ladder proceed. A template render failure must be caught in CI, not at delivery time — hence the durability test.

---

## 15. Security Considerations

- No tracking pixel: it would leak open behaviour to a third party on an intimate message.
- The token URL is the credential; it must not appear in any log.
- Webhook signatures verified with replay protection.

---

## 16. Testing Requirements

### Unit Tests

- Plain-text alternative contains the same URL and message.
- Subject composed from sender and occasion.

### Integration Tests

- Resend failure falls back to SES and records the provider.
- Bounce webhook updates the attempt status.
- Both providers failing escalates to the sender notification.

### Component Tests

- **Template renders readably with images disabled.**
- **Template renders readably with all CSS stripped.**
- No external resource references, no script tags, no web fonts — asserted against the rendered HTML.

---

## 17. Acceptance Criteria

- [ ] Email channel with automatic Resend-to-SES failover, provider recorded.
- [ ] Template is table-based and inline-styled, with no external resources — asserted by test.
- [ ] Readable with images disabled and with CSS stripped.
- [ ] Plain-text alternative for every send.
- [ ] Subject names sender and occasion.
- [ ] Bounce and complaint handling wired.
- [ ] Sender receipt emails for delivery and first open.
- [ ] Client-matrix results recorded in §20.

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
TASK-062
    ↓
TASK-063
```


---

## 20. Implementation Notes

- Resist every instinct to brand this email. Its value is that it looks like a message from a person, because that is what it is.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-02-01-01](../EPIC-05-02-01-01.md).
3. Read the parent Sprint — [SPR-05-02-01](../../SPR-05-02-01.md).
4. Read the parent Module — [MOD-05-02](../../../MOD-05-02.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§14.4`, `ADR-016`, `§29.24` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
