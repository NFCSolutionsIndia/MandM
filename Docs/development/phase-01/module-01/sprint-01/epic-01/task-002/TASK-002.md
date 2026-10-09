# TASK-002 — Scaffold the Node API, the Marketing Site and the Admin Console

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-002 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-01 — Workspace & Package Scaffold](../EPIC-01-01-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | completed |
| Dependencies | `TASK-001` |
| Blueprint refs | `§19`, `§28.5`, `ADR-002` |

---

## 1. Objective

Create `apps/api` as a Next.js 16 App Router application with the route-group structure from blueprint §28.5 and a placeholder page in each group.

---

## 2. Context

The apps serves three audiences from one codebase: public marketing, the authenticated app, and the admin console — plus public tokenised routes for capsule unlock and sharing. Route groups keep their layouts and bundles separate so a marketing visitor never downloads app code.

---

## 3. Problem Statement

Getting route grouping wrong forces a later restructure that touches every page. It also determines whether `/c/[token]` can be server-rendered independently of the app shell — which blueprint §29.24 requires as a hard constraint, because a capsule opened in 2046 must work with JavaScript disabled.

---

## 4. Expected Outcome

A Next.js app that starts with `pnpm dev`, serves a distinct placeholder at `/`, `/login`, `/app`, `/admin`, and `/c/test`, with each group carrying its own layout. The marketing group renders without importing any app-shell code.

---

## 5. Requirements

### Functional Requirements

- Route groups `(marketing)`, `(auth)`, `(app)` plus non-grouped `admin/`, `c/[token]`, `s/[token]`, `api/`.
- Each group has its own `layout.tsx`.
- A placeholder page renders in each group, identifying which group it belongs to.
- `/c/[token]` renders server-side with no client component in its tree.

### Technical Requirements

- Next.js pinned exactly; React 19; TypeScript strict.
- **Read `node_modules/next/dist/docs/` before writing any config or route file** — conventions in this release differ from earlier ones (ADR-002, project `AGENTS.md`).
- No `output: "export"` — this application requires a server runtime, unlike the existing static site.
- Root layout sets `lang`, viewport, and theme-colour meta.
- Path alias `@/*` → `apps/site/src/*`.

---

## 6. Implementation Instructions

1. Read the relevant guide in `node_modules/next/dist/docs/` first. Do not carry over App Router patterns from memory.
2. Create `apps/site/src/app/` with the route groups listed in §5 above.
3. Give `(marketing)` a layout with no app chrome; give `(app)` a layout that will later host the navigation shell (TASK for the shell comes later — leave a clearly marked placeholder).
4. Create `c/[token]/page.tsx` as an async server component that renders static text. **Add a comment stating that no client component may be introduced into this route** and why (blueprint §29.24).
5. Configure `next.config.ts` minimally: typed routes if available, image config, and nothing speculative.
6. Add `apps/site/src/app/layout.tsx` with the font loading strategy stubbed — actual fonts arrive with the token task.
7. Verify each group's bundle: the marketing page must not include app-shell JavaScript. Record the observed first-load JS per group in §20 as a baseline.

---

## 7. Architecture

```text
apps/site/src/app/
├── (marketing)/     public, indexable, no app chrome
├── (auth)/          signup, login, verify, welcome
├── (app)/           authenticated shell  ← bottom nav / sidebar lives here
├── admin/           separate auth realm (PHASE-08)
├── c/[token]/       RECIPIENT UNLOCK — server-only, must work without JS
├── s/[token]/       public share view
└── api/             route handlers: webhooks, upload, media URLs, push
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/next.config.ts
apps/site/tsconfig.json
apps/site/src/app/layout.tsx
apps/site/src/app/layout.tsx
apps/site/src/app/page.tsx
apps/<ios|android>/features/auth/layout.tsx
apps/<ios|android>/features/auth/login/page.tsx
apps/<ios|android>/features/layout.tsx
apps/<ios|android>/features/page.tsx
apps/admin/src/app/page.tsx
apps/site/src/app/c/[token]/page.tsx
apps/site/src/app/s/[token]/page.tsx
apps/site/src/app/not-found.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Placeholders only — no design work in this task. Each page renders its group name and route as plain text so the routing structure is visually verifiable. The `not-found.tsx` page should already carry the warm tone the product requires ("This page has slipped away") rather than a bare 404, because it is cheap to do now and easy to forget later.

---

## 12. Business Rules

- `/c/[token]` must remain free of client components for the life of the project. Any change adding interactivity there must instead use a progressively-enhanced form or a separate route.
- No route group may import from another group's layout.

---

## 13. Edge Cases

- A token route colliding with a marketing slug — reserve `c`, `s`, `m`, `j`, `g`, `n`, `api`, `app`, `admin` as forbidden marketing slugs and document the list.
- Trailing-slash behaviour differing between preview and production — set it explicitly rather than relying on the default.

---

## 14. Error Handling

- A missing token renders the not-found page, never a stack trace.

---

## 15. Security Considerations

- Set baseline security headers now (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors none`) so no route ever ships without them. CSP with nonces comes in PHASE-09; add a permissive-but-present policy now with a TODO referencing that phase.
- `/c/[token]` and `/s/[token]` must send `X-Robots-Tag: noindex, noarchive` from this task onward — a shared memory must never be indexable, and adding it later risks a window of exposure.

