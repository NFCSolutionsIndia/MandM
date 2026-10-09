# TASK-071 — Implement Web Share Target, Badging and Native Share

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-071 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-01 — Store release & platform integration](../../../MOD-06-01.md) |
| Sprint | [SPR-06-01-01 — Store listings, first launch & share extension](../../SPR-06-01-01.md) |
| Epic | [EPIC-06-01-01-01 — Store listings, icons & first-launch experience](../EPIC-06-01-01-01.md) |
| Type | frontend |
| Priority | medium |
| Status | pending |
| Dependencies | `TASK-069`, `TASK-041` |
| Blueprint refs | `§9.6`, `§28.1` |

---

## 1. Objective

Handle incoming shares from the OS share sheet into the create flow, add unread badging on the installed icon, and wire outbound native share.

---

## 2. Context

Blueprint §9.6 calls the share target "the single biggest capture-friction reduction available" — photos can be pushed *into* M&M from the OS share sheet rather than picked from inside the app.

---

## 3. Problem Statement

The natural flow for a user who just took a photo is to share it from the gallery, not to open another app and navigate to a picker. Supporting the share sheet meets the user where they already are, and it costs one route handler.

---

## 4. Expected Outcome

Photos and videos shared from the OS arrive staged in the create sheet; unread arrivals show on the installed icon; outbound sharing uses the native sheet where available.

---

## 5. Requirements

### Functional Requirements

- Share-target route accepting POST multipart with images and videos.
- Incoming files staged into the create flow via the PHASE-04 local store.
- Badging API showing unread arrival count on the installed icon.
- Outbound `navigator.share` with files where supported, falling back to copy-link.

### Technical Requirements

- The share-target handler must treat incoming files as untrusted: validate type and size before staging, exactly as the upload path does.
- Badging via `navigator.setAppBadge`, feature-detected (unavailable on iOS).
- Outbound share must degrade to copy-link without a broken button.

---

## 6. Implementation Instructions

1. Implement the share-target route handler. Read the multipart body, validate each file against the same allow-list as upload (**including rejecting SVG**), write accepted files to the local blob store, and redirect into `/app/new` with them staged.
2. Handle the signed-out case: stage the files, redirect to login with `next` pointing at the create flow, and restore the staged files afterwards. Losing a shared photo because the session expired would be a bad first impression.
3. Wire badging to the unread notification count once PHASE-07 provides it; until then, wire it to pending arrivals and note the handoff.
4. Implement outbound share using `navigator.share` with files where supported, and a copy-link fallback everywhere else, feature-detected via `lib/capabilities`.

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
apps/site/src/app/api/share-target/route.ts
apps/<ios|android>/features/notifications/badge
apps/api/src/features/sharing/components/NativeShareButton.tsx
apps/site/src/app/api/share-target/__tests__/share-target.test.ts
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

- Incoming shared files are untrusted and validated exactly like uploads, including SVG rejection.
- A signed-out share must not lose the files.
- Badging and native share are feature-detected; no dead buttons.

---

## 13. Edge Cases

- A share containing ten photos — all staged, respecting the twenty-file cap with the excess reported.
- A share of an unsupported type — rejected with a clear message rather than a blank create screen.
- A share while signed out — files preserved through the login redirect.
- A share while offline — files staged locally and queued; this is the happy path for the outbox.
- Badging unsupported (iOS) — omitted silently.
- `navigator.share` rejecting because the user cancelled — not an error.
- A share of a text or URL rather than a file — decide whether to accept it and record the choice; recommend ignoring non-media for now.

---

## 14. Error Handling

- A share-target failure must land the user somewhere sensible with an explanation, never on a blank page.

---

## 15. Security Considerations

- Validate every incoming file; the share sheet is an untrusted entry point into the app.

---

## 16. Testing Requirements

### API Tests

- Share target stages valid files; rejects SVG and unsupported types.
- Signed-out share preserves files through login.

### Component Tests

- Native share falls back to copy-link where unsupported; cancellation is not an error.

### E2E Tests

- Android: share two photos from the gallery into the app and confirm they appear staged in the create sheet.

---

## 17. Acceptance Criteria

- [ ] Share target ingests images and videos into the create flow.
- [ ] File validation matches the upload allow-list, including SVG rejection.
- [ ] Signed-out share preserves the files.
- [ ] Offline share stages and queues correctly.
- [ ] Badging feature-detected; native share falls back cleanly.
- [ ] Verified on a real Android device.

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
TASK-069
    ↓
TASK-041
    ↓
TASK-071
```


---

## 20. Implementation Notes

- The signed-out share path is the one most likely to be missed and the most annoying to hit as a user. Test it.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-01-01-01](../EPIC-06-01-01-01.md).
3. Read the parent Sprint — [SPR-06-01-01](../../SPR-06-01-01.md).
4. Read the parent Module — [MOD-06-01](../../../MOD-06-01.md).
5. Read the parent Phase — [PHASE-06](../../../../PHASE-06.md).
6. Read the relevant blueprint sections: `§9.6`, `§28.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
