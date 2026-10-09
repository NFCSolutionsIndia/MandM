# TASK-015 — Build Skeleton, Empty, and Error State Templates

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-015 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-02 — Design System Foundation](../../../MOD-01-02.md) |
| Sprint | [SPR-01-02-01 — Design Tokens, Primitives & App Shell](../../SPR-01-02-01.md) |
| Epic | [EPIC-01-02-01-02 — Core UI Primitives](../EPIC-01-02-01-02.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-010` |
| Blueprint refs | `§33.9`, `§29`, `§26.9` |

---

## 1. Objective

Build reusable skeleton, empty-state, and error-state templates so every list and screen in the product satisfies blueprint §33.9 without re-inventing them.

---

## 2. Context

Blueprint §33.9 is unambiguous: **every** list must have skeleton loading, an empty state with illustration and CTA, an error state with retry, and an end-of-list marker. Section §29 then specifies a distinct empty state for nearly every screen.

---

## 3. Problem Statement

Empty and error states are where a product either feels considered or feels unfinished, and they are the states most often skipped under time pressure. Making them templates — with a required CTA slot — makes the complete version cheaper to build than the incomplete one.

---

## 4. Expected Outcome

A `Skeleton` primitive plus composed skeletons for card, list-row, and grid layouts; an `EmptyState` taking illustration, headline, body, and a required primary action; an `ErrorState` with a retry handler; and an `EndOfList` marker.

---

## 5. Requirements

### Functional Requirements

- Skeleton with shimmer, respecting reduced motion (static tint instead of animation).
- Composed skeletons matching the real card, row, and grid geometry so there is no layout shift when content arrives.
- EmptyState with slots for illustration, headline, supporting copy, primary action, and optional secondary action.
- ErrorState with a message, a retry button, and an optional detail disclosure.
- EndOfList marker for finite lists.
- An offline variant of ErrorState distinguishing "you are offline" from "this failed".

### Technical Requirements

- Skeleton geometry must match the loaded component's dimensions — verified by a test comparing rendered heights, because §29.6 requires a stable-height grid with zero layout shift.
- EmptyState requires a primary action by type — an empty state with no way forward is a dead end and the type system should prevent it.
- ErrorState retry receives the original request context so retry is genuine, not a page reload.

---

## 6. Implementation Instructions

1. Build `Skeleton` as a token-driven shimmer block with width, height, and radius props. Under `prefers-reduced-motion`, render a static tint rather than an animation.
2. Build `CardSkeleton`, `ListRowSkeleton`, and `GridSkeleton` that mirror the geometry of the real components. Write a test asserting the skeleton and loaded heights match within a tolerance — this is what prevents the layout shift §29.6 forbids.
3. Build `EmptyState` with a **required** `primaryAction` prop. Include an `illustration` slot; commit simple, warm SVG placeholders now and let design replace them, so no screen ships with a blank area.
4. Build `ErrorState` with `message`, `onRetry`, and an optional collapsible detail. Add an `offline` variant whose copy states that cached content is shown and new items will sync (§29.7).
5. Build `EndOfList` — a quiet marker, not a loud banner.
6. Write usage notes showing the four states of a single list side by side, so the pattern is obvious to anyone building a new screen.

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
apps/site/src/components/ui/Skeleton.tsx
apps/site/src/components/ui/skeletons/CardSkeleton.tsx
apps/site/src/components/ui/skeletons/ListRowSkeleton.tsx
apps/site/src/components/ui/skeletons/GridSkeleton.tsx
apps/site/src/components/ui/EmptyState.tsx
apps/site/src/components/ui/ErrorState.tsx
apps/site/src/components/ui/EndOfList.tsx
apps/site/src/components/illustrations/  (placeholder SVGs)
apps/site/src/components/ui/__tests__/states.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**EmptyState** — centred illustration, headline in Fraunces, one or two lines of warm supporting copy, then a primary button and optional secondary text link. Copy is warm and second person, never a bare "No data" (§33.11).

Reference copy from the blueprint, to be used verbatim where specified:

- Home, new user: "Your memory box is empty — let's create your first one" (§29.7)
- Timeline: a stylised empty timeline showing the Now divider, so the future band is visible as something waiting (§29.12)
- Notifications: "Nothing new — we will tell you when something arrives" (§29.8)
- Members: "Add the people who matter — we will help you remember their milestones" (§29.11)

**ErrorState** — icon, a message saying what failed and what to do, a retry button, optional details. The offline variant reads "Showing your saved memories — new items will sync" (§29.7).

---

## 12. Business Rules

- Every list uses all four states. A screen shipped without them fails review (§33.9).
- An EmptyState must always offer a way forward.
- Offline is a distinct state, not an error (§33.14). Never show a failure message for a working offline experience.
- Error copy says what is wrong and what to do (§33.2).

---

## 13. Edge Cases

- A list that is empty because a filter excluded everything — this is a different empty state from a genuinely empty collection, and it must offer "clear filters" rather than "create your first" (§29.6, §29.9).
- An error after partial data has loaded — show the loaded items plus an inline retry for the failed portion, never replace loaded content with a full-screen error.
- Offline with cached content available — show the content with a banner, not an error.
- A skeleton that renders longer than a second or two feels broken; consider a secondary message after a threshold.
- An illustration missing in dark mode — the placeholder SVGs must use tokens, not baked colours.

---

## 14. Error Handling

- This task defines error presentation; its own failure mode is a missing retry handler, which the type system should prevent.

---

## 15. Security Considerations

- Error details disclosure must never expose a stack trace, a query, or an internal identifier to an end user.

---

## 16. Testing Requirements

### Component Tests

- Skeleton height matches the loaded component height within tolerance for card, row, and grid.
- Reduced motion renders a static skeleton with no animation.
- EmptyState requires a primary action (type-level test).
- ErrorState retry invokes the supplied handler.
- Offline variant renders distinct copy from the error variant.
- Filtered-empty renders a clear-filters action rather than a create action.

### Accessibility Tests

- Skeletons are hidden from assistive technology or announced as "loading", not read as content.
- axe on all state templates.

---

## 17. Acceptance Criteria

- [x] Skeleton, EmptyState, ErrorState, and EndOfList implemented in both themes.
- [x] Skeleton geometry matches loaded geometry, proven by test.
- [x] EmptyState cannot be constructed without a primary action.
- [x] Offline variant distinct from the error variant.
- [x] Filtered-empty distinct from truly-empty.
- [x] Placeholder illustrations use tokens and render correctly in dark mode.
- [x] axe clean; skeletons not read as content.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally and in CI
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-010
    ↓
TASK-015
```


---

## 20. Implementation Notes

Completed 2026-09-02. `States.tsx` (Skeleton, SkeletonRegion, EmptyState, ErrorState, EndOfList) and `skeletons/` (geometry, CardSkeleton, ListRowSkeleton, GridSkeleton) are in `apps/site/src/components/ui/`; tests in `__tests__/display.test.tsx` and the geometry case in `e2e/a11y.spec.ts`.

**The skeleton and the loaded card share one shell, rather than agreeing on a number.** Two components that separately try to be 148px tall will drift the first time either is edited, and the drift is invisible in review — you notice it as content "jumping" a month later and never connect it to the padding change that caused it. `skeletons/geometry.tsx` owns the box; PHASE-03 builds the real `MemoryCard` *inside* `CardShell`, not beside it.

**The height test had to run in a browser.** jsdom reports every box as 0×0, so a height comparison there passes trivially and proves nothing — exactly the false reassurance §29.6 cannot afford. `e2e/a11y.spec.ts` measures both after `document.fonts.ready` (the fallback font gives different line boxes) and allows 1px of sub-pixel rounding and no more.

**`SkeletonRegion` had an `aria-label` on a plain `<div>`, and announced nothing.** ARIA prohibits an accessible name on a generic element — it is discarded. The loading state looked announced and was silent. The label now lives in a visually-hidden `role="status"`, which is polite and atomic, so the phrase is read once when it appears and the region falls silent when it empties. Caught by axe in the browser; the jsdom suite never looked at it.

**`EmptyState` cannot be constructed without a primary action** — enforced by the type, not by review. An empty state with no way forward is a dead end. `filtered` distinguishes "you have no memories yet" from "nothing matches this filter": offering "Add your first memory" to someone whose search returned nothing answers a question they did not ask.

**`ErrorState` distinguishes offline from failed.** They are different problems with different fixes, and "something went wrong" to someone in a tunnel is unhelpful and slightly insulting. `navigator.onLine` is read in an effect, not during render — it does not exist on the server and guessing would cause a hydration mismatch.

Illustrations are `currentColor` and tokens only. A baked-in hex is how an empty state becomes a bright white rectangle on a dark page; asserted by test.

**Deviation — file layout.** §8 proposes `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `EndOfList.tsx` and `components/illustrations/`. The four states are one file, `States.tsx`, because they are one vocabulary and are almost always read together; the composed skeletons are `skeletons/`. The placeholder illustration is a token-only SVG inside `States.tsx` rather than a separate directory — when design replaces it, the `illustration` slot is already there.

The four states of one list are rendered side by side at `/design/components` (§6.6), which is also what the geometry test measures.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-02-01-02](../EPIC-01-02-01-02.md).
3. Read the parent Sprint — [SPR-01-02-01](../../SPR-01-02-01.md).
4. Read the parent Module — [MOD-01-02](../../../MOD-01-02.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§33.9`, `§29`, `§26.9` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
completed
```

Allowed statuses: `pending` · `progress` · `completed`
