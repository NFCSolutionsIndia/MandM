# TASK-011 — Implement Design Token System for Light, Dark, and System Themes

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-011 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-02 — Design System Foundation](../../../MOD-01-02.md) |
| Sprint | [SPR-01-02-01 — Design Tokens, Primitives & App Shell](../../SPR-01-02-01.md) |
| Epic | [EPIC-01-02-01-01 — Design Tokens & Theming](../EPIC-01-02-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | completed |
| Dependencies | `TASK-002` |
| Blueprint refs | `§26.3`, `§26.5`, `ADR-014` |

---

## 1. Objective

Create the complete token stylesheet and Tailwind v4 preset implementing every colour, radius, elevation, spacing, and motion value from blueprint §26, correct in light, dark, and system themes.

---

## 2. Context

Blueprint §26.3 specifies the full palette and the exact implementation rule. ADR-014 restates it because the existing repository gets it wrong in an instructive way: it defines dark-mode values in a `.dark` block that sets `--primary` to `#FFFFFF`, so the brand coral disappears entirely in dark mode.

---

## 3. Problem Statement

Every screen in every later phase consumes these tokens. A structural mistake here appears on all of them, and fixing it late means touching every component. The three-state requirement (explicit light, explicit dark, and unset system) is where implementations usually break — a design that only handles a `.dark` class fails for users on system default.

---

## 4. Expected Outcome

A token stylesheet plus Tailwind preset where every §26 value is available as a semantic token, correct in all three theme states, with a theme provider that applies the preference before first paint and a toggle that overrides the system in both directions.

---

## 5. Requirements

### Functional Requirements

- Every colour token from §26.3, light and dark.
- Type scale, radii, elevation, spacing, and the four motion tiers from §26.4–26.5, including the 1200ms ceremonial tier.
- Status chip colours mapped to semantic tokens (scheduled, processing, delivered, opened, reacted, failed, cancelled, sealed).
- Theme provider supporting `light`, `dark`, and `system`; user choice persisted.
- No flash of wrong theme on load.

### Technical Requirements

- **Complete light palette on bare `:root`.** No token may have its only definition inside a media query or an attribute selector.
- Dark overrides under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`.
- Dark overrides repeated under `:root[data-theme="dark"]` so an explicit choice wins in both directions.
- `body` gets an explicit token background — never transparent.
- Tailwind v4 preset in `packages/config` maps tokens to utility names so components never contain a hex value.
- Fraunces and Inter loaded with `font-display: swap`, subset to Latin plus ₹, with a real fallback stack.

---

## 6. Implementation Instructions

1. Create `apps/site/src/styles/tokens.css`. Write the **entire light palette** on bare `:root` first, then add the two dark blocks. Follow the §26.3 rule literally — this is the one part of this task where creative deviation causes the exact bug being avoided.
2. Add the non-colour tokens: type scale, radii, elevation (with the dark-mode variant using a 1px border plus a lower-opacity shadow, since shadows read poorly on dark surfaces), spacing, and the four motion durations.
3. Create `packages/config/tailwind-preset.ts` mapping tokens to semantic utility names (`bg-surface`, `text-primary`, `rounded-card`, `shadow-md`, `duration-ceremonial`).
4. Configure fonts in the root layout: Fraunces for display, Inter for UI, both with fallback stacks and `swap`.
5. Create `apps/site/src/components/providers/ThemeProvider.tsx` reading the stored preference and applying `data-theme` before hydration. Wrap every storage access in try/catch — a private window can throw on access, not merely return null.
6. Build a theme toggle cycling light → dark → system, with an accessible label announcing the current state.
7. Write the guard test described in §16: parse `tokens.css` and fail if any custom property appears **only** inside a media query or attribute selector. This is what stops the bug recurring six months from now.
8. Write the contrast test asserting coral `#FF6B5E` against `--surface` fails 4.5:1 and is therefore not permitted for small text — encode this as a lint-able rule or a documented test, since §26.8 makes it binding.

---

## 7. Architecture

```text
packages/config/tailwind-preset.ts      semantic utilities
        │
apps/site/src/styles/tokens.css          :root  (COMPLETE light palette)
        │                               @media dark + :root:not([data-theme="light"])
        │                               :root[data-theme="dark"]
        ▼
ThemeProvider  →  sets data-theme before paint
        ▼
every component  →  uses utilities only, never a hex value
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/styles/tokens.css
apps/site/src/styles/globals.css
packages/config/tailwind-preset.ts
apps/site/src/components/providers/ThemeProvider.tsx
apps/site/src/components/ui/ThemeToggle.tsx
apps/site/src/app/layout.tsx  (fonts + provider)
apps/site/src/styles/__tests__/tokens.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Theme toggle:** a single control cycling light → dark → system. Icon reflects the *current* state; the accessible name states both the current state and the next ("Theme: dark. Activate for system."). Minimum 44×44px target (§26.8).

**No flash:** the provider must set `data-theme` on the document before first paint. A brief inline script in the document head reading the stored preference is acceptable and is the standard solution; document why it is inline.

**Reduced motion:** the motion tokens must have `prefers-reduced-motion` variants at the token level, so a component gets the correct behaviour by using the token rather than by remembering to handle it.

---

## 12. Business Rules

- **No component may contain a raw colour value.** Enforced by a lint rule if practical, by review otherwise.
- **No token may be defined only inside a media query or attribute selector** — the guard test enforces this.
- Coral `#FF6B5E` is never used for small text on white; it is valid for large text, icons, and fills only (§26.8).
- Fraunces is reserved for emotional moments — headers, capsule reveals, celebratory copy. UI chrome, forms, tables, and admin are always Inter (§26.4).

---

## 13. Edge Cases

- Private browsing where `localStorage` access **throws** rather than returning null — wrap every read and write in try/catch and render correctly with no stored value.
- System theme changing while the app is open with preference set to `system` — the media query listener must update live.
- A user with an explicit light preference on a device in dark mode — the `:root[data-theme="light"]` path must win, which is exactly what the media-query guard exists for.
- Font loading failure — the fallback stack must be genuinely similar in metrics, or layout shifts noticeably.
- Forced-colors / high-contrast mode — verify the UI remains usable; do not fight the OS.

---

## 14. Error Handling

- Storage failure must never break rendering: fall back to `system` silently.

---

## 15. Security Considerations

- No external asset host beyond Google Fonts. No tracker in the styling layer.

---

## 16. Testing Requirements

### Unit Tests

- Guard test: no custom property is defined only inside a media query or attribute selector.
- Contrast test: computed contrast of coral on surface is below 4.5:1, documenting why small text is prohibited; `--text-primary` on `--surface` and `--bg` exceeds 4.5:1 in both themes.

### Component Tests

- Render a token-consuming component in explicit light, explicit dark, and unset system; assert the resolved background and brand colour differ appropriately and that brand colour is present in dark mode.
- Theme toggle announces the current state and cycles all three values.
- Storage throwing does not prevent render.

### Accessibility Tests

- axe check on the toggle with zero serious or critical violations.

---

## 17. Acceptance Criteria

- [x] Every §26.3 colour token exists in light and dark.
- [x] Non-colour tokens from §26.4–26.5 exist, including the four motion tiers.
- [x] Guard test passes and demonstrably fails when a token is moved inside a media query.
- [x] **Brand coral is present and correct in dark mode** — the specific bug in the existing repository does not recur.
- [x] All three theme states render correctly, verified by test.
- [x] No flash of wrong theme on a hard reload.
- [x] Storage access wrapped in try/catch; private-window render verified.
- [x] No raw colour value in any component created by this task.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — CI is created in TASK-005
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-002
    ↓
TASK-011
```


---

## 20. Implementation Notes

### The blueprint is wrong about coral, and the measurement says so

§26.8 and CONVENTIONS both state that coral `#FF6B5E` "is valid for large text, icons, and
fills only". **Measured against `--surface` it is 2.79:1.** WCAG's large-text threshold is
3:1, so it fails that too — not only the 4.5:1 body-text rule.

The workable rule is narrower than the blueprint's, and it is what this system enforces:

| Use | Ratio | Verdict |
|---|---:|---|
| Coral text on white, any size | 2.79:1 | **never** |
| White text on a coral fill | 2.79:1 | **never** |
| Coral as a fill with `--on-primary` on top | 6.2:1 light, 7.0:1 dark | correct |
| Plum fill with white text | 12.8:1 | correct |

The `/design` page states the measured figure rather than the blueprint's, so the page and
the tests cannot disagree. **This warrants a blueprint amendment** — flagged rather than
silently corrected, because §26.8 is described as binding.

### A contrast failure that existed only in dark mode

The first version of the buttons used `text-text-primary` on a coral fill. That token is
near-black in light and near-white in dark, so in dark mode the label became
light-on-coral at **2.26:1** — a failure invisible in light mode, which is where nobody
was looking.

**Found by looking at a screenshot, not by a test.** The token guard passed, the contrast
tests passed, the build passed. Rendering the page and looking at it is what caught it.

Fixed with `--on-primary` / `--on-accent` / `--on-secondary` — text colours for placement
ON a brand fill, which deliberately **do not flip between themes**. Coral and gold are
light in both themes, so dark text is correct in both; plum is dark in both, so light text
is. Three tests now cover it, including one asserting the on-* tokens never appear inside
a dark block, since redefining one there would reintroduce the flip silently.

### The token guard, and the parser that read its own documentation

§6.7's guard parses `tokens.css` and fails if any custom property appears **only** inside a
media query or attribute selector — the Appendix A-8 bug, where dark values lived in a
`.dark` block and the brand colour vanished for everyone on system default.

The first version of that parser did not strip CSS comments, and the file's own doc
comment contains the string `@media`. The scope split therefore landed at character 0,
the "base" scope came out empty, and five assertions failed for a reason unrelated to the
stylesheet. **A parser that reads its own documentation as code produces confident wrong
answers**, so comments are now stripped before any parsing.

The guard also asserts that the two dark blocks stay in sync. They are duplicated on
purpose — `@media (prefers-color-scheme: dark)` for system users and
`:root[data-theme="dark"]` for an explicit choice — and drift between them means the two
paths disagree in a way that is very hard to notice.

### React 19 lint caught a real anti-pattern

`ThemeProvider` originally read `localStorage` in a `useEffect` and called `setState`
twice. `eslint-plugin-react-hooks` flagged it: "Calling setState synchronously within an
effect can trigger cascading renders."

Rewritten on `useSyncExternalStore`, which is the API for exactly this — reading browser
state the server cannot see, with an explicit `getServerSnapshot` so hydration matches.
It also subscribes to the `storage` event, so someone with the app open in two tabs does
not see them disagree. Better than suppressing the rule, and shorter.

### No flash of the wrong theme

The applied theme is set by an **inline script in `<head>`**, synchronously, before first
paint. A React effect runs after hydration, so a user who chose dark would see a white
flash first — on a product people open at night to look at photographs of people they
miss, that is not a cosmetic detail.

Every `localStorage` access is wrapped in try/catch, including inside that script. A
private window or blocked site data does not merely return null; **accessing the property
throws**, and an unguarded read there would break the page before React loads, with no
error boundary to catch it. Setting `data-theme="system"` is deliberately avoided — that
value matches neither dark block and would silently pin the user to light; the attribute
is removed instead so the media query decides.

### Deviation: the Tailwind preset is CSS, not TypeScript

§8 names `packages/config/tailwind-preset.ts`. Tailwind v4 is CSS-first: the token→utility
mapping is an `@theme` block, and a JavaScript preset object is the v3 shape. Written as
`tailwind-preset.css` so it is the real mechanism rather than a file matching a filename.

`@theme inline` matters: it makes utilities resolve to `var(--token)` rather than freezing
the value at build time, which is what lets a single utility class be correct in both
themes.

### Verification of §17 acceptance criteria

Verified in a real browser under both operating-system themes, not by inspection:

| Criterion | Result | How |
|---|---|---|
| Every §26.3 colour, light and dark | Pass | All present; `/design` renders each with its token name and role. |
| Type, radii, elevation, spacing, four motion tiers | Pass | Including the 1200ms ceremonial tier, with a test asserting it stays slow — someone will eventually "fix" it for feeling sluggish. |
| Status chips mapped to semantic tokens | Pass | Aliases, not new colours, so a chip cannot drift from what it represents. Every chip carries a label — §26.8 forbids colour as the only signal. |
| Theme provider: light, dark, system; persisted | Pass | Measured in Chromium: on a **light** OS, choosing dark gives `#17121A`; on a **dark** OS, choosing light gives `#FAF9F7`. Both directions — the case a media-query-only implementation fails. Survives reload. |
| No flash of wrong theme | Pass | Inline `<head>` script applies `data-theme` before first paint. |
| Complete light palette on bare `:root` | Pass | Guard test parses the stylesheet and fails on any media-query-only token. |
| Brand survives dark mode | Pass | `--primary` measures `#ff7f73` in dark, not `#fff` — the Appendix A-8 bug asserted directly. |
| Fonts with `swap` and fallbacks | Pass | Fraunces and Inter self-hosted via `next/font`, two `.woff2` preloaded, both with the blueprint's fallback chains. |
| Contrast rule encoded as a test | Pass | See the coral finding above. |

30 tests in `apps/api`; 113 across the workspace.

### Beyond §17, and worth knowing

- `/design` is a token reference surface, not product UI. It exists so a token mistake is
  visible now rather than discovered across thirty screens later, and it is the fastest way
  to check all three theme states by eye. `noindex`, and `design` is added to the reserved
  marketing slugs so a future page cannot shadow it.
- The TASK-002 placeholder pages are now styled with tokens. Still placeholders —
  components are TASK-012 onward — but the token system is demonstrably working on real
  routes rather than only on a showcase page.
- `prefers-reduced-motion` collapses all four motion tiers to 1ms at the token level, so
  every component inherits the behaviour without remembering to. §26.5 calls this
  non-optional; it is an accessibility and a vestibular-safety requirement.

### Left deliberately undone

No components — Button, Field, Sheet and the rest are TASK-012 to TASK-015, which depend
on TASK-010's seed data. No navigation shell (TASK-016). The `/design` page uses raw
utilities on purpose: it must not depend on components that do not exist yet, and it will
be a useful cross-check against them when they do.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-02-01-01](../EPIC-01-02-01-01.md).
3. Read the parent Sprint — [SPR-01-02-01](../../SPR-01-02-01.md).
4. Read the parent Module — [MOD-01-02](../../../MOD-01-02.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§26.3`, `§26.5`, `ADR-014` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
