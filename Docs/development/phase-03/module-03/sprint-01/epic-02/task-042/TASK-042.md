# TASK-042 — Build Memory Detail Viewer and Gallery Grid

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-042 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-03 — Memories](../../../MOD-03-03.md) |
| Sprint | [SPR-03-03-01 — Memory Model, CRUD & Screens](../../SPR-03-03-01.md) |
| Epic | [EPIC-03-03-01-02 — Memory Screens](../EPIC-03-03-01-02.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-040`, `TASK-013` |
| Blueprint refs | `§29.10`, `§29.6` |

---

## 1. Objective

Build the full-screen memory detail viewer and the virtualised gallery grid with multi-select.

---

## 2. Context

Blueprint §29.10 specifies the viewer (full-bleed, swipeable, pinch-zoom, note and precision-formatted date, chips, overflow menu, native share) and §29.6 the grid (virtualised, sticky date headers, blurhash placeholders, **stable-height grid with zero layout shift**).

---

## 3. Problem Statement

Zero layout shift is called out explicitly because a memory grid that jumps while thumbnails load feels broken, and on a long archive it makes scrolling unusable. The blurhash-first strategy from §12.3 is what makes it possible, and the PHASE-01 skeleton geometry test is what keeps it honest.

---

## 4. Expected Outcome

A viewer where a memory can be experienced properly, and a grid that scrolls a large archive smoothly with no reflow.

---

## 5. Requirements

### Functional Requirements

- Viewer: full-bleed media, swipe between assets, pinch-zoom images, video and audio players.
- Title, precision-formatted date, note, people and occasion chips.
- Overflow menu: edit, favourite, add to album, download, seal (hidden until PHASE-05), delete.
- Native Web Share.
- Grid: virtualised, sticky date headers, blurhash placeholders, multi-select with a batch action bar.
- Deleted memory shows a gentle explanatory page, not a raw 404.

### Technical Requirements

- Progressive load: blurhash → thumb → preview → original (§12.3). The note text renders first, before any media.
- Grid uses fixed aspect-ratio cells so heights are known before media loads — this is what delivers zero layout shift.
- Multi-select state survives scrolling in a virtualised list.
- Dates rendered exclusively through the precision formatter.

---

## 6. Implementation Instructions

1. Build the viewer at `/app/memory/[id]`. Render the note and date **first**, then media — so a slow connection shows meaning before pixels.
2. Implement swipe between assets and pinch-zoom for images. Use the platform gesture where possible rather than reimplementing inertia.
3. Wire the overflow menu, hiding the seal action until PHASE-05 via release gating.
4. Build the grid with fixed aspect-ratio cells and blurhash placeholders. Verify zero layout shift by measuring CLS with throttled media loading, not just by eye.
5. Implement multi-select with a batch bar. Keep selection in a store rather than component state so virtualisation cannot drop it.
6. Add sticky date headers using the precision formatter for the header labels.
7. Implement the deleted-memory state as a designed page.
8. Use signed-URL-tolerant image components: an expired URL falls back rather than showing a broken image (PHASE-04 supplies the URLs).

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
apps/<ios|android>/features/memory/[id]/page.tsx
apps/<ios|android>/features/gallery/page.tsx
apps/api/src/features/memory/components/MemoryViewer.tsx
apps/api/src/features/memory/components/MemoryGrid.tsx
apps/api/src/features/memory/components/MemoryOverflowMenu.tsx
apps/site/src/stores/selection.ts
apps/api/src/features/memory/__tests__/grid.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Viewer** — full-bleed media, minimal chrome that fades, then title, precision-formatted date, and note. Chips below. Overflow top-right.

Note and date render before media, so a slow connection shows the meaning first.

**Grid** — responsive columns, fixed aspect ratio, blurhash placeholder, type badge (🎥 🎙️ 🖼️), lock icon on capsule members. Sticky date headers. Multi-select via long-press or a select mode, with a batch bar.

**Deleted state** — a warm explanatory page ("This memory was deleted"), with a Trash link if within the window.

---

## 12. Business Rules

- Zero layout shift in the grid — fixed cell heights, always.
- Dates rendered only through the precision formatter.
- Note and date render before media.
- Unreleased actions are hidden, not disabled.

---

## 13. Edge Cases

- A memory with no media (a note-only memory) — must render well; this is a legitimate and valuable case.
- A memory whose media is still transcoding — show a processing state, not a broken player.
- An expired signed URL — fall back to the blurhash rather than a broken image icon.
- A 5,000-item grid — virtualisation must keep scrolling smooth; measure on a mid-range Android.
- Multi-select of 200 items then a batch delete — confirm with a count and handle partial failure.
- Pinch-zoom on a very large image — must not exhaust memory; load the preview rather than the original for zoom until a threshold.
- Swipe between assets where one fails to load — must not block the swipe.
- A year-precision memory in a sticky date header — must render "1998", not "1 January 1998".

---

## 14. Error Handling

- A media failure shows an inline retry on that asset only, never replacing the whole memory.

---

## 15. Security Considerations

- Signed URLs only; never a public object URL (§12.5).
- Download respects the matrix cell for download rights.

---

## 16. Testing Requirements

### Component Tests

- **CLS is zero with throttled media loading** — measured, not assumed.
- Note and date render before media.
- Multi-select survives virtualised scrolling.
- Sticky headers use precision formatting.
- Seal action hidden at Release 1.
- Note-only memory renders correctly.

### E2E Tests

- Open a memory, swipe assets, favourite it, and delete it; confirm the deleted state page.

### Accessibility Tests

- axe on both screens; the grid is keyboard navigable; media has accessible names.

### Performance Tests

- Scroll a 2,000-item grid on a throttled mid-range profile with no dropped frames beyond the agreed budget.

---

## 17. Acceptance Criteria

- [ ] Both screens implemented per §29.10 and §29.6, all five states, both themes.
- [ ] **Zero layout shift measured in the grid.**
- [ ] 2,000-item grid scrolls within the performance budget on a mid-range profile.
- [ ] Note and date render before media.
- [ ] Multi-select survives scrolling.
- [ ] Precision formatting used in headers and detail.
- [ ] Note-only memories render well.
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
TASK-040
    ↓
TASK-013
    ↓
TASK-042
```


---

## 20. Implementation Notes

- The performance benchmark is an acceptance criterion, not an aspiration. Run it on a throttled profile before marking this done.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-03-01-02](../EPIC-03-03-01-02.md).
3. Read the parent Sprint — [SPR-03-03-01](../../SPR-03-03-01.md).
4. Read the parent Module — [MOD-03-03](../../../MOD-03-03.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.10`, `§29.6` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
