# TASK-100 — Build Marketing Landing Page and Content Pages

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-100 |
| Phase | [PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout](../../../../PHASE-10.md) |
| Module | [MOD-10-01 — Marketing Site & Honest Claims](../../../MOD-10-01.md) |
| Sprint | [SPR-10-01-01 — Marketing Site, Pricing, Legal & Claim Correction](../../SPR-10-01-01.md) |
| Epic | [EPIC-10-01-01-01 — Marketing Site & Claim Correction](../EPIC-10-01-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-010`, `TASK-014` |
| Blueprint refs | `§30.1`, `§30.2`, `§30.3`, `§26` |

---

## 1. Objective

Build the landing page with the §30.1 sections plus how-it-works, privacy, blog, and FAQ — server-rendered, fast, and on the new design system.

---

## 2. Context

Blueprint §30 sets the requirements: SEO-first, semantic heading order, fast LCP, schema.org markup, and a specific note that the existing repository's "scroll hijacking (Lenis), the custom cursor, the WebGL fluid simulation, and the full-viewport GLSL shaders... actively harm LCP, which is the one metric a marketing page is judged on. Keep the craft; drop the spectacle."

---

## 3. Problem Statement

The existing landing page is the one part of the current codebase with genuine reusable value — its copy, its asset set, and its considered dark mode. The task is to keep that quality while removing several hundred kilobytes of animation machinery that costs conversion and battery for no benefit.

---

## 4. Expected Outcome

A fast, warm, server-rendered marketing site on the §26 design system, with the strongest existing copy retained and the spectacle removed.

---

## 5. Requirements

### Functional Requirements

- Landing sections per §30.1: nav, hero, how-it-works, feature grid, emotional showcase, gifts preview (Release-3 labelled), pricing summary, blog teaser, install banner, footer.
- How it works: the four-step Record → Schedule → Secure → Deliver flow.
- Privacy and trust page: encryption, ownership, no ads, durability, export — and a link to the published delivery guarantee.
- Blog index and article pages from MDX.
- FAQ, searchable, from the §30.3 structure.
- Install CTA labelled "Install the app", not "Get the app" (§28.3).

### Technical Requirements

- Server-rendered with a first-load-JS budget enforced in CI, using the PHASE-01 baseline as the reference.
- LCP under 2.0s on a 4G profile.
- schema.org `SoftwareApplication` and `FAQPage` markup; canonical URLs; OG and Twitter cards; sitemap.
- **No Lenis, no custom cursor, no WebGL, no full-viewport shaders.**
- Confetti and motion respect `prefers-reduced-motion` (§30.1 requires a static alternative).

---

## 6. Implementation Instructions

1. Build the landing page sections on the §26 tokens. Reuse the existing copy where it is strong — the hero framing, the "we preserve your feelings" line, the four-step process — and rewrite anything that overclaims.
2. **Label unreleased features "Coming soon"** in the feature grid (§30.1 requires this) rather than implying availability. The gifts preview and legacy vault fall into this category.
3. Build the how-it-works page around the four-step flow, which is the clearest statement of the product in the whole blueprint.
4. Build the privacy and trust page. Link the published delivery guarantee prominently; it is the strongest trust asset available.
5. Build the blog from MDX with category chips and reading time; no comments, per §30.2.
6. Build the FAQ, searchable, sourced from content that will later be CMS-managed.
7. Add schema.org markup, canonical URLs, OG cards, and a sitemap.
8. Enforce the first-load-JS budget in CI against the PHASE-01 baseline, and measure LCP on a 4G profile.
9. Run axe on every page.

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
apps/site/src/app/page.tsx
apps/site/src/app/how-it-works/page.tsx
apps/site/src/app/privacy/page.tsx
apps/site/src/app/journal/[slug]/page.tsx
apps/site/src/app/faq/page.tsx
apps/api/src/features/marketing/components/
apps/site/src/app/sitemap.ts
apps/site/e2e/marketing-perf.spec.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §30.1, on the §26 design system. Warm, typographic, fast.

**Hero** — H1 "Send love at the perfect moment." Sub, install CTA, a phone mockup looping a memory being unwrapped, and social proof **only with real numbers** (Appendix B).

**Feature grid** — six cards; anything unreleased is labelled "Coming soon".

**Dropped from the existing site:** Lenis scroll hijacking, custom cursor, WebGL fluid cursor, GLSL shader hero. Kept: the typography, the warmth, and the dark mode.

---

## 12. Business Rules

- **No Lenis, no custom cursor, no WebGL, no full-viewport shaders** (§30).
- Unreleased features are labelled "Coming soon", never implied as available.
- Social proof uses real numbers or none (Appendix B).
- The install CTA says "Install the app".
- Motion has a reduced-motion alternative.

---

## 13. Edge Cases

- A visitor on a slow connection — LCP budget covers it; verify on a throttled profile rather than a fast laptop.
- A visitor with JavaScript disabled — the marketing site should be readable; it is server-rendered, so verify.
- A visitor in dark mode — the site must respect it, and the existing repo's dark-mode bug must not recur.
- A blog post with no hero image — layout must hold.
- The gifts section with no shop to link to — "Coming soon" with no dead link.
- An SEO crawler — heading order and canonical URLs must be correct.
- A shared OG card — verify the image and copy render correctly on at least two platforms.

---

## 14. Error Handling

- A failed blog build must fail CI rather than shipping a broken page.

---

## 15. Security Considerations

- No third-party trackers; analytics is first-party (ADR-021).

---

## 16. Testing Requirements

### Component Tests

- Unreleased features labelled "Coming soon".
- Install CTA copy correct.
- Reduced-motion alternative present.

### E2E Tests

- **LCP under budget on a 4G profile.**
- First-load JS within the budget.
- Site readable with JavaScript disabled.

### Accessibility Tests

- axe clean on every marketing page in both themes.

---

## 17. Acceptance Criteria

- [ ] All §30.1 sections plus how-it-works, privacy, blog, and FAQ shipped.
- [ ] No Lenis, cursor, or WebGL anywhere in the marketing bundle, verified.
- [ ] LCP and first-load-JS budgets met and enforced in CI.
- [ ] Unreleased features labelled; no dead links.
- [ ] schema.org, canonical, OG, and sitemap present.
- [ ] axe clean; dark mode correct.

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
TASK-010
    ↓
TASK-014
    ↓
TASK-100
```


---

## 20. Implementation Notes

- Keep the existing copy where it is good. The "we preserve your feelings" framing and the four-step process are both stronger than anything a rewrite would produce.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-10-01-01-01](../EPIC-10-01-01-01.md).
3. Read the parent Sprint — [SPR-10-01-01](../../SPR-10-01-01.md).
4. Read the parent Module — [MOD-10-01](../../../MOD-10-01.md).
5. Read the parent Phase — [PHASE-10](../../../../PHASE-10.md).
6. Read the relevant blueprint sections: `§30.1`, `§30.2`, `§30.3`, `§26` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
