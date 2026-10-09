# TASK-079 — Implement Release-1 Notification Triggers with Once-Only Guarantees

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-079 |
| Phase | [PHASE-07 — Notifications — Push, Email & The Trigger Matrix](../../../../PHASE-07.md) |
| Module | [MOD-07-02 — Trigger Matrix & Email Templates](../../../MOD-07-02.md) |
| Sprint | [SPR-07-02-01 — Trigger Implementation & Volume Guardrail](../../SPR-07-02-01.md) |
| Epic | [EPIC-07-02-01-01 — Release-1 Trigger Matrix & Email Templates](../EPIC-07-02-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-077` |
| Blueprint refs | `§14.1`, `§14.3` |

---

## 1. Objective

Wire every Release-1 trigger from the §14 matrix to the dispatch layer, with the documented channels and timing and a once-only guarantee for each.

---

## 2. Context

Blueprint §14.1 gives the full matrix with per-channel columns and exact timing. Several triggers are already enqueued by earlier phases (delivery, open, reply from PHASE-05; On This Day and event reminders from PHASE-03); this task completes the set and verifies each one.

---

## 3. Problem Statement

The matrix is precise about things that are easy to get wrong: On This Day is capped at once per week, the shared-vault trigger is digest-only, and the "delivering in 7 days" reminder fires exactly once. Each of these, implemented casually, becomes a source of fatigue.

---

## 4. Expected Outcome

Every Release-1 trigger implemented, each with a test asserting its channels and that it fires exactly once.

---

## 5. Requirements

### Functional Requirements

- Delivery-related: capsule delivered (in-app, push, **email always**), capsule opened, reply received, delivery failed (actionable), delivering in 7 days (once).
- Discovery: On This Day (once per week maximum, 09:00 local).
- System: upload finished when backgrounded, storage 90% and 100%, new-device sign-in (non-suppressible), credential change (non-suppressible), payment failed (non-suppressible, then day 3 and day 7).
- Sharing: share link first viewed only.

### Technical Requirements

- Each trigger has a registry entry; the call site or job kind references it.
- Natural keys chosen per trigger so retries and restarts cannot double-send: for example capsule id plus type for delivery, user id plus ISO week for On This Day.
- The 7-day reminder is guarded so an edited unlock date does not fire it twice.
- Payment-failure dunning uses a schedule, not three separate triggers.

---

## 6. Implementation Instructions

1. Add every trigger to the registry with its channels, criticality, and suppressibility from the §14 table. Transcribe rather than interpret.
2. Wire the PHASE-05 delivery engine's enqueues to the real dispatch, replacing any interim stub.
3. Implement the 7-day reminder as a job kind derived from `unlock_at`, with a guard so a rescheduled capsule does not re-fire.
4. Verify the On This Day weekly cap end to end, since PHASE-03 built the job and this task supplies the transport.
5. Implement the storage-threshold triggers at 90% and 100%, each once per threshold crossing rather than per upload.
6. Implement the non-suppressible security and billing triggers.
7. Implement the share-first-view trigger, firing on the first view only.
8. **Write one test per trigger** asserting the channel set and that a second invocation does not re-send.

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
packages/shared/src/notifications/registry.ts  (complete the matrix)
apps/workers/src/handlers/capsule-reminder.ts
apps/api/src/lib/notifications/triggers/  (call-site helpers)
apps/api/src/lib/notifications/__tests__/triggers.test.ts
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

- Every trigger has a registry entry; none is dispatched ad hoc.
- On This Day is capped at once per week (§14.1).
- The 7-day reminder fires exactly once, even if the unlock date is edited.
- Storage thresholds fire per crossing, not per upload.
- Security and billing triggers are non-suppressible.

---

## 13. Edge Cases

- A capsule rescheduled after its 7-day reminder fired — decide and document whether a new reminder fires for the new date; recommend yes, with the guard keyed on the specific unlock date.
- A user crossing 90% storage, deleting, and crossing again — fire again, because the situation genuinely recurred.
- A capsule delivered to five recipients — one sender notification, not five.
- Several replies in a day — batched, per the PHASE-05 note.
- A user signing in from a new device repeatedly (private browsing) — decide whether to throttle; a security notification per session would be noise, but suppressing it weakens the control. Document the choice.
- A payment failure resolved before day 3 — cancel the remaining dunning notifications.
- A share viewed by the same person twice — first view only.
- On This Day when the user already opened the app and saw the card — decide whether to suppress the push; recommend yes, and document it.

---

## 14. Error Handling

- A trigger that fails to dispatch must be retried, and a repeated failure on a critical type must alert.

---

## 15. Security Considerations

- Non-suppressible types enforced by the registry.
- No content in payloads.

---

## 16. Testing Requirements

### Unit Tests

- **One test per trigger: correct channel set, and a second invocation does not re-send.**

### Integration Tests

- Delivery to five recipients produces one sender notification.
- Rescheduled capsule reminder behaves per the documented decision.
- Storage threshold re-fires after a genuine re-crossing.
- Resolved payment cancels remaining dunning.
- On This Day weekly cap holds across a restart.

---

## 17. Acceptance Criteria

- [ ] Every Release-1 trigger implemented with registry entries transcribed from §14.1.
- [ ] One passing test per trigger for channels and once-only.
- [ ] PHASE-05 and PHASE-03 enqueues now reach real dispatch.
- [ ] 7-day reminder guard correct.
- [ ] Storage thresholds per crossing.
- [ ] Non-suppressible types enforced.
- [ ] All documented edge-case decisions recorded in §20.

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
TASK-077
    ↓
TASK-079
```


---

## 20. Implementation Notes

- Transcribe the §14 table; do not improve it while implementing. If a row looks wrong, raise it rather than changing it silently.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-07-02-01-01](../EPIC-07-02-01-01.md).
3. Read the parent Sprint — [SPR-07-02-01](../../SPR-07-02-01.md).
4. Read the parent Module — [MOD-07-02](../../../MOD-07-02.md).
5. Read the parent Phase — [PHASE-07](../../../../PHASE-07.md).
6. Read the relevant blueprint sections: `§14.1`, `§14.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
