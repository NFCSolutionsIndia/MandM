# TASK-077 — Build Notification Dispatch Layer with Preferences and Quiet Hours

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-077 |
| Phase | [PHASE-07 — Notifications — Push, Email & The Trigger Matrix](../../../../PHASE-07.md) |
| Module | [MOD-07-01 — Push infrastructure (APNs/FCM) & notification centre](../../../MOD-07-01.md) |
| Sprint | [SPR-07-01-01 — Push Transport, Notification Centre & Preferences](../../SPR-07-01-01.md) |
| Epic | [EPIC-07-01-01-01 — APNs & FCM infrastructure and dispatch layer](../EPIC-07-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-076`, `TASK-029` |
| Blueprint refs | `§14.2`, `§14.3`, `§29.27` |

---

## 1. Objective

Build the single dispatch function all features call: channel selection, preference filtering, quiet-hours deferral, non-suppressible enforcement, and the volume metric.

---

## 2. Context

Blueprint §14.3 specifies per-type and per-channel toggles, timezone-aware quiet hours, digest mode, and that "security and billing emails are not suppressible and this is stated plainly in settings". It also requires the volume metric: "notifications sent per user per week are tracked as a product health metric with an alert if the mean exceeds two."

---

## 3. Problem Statement

If each feature decides its own channels, the "be quiet" rule erodes one feature at a time and nobody notices until the uninstall rate moves. A single dispatch function makes the rules structural, and the volume metric makes violations visible.

---

## 4. Expected Outcome

One `dispatch()` entry point enforcing every §14 rule, consuming the reminder-style defaults from the PHASE-02 quiz, and emitting the volume metric.

---

## 5. Requirements

### Functional Requirements

- `dispatch({ userId, type, payload, deepLink })` selecting channels from the type's matrix row and the user's preferences.
- Always record the notification in-app.
- Email unconditionally for critical types regardless of push state.
- Quiet hours defer non-urgent types to the next allowed window in the user's timezone.
- Non-suppressible types (security, billing, delivery failure) bypass preferences.
- Digest mode batches eligible types.
- Idempotent by a natural key so a retry cannot double-send.
- Emit the per-user weekly volume metric.

### Technical Requirements

- Preference defaults seeded from the reminder-style mapping constant created in PHASE-02.
- Quiet hours evaluated in the user's timezone against database time.
- The natural key for idempotency is type plus subject id plus period, depending on the type.
- Non-suppressible types are declared in the type registry, not decided per call.

---

## 6. Implementation Instructions

1. Create a type registry in `packages/shared` declaring, per notification type: default channels, whether it is critical (always email), whether it is suppressible, and whether it is quiet-hours-eligible. **This registry is the §14 matrix in code.**
2. Implement `dispatch()` reading the registry and the user's preferences. Record in-app always; then select channels.
3. Implement quiet-hours deferral: if the type is eligible and the current local time is outside the window, schedule for the next window rather than dropping.
4. Enforce non-suppressible types by checking the registry, not the preference row.
5. Implement digest batching for eligible types, so "new memory in a shared vault" never sends per item (§14.1 requires digest-only for that type).
6. Implement idempotency by natural key so a worker retry cannot double-send.
7. Seed a new user's preferences from the PHASE-02 quiz mapping, completing that contract.
8. Emit the volume metric per user per week and wire the alert above a mean of two.

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
packages/shared/src/notifications/registry.ts
apps/api/src/lib/notifications/dispatch.ts
apps/api/src/lib/notifications/quiet-hours.ts
apps/api/src/lib/notifications/digest.ts
apps/api/src/lib/notifications/__tests__/dispatch.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal lib/notifications/dispatch.ts
```

### Request

```json
{
  "userId": "uuid",
  "type": "capsule.opened",
  "payload": { "capsuleId": "uuid", "recipientName": "Ella" },
  "deepLink": "/app/capsule/uuid"
}
```

### Response

```json
{ "ok": true, "data": { "notificationId": "uuid", "channels": ["in_app", "push", "email"] } }
```

### Validation

- Type exists in the registry
- User exists and is not deleted
- Natural key not already dispatched

### Error Responses

| Status | Code | When |
|---|---|---|
| 409 | `NOTIFICATION_ALREADY_SENT` | Natural key already dispatched — treated as success |
| 422 | `NOTIFICATION_TYPE_UNKNOWN` | Type absent from the registry — a programming error |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Every notification in the product goes through `dispatch()`.** No feature sends directly.
- The in-app record is always written, so nothing is lost to a cleared tray (§14.2).
- Critical types always email, regardless of push state.
- Security and billing types cannot be suppressed, and settings says so.
- Quiet hours defer, never drop.
- Digest-only types never send per item.

---

## 13. Edge Cases

- A user with quiet hours covering 24 hours — treat as a digest preference rather than silence, or the delivery notification never arrives; decide and document.
- A critical notification during quiet hours — critical types are not quiet-hours-eligible; verify that capsule delivery is classified correctly.
- A user in a timezone that changed since their preference was set — evaluate against the current timezone.
- A retry after a partial send (in-app written, email failed) — the natural key must not block the email retry; track per-channel state.
- A user who disabled every optional type — security and billing still arrive; assert this.
- Digest window crossing a DST boundary — absolute instants.
- A notification for a deleted user — skip cleanly.
- A type added to the registry without preference defaults — fail at build or test time, not at send time.

---

## 14. Error Handling

- A channel failure records per-channel state and retries that channel only; it never re-sends the channels that succeeded.

---

## 15. Security Considerations

- Non-suppressible enforcement is server-side.
- The dispatch layer must not log payload content beyond the type and ids.

---

## 16. Testing Requirements

### Unit Tests

- Registry drives channel selection.
- Critical type emails even with push subscribed and preferences off.
- **Security and billing types cannot be suppressed.**
- Quiet hours defer an eligible type to the next window.
- Digest-only type never sends per item.
- Idempotency by natural key.
- Per-channel retry does not re-send succeeded channels.
- A registry type missing defaults fails a test.

### Integration Tests

- New user preferences seeded from the PHASE-02 quiz mapping.
- Volume metric emitted and the alert threshold configurable.

---

## 17. Acceptance Criteria

- [ ] Single dispatch entry point; no feature sends directly.
- [ ] Registry encodes the §14 matrix.
- [ ] Critical types always email; non-suppressible types enforced server-side.
- [ ] Quiet hours defer in the user's timezone.
- [ ] Digest batching works for eligible types.
- [ ] Idempotent with per-channel retry.
- [ ] Preferences seeded from the quiet/on-point/minimal mapping.
- [ ] Volume metric emitted with an alert above a mean of two per week.

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
TASK-076
    ↓
TASK-029
    ↓
TASK-077
```


---

## 20. Implementation Notes

- The registry is the §14 matrix made executable. Adding a notification type should require declaring its channels, criticality, and suppressibility — the type system should force that.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-07-01-01-01](../EPIC-07-01-01-01.md).
3. Read the parent Sprint — [SPR-07-01-01](../../SPR-07-01-01.md).
4. Read the parent Module — [MOD-07-01](../../../MOD-07-01.md).
5. Read the parent Phase — [PHASE-07](../../../../PHASE-07.md).
6. Read the relevant blueprint sections: `§14.2`, `§14.3`, `§29.27` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
