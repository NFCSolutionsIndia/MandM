# TASK-052 — Build Upload Queue UI with Pause, Resume, Cancel and Retry

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-052 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-02 — Resumable Upload & Outbox](../../../MOD-04-02.md) |
| Sprint | [SPR-04-02-02 — Client Uploader, Outbox & Queue UI](../../SPR-04-02-02.md) |
| Epic | [EPIC-04-02-02-01 — Resumable Client Uploader & Outbox](../EPIC-04-02-02-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-051`, `TASK-013` |
| Blueprint refs | `§29.28`, `§29.14`, `§12.7` |

---

## 1. Objective

Build the visible upload queue tray with per-item progress and controls, plus the offline banner and honest pending states.

---

## 2. Context

Blueprint §29.28 requires an "offline banner + queued-actions tray (\"2 memories will upload when you're back online\") with per-item retry", and §12.7 requires "a persistent, honest queue UI".

---

## 3. Problem Statement

The queue is how the durability promise becomes visible. A user who can see that two items are waiting, and that the app knows about them, will close the app confidently. A user with no visibility assumes the worst and either waits, staring, or loses trust.

---

## 4. Expected Outcome

A tray reachable from anywhere in the app showing every pending item with real progress and working controls, plus a global offline banner.

---

## 5. Requirements

### Functional Requirements

- Tray listing items with thumbnail, name, state, progress, and byte counts.
- Per-item pause, resume, cancel, retry.
- Global pause-all.
- Badge on the app shell showing the pending count.
- Offline banner with the §29.28 copy.
- Persistence warning when denied.
- Completed items fade out rather than vanishing abruptly.

### Technical Requirements

- Progress read from the outbox so it survives navigation and unmount.
- Tray implemented as a sheet so it can open over any screen.
- Uses the PHASE-01 upload Progress variant, which already exposes pause, cancel, and retry.
- Live region announcing state changes coarsely, not per percent.

---

## 6. Implementation Instructions

1. Build the tray as a sheet reachable from a persistent indicator in the app shell.
2. Render items from the outbox with the PHASE-01 upload progress component.
3. Wire the four per-item controls plus pause-all.
4. Add the pending-count badge to the shell, and consider the Badging API for the installed icon (PHASE-06 wires that; note the handoff).
5. Build the offline banner using the §29.28 copy, and make sure it distinguishes "offline" from "failed" (§33.14 — offline is a state, not an error).
6. Surface the persistence warning as a dismissible but recurring notice, since it materially changes the durability guarantee.
7. Announce state changes to assistive technology coarsely: "2 items uploading" rather than a percentage stream.
8. Handle the completed state gracefully — a brief confirmation then removal, so the tray does not accumulate history.

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
apps/api/src/features/media/components/UploadTray.tsx
apps/api/src/features/media/components/UploadItem.tsx
apps/site/src/components/layout/OfflineBanner.tsx
apps/site/src/components/layout/UploadIndicator.tsx
apps/api/src/features/media/__tests__/upload-tray.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Indicator** — a small persistent element in the shell showing the pending count. Tapping opens the tray.

**Tray** — a sheet listing items:

```
Uploading 2 of 5
  ▓▓▓▓▓▓▓░░░  Ella's first steps.mov   68%  ·  142/210 MB   [pause] [cancel]
  ⏸ paused    Grandma's story.m4a       0%   ·   0/4 MB      [resume] [cancel]
  ⚠ failed    Beach 1998.jpg                                [retry]  [cancel]
```

**Offline banner** — "2 memories will upload when you're back online". Calm, informational, and clearly distinct from an error.

**Persistence warning** — "Your browser may clear unsent memories — connect to finish uploading" (§29.28).

---

## 12. Business Rules

- Offline is presented as a state, never as an error (§33.14).
- Progress is honest — confirmed bytes only.
- A failed item stays visible with a retry; it never disappears silently.
- State changes are announced coarsely, not per percent.

---

## 13. Edge Cases

- Twenty queued items — show a summary with an expandable list rather than a wall.
- An item failing while the tray is closed — the indicator must reflect it, and the count must distinguish failed from pending.
- Pause-all then going offline then coming back — resume must not silently override the user's pause.
- A cancelled item mid-part — abort promptly and reflect it immediately.
- Completed items arriving in quick succession — batch the confirmations rather than flashing five toasts.
- The tray open while an item completes — the row should resolve visibly, not jump out of the list.
- A screen reader with rapid progress updates — coarse announcements only.

---

## 14. Error Handling

- A failed item shows the reason in plain language and the appropriate action: retry, upgrade (quota), or acknowledge loss (missing blob).

---

## 15. Security Considerations

- File names are user content; render them as text and never as markup.

---

## 16. Testing Requirements

### Component Tests

- Items render per state with correct controls.
- Pause, resume, cancel, retry each invoke the outbox correctly.
- Pause-all is not overridden by reconnection.
- Offline banner copy matches §29.28 and is styled as a state, not an error.
- Persistence warning renders when denied.
- Coarse live-region announcements, not per-percent.

### E2E Tests

- Queue three items offline, see the banner and count, reconnect, and watch all three complete with the tray resolving.

### Accessibility Tests

- axe on the tray; controls have accessible names; progress is exposed as text as well as visually.

---

## 17. Acceptance Criteria

- [ ] Tray implemented per §29.28 with all item states and four controls.
- [ ] Pending count badge in the shell.
- [ ] Offline banner distinguishes offline from failed.
- [ ] Persistence warning surfaced.
- [ ] Progress honest and survives navigation.
- [ ] Failed items persist with retry.
- [ ] Coarse announcements; axe clean.

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
TASK-051
    ↓
TASK-013
    ↓
TASK-052
```


---

## 20. Implementation Notes

- This UI is where the durability engineering becomes visible to the user. It is worth more polish than a typical status list.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-02-02-01](../EPIC-04-02-02-01.md).
3. Read the parent Sprint — [SPR-04-02-02](../../SPR-04-02-02.md).
4. Read the parent Module — [MOD-04-02](../../../MOD-04-02.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§29.28`, `§29.14`, `§12.7` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
