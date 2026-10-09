# TASK-016 — Build Configuration-Driven Responsive Navigation Shell

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-016 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-02 — Design System Foundation](../../../MOD-01-02.md) |
| Sprint | [SPR-01-02-01 — Design Tokens, Primitives & App Shell](../../SPR-01-02-01.md) |
| Epic | [EPIC-01-02-01-03 — Application Shell & Navigation](../EPIC-01-02-01-03.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-011`, `TASK-012` |
| Blueprint refs | `§28.1`, `§28.2`, `§26.6` |

---

## 1. Objective

Build the application shell with a mobile bottom tab bar, a tablet rail, and a desktop sidebar, all driven by a single navigation configuration.

---

## 2. Context

Blueprint §28.1 resolves a conflict between two proposed navigation structures in favour of a staged version: Release 1 ships `Home · Occasions · (+) · Timeline · Me`, and at Release 3 Gifts replaces Timeline. §28.1 also requires that such a change be announced in-app, never silent.

---

## 3. Problem Statement

Gap analysis §3 item 3 records this planned change explicitly. Hard-coding five tabs guarantees a refactor later; a configuration array with release gating makes it a one-line change plus an announcement. The scroll-away and safe-area behaviours are also easy to get wrong in ways that make a native app feel like a website in a wrapper.

---

## 4. Expected Outcome

An `(app)` layout rendering a bottom tab bar below 768px, an icon rail on tablet landscape, and a sidebar with a command bar above 1024px — from one config array — with correct active states, scroll-away behaviour, and safe-area handling.

---

## 5. Requirements

### Functional Requirements

- Five navigation items from configuration: Home, Occasions, Create (centre), Timeline, Me.
- Create is a raised centre action in `--primary` that opens a sheet rather than navigating.
- Active tab uses the filled icon variant and is announced as current to assistive technology.
- Tab bar translates out of view on scroll down and back on scroll up.
- Desktop sidebar with the same items plus secondary destinations, and a top command bar hosting global search.
- Each config item can declare a minimum release so unreleased items are omitted entirely.

### Technical Requirements

- One config module is the single source of navigation truth; layout components read it and never hard-code items.
- Active detection from the current pathname with correct handling of nested routes.
- `env(safe-area-inset-bottom)` applied so the bar clears the iOS home indicator.
- Scroll-away implemented with a passive scroll listener and a transform, not by changing layout, so it cannot cause reflow jank.
- The bar must not obscure the last item of a scrolled list — the content area needs bottom padding equal to the bar height.

---

## 6. Implementation Instructions

1. Create `apps/site/src/config/navigation.ts` exporting the item array: key, label, href or action, icon (outline and filled), and `minRelease`.
2. Build `BottomTabBar` reading the config. Render the centre item as a raised button that invokes the create sheet.
3. Build `Sidebar` and `CommandBar` for desktop from the same config, with the sidebar adding secondary destinations (Members, Settings).
4. Build `AppShell` selecting the correct navigation for the viewport, and place it in the `(app)` layout.
5. Implement scroll-away with a passive listener and a translate transform, with a small threshold so a minor scroll does not flicker the bar. Disable the behaviour under `prefers-reduced-motion`.
6. Apply safe-area padding to the bar and matching bottom padding to the scroll container. Verify on a device with a home indicator, or in a simulator with insets enabled.
7. Add `aria-current="page"` to the active item and ensure the label is always available to assistive technology even when visually reduced to an icon.
8. Add the keyboard shortcuts from §28.2 (`n` new, `/` search, `Esc` close) on desktop only, and make sure they never fire while focus is inside a text field.

---

## 7. Architecture

```text
config/navigation.ts   ← single source; items carry minRelease
        │
        ├── BottomTabBar    (< 768px)   Home · Occasions · (+) · Timeline · Me
        ├── IconRail        (tablet landscape)
        └── Sidebar + CommandBar (>= 1024px)
                │
        (app)/layout.tsx  →  AppShell  →  {children}

Release 3: swap Timeline for Gifts in the config + in-app announcement (§28.1)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/config/navigation.ts
apps/site/src/components/layout/AppShell.tsx
apps/site/src/components/layout/BottomTabBar.tsx
apps/site/src/components/layout/IconRail.tsx
apps/site/src/components/layout/Sidebar.tsx
apps/site/src/components/layout/CommandBar.tsx
apps/site/src/hooks/useScrollDirection.ts
apps/<ios|android>/features/layout.tsx
apps/site/src/components/layout/__tests__/AppShell.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Mobile (< 768px)**

```
┌───────────────────────────────────────────────────────┐
│   🏠 Home    📅 Occasions    ➕    🕰 Timeline   👤 Me  │
└───────────────────────────────────────────────────────┘
```

Centre ➕ is raised, coral, and larger than its neighbours. It opens a sheet — it is not a route. Icons switch to the filled variant when active. Labels always present. Bar clears the home indicator via safe-area inset.

**Tablet portrait** — same tab bar. **Tablet landscape** — left icon rail.

**Desktop (≥ 1024px)** — persistent sidebar (Home, Occasions, Create, Timeline, Members, Settings) plus a top command bar with global search and ⌘K. Keyboard shortcuts active.

All in both themes, with a reduced-motion variant that disables scroll-away.

---

## 12. Business Rules

- Navigation items come from configuration only. A hard-coded item in a layout is a defect.
- The create action never navigates — losing the current screen to start a memory is the friction the sheet pattern exists to avoid (§28.1).
- Unreleased items are omitted, not disabled — a disabled nav item is a promise (§28.4).
- Navigation never reveals a route the session cannot reach.

---

## 13. Edge Cases

- A route not present in the config — nothing should appear active; do not fall back to marking Home active, which misleads.
- Nested route such as `/app/memory/123` — the Timeline tab should read as active; define the matching rule explicitly rather than relying on prefix coincidence.
- Scroll-away triggering on a short list that barely scrolls, or on a bounce/overscroll — require a threshold and ignore negative overscroll.
- Keyboard shortcut firing while typing in the note field — shortcuts must be suppressed when focus is in an editable element.
- Landscape phone, where a bottom bar consumes scarce vertical space — verify the layout remains usable.
- Very long localised labels overflowing a tab — plan truncation with the full name available to assistive technology.
- Safe-area inset of zero on Android — padding must not leave a visible gap.

---

## 14. Error Handling

- A navigation target that fails to load must leave the shell intact and show the error inside the content area, never replace the whole screen.

---

## 15. Security Considerations

- Do not render items for routes the session lacks; the shell is not an access-control mechanism, but it must not advertise what it cannot open.

---

## 16. Testing Requirements

### Component Tests

- Renders the tab bar below 768px, the rail on tablet landscape, and the sidebar above 1024px.
- Active item derives from the route, including a nested route.
- An unknown route marks nothing active.
- Create invokes the sheet and does not change the route.
- An item with a future `minRelease` is absent from the DOM.
- Scroll-away hides and restores the bar past the threshold, and is disabled under reduced motion.
- Keyboard shortcuts do not fire while focus is in a text field.

### E2E Tests

- Playwright: navigate all four routable tabs at mobile and desktop viewports; assert the shell persists and the active state follows.

### Accessibility Tests

- `aria-current="page"` on the active item.
- Every item has an accessible name even when the label is visually minimised.
- Full keyboard traversal with a visible focus ring; axe clean at all three breakpoints.

---

## 17. Acceptance Criteria

- [x] Shell renders correctly at mobile, tablet, and desktop breakpoints.
- [x] All items come from `config/navigation.ts`; no hard-coded item anywhere.
- [x] Swapping Timeline for Gifts in the config changes the bar with no component edit — demonstrate this in a scratch commit and revert it.
- [x] Create opens a sheet and does not navigate.
- [ ] Safe-area insets verified on a device or simulator with a home indicator. **NOT VERIFIED** — proven in Chromium with a forced 34px inset, never opened on real hardware. See §20.
- [x] Scroll-away works with a threshold and is disabled under reduced motion.
- [x] Shortcuts suppressed inside editable fields.
- [x] axe clean at all three breakpoints; `aria-current` correct.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — 180 unit, 60 end-to-end. **There is no CI yet**: TASK-005 is deferred by decision, so "and in CI" is unverifiable rather than verified.
- [x] Error handling from §14 implemented — `(app)/error.tsx`, verified against a deliberately throwing route
- [x] Security considerations from §15 satisfied
- [ ] All §17 acceptance criteria verified — one outstanding, see §20
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [ ] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-011
    ↓
TASK-012
    ↓
TASK-016
```


---

## 20. Implementation Notes

Completed 2026-09-03. `config/navigation.ts`, `components/layout/` (AppShell, BottomTabBar, IconRail, Sidebar, CommandBar, CreateSheet, ScreenPlaceholder), `components/icons/nav.tsx`, `hooks/useScrollDirection.ts`, `hooks/useMediaQuery.ts`, `hooks/useAppShortcuts.ts`. 27 tests in `components/layout/__tests__/AppShell.test.tsx`, 17 in `config/__tests__/navigation.test.ts`, 28 in `e2e/shell.spec.ts`.

**The breakpoint switching is CSS, not JavaScript.** All three navigations render and media queries choose. Measuring the viewport and rendering one would mean the server guesses, a desktop user watches a tab bar flash into a sidebar, and the guess is a hydration mismatch — this codebase has already lost the theme to one (TASK-014 §20). `display: none` removes an element from the accessibility tree too, so the two hidden navigations are not announced, not focusable, and not seen by axe; the end-to-end suite confirms exactly one `navigation` landmark at each width rather than taking that on trust.

**`md:landscape:` was wrong, and only a real browser could show it.** A desktop monitor is also `(orientation: landscape)`. Written as `md:landscape:block lg:hidden`, the two rules tie on specificity and Tailwind emits the landscape block last — so at 1440px the icon rail appeared beside the sidebar, with the content padded for an 80px rail while sitting under a 240px one. `md:max-lg:landscape:` bounds the range at both ends, so the outcome no longer depends on emission order.

**The command bar was inset for the sidebar and not for the rail**, so at 844×390 the wordmark rendered underneath the rail and read as "s & Memories". Nothing failed: no test measured it, and axe has no opinion about a word being covered by a panel. It was found by looking at a screenshot. `e2e/shell.spec.ts` now measures the first visible control in the bar against the rail and the sidebar.

**Safe-area insets are now testable, which they were not.** §17 asks for verification "on a device or simulator with a home indicator". `env(safe-area-inset-bottom)` resolves to 0px in every desktop browser and cannot be overridden, so every assertion about the inset was an assertion about zero. The insets are read once into `--safe-top` / `--safe-bottom` / `--safe-left` (globals.css): identical behaviour on a device, and a test can force 34px and check that the bar grows by exactly that, stays anchored to the bottom, still clears the last row, and adds nothing at all when the inset is zero (§13, Android).

Doing that surfaced two latent errors: `main` was adding the inset that `body` already reserves, double-counting it and leaving 34px of unexplained space under the last row on an iPhone; and the toast layer offset itself by a hard-coded `4rem` against a bar that is `3.5rem`, so it sat 8px too high. Both now read `--tab-bar-height` and `--safe-bottom`.

**BLOCKER — not verified on real hardware.** The behaviour is proven with a forced 34px inset in Chromium. It has not been opened on an iPhone or in an iOS simulator, which is what §17 literally asks for, and I have no device here. Everything else in §17 is verified; this one criterion rests on a forced value rather than a real one. Worth ten minutes on an iPhone before Release 1.

**The Release 3 swap was demonstrated literally and then made permanent.** §17 asks for a scratch commit; `CURRENT_RELEASE` was set to 3, the app was built and opened at 390×844, and the bar read `Home · Occasions · Create · Gifts · Me` with no component edited. Reverted. The same demonstration is now a test, because a scratch commit proves the abstraction worked on the day it was written and then disappears, while the test fails on the day someone hard-codes a tab.

Timeline carries `maxRelease: 2` and Gifts `minRelease: 3`, so one constant performs the whole swap. `RELEASE_3_ANNOUNCEMENT` sits beside the gate because §28.1 requires the change be announced in-app and never silent; rendering it needs the release-notes surface, which is PHASE-10.

**The active-route rule is written down once, and Home is `exact`.** Every app route begins with `/app`, so a plain prefix match makes Home active on every screen in the product. §13 also forbids falling back to Home on an unknown route — "which misleads" — so nothing is active there. Longest match wins, and Timeline `owns` `/app/memory` and `/app/capsule` so reading a memory does not bury the timeline (§28.1).

**Shortcuts: Escape is the deliberate exception.** Every other shortcut is suppressed while focus is in an editable element — the failure being prevented is someone writing a note to their grandchild, typing the word "not", and having the create sheet open over it. Escape must still work from inside a text field, because that is where you are when you decide to abandon what you were doing. `isContentEditable` alone was not enough: jsdom does not implement it, so the test proving "typing in the composer does not open the sheet" passed while the guard did nothing. It now also walks ancestors with `closest('[contenteditable]:not([contenteditable="false"])')`, which is more correct in a browser as well.

**Nine placeholder routes were created**, which §8 does not list: `/app/occasions`, `/app/timeline`, `/app/me`, `/app/members`, `/app/settings`, `/app/search`, `/app/notifications`, `/app/gifts`. A tab that 404s is not a shell, §16's end-to-end test navigates all four routable tabs, and `typedRoutes` makes a `<Link>` to a route that does not exist a typecheck failure — so the config could not even be written without them. Each says which task replaces it. `/app/gifts` exists at Release 1 and the navigation deliberately does not show it, which is what makes §28.4's "hidden, not disabled" rule testable before Release 3.

**Deviation — `/app/me` is not in the blueprint's route map.** §28.1 requires a "Me" tab (profile, members, vault, subscription, settings) and §29.10 specifies the screen, but §28.5's consolidated route map lists `/app/members` and `/app/settings/*` and no profile route. `/app/me` matches the tab name. Worth confirming when PHASE-02 builds the real screen.

**Deviation — the icons are hand-drawn.** §26.6 asks for one family with a **filled variant for the active tab**. Lucide has no filled variants; filling a stroke-only path produces a blob. Phosphor has them and is a dependency in the always-loaded app shell for eight glyphs. So the shell's eight are drawn to one geometry — 24×24, 2px stroke, round caps, outline and filled sharing a single path so the silhouette cannot drift. The product-wide family decision is deferred to the first content screen that needs a broad set, recorded here so it is a decision rather than a drift.

**Deviation — one responsive `CommandBar`, not a desktop-only one.** §28.2 asks for a command bar on desktop; §28.1 separately requires global chrome everywhere and resolves search as "a persistent top-bar affordance … a verb, not a place", which is why it is not a tab. A desktop-only bar would leave search unreachable on a phone. Deliberately absent: the time-aware greeting and the unread badge count, both of which need session and notification data that does not exist until PHASE-02 and PHASE-07. A greeting invented now would be a lie with a friendly tone.

**Deviation — file layout.** §8 proposes `hooks/useScrollDirection.ts` (created) and an `AppShell.test.tsx`; `useMediaQuery.ts` and `useAppShortcuts.ts` are additional, because the media-query store and the shortcut predicate are both independently testable and neither belongs inside a component. `ScreenPlaceholder.tsx` is not in §8 either — it exists so nine placeholder screens are one component rather than nine copies.

**§14 needed a file, not a stylesheet.** "A navigation target that fails to load must leave the shell intact and show the error inside the content area, never replace the whole screen" is a routing fact: an `error.tsx` is caught by the nearest layout ABOVE it. There wasn't one, so an error escaped to the root boundary — which sits above the shell — and replaced the entire page, leaving the user on a dead screen with no navigation and nothing to do but reload. `(app)/error.tsx` now sits inside the shell layout.

Verified in a browser against a deliberately throwing route, then the route was removed rather than shipped: the shell stayed, the error rendered in the content area with a working retry, and no tab was marked active (correct — an unknown route marks nothing, §13). The permanent tests assert the file's position, that retry calls Next's `reset()` rather than reloading, and that the exception message is never shown — it can carry a query, a path, or a token, so only the digest is (ADR-023).

**A flaky test was fixed rather than retried.** "Scroll-away is disabled under reduced motion" passed alone and failed in the full suite: a single `mouse.wheel` fired before hydration is lost, and nothing retried it, so the assertion ran against a page that had never scrolled. It now polls until the page has genuinely moved. The full suite then passed three times consecutively. The playwright config's policy is `retries: 0` — "a test that only passes on a retry is not passing".

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-02-01-03](../EPIC-01-02-01-03.md).
3. Read the parent Sprint — [SPR-01-02-01](../../SPR-01-02-01.md).
4. Read the parent Module — [MOD-01-02](../../../MOD-01-02.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§28.1`, `§28.2`, `§26.6` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
progress
```

> Everything is built, tested and reviewable. Held at `progress` for ONE §17 criterion:
> safe-area insets have not been seen on real hardware. `env(safe-area-inset-bottom)` is
> 0px in every desktop browser, so the behaviour is proven with a forced 34px inset in
> Chromium instead. Open `/app` on an iPhone, confirm the tab labels sit clear of the home
> indicator and that the last row of a scrolled page is not underneath the bar, and this
> becomes `completed`.

Allowed statuses: `pending` · `progress` · `completed`
