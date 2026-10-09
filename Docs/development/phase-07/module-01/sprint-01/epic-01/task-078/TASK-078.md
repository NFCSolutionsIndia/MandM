# TASK-078 — Build Notification Centre and Preference Screens

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-078 |
| Phase | [PHASE-07 — Notifications — Push, Email & The Trigger Matrix](../../../../PHASE-07.md) |
| Module | [MOD-07-01 — Push infrastructure (APNs/FCM) & notification centre](../../../MOD-07-01.md) |
| Sprint | [SPR-07-01-01 — Push Transport, Notification Centre & Preferences](../../SPR-07-01-01.md) |
| Epic | [EPIC-07-01-01-01 — APNs & FCM infrastructure and dispatch layer](../EPIC-07-01-01-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-077`, `TASK-014` |
| Blueprint refs | `§29.8`, `§29.27`, `§14.3` |

---

## 1. Objective

Build the notification centre with grouping and read state, and the preferences screen with per-type and per-channel toggles and quiet hours.

---

## 2. Context

Blueprint §29.8 specifies grouping (Today / This Week / Earlier), typed icons, swipe to dismiss, mark-all-read, deep links, and — importantly — that non-suppressible categories "are shown with a lock icon and an explanatory line, rather than a toggle that appears broken".

---

## 3. Problem Statement

The centre is the complete record, which matters because OS notification trays get cleared and push gets dropped. The preferences screen matters because the honest presentation of non-suppressible types is a small trust signal that costs nothing and is usually got wrong.

---

## 4. Expected Outcome

A notification centre showing everything the product ever sent, and a preferences screen that is honest about what cannot be turned off.

---

## 5. Requirements

### Functional Requirements

- Centre: grouped Today / This Week / Earlier, typed icons, read state, swipe to dismiss, mark all read, deep links.
- Unread badge in the app shell and on the installed icon.
- Preferences: per-type × per-channel matrix, quiet-hours pickers, digest toggle.
- Non-suppressible types shown with a lock and an explanation, not a broken toggle.
- Empty state per §29.8.

### Technical Requirements

- Badging wired to the unread count, completing the PHASE-06 handoff.
- The preference matrix is generated from the notification registry, so a new type appears automatically.
- Quiet-hours pickers respect the user's locale for 12/24-hour display (§33.6).

---

## 6. Implementation Instructions

1. Build the centre with the three groups and typed icons. Deep links must land on the right screen — a delivery notification should open the capsule, not Home.
2. Implement read state, swipe-to-dismiss, and mark-all-read.
3. Wire the unread count to the shell badge and to the Badging API, completing PHASE-06.
4. **Generate the preference matrix from the registry** rather than hand-listing types, so adding a type cannot leave the settings screen out of date.
5. Render non-suppressible types with a lock icon and a one-line explanation ("We always email you about security and billing"). Do not render a disabled switch — that reads as a bug.
6. Build quiet-hours time pickers with locale-appropriate formatting and a clear statement of which timezone applies.
7. Implement the digest toggle.
8. Use the §29.8 empty-state copy: "Nothing new — we will tell you when something arrives".

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
apps/<ios|android>/features/notifications/page.tsx
apps/<ios|android>/features/settings/notifications/page.tsx
apps/api/src/features/notifications/components/NotificationList.tsx
apps/api/src/features/notifications/components/PreferenceMatrix.tsx
apps/api/src/features/notifications/components/QuietHoursPicker.tsx
apps/api/src/features/notifications/__tests__/preferences.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Centre** — grouped, typed icons, unread emphasis. Deep-link targets are specific: a delivery opens the capsule; a reaction opens the memory.

**Preferences** — a matrix of type × channel:

```
                        in-app   push   email
Capsule delivered          ✓      [x]    🔒 always
Someone opened it          ✓      [x]    [x]
On This Day                ✓      [x]     —
Security                   ✓       —     🔒 always
Billing                    ✓       —     🔒 always
```

Lock icons carry a one-line explanation, not a disabled switch.

**Quiet hours** — two time pickers with the timezone stated explicitly, because a user who travels will otherwise wonder.

**Empty state** — §29.8 copy verbatim.

---

## 12. Business Rules

- Non-suppressible types show a lock and an explanation, never a disabled toggle (§29.8).
- The preference matrix is generated from the registry.
- Deep links land on the specific object, not a generic screen.
- The centre is the complete record; nothing is ever removed by the system.

---

## 13. Edge Cases

- A notification whose target was deleted — the row remains but the link explains the target is gone rather than 404-ing.
- Hundreds of notifications — paginate with the grouping preserved.
- A new notification type shipped without a settings entry — impossible, because the matrix is generated; assert this with a test.
- Quiet hours spanning midnight — must work; test explicitly.
- Quiet hours set to a 24-hour span — handle per the TASK-077 decision.
- A user in a different timezone from when they set quiet hours — the stated timezone must update.
- Badging unsupported (iOS) — the shell badge still works.
- Swipe-to-dismiss on desktop — provide a keyboard and mouse equivalent.

---

## 14. Error Handling

- A failed preference save must revert the toggle visibly; a preference that appears saved but is not is worse than a visible failure.

---

## 15. Security Considerations

- Preferences are per user and tenant-scoped.
- The centre must not render notification payload content as markup.

---

## 16. Testing Requirements

### Component Tests

- Grouping renders correctly across the three buckets.
- Non-suppressible types render a lock and explanation, not a disabled switch.
- **Matrix is generated from the registry — adding a type to the registry adds a row.**
- Quiet hours spanning midnight is handled.
- Deep links target the specific object.
- Deleted target explains itself.

### E2E Tests

- Receive a notification, see it in the centre, tap it, land on the capsule, and confirm the unread count clears.

### Accessibility Tests

- axe on both screens; the matrix is a properly labelled group of controls; swipe has a keyboard equivalent.

---

## 17. Acceptance Criteria

- [ ] Centre implemented per §29.8, all five states, both themes.
- [ ] Unread badge in shell and via Badging API where supported.
- [ ] Preference matrix generated from the registry, proven by test.
- [ ] Non-suppressible types honestly presented.
- [ ] Quiet hours work across midnight with the timezone stated.
- [ ] Deep links specific and correct.
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
TASK-077
    ↓
TASK-014
    ↓
TASK-078
```


---

## 20. Implementation Notes

- Generating the matrix from the registry is what keeps settings and behaviour from drifting as Release 2 adds a dozen types.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-07-01-01-01](../EPIC-07-01-01-01.md).
3. Read the parent Sprint — [SPR-07-01-01](../../SPR-07-01-01.md).
4. Read the parent Module — [MOD-07-01](../../../MOD-07-01.md).
5. Read the parent Phase — [PHASE-07](../../../../PHASE-07.md).
6. Read the relevant blueprint sections: `§29.8`, `§29.27`, `§14.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
