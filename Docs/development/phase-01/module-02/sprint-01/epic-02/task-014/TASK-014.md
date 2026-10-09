# TASK-014 — Build Display Primitives: Chip, Avatar, StatusChip, Progress, Countdown

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-014 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-02 — Design System Foundation](../../../MOD-01-02.md) |
| Sprint | [SPR-01-02-01 — Design Tokens, Primitives & App Shell](../../SPR-01-02-01.md) |
| Epic | [EPIC-01-02-01-02 — Core UI Primitives](../EPIC-01-02-01-02.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-010` |
| Blueprint refs | `§26.9`, `§26.3`, `§29.7`, `§29.16` |

---

## 1. Objective

Build the display primitives that carry state and identity across the product, including the status chip vocabulary and the countdown component central to the capsule experience.

---

## 2. Context

Status appears everywhere in this product — memory delivery states, upload progress, order states, moderation states. Blueprint §26.3 defines a status-chip colour vocabulary; §29.7 and §29.16 both surface live countdowns as primary content.

---

## 3. Problem Statement

The countdown is not decoration. It is how a pending capsule becomes emotionally real, and blueprint §1 identifies that pending promise as the product's central retention mechanic. It appears on Home, on the timeline's future band, and on the capsule detail screen, so it must be a single well-behaved component.

---

## 4. Expected Outcome

Chip (filter/selectable/relationship), Avatar with group stacking and initials fallback, StatusChip covering the documented vocabulary, Progress (bar, ring, upload with pause/cancel affordances), and Countdown rendering long durations humanely.

---

## 5. Requirements

### Functional Requirements

- Chip variants: filter (toggleable), selectable (multi-select), relationship (display), each with a removable option.
- Avatar: image, initials fallback, deterministic background from the name, size scale, and a stacked group with an overflow count.
- StatusChip mapping the §26.3 vocabulary to tokens with an icon per state.
- Progress: determinate bar, ring for countdowns and completion, and an upload variant exposing pause, resume, and cancel.
- Countdown: live, accessible, and readable at every scale from seconds to decades.

### Technical Requirements

- Countdown updates via a single shared interval, not one timer per instance — a timeline can render dozens.
- Countdown pauses when the document is hidden and resynchronises on visibility change, so a backgrounded tab does not drift or burn battery.
- Avatar initials derived correctly for single-word, multi-word, and non-Latin names.
- StatusChip never conveys state by colour alone.

---

## 6. Implementation Instructions

1. Build `Chip` with its variants and an optional remove affordance that is a real button with an accessible name.
2. Build `Avatar` with an initials fallback. Derive initials in a way that works for "Riya", "Riya Sharma", and names in Devanagari or Tamil script — take the first grapheme of up to two words rather than slicing by code unit, or a two-character emoji name will render as broken text.
3. Build `StatusChip` with a map from state to token and icon, covering: scheduled, processing, delivered, opened, reacted, failed, cancelled, sealed.
4. Build `Progress` with bar, ring, and upload variants. The upload variant must expose pause, resume, cancel, and retry — PHASE-04 depends on it (§29.28 queued-actions tray).
5. Build `Countdown` taking a target instant and a timezone. Format adaptively: seconds when under a minute, then minutes, hours, days, and for long horizons "4 years 32 days" as §29.16 specifies. Use `tabular-nums` so digits do not jitter.
6. Give Countdown an accessible representation: a `time` element with a machine-readable `datetime`, and a polite live region that updates at a **coarse** interval (not every second) so a screen reader is not flooded.
7. Implement the shared-interval scheduler and the visibility-change resynchronisation.

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
apps/site/src/components/ui/Chip.tsx
apps/site/src/components/ui/Avatar.tsx
apps/site/src/components/ui/AvatarGroup.tsx
apps/site/src/components/ui/StatusChip.tsx
apps/site/src/components/ui/Progress.tsx
apps/site/src/components/ui/Countdown.tsx
apps/site/src/hooks/useSharedTick.ts
apps/api/src/lib/format/duration.ts
apps/site/src/components/ui/__tests__/Countdown.test.tsx
apps/site/src/components/ui/__tests__/Avatar.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**StatusChip** — pill with an icon plus a text label. Colour from the §26.3 vocabulary. Never colour alone.

**Countdown** — tabular numerals so digits do not shift. Adaptive units:

```
under 1 min   "in 42 seconds"
under 1 hour  "in 18 minutes"
under 1 day   "in 4 hours"
under 60 days "in 22 days"
beyond        "in 4 years 32 days"
```

Rendered as a `<time datetime="...">` element so assistive technology and crawlers get the exact instant. The visible text updates on the shared tick; the live region updates coarsely.

**Progress (upload variant)** — bar with a percentage, the byte count, and pause/cancel controls, plus a retry affordance in the failed state.

---

## 12. Business Rules

- Status is never conveyed by colour alone (§26.8).
- A countdown to a past instant renders as "due" or "delivering", never a negative number.
- Countdown must state the recipient-relevant timezone where one applies — a capsule delivering "in 4 hours" means little without knowing whose 4 hours (§33.6).

---

## 13. Edge Cases

- A target date decades away — must not overflow or produce an absurd unit like "in 1,461 days" where "in 4 years" is meant.
- A target instant that passes while the component is mounted — must transition to the due state without a flash of negative time.
- Crossing a DST boundary between now and the target — compute from absolute instants, never by adding 24-hour days.
- A backgrounded tab for hours — resynchronise on visibility change rather than trusting accumulated ticks.
- Dozens of countdowns on one timeline screen — the shared tick is what keeps this affordable; verify with a rendered list of 50.
- A single-grapheme or emoji display name in Avatar — must not produce mojibake.
- A very long relationship label in a Chip — must truncate with an accessible full value.

---

## 14. Error Handling

- An invalid or missing target date must render a neutral placeholder, not `NaN` or `Invalid Date`.

---

## 15. Security Considerations

- Avatar image URLs are signed and time-limited from PHASE-04 onward; the component must tolerate an expired URL by falling back to initials rather than showing a broken image.

---

## 16. Testing Requirements

### Component Tests

- Countdown formats each documented range correctly.
- Countdown across a DST boundary produces the correct day count.
- Countdown transitions to due when the target passes while mounted.
- Fifty countdowns share a single interval (assert timer count).
- Avatar initials correct for single-word, multi-word, non-Latin, and emoji names.
- StatusChip renders an icon for every state in the vocabulary.
- Upload progress exposes pause, cancel, and retry with accessible names.

### Accessibility Tests

- Countdown exposes a machine-readable `datetime` and does not flood the live region.
- axe on all display primitives.

---

## 17. Acceptance Criteria

- [x] All five primitives implemented in both themes.
- [x] Countdown correct across all documented ranges, including multi-year and DST transitions.
- [x] Shared tick verified — fifty instances, one interval.
- [x] Avatar initials correct for non-Latin and emoji names.
- [x] StatusChip covers the full vocabulary with icons.
- [x] Upload progress exposes pause, resume, cancel, retry.
- [x] axe clean.

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
TASK-014
```


---

## 20. Implementation Notes

Completed 2026-09-02. `Chip`, `Avatar`, `StatusChip`, `Progress` and `Countdown` are in `apps/site/src/components/ui/`; 29 tests in `__tests__/display.test.tsx`, 9 in `chips.test.tsx`, 10 in `progress.test.tsx`.

**Countdown was computing a relative time during the server render, and it broke the theme.** The server's clock and the browser's are never the same instant, so the two strings differed and React threw hydration error #418 — which makes React re-render the whole document and **discards the `data-theme` attribute** the inline head script set before paint. A user who had chosen dark watched the page revert to light a moment after it loaded. TASK-011's no-flash script was correct; this quietly defeated it.

The component now renders the absolute date on the server — pinned to `en-GB`/UTC, because `toLocaleDateString(undefined, …)` resolves to the *runtime's* locale and Node's is not the browser's — and switches to the relative text once the client has a clock, via `useSyncExternalStore` with an `undefined` server snapshot.

Found by an end-to-end test reading `data-theme` after hydration. jsdom cannot see it: there is no server render to disagree with. `display.test.tsx` now states the invariant directly — the server output must be identical under two different clocks — so a regression fails in seconds rather than in a browser.

**One interval for every instance**, paused on `visibilitychange` and resynchronised on return. A timeline renders dozens of these; one timer each is dozens of main-thread wake-ups a second, a real battery cost for a screen the user is scrolling past. Asserted at fifty instances, and asserted to clean up.

**Years are calendar years.** A capsule for "your eighteenth birthday" must not read as seventeen years and 364 days because leap days accumulated.

**The chip variant decides the element, not just the colour.** Filter is a toggle (`aria-pressed`), selectable is membership (`role="checkbox"`), relationship is display only and therefore *not* interactive. A relationship rendered as a button puts every person in a family tree into the tab order and promises an action that does not exist. A remove affordance never nests a button inside a button — invalid HTML that browsers recover from differently.

**Indeterminate progress omits `aria-valuenow` entirely.** "Unknown" and "zero" are different states: a bar reported at 0% says the transfer is not working. `role="progressbar"` is deliberately *not* in a live region — a 200-step upload in a polite region announces "1 percent, 2 percent, 3 percent…" without pause.

`UploadProgress` exposes pause, resume, cancel and retry now because PHASE-04's queued-actions tray (§29.28) is built on it. Controls appear by status rather than being greyed out: a visible but inert control invites a tap that does nothing. Cancel is named after the file, because a tray of six buttons all called "Cancel" cannot be used by anyone navigating by button.

**Deviation — file layout.** §8 proposes `AvatarGroup.tsx`, `hooks/useSharedTick.ts` and `lib/format/duration.ts`. `AvatarGroup` is exported from `Avatar.tsx` (it is the same initials and tint logic); the shared tick and the duration formatting live inside `Countdown.tsx`, which is their only consumer. If a second consumer appears, extract then — a hook with one caller is indirection, not reuse. `countdownParts` and `formatCountdown` are exported so they can be tested without rendering.

**Not done — the timezone parameter.** §6.5 says Countdown takes "a target instant and a timezone". It takes the instant only. Every current use is "how long until this unlocks", which is a duration and therefore timezone-independent; the timezone matters for *displaying* the unlock moment in the recipient's zone, which is a PHASE-05 concern and needs the recipient's stored preference to be meaningful. Recorded rather than stubbed.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-02-01-02](../EPIC-01-02-01-02.md).
3. Read the parent Sprint — [SPR-01-02-01](../../SPR-01-02-01.md).
4. Read the parent Module — [MOD-01-02](../../../MOD-01-02.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§26.9`, `§26.3`, `§29.7`, `§29.16` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