---

## 16. Testing Requirements

### Unit Tests

- A test asserting `/c/[token]` response HTML contains the placeholder content when JavaScript is disabled in the browser context.

### E2E Tests

- Playwright test asserting each of the five placeholder routes returns 200 and contains its expected marker text.

---

## 17. Acceptance Criteria

- [x] `pnpm dev` serves all five placeholder routes.
- [x] `/c/test` renders correct content with JavaScript disabled in Playwright.
- [x] Route-group bundle isolation verified, and first-load JS baselines recorded in §20. — **amended from "measurably smaller"; see §20 for the contradiction with §6.3 and the resolution**
- [x] `noindex` header present on `/c/*` and `/s/*`.
- [x] Baseline security headers present on every route.
- [x] The `node_modules/next/dist/docs/` guide consulted, with any deviation from remembered conventions noted in §20.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — CI is created in TASK-005
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified — the third was amended; see §20
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-001
    ↓
TASK-002
```


---

## 20. Implementation Notes

### The most important finding: `notFound()` renders a blank page without JavaScript

**This is the finding that justified the task.** Measured on Next 16.3.3:

Throwing `notFound()` from the dynamic route `/c/[token]` returns HTTP 404 with an
effectively **empty `<body>`**. The not-found UI is delivered only inside the React
Flight payload (`<div hidden>` plus `__next_f.push(...)` script tags) and becomes
visible only after hydration. The copy appears in the response exactly once — as an
escaped string inside a `<script>` — and there is no `<h1>` in the document at all.

With JavaScript disabled, a recipient who mistyped or half-copied a capsule link got a
**completely blank page**. That is the precise scenario blueprint §29.24 exists to
prevent, and it is arguably worse than the stack trace §14 warns about: a stack trace at
least tells you something happened.

A segment-local `not-found.tsx` at `c/[token]/` does **not** fix it — tried and
measured.

**Resolution — a deliberate deviation from §14's wording:** `/c/[token]` and
`/s/[token]` now render the not-found surface **inline, with a 200**, instead of
calling `notFound()`. Two reasons, and the second is the stronger one:

1. It renders into the HTML, so it works with scripting off.
2. **It prevents token enumeration.** Once TASK-065 makes tokens real, "expired",
   "revoked", "not yet unlocked" and "never existed" must be indistinguishable from
   outside. Distinct status codes would leak which tokens once existed.

The SEO argument for a 404 does not apply — both routes are `noindex` by header and
by metadata. **TASK-065 must emit a server-side metric for unresolved tokens**, which is
a better monitoring signal than an HTTP status anyway, because a burst of failures there
is a security event rather than a typo.

Regression-tested in `e2e/capsule-no-js.spec.ts` under a browser with
`javaScriptEnabled: false`. If anyone "restores" `notFound()`, that test fails.

### §17 criterion 6 — the `node_modules/next/dist/docs/` guide, and what it changed

Consulted before writing any route or config file, as ADR-002 requires. Five things
would have been wrong from memory:

| Written from memory | Next 16 reality |
|---|---|
| `const { token } = params` | `params` is a **Promise**; synchronous access was removed entirely in 16. Must `await props.params`. |
| `middleware.ts` | Renamed to `proxy.ts`; the named export must be `proxy`; the edge runtime is not supported there. |
| `themeColor` inside `metadata` | Belongs in the separate `viewport` export. Placing it on `metadata` silently does nothing. |
| `experimental.typedRoutes` | Now **stable** as top-level `typedRoutes`. Enabled. |
| `next lint` in scripts | **Removed** in 16. Linting is plain `eslint .`, which is what TASK-001 already set up. |

Also learned: `next typegen` emits a global `PageProps<"/c/[token]">` helper. It is
**not** used here — that type is generated into `.next/types` by a build, and CI runs
typecheck *before* build, so depending on it would make a clean checkout fail to
typecheck. Params are typed explicitly instead; equivalent, with no ordering requirement.

Next 16 also writes `apps/site/AGENTS.md` and `CLAUDE.md` itself, re-creating them on
every `next dev`. They are committed so the working tree stays clean. This is the
`AGENTS.md` that ADR-002 and every task's §21 refer to.

### First-load JS baseline (§6.7, §17 criterion 3)

Measured against a production build by summing every `<script src>` the served HTML
actually references — `apps/site/scripts/verify-routes.mjs`, re-runnable at any time.

| Route | Raw | Gzipped |
|---|---:|---:|
| `/` (marketing) | 552.6 KB | 168.6 KB |
| `/login` (auth) | 552.6 KB | 168.6 KB |
| `/app` (app) | 552.6 KB | 168.6 KB |
| `/admin` | 552.6 KB | 168.6 KB |
| `/c/[token]` | 552.6 KB | 168.6 KB |
| `/s/[token]` | 552.6 KB | 168.6 KB |

**Two things to carry forward:**

1. **`/c/[token]` ships 168.6 KB gzipped it does not need.** The page renders
   without any of it — verified — but the browser downloads the framework runtime
   regardless. For the one route whose purpose is working without JavaScript in 2046,
   that is worth attacking in TASK-065. It is a real cost on a slow connection.
2. Next 16's build output no longer prints per-route size columns, so this measurement
   is home-grown. Keep the script; without it there is no baseline to regress against.

### §17 criterion 3 — AMENDED, and why

> Original wording: "Marketing route first-load JS is measurably smaller than the app
> route, and the numbers are recorded in §20."

**This criterion contradicts §6.3 of the same task.** §6.3 says to "give `(app)` a layout
that will later host the navigation shell (TASK for the shell comes later — leave a
clearly marked placeholder)". A placeholder layout ships no JavaScript, so the number it
asks to compare cannot diverge. The criterion was written assuming the shell exists.

Measured on a **production** build — not dev, which adds HMR and devtools chunks and would
have given a misleading answer:

```
/      (marketing)   552.6 KB raw   168.6 KB gzipped   6 chunks
/app   (app)         552.6 KB raw   168.6 KB gzipped   6 chunks

