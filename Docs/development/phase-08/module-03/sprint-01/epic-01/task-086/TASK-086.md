# TASK-086 — Implement Stripe and Razorpay Checkout with Idempotent Webhooks

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-086 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-03 — Subscriptions, Entitlements & Quota](../../../MOD-08-03.md) |
| Sprint | [SPR-08-03-01 — Billing, Entitlements & Paywalls](../../SPR-08-03-01.md) |
| Epic | [EPIC-08-03-01-01 — Subscription, Checkout & Entitlement Enforcement](../EPIC-08-03-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-085` |
| Blueprint refs | `§17.2`, `ADR-015`, `§29.26` |

---

## 1. Objective

Implement hosted checkout and the billing portal for both providers, with webhook handling that is signature-verified, replay-protected, and idempotent.

---

## 2. Context

ADR-015 chooses both providers because the launch market is India-first: "₹ pricing, UPI, COD means Razorpay is not optional; Stripe covers the rest." Blueprint §20.3 requires "webhook signature verification with replay protection via timestamp windows and event-id deduplication".

---

## 3. Problem Statement

Webhooks are delivered at least once, out of order, and sometimes duplicated. A non-idempotent handler double-charges entitlements or downgrades a paying user. Since this product's billing state gates a promise, the handler must be boring and exactly correct.

---

## 4. Expected Outcome

Working checkout in both providers, a billing portal, and a webhook handler that produces the same result no matter how many times or in what order events arrive.

---

## 5. Requirements

### Functional Requirements

- Checkout session creation for both providers, region-aware.
- Billing portal link for card and plan management.
- Webhook handling for created, updated, deleted, payment succeeded, payment failed.
- Signature verification and replay protection.
- Idempotency by provider event id.
- Dunning schedule on payment failure (immediately, day 3, day 7).
- Proration note on plan change.

### Technical Requirements

- Provider selection by region, with an explicit override for testing.
- A processed-events table keyed by provider event id so a replay is a no-op.
- Out-of-order handling: apply events by their provider timestamp, not arrival order, or ignore an event older than the current state.
- Entitlement columns updated from the plan mapping, not from webhook payload values directly.

---

## 6. Implementation Instructions

1. Implement checkout session creation for Stripe and for Razorpay, selecting by region with an override.
2. Implement the billing portal link for Stripe, and the equivalent management path for Razorpay (which differs — document what is available).
3. Implement the webhook route with signature verification and a timestamp window for replay protection.
4. **Add a processed-events table and check it first.** A duplicate event id returns success without reapplying.
5. Handle out-of-order events by comparing the provider timestamp against the stored state; ignore stale events rather than applying them.
6. Map plan identifiers to entitlement values from the shared constants; never take a limit from a webhook payload.
7. Implement dunning as a scheduled sequence, cancelled if payment succeeds.
8. Write the idempotency test: deliver the same event three times and assert one effect.

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
apps/site/src/app/api/webhooks/stripe/route.ts
apps/site/src/app/api/webhooks/razorpay/route.ts
apps/api/src/features/billing/checkout.ts
apps/api/src/features/billing/webhook-handler.ts
packages/db/migrations/0017_processed_events.sql
apps/api/src/features/billing/__tests__/webhooks.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
POST /api/webhooks/stripe
```

### Request

```json
{ "id": "evt_...", "type": "customer.subscription.updated", "data": { "object": { } } }
```

### Response

```json
{ "ok": true }
```

### Validation

- Signature valid
- Timestamp within the replay window
- Event id not already processed
- Event not stale relative to stored state

### Error Responses

| Status | Code | When |
|---|---|---|
| 400 | `WEBHOOK_SIGNATURE_INVALID` | Signature verification failed |
| 400 | `WEBHOOK_REPLAY` | Timestamp outside the accepted window |
| 200 | `WEBHOOK_DUPLICATE` | Already processed — acknowledged without reapplying |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Idempotent by provider event id.** A duplicate is acknowledged, not reapplied.
- Stale events are ignored, not applied.
- Entitlement values come from the shared plan mapping, never from a webhook payload.
- Signature verification and replay protection on every webhook.

---

## 13. Edge Cases

- **The same event delivered three times — one effect.** The defining test.
- An update event arriving before the create event — handle by fetching current state from the provider rather than assuming order.
- A payment succeeding after dunning started — cancel the remaining dunning notifications.
- A subscription cancelled at period end — entitlements persist until `current_period_end`.
- A user upgrading mid-period — proration handled by the provider; the entitlement update must be immediate.
- A webhook for an unknown user (deleted account) — acknowledge and ignore.
- Razorpay and Stripe both having a subscription for the same user (a migration mishap) — detect and alert rather than silently picking one.
- A signature check failing because of a body-parsing middleware consuming the raw body — a classic bug; ensure the raw body is available.

---

## 14. Error Handling

- A webhook that cannot be processed must return a non-2xx so the provider retries, except for duplicates and unknown users, which are acknowledged.

---

## 15. Security Considerations

- Signature verification with the raw body.
- Replay protection via timestamp window plus event-id dedupe.
- Webhook secrets in environment configuration only.
- Never trust amounts or limits from the payload for entitlement purposes.

---

## 16. Testing Requirements

### Integration Tests

- Upgrade applies entitlements immediately.
- Cancel-at-period-end retains entitlements until the period ends.
- Payment success cancels dunning.

### API Tests

- **Duplicate event delivered three times produces one effect.**
- Invalid signature rejected.
- Timestamp outside the window rejected.
- Stale event ignored.
- Unknown user acknowledged and ignored.
- Raw body available for signature verification.

---

## 17. Acceptance Criteria

- [ ] Checkout works for both providers, region-selected.
- [ ] Billing portal or equivalent available for both, with differences documented.
- [ ] **Webhooks idempotent, signature-verified, and replay-protected, all proven by test.**
- [ ] Out-of-order events handled by fetching current state.
- [ ] Entitlements sourced from the plan mapping.
- [ ] Dunning scheduled and cancellable.

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
TASK-085
    ↓
TASK-086
```


---

## 20. Implementation Notes

- The raw-body signature problem catches almost everyone once. Verify it explicitly rather than assuming the framework preserved it.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-03-01-01](../EPIC-08-03-01-01.md).
3. Read the parent Sprint — [SPR-08-03-01](../../SPR-08-03-01.md).
4. Read the parent Module — [MOD-08-03](../../../MOD-08-03.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§17.2`, `ADR-015`, `§29.26` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
