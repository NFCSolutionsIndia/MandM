# PHASE-05 — Time Capsules & The Delivery Guarantee

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-05 |
| Phase name | Time Capsules & The Delivery Guarantee |
| Release | Release 1 |
| Phase objective | Build the differentiating feature: seal a memory for a person and a future date, and guarantee it arrives. |
| Business objective | Without this phase the product is a worse Google Photos. With it, it is the only place you can hand a moment to someone in the future. |
| Technical objective | Capsule model with a transactional seal, a database-owned durable scheduler, a multi-channel delivery ladder with a watchdog, a JavaScript-free recipient unlock page, and revocable share links. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-04 |
| Estimated effort | ~5 weeks |
| Modules | 4 |
| Sprints | 5 |
| Epics | 5 |
| Tasks | 12 |
| Expected outcome | A user seals a memory for a date decades away and can trust it. A recipient opens it on that day, in a browser that may not exist yet, and replies. |

---

## 1. Phase Purpose

This is the phase the whole product exists for.

Blueprint §23.4 gives the boundary test — "if this were missing, would the core promise be broken?" — and §23.1 answers it for this phase in one line: **"The differentiator. Without it this is a worse Google Photos."**

Four commitments govern every task here, and none of them is negotiable:

**Sealing is transactional.** The capsule state and its scheduled job commit together (§18.4 item 1). There is no instant in which a capsule is sealed but unscheduled.

**The schedule lives in PostgreSQL.** ADR-006 calls this "the most important architectural decision in the system": a job due in 2046 must outlive every vendor in the stack. A queue service may *execute*; it is never the record.

**`/c/[token]` works with JavaScript disabled.** Blueprint §29.24 makes this a hard constraint, and the project plan restates it: "a 2046 recipient must not be blocked by a 2026 framework assumption."

**A missed unlock is a Sev-0 incident.** Blueprint §12.6 and §37 put losing a sealed capsule "on the same footing as a data breach, because it is the same failure of the same promise." The watchdog that detects it is built here, and its alert must never be routine.

This phase also finally fills the two authorization branches PHASE-02 deliberately left as stubs: share-link holder and delivered capsule recipient (§11.1).

---

## 2. Phase Goals

- A memory can be sealed to named recipients with a date or an age milestone, and the seal is atomic.
- A sealed capsule is immutable in content, cancellable by its owner, and invisible to its recipient until delivery.
- The scheduler delivers on time, in the recipient's local humane window, and retries across days rather than minutes.
- A watchdog pages a human if any capsule passes its unlock time without a successful attempt.
- The recipient unlock page renders and functions with JavaScript disabled.
- A recipient can reply without an account, and the reply reaches the sender's vault.
- Share links are revocable, with residual exposure bounded by the five-minute signed-URL TTL.

---

## 3. Features Delivered

- Capsule sealing with date and age-milestone unlock conditions.
- Free-tier gates: three pending capsules, twelve-month horizon.
- Transactional seal with content immutability.
- Durable database-owned scheduler with claim-and-lock.
- Channel ladder (push then email) with day-scale backoff and full attempt logging.
- Delivery watchdog and monthly integrity sweep.
- Decade-durable delivery email.
- Server-rendered recipient unlock with ceremonial reveal and reply.
- Revocable share links and the "who can see this" panel.

---

## 4. Architecture Impact

- Introduces the delivery engine — the process that must still work in ten years.
- Extends `lib/authz` with its two remaining grant sources (§11.1).
- Populates the future-band source interface built in PHASE-03.
- Introduces the bespoke delivery-SLA monitor that ADR-020 calls "the most important alert page in the company".

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-05-01](module-01/MOD-05-01.md) | Capsule Creation & Sealing | Let an owner address a memory to people and a moment, and make that commitment structurally trustworthy. | critical | pending |
| [MOD-05-02](module-02/MOD-05-02.md) | Delivery Engine | Deliver every sealed capsule on time, prove it, and page a human the moment one is missed. | critical | pending |
| [MOD-05-03](module-03/MOD-05-03.md) | Recipient Experience | Deliver the memory in a way worthy of the wait, to someone with no account, in a browser we cannot predict. | critical | pending |
| [MOD-05-04](module-04/MOD-05-04.md) | Private Sharing | Let a user share one memory without exposing anything else, and take it back instantly. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-04

- **PHASE-04** must be complete: sealing a promise over media that might not have uploaded is not a promise.
- **PHASE-02** verified-email gate is enforced here at the seal action, honouring the §29.4 grace state.
- **External:** Resend with a verified domain plus AWS SES configured as a standing fallback (ADR-016).

---

## 7. Phase Deliverables

- Capsule, recipient, attempt, and reply schema scoped through `lib/authz`.
- Seal flow and capsule detail screens.
- Delivery worker, channel ladder, watchdog, integrity sweep.
- Decade-durable email template.
- `/c/[token]` and `/s/[token]` public pages.
- `docs/DELIVERY-GUARANTEE.md`.

---

## 8. Phase Acceptance Criteria

- [ ] Seal a capsule for sixty seconds from now; it arrives, opens, and the reply reaches the sender.
- [ ] Seal one for twenty years; the job row exists, the integrity sweep verifies it, and the watchdog would fire if it were missed.
- [ ] A failure injected between the capsule update and the job insert rolls back both — no sealed-but-unscheduled capsule can exist.
- [ ] A recipient with JavaScript disabled can open a delivered capsule and read the note.
- [ ] Pre-delivery, the recipient token cannot reach the media through any endpoint.
- [ ] Revoking a share link makes the next request fail, with media exposure bounded to the signed-URL TTL.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A sealed capsule silently never delivering | critical | Transactional seal, DB-owned schedule, claim-and-lock with expiry, full attempt log, hourly watchdog paging a human, monthly integrity sweep. Failure injection tested in PHASE-09. |
| Recipient cannot open the capsule in a future browser | high | `/c/[token]` server-rendered with no client components; email is table-based with inline CSS and a plain-text alternative; a test asserts the page works with JavaScript disabled. |
| Pre-delivery content leaking to the recipient | high | Enforced in `lib/authz` and at the signed-URL endpoint, not only in the UI; a security test asserts unreachability. |
| Delivery at 3am local time | medium | Humane window resolved at fire time, not seal time (gap G-3), because a recipient may move timezone over twenty years. |
| Capsule addressed to someone who has died | medium | Gap G-4: `Member.deceased_at` gates delivery and notifies the owner instead. Copy requires review before shipping. |
| Entitlement changes invalidating an existing promise | high | Entitlements evaluated at seal time only; §17.2 item 4 makes never cancelling for non-payment a written policy. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder seals a capsule to their own phone number for two minutes ahead, receives it, opens it, and replies
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§7.1 M8-M11`
- `§10 Capsule`
- `§11.4`
- `§18.4`
- `§29.15`
- `§29.16`
- `§29.24`
- `§34.6`
- `ADR-006`
- `ADR-016`
