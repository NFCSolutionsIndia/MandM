# PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-08 |
| Phase name | Privacy, Data Rights, Billing, Trust & Safety, Admin |
| Release | Release 1 |
| Phase objective | Make the product accountable: prove who saw what, let users leave with everything, take payment, and be able to act on abuse. |
| Business objective | Media costs money from the first user, and any service accepting user media has legal duties from its first public visitor. |
| Technical objective | Audit log, privacy centre, WebAuthn app lock, data export and account deletion, Stripe and Razorpay with entitlement enforcement, moderation queue with CSAM matching, and the Release-1 operator console. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-07 |
| Estimated effort | ~2.5 weeks |
| Modules | 4 |
| Sprints | 5 |
| Epics | 5 |
| Tasks | 12 |
| Expected outcome | A user can see exactly who reached their memories, take everything with them, delete everything, and pay — and operators can see whether deliveries are working and act on a report. |

---

## 1. Phase Purpose

This phase is where the product becomes something that can be operated and, legally, launched.

Four strands, all non-optional:

**Accountability.** Blueprint §11.5 and §24.1 turn privacy from a claim into a surface: an access log the user can read, active-link management, one-tap revocation. §20.11 requires every content access — by user, recipient, or admin — to be logged.

**Data rights.** §20.9 makes export "a trust feature, not a compliance chore" — every original plus a full metadata manifest, no paywall, no watermark. Deletion is two-step with a 30-day grace period, and it must warn about the capsule promises it will cancel.

**Money.** Blueprint §17.2 decided the model: storage-based free tier at 10 GB, three pending capsules, a twelve-month horizon, and **no memory-count limit**. Entitlements are evaluated at seal time and never re-applied, so a lapsed subscription can never invalidate an existing promise.

**Duty of care.** §27.4 lists trust and safety as one of three things that must not be deferred: "A media service without a report path and a takedown workflow is a legal exposure from its first public user." CSAM hash-matching on upload is a documented exception to the no-scanning commitment and must be disclosed.

---

## 2. Phase Goals

- Every content access is recorded, and the user can read their own access log.
- A user can export every original plus a complete metadata manifest.
- A user can delete their account, is told which capsule promises that cancels, and has 30 days to change their mind.
- A user can subscribe with a card or UPI, and entitlements are enforced without ever invalidating an existing promise.
- A user can report content and block a person; an operator can act on it with an SLA.
- An operator can see at a glance whether deliveries are working.
- Support cannot see memory content without break-glass, a second approver, and a notification to the user.

---

## 3. Features Delivered

- Audit log with a user-visible access log.
- WebAuthn app lock and vault PIN.
- Full data export and two-step account deletion with purge.
- Stripe and Razorpay checkout, webhooks, entitlements, quota enforcement, contextual paywalls.
- Storage accounting reconciliation.
- Report and block; CSAM hash-matching; moderation queue with SLA.
- Operator console: delivery health, job queue, user lookup with break-glass, system health.

---

## 4. Architecture Impact

- Introduces the `AuditLog` that §20.11 requires across every sensitive path.
- Introduces the billing and entitlement layer the PHASE-05 seal gates already read from.
- Introduces the admin authentication realm on a separate subdomain with its own rate limits.
- Introduces the moderation boundary: only shared, reported, or auto-flagged content is reviewable.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-08-01](module-01/MOD-08-01.md) | Privacy Centre, Audit Log & App Lock | Turn the product's privacy claims into surfaces the user can inspect and controls they can use. | critical | pending |
| [MOD-08-02](module-02/MOD-08-02.md) | Data Rights — Export & Deletion | Make export and deletion complete, honest, and legally sufficient. | critical | pending |
| [MOD-08-03](module-03/MOD-08-03.md) | Subscriptions, Entitlements & Quota | Implement the §17.2 pricing model exactly, with entitlements that cannot retroactively invalidate a sealed capsule. | critical | pending |
| [MOD-08-04](module-04/MOD-08-04.md) | Trust & Safety and the Operator Console | Give the product a report path, a takedown workflow, and an operator console — without opening a door into private content. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-07

- **PHASE-05** must be complete: deletion must be able to warn about sealed capsules, and the delivery-health screen needs the attempt log.
- **PHASE-04** accounting must exist for quota enforcement and reconciliation.
- **External:** Stripe and Razorpay accounts with webhooks; a CSAM hash-matching provider; a paging channel for the delivery alert.

---

## 7. Phase Deliverables

- Audit log and privacy centre
- App lock
- Export and deletion
- Billing with entitlements
- Moderation queue
- Operator console

---

## 8. Phase Acceptance Criteria

- [ ] An export contains every original and a manifest covering every entity, verified against a seeded account.
- [ ] Account deletion lists the pending capsules it will cancel, by recipient name, before confirming.
- [ ] A subscription upgrade lifts the quota immediately; a lapse does not cancel an existing capsule.
- [ ] A reported memory appears in the moderation queue with an SLA timer.
- [ ] Support cannot open memory content without break-glass, and the user is notified when they do.
- [ ] The delivery-health screen shows due, failed, and at-risk capsules, with the watchdog alert wired.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Admin access becoming an unaudited backdoor | critical | Separate auth realm with hardware MFA, no content access by default, break-glass requiring a reason and a second approver, user notified, every action audited. |
| Deletion purging incompletely and leaving orphaned media | high | Storage-first purge ordering, reconciliation job, and a completeness test against a seeded account. |
| Entitlement enforcement retroactively breaking a promise | critical | Entitlements evaluated at seal time only (§17.2 item 4); a test asserts a downgrade cannot cancel a sealed capsule. |
| Moderation overreach into private content | high | Only shared, reported, or auto-flagged content enters the queue; the boundary is enforced architecturally and CSAM matching is the single documented exception. |
| Storage accounting drift | medium | Gap G-5: reconciliation job comparing counted usage against actual objects, with a report. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder subscribes, exports their data, reports a memory, and an operator resolves it — all visible in the audit log
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§11.5`
- `§16`
- `§17.2`
- `§20.9`
- `§20.11`
- `§29.10`
- `§29.26`
- `§31`
- `gap G-5`
- `gap G-8`