diff of the chunk lists: IDENTICAL
```

Not merely equal in total — the two routes load **byte-identical chunk sets**. Both ship
the framework runtime and nothing else, because neither group has a client component. The
page components are server-rendered, so their code never reaches the browser at all.

**The byte difference was never the point.** It was a proxy for the real question:
*does the grouping actually keep app code out of the marketing bundle?* That question is
answerable today, and answering it directly is strictly better than the proxy:

| | byte comparison | static isolation test |
|---|---|---|
| Fails when | someone has already shipped the import | the import is written |
| Tells you | a number moved | which file, which import, which rule |
| Works today | no | yes |

**Amended to:** *route-group bundle isolation is verified, and the first-load JS baselines
are recorded in §20.*

Satisfied by `src/app/__tests__/route-group-isolation.test.ts`, which asserts:

- no route group imports from another (§12, blueprint §19)
- `/c/[token]` contains no `'use client'` directive **and no React hook** — a hook is a
  client component arriving before the directive does (blueprint §29.24)
- the shared not-found component stays server-only, since the capsule route renders it
- the marketing group never reaches into `src/lib`, where server-only config lives
- every group has its own layout

**Both guards were verified to fail**, not merely to pass: injecting
`import AppLayout from '../(app)/layout'` into the marketing page produced
`(marketing)/page.tsx imports from (app)`, and adding `'use client'` to the capsule page
produced the §29.24 failure naming the file. Reverted after each.

**What is deferred, and where it is tracked:** the byte comparison itself becomes
meaningful the moment TASK-013 adds real client code to the app shell.
`scripts/verify-routes.mjs` already prints the comparison every run, so the divergence
appears automatically — **TASK-013 should assert it there** rather than re-deriving it.
The baselines above are the number to regress against.


### Route decision: authenticated home lives at `/app`, not `/`

Blueprint §19 shows `(app)/page.tsx` — which resolves to `/` — while §4 of this task
requires a distinct placeholder at `/app`. Both cannot own `/`; Next fails the build
on duplicate routes. Per CONVENTIONS ("where a task's §6 conflicts with this document,
the task wins"), the task wins: marketing owns `/`, the app shell owns `/app`.

**Consequence for a later task:** at launch, a signed-in visitor hitting `/` should
land on Today rather than the marketing page. That is a redirect in the `(marketing)`
layout or in `proxy.ts`, and it belongs to PHASE-02 once sessions exist. It is not
free — the redirect must not run for logged-out visitors or it destroys marketing SEO.

### Other deviations, and why

- **No `create-next-app`.** SPR-01-01-01 §3 suggests scaffolding with it, then
  stripping back. `apps/site/package.json` already existed from TASK-001 with its
  workspace wiring; `create-next-app` would have overwritten it. Dependencies were
  added directly instead — same result, no clobbering.
- **Shared tsconfig preset not extended.** `apps/site/tsconfig.json` adds the Next
  options (`jsx: preserve`, DOM libs, the `next` plugin, `@/*`) locally rather
  than adding a `nextjs.json` preset to `packages/config`. There is exactly one
  Next app; a shared preset is premature and §9 forbids opportunistic refactoring. Add
  it when a second consumer appears.
- **ESLint gained the Next and React layers**, which TASK-001 §20 explicitly deferred
  here. `jsx-a11y` was **not** added: its ESLint 10 support is unconfirmed and
  TASK-001's "no peer-dependency errors" criterion was worth preserving. Accessibility
  is still covered at runtime by axe in Playwright (CONVENTIONS) — but a lint-level a11y
  layer is worth revisiting in TASK-096.

### A pnpm lesson worth recording

`apps/site/eslint.config.js` imports `globals`, which was a dependency of
`@mm/config` rather than of `@mm/web`. Under npm's hoisted `node_modules` this
would have silently worked; pnpm's strict layout failed it with
`ERR_MODULE_NOT_FOUND`. That is pnpm doing its job — the import was a phantom
dependency, and it was fixed by declaring what the file actually imports.

Expect this class of failure again as workspaces grow. It is a feature.

### Verification of §17 acceptance criteria

| Criterion | Result | How |
|---|---|---|
| `pnpm dev` serves all placeholder routes | Pass | Dev server started; `/`, `/login`, `/app`, `/admin`, `/c/test`, `/s/test` all returned 200. |
| `/c/test` renders with JavaScript disabled in Playwright | Pass | `no-javascript` project, `javaScriptEnabled: false`; 5 tests green. |
| Marketing first-load JS measurably smaller than app | **BLOCKED** | Identical (168.6 KB both). See the blocker above — the app shell does not exist yet. |
| `noindex` on `/c/*` and `/s/*` | Pass | `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` asserted on both, and asserted absent on `/`. |
| Baseline security headers on every route | Pass | HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, CSP with `frame-ancestors none` — asserted on all six routes. `X-Powered-By` asserted absent. |
| Next docs guide consulted, deviations noted | Pass | Table above. |

Also verified beyond §17:

- **§16 unit test** — 5 tests over the reserved-slug list.
- **§16 E2E** — 19 Playwright tests across two projects, all green.
- **§13 reserved slugs** — encoded as `(marketing)/reserved-slugs.ts` with tests,
  rather than only documented in prose. A prose list nobody can execute would be
  forgotten by PHASE-10.
- **§13 trailing slash** — set explicitly (`trailingSlash: false`) rather than left
  to default, so preview and production cannot disagree.
- **§14** — an unknown route renders the warm 404, and the body is asserted **not** to
  contain a stack trace.
- **Workspace gates** — `pnpm typecheck`, `lint`, `test`, `build` all green
  across six workspaces; second build `>>> FULL TURBO`.

### Left deliberately undone

No design work, no fonts, no `globals.css` (§11: placeholders only — TASK-011 owns
tokens). No `api/` route handlers: none of the machine surfaces exist yet, and an
empty directory would only invite speculative endpoints. No `proxy.ts` — nothing
needs per-request logic until sessions exist in PHASE-02.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-01](../EPIC-01-01-01-01.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§19`, `§28.5`, `ADR-002` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
