# TASK-076 — Implement APNs / FCM Subscription, Device Lifecycle and SW Handler

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-076 |
| Phase | [PHASE-07 — Notifications — Push, Email & The Trigger Matrix](../../../../PHASE-07.md) |
| Module | [MOD-07-01 — Push infrastructure (APNs/FCM) & notification centre](../../../MOD-07-01.md) |
| Sprint | [SPR-07-01-01 — Push Transport, Notification Centre & Preferences](../../SPR-07-01-01.md) |
| Epic | [EPIC-07-01-01-01 — APNs & FCM infrastructure and dispatch layer](../EPIC-07-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-072`, `TASK-017` |
| Blueprint refs | `§9.5`, `§29.0`, `§14.2` |

---

## 1. Objective

Generate APNs/FCM credentials keys, build subscribe/refresh/unsubscribe endpoints, store devices, prune dead endpoints, and handle push in the background sync layer with actions and deep links.

---

## 2. Context

Blueprint §9.5: "APNs / FCM with APNs/FCM credentials, subscriptions stored per device, encrypted payloads. Handled in the background sync layer with actionable buttons and deep links. iOS 16.4+ supports APNs / FCM **only for installed PWAs**."

---

## 3. Problem Statement

Push subscriptions are fragile — they expire, get revoked, and die when a device is replaced. A subscription table that is never pruned quietly accumulates dead endpoints, wastes send attempts, and makes delivery-rate metrics meaningless. Pruning is what keeps the numbers honest.

---

## 4. Expected Outcome

Working push on Android, desktop, and installed iOS PWAs, with dead subscriptions pruned automatically and a background-sync handler that deep-links correctly.

---

## 5. Requirements

### Functional Requirements

- Registration endpoint storing the device token, push provider (apns/fcm), bundle id, platform and app version.
- Refresh on `pushsubscriptionchange`.
- Unsubscribe endpoint.
- Prune endpoints after repeated 404/410 responses.
- Native notification handlers rendering title, body, icon and actions on both platforms.
- `notificationclick` focusing an existing client or opening the deep link.

### Technical Requirements

- APNs/FCM credentials keys in environment configuration; the private key is a secret.
- Payloads encrypted by the push library; **the payload carries ids and a short title only** — never note text, media, or an email address.
- A 404 or 410 from the push service marks the device dead immediately; other failures increment a counter.
- Platform and app version recorded on the device row, so iOS coverage can be measured.

---

## 6. Implementation Instructions

1. Generate APNs/FCM credentials keys and store the private key as a secret; expose the public key to the client.
2. Implement subscribe, refresh, and unsubscribe endpoints writing to the `devices` table with Scoped by `user_id` through `lib/authz`.
3. Implement the background-sync `push` handler: parse the payload, show the notification with actions, and handle `notificationclick` by focusing an existing window if one is open (per §9.5) or opening the deep link.
4. Implement pruning: mark dead on 404/410, increment `failure_count` otherwise, and remove after a threshold.
5. Record `is_installed_pwa` so iOS push coverage is measurable — this number matters, because it bounds how many iOS users can receive a push at all.
6. **Write the payload assertion test:** enqueue a notification for a memory with a note, and assert the push payload contains no note text.
7. Verify on a real iOS device. This is the platform most likely to fail silently.

---

## 7. Architecture

```text
client                          API                       push service
  subscribe ─────────────────▶ devices row (scoped)
  pushsubscriptionchange ────▶ refresh
                               dispatch ──────────────────▶ encrypted payload
                                 (ids + short title only)        │
background sync layer  ◀───────────────────────────────────────── push │
  ├─ show notification (actions, deep link)
  └─ notificationclick → focus existing client, else open link

404/410 from push service ──▶ mark device dead, prune
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/app/api/push/subscribe/route.ts
apps/site/src/app/api/push/unsubscribe/route.ts
apps/api/src/lib/push/send.ts
apps/api/src/lib/push/prune.ts
apps/site/src/sw/push-handler.ts
packages/db/src/schema/notification.ts
packages/db/migrations/0013_notifications.sql
apps/api/src/lib/push/__tests__/payload.test.ts
```

---

## 9. Data Model

`devices` per §10: id, user_id, endpoint, p256dh, auth, user_agent, platform, is_installed_pwa, last_success_at, failure_count, created_at. Scoped by `user_id` through `lib/authz`.

`notifications` per §10: id, user_id, type, payload (JSON), deep_link, read_at, created_at, channels_sent (JSON). Scoped by `user_id` through `lib/authz`.

**`is_installed_pwa` is a metric, not decoration.** iOS push requires installation, so this column is how push coverage on iOS is measured — and it directly informs how hard install needs to be promoted.

**Payload discipline:** the push payload carries a type, an id, a deep link, and a short human title. It never carries note text, media, or an email address. A push payload passes through a third-party service and is stored in an OS notification tray.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **No note text, media, or contact address in a push payload.**
- A 404 or 410 marks the device dead immediately.
- Push never carries information that only exists in the push (§14.2) — the in-app record and email carry it.
- `notificationclick` focuses an existing client rather than opening a duplicate.

---

## 13. Edge Cases

- iOS Safari not installed — subscription is impossible; the client must not present the permission prompt at all, and email must cover the user entirely.
- A subscription expiring silently — pruning on 410 catches it; the user should be re-prompted at a sensible moment rather than silently losing push.
- A user with five devices — all receive the push; deduplicate at the user level for read state, not at the device level.
- A push arriving while the app is open — decide whether to show the OS notification or an in-app toast; recommend in-app when focused, and document it.
- `notificationclick` when the app is open on a different route — focus and navigate, do not open a second window.
- A payload exceeding the push size limit — truncate the title, never the deep link.
- A revoked permission — detect and stop attempting, prompting again only in context.

---

## 14. Error Handling

- A push send failure never blocks the enqueue; the notification is still recorded in-app and emailed where the type requires it.

---

## 15. Security Considerations

- APNs/FCM credentials private key is a secret.
- **Payload content discipline is a privacy control** — a push payload is visible on a lock screen.
- Devices are tenant-scoped; a user cannot enumerate another user's devices.

---

## 16. Testing Requirements

### Unit Tests

- Dead-endpoint detection on 404 and 410.
- **Payload for a memory with a note contains no note text.**
- Oversized payload truncates the title, not the link.

### Integration Tests

- Subscribe, send, receive, and prune lifecycle.
- Multiple devices all receive; read state is per user.

### E2E Tests

- A real iOS device receives an APNs push.

---

## 17. Acceptance Criteria

- [ ] Subscribe, refresh, unsubscribe, and prune all working.
- [ ] The push handler shows notifications with actions and deep-links correctly on both platforms.
- [ ] **Payload assertion test passes — no content in payloads.**
- [ ] `is_installed_pwa` recorded for coverage measurement.
- [ ] Verified on a real iOS device, against APNs.
- [ ] Uninstalled iOS never sees a permission prompt.

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
TASK-072
    ↓
TASK-017
    ↓
TASK-076
```


---

## 20. Implementation Notes

- Record iOS push coverage from `is_installed_pwa` once there is traffic. If it is low, install promotion needs work — and email is carrying the product.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-07-01-01-01](../EPIC-07-01-01-01.md).
3. Read the parent Sprint — [SPR-07-01-01](../../SPR-07-01-01.md).
4. Read the parent Module — [MOD-07-01](../../../MOD-07-01.md).
5. Read the parent Phase — [PHASE-07](../../../../PHASE-07.md).
6. Read the relevant blueprint sections: `§9.5`, `§29.0`, `§14.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
