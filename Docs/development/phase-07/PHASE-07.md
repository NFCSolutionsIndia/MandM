# PHASE-07 — Notifications — Push, Email & The Trigger Matrix

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-07 |
| Phase name | Notifications — Push, Email & The Trigger Matrix |
| Release | Release 1 |
| Phase objective | Tell the user what matters, rarely, and never miss the one that counts. |
| Business objective | A scheduled-delivery product literally cannot function without notifications — and one that nags gets uninstalled. |
| Technical objective | APNs / FCM with APNs/FCM credentials, device lifecycle, the notification centre, per-channel preferences with quiet hours, and the §14 trigger matrix implemented as job kinds with a volume guardrail. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-06 |
| Estimated effort | ~1.5 weeks |
| Modules | 2 |
| Sprints | 2 |
| Epics | 2 |
| Tasks | 5 |
| Expected outcome | Every Release-1 trigger from blueprint §14 fires exactly once through the right channels, email always works as a fallback, and the mean volume stays under two per user per week. |

---

## 1. Phase Purpose

Blueprint §14 opens with the governing rule: **"be quiet."** A memory app that nags gets uninstalled, and every unnecessary notification devalues the one that actually matters — the arrival. The target is stated as a number: **fewer than four notifications per user per month outside deliveries.**

Three design decisions from §14.2 shape everything here:

**Email is the guaranteed channel.** Push subscriptions die — a browser reset, a replaced device, and on iOS the requirement that the apps be installed. Anything the user must not miss goes by email regardless of push state.

**Push is the delight channel.** Timely and dismissible, never the sole carrier of critical information.

**In-app is the complete record.** Everything the product ever sent is in the notification centre, so nothing is lost to a cleared tray.

The most valuable single notification in the product is also identified in §14.1: *"Recipient opened your capsule"* — sent immediately on first open. That is the moment a decades-old promise completes, and it is worth building carefully.

---

## 2. Phase Goals

- Push works on Android, desktop, and installed iOS PWAs, with email as an unconditional fallback.
- Every §14 Release-1 trigger fires exactly once, through the documented channels.
- Preferences work per type and per channel, with timezone-aware quiet hours.
- Security and billing notifications cannot be suppressed, and say so.
- The mean notification volume per user per week is measured and alerts above two.

---

## 3. Features Delivered

- APNs / FCM with APNs/FCM credentials and device lifecycle management.
- Native push handlers (APNs / FCM) with actions and deep links.
- Contextual permission request at first seal.
- Notification centre with grouping and read state.
- Per-type and per-channel preferences, quiet hours, digest mode.
- Email templates for every trigger, with bounce handling.
- Volume guardrail metric and alert.

---

## 4. Architecture Impact

- Introduces the `Notification` and `Device` entities and the notification dispatch layer every later feature enqueues into.
- Completes the badging wiring left open in PHASE-06.
- Supplies the transport the PHASE-05 delivery engine and PHASE-03 reminder jobs already enqueue into.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-07-01](module-01/MOD-07-01.md) | Push Infrastructure & Notification Centre | Deliver notifications reliably across channels and keep a complete in-app record of everything sent. | critical | pending |
| [MOD-07-02](module-02/MOD-07-02.md) | Trigger Matrix & Email Templates | Wire every Release-1 trigger to the dispatch layer with the right channels and timing, and prove the volume stays low. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-06

- **PHASE-06** store release must exist, because a push token is only issued to an installed app.
- **PHASE-05** delivery engine and **PHASE-03** reminder jobs already enqueue notifications; this phase delivers them.
- **PHASE-02** onboarding quiz produced the reminder-style mapping constant this phase consumes.

---

## 7. Phase Deliverables

- Push infrastructure
- Notification centre
- Preferences with quiet hours
- Email templates for every trigger
- Volume metric

---

## 8. Phase Acceptance Criteria

- [ ] A capsule delivery notifies the recipient by email unconditionally and by push where subscribed.
- [ ] First open notifies the sender immediately.
- [ ] Quiet hours defer a non-urgent notification into the user's morning.
- [ ] Disabling every optional type still delivers security and billing notifications.
- [ ] The volume metric is visible and alerts above the threshold.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Notification fatigue causing uninstalls | high | The §14 matrix is implemented exactly, with a hard weekly cap on On This Day and a measured volume metric that alerts above two per user per week. |
| Push failing silently on iOS, losing the delivery notification | critical | Email is unconditional for every critical trigger; dead subscriptions are pruned; install is promoted (PHASE-06). |
| A trigger firing twice | high | Every enqueue is idempotent by a natural key; the delivery watchdog and On This Day cap already model this pattern. |
| Private content leaking into a push payload | high | Payloads carry ids and a short title only; no note text or media. Asserted by test. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder receives a capsule delivery notification on their own installed phone, and the sender is told when they open it
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§14`
- `§9.5`
- `§29.8`
- `§29.27`
