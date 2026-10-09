# TASK-080 — Build Email Templates for All Triggers with Bounce Handling and Volume Guardrail

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-080 |
| Phase | [PHASE-07 — Notifications — Push, Email & The Trigger Matrix](../../../../PHASE-07.md) |
| Module | [MOD-07-02 — Trigger Matrix & Email Templates](../../../MOD-07-02.md) |
| Sprint | [SPR-07-02-01 — Trigger Implementation & Volume Guardrail](../../SPR-07-02-01.md) |
| Epic | [EPIC-07-02-01-01 — Release-1 Trigger Matrix & Email Templates](../EPIC-07-02-01-01.md) |
| Type | backend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-079`, `TASK-063` |
| Blueprint refs | `§14.4`, `§14.3`, `ADR-016` |

---

## 1. Objective

Build an email template for every Release-1 trigger on the durable base established in PHASE-05, handle bounces and complaints, and implement the volume guardrail metric and alert.

---

## 2. Context

PHASE-05 built the decade-durable capsule delivery email. This task extends that base to every other trigger and adds the operational plumbing: `List-Unsubscribe` on non-transactional mail, bounce handling, and the volume metric §14.3 requires.

---

## 3. Problem Statement

Email is the guaranteed channel, so a broken template silently removes the only reliable path for a critical notification. The volume metric exists because "be quiet" is a claim that decays without measurement — and blueprint §14.3 asks for the alert explicitly.

---

## 4. Expected Outcome

A template per trigger sharing one minimal base, bounce and complaint handling that marks addresses undeliverable, `List-Unsubscribe` where appropriate, and a live volume metric with an alert.

---

## 5. Requirements

### Functional Requirements

- A template per Release-1 trigger, built on the PHASE-05 durable base.
- `List-Unsubscribe` headers on non-transactional mail; **not** on delivery mail (§14.4).
- Bounce and complaint webhooks marking addresses undeliverable and surfacing that on the capsule detail screen.
- Volume metric: notifications per user per week, with an alert above a mean of two.
- A simulated-month test asserting fewer than four non-delivery notifications for an active user.

### Technical Requirements

- All templates share the PHASE-05 base: table layout, inline styles, no web fonts, no external CSS, no JavaScript, plain-text alternative.
- Bounce classification distinguishes hard from soft; a hard bounce marks the address undeliverable immediately.
- The metric is computed from the notification records, so it cannot drift from what was actually sent.

---

## 6. Implementation Instructions

1. Extend the PHASE-05 email base and build a template per trigger. Keep each to one clear message and one action; the durability constraints apply to all of them, not only the delivery mail.
2. Add `List-Unsubscribe` and `List-Unsubscribe-Post` to non-transactional mail. **Do not add it to capsule delivery** — that is transactional and §14.4 says so.
3. Implement bounce and complaint webhook handling: verify the signature, classify hard versus soft, mark the address undeliverable on a hard bounce, and surface it on the capsule detail screen so the sender can fix it.
4. A complaint (spam report) must suppress future non-transactional mail to that address immediately — this protects sending reputation and is a legal courtesy.
5. Implement the volume metric from the notification records, aggregated per user per ISO week, and wire the alert above a mean of two.
6. Write the simulated-month test: an active user creating memories, sealing a capsule, receiving a delivery and a reply — assert the non-delivery notification count stays under four.
7. Verify every template with images disabled and CSS stripped, as PHASE-05 established.

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
packages/emails/src/templates/  (one per trigger)
packages/emails/src/base.tsx
apps/site/src/app/api/webhooks/resend/route.ts  (extend)
apps/api/src/lib/notifications/volume-metric.ts
packages/emails/src/__tests__/all-templates.test.tsx
apps/api/src/lib/notifications/__tests__/volume.test.ts
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

- Every template inherits the durable base — no exceptions for "simple" mail.
- `List-Unsubscribe` on non-transactional mail only.
- A hard bounce marks the address undeliverable and surfaces on the capsule detail.
- A spam complaint suppresses future non-transactional mail to that address.
- The volume metric is computed from what was actually sent.

---

## 13. Edge Cases

- A hard bounce on a capsule recipient address — surfaced on the capsule detail so the sender can fix it before the delivery date; this is one of the most valuable uses of bounce data in the product.
- A soft bounce (mailbox full) — retried within the PHASE-05 ladder rather than marked undeliverable.
- A complaint from a capsule recipient — suppress non-transactional mail but consider that the transactional delivery has already happened; document the handling.
- A user whose own address hard-bounces — they cannot receive security mail; surface this prominently in-app, because it breaks the guaranteed channel.
- The volume metric skewed by one heavy user — report the mean and a high percentile, since the mean alone hides a fatigue problem affecting a subset.
- A template rendering failure in production — the durability test in CI is the guard; a failure must alert rather than silently drop mail.
- Unsubscribe from all non-transactional mail — the user must still receive security and billing; state this on the unsubscribe confirmation.

---

## 14. Error Handling

- A send failure retries per the ladder; a template render failure alerts, because it means a class of notification is silently broken.

---

## 15. Security Considerations

- No tracking pixels (§14.4).
- Webhook signatures verified with replay protection.
- Unsubscribe links must not be guessable identifiers that reveal an account.

---

## 16. Testing Requirements

### Integration Tests

- Hard bounce marks the address undeliverable and appears on the capsule detail.
- Soft bounce retries rather than marking undeliverable.
- Complaint suppresses future non-transactional mail.
- `List-Unsubscribe` present on non-transactional and absent on delivery mail.
- **Simulated active month produces fewer than four non-delivery notifications.**
- Volume metric reports mean and a high percentile.

### Component Tests

- **Every template renders readably with images disabled and CSS stripped.**
- No external resources or scripts in any template.

---

## 17. Acceptance Criteria

- [ ] A template per Release-1 trigger, all on the durable base.
- [ ] All templates readable with images disabled and CSS stripped.
- [ ] `List-Unsubscribe` correct per type.
- [ ] Bounce and complaint handling working, with hard bounces surfaced on capsule detail.
- [ ] A user whose own address bounces is warned in-app.
- [ ] Volume metric live with mean and percentile, and an alert above two per week.
- [ ] **Simulated-month test passes under four non-delivery notifications.**

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
TASK-079
    ↓
TASK-063
    ↓
TASK-080
```


---

## 20. Implementation Notes

- Surfacing a hard bounce on a capsule recipient before the delivery date is one of the highest-value uses of this data — it turns a future failure into a fixable warning.
- Report a percentile alongside the mean; a fatigue problem in a subset of users is invisible in an average.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-07-02-01-01](../EPIC-07-02-01-01.md).
3. Read the parent Sprint — [SPR-07-02-01](../../SPR-07-02-01.md).
4. Read the parent Module — [MOD-07-02](../../../MOD-07-02.md).
5. Read the parent Phase — [PHASE-07](../../../../PHASE-07.md).
6. Read the relevant blueprint sections: `§14.4`, `§14.3`, `ADR-016` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
