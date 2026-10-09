# TASK-043 — Build Virtualised Timeline with Now Divider and Future Band

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-043 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-04 — Timeline & Discovery](../../../MOD-03-04.md) |
| Sprint | [SPR-03-04-01 — Timeline, Search & On This Day](../../SPR-03-04-01.md) |
| Epic | [EPIC-03-04-01-01 — Past → Present → Future Timeline](../EPIC-03-04-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-042`, `TASK-013` |
| Blueprint refs | `§29.12`, `§9.4` |

---

## 1. Objective

Build the timeline: cursor-paginated ranges, a virtualised list, a sticky scrubber, the Now divider, and the future band with a documented stub for capsules.

---

## 2. Context

Blueprint §29.12 specifies the view in detail, and its empty state is unusual and deliberate: "a stylised empty timeline showing the Now divider and a single prompt — visually communicating that the future band exists and is waiting".

---

## 3. Problem Statement

The future band is the product's identity. Building it now, empty, with a documented interface means PHASE-05 fills a surface that already exists and has already been designed — rather than bolting the differentiating feature onto a finished screen. The empty state matters for the same reason: a new user should see that the future exists before they have anything in it.

---

## 4. Expected Outcome

A timeline that scrolls a large archive smoothly, jumps to any year, shows a clear Now divider, and renders a future band that is visibly waiting for content.

---

## 5. Requirements

### Functional Requirements

- Cursor-paginated query by `occurred_at` within a vault.
- Virtualised windowed list with stable item heights.
- Sticky month/year scrubber with jump-to-year.
- Density toggle: year / month / day.
- A visually distinct Now divider.
- **Future band** rendering scheduled items above the divider, with a stub interface for capsules.
- Filter sheet: media type, favourites, occasion, has-voice-note, in-a-capsule.
- Deep link `?at=YYYY-MM` restoring scroll position.
- Offline: cached ranges served, uncached ranges clearly marked.
- Empty state showing the Now divider and the waiting future band.

### Technical Requirements

- Cursor pagination on `(vault_id, occurred_at)` using the PHASE-03 composite index.
- Prefetch adjacent ranges so scrolling does not stutter at a boundary.
- Stable heights: compute row height from item type before media loads.
- The future-band data source is an interface with one Release-1 implementation (scheduled memories, if any) and a documented second implementation slot for PHASE-05 capsules.

---

## 6. Implementation Instructions

1. Implement the range query in `features/timeline/queries.ts` with cursor pagination, scoped through authz.
2. Build the virtualised list. Derive row heights from item type and density so the scrollbar is stable and the scrubber maps accurately.
3. Build the sticky scrubber with year jump. On a long archive the scrubber is the primary navigation, so it must be accurate rather than approximate.
4. Implement the Now divider as a first-class list item, not a decoration, so virtualisation handles it correctly.
5. **Define `FutureBandSource` as an interface** in `features/timeline/future-band.ts`, with a comment naming the PHASE-05 task that adds the capsule implementation. Register the Release-1 source (future-dated memories). Do not special-case capsules in the list component.
6. Implement the density toggle, recomputing heights per density.
7. Implement the filter sheet, sharing filter state with the gallery so switching views keeps the filter.
8. Implement `?at=YYYY-MM` deep linking, including restoring position on back navigation.
9. Implement the offline behaviour: serve cached ranges, and mark uncached ones explicitly rather than showing an empty stretch.
10. Build the empty state per §29.12 — the Now divider with the future band visibly waiting.
11. Benchmark: 2,000 items, throttled mid-range profile, measure dropped frames and record the number in §20.

---

## 7. Architecture

```text
             ┌─────────────────────────┐
   FUTURE    │  sealed capsules  [stub → PHASE-05]
             │  future-dated memories
             ├───── NOW ───────────────┤  ← first-class list item
             │  this month
   PAST      │  earlier months …        │  ← cursor-paginated, virtualised
             └─────────────────────────┘

FutureBandSource (interface)
  ├─ FutureMemoriesSource      (Release 1)
  └─ SealedCapsulesSource      (PHASE-05 registers here)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/<ios|android>/features/timeline/page.tsx
apps/api/src/features/timeline/queries.ts
apps/api/src/features/timeline/components/Timeline.tsx
apps/api/src/features/timeline/components/Scrubber.tsx
apps/api/src/features/timeline/components/NowDivider.tsx
apps/api/src/features/timeline/future-band.ts
apps/api/src/features/timeline/components/FilterSheet.tsx
apps/api/src/features/timeline/__tests__/timeline.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.12.

Sticky scrubber at the top with the current period and a year jump. Rows grouped by month with sticky headers using precision-aware formatting.

**Now divider** — visually distinct, labelled, and unmissable. Above it, the future band; below it, the past.

**Empty state** — the distinctive one. Not "no memories": a stylised timeline with the Now divider drawn and the future band visible and empty, plus one prompt. The user should understand, before adding anything, that this product thinks about the future.

**Offline** — uncached ranges show a marked placeholder, so a gap reads as "not downloaded" rather than "nothing happened".

---

## 12. Business Rules

- The Now divider is a list item, not decoration.
- The future band is populated through the source interface; the list component knows nothing about capsules.
- Uncached offline ranges are marked, never silently empty.
- Dates use the precision formatter.

---

## 13. Edge Cases

- An archive with a single memory — the timeline must still show the Now divider and the future band.
- A memory dated far in the future — must appear in the future band without breaking the scrubber's scale.
- A vault with 20,000 memories — pagination and scrubber accuracy must hold; benchmark.
- A year with thousands of items at day density — the density toggle must remain usable.
- Deep link to a month with no content — land there and show the marked empty range, not a redirect.
- Filter that excludes everything — the filtered-empty state with clear-filters, not the first-run empty state.
- Rapid scrubbing — must not fire a request per frame; debounce and use buffered ranges.
- Back navigation from a memory — must restore the previous scroll position.

---

## 14. Error Handling

- A failed range shows a retry for that section only, leaving the rest of the timeline usable.

---

## 15. Security Considerations

- Vault-scoped through authz; the cursor must not be usable to page into another vault.

---

## 16. Testing Requirements

### Component Tests

- Cursor pagination returns correct, non-overlapping ranges.
- Now divider renders in the correct position.
- Future band renders from the source interface, with a mock source.
- Density toggle recomputes heights without scroll jump.
- Filtered-empty differs from first-run empty.
- Deep link restores position; back navigation restores scroll.
- Uncached offline range is marked.

### Accessibility Tests

- axe; the list is keyboard navigable; the scrubber is operable by keyboard; the Now divider is announced.

### Performance Tests

- **2,000 items on a throttled mid-range profile within the frame budget** — record the measurement.

---

## 17. Acceptance Criteria

- [ ] Timeline implemented per §29.12 with all five states in both themes.
- [ ] **Empty state shows the Now divider and the waiting future band.**
- [ ] Future band populated via a documented source interface with a PHASE-05 slot.
- [ ] Scrubber accurate; deep links and back navigation restore position.
- [ ] Density toggle works without scroll jump.
- [ ] Offline uncached ranges marked.
- [ ] 2,000-item benchmark met and recorded in §20.
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
TASK-042
    ↓
TASK-013
    ↓
TASK-043
```


---

## 20. Implementation Notes

- The source-interface pattern is what makes PHASE-05 an addition rather than a rewrite. Do not let capsule knowledge leak into the list component.
- Record the benchmark number. PHASE-09 will regression-test against it.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-04-01-01](../EPIC-03-04-01-01.md).
3. Read the parent Sprint — [SPR-03-04-01](../../SPR-03-04-01.md).
4. Read the parent Module — [MOD-03-04](../../../MOD-03-04.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.12`, `§9.4` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
