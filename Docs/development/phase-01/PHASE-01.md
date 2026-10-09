# PHASE-01 — Foundation & Architecture

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-01 |
| Phase name | Foundation & Architecture |
| Release | Release 1 |
| Phase objective | Stand up an empty but production-shaped monorepo, design system, and data layer that every later phase builds on. |
| Business objective | Nothing ships to users, but every later week is faster or slower depending on this fortnight. |
| Technical objective | Monorepo, Next.js 16 app, workers service, PostgreSQL + Drizzle migration pipeline, design tokens, CI/CD, observability. |
| Priority | critical |
| Status | pending |
| Dependencies | None |
| Estimated effort | ~2 weeks |
| Modules | 2 |
| Sprints | 3 |
| Epics | 6 |
| Tasks | 16 |
| Expected outcome | A deployed empty shell on a real URL, green CI, a working migration pipeline, and a token-driven component library. |

---

## 1. Phase Purpose

This phase exists because the project has **no codebase**. The repository today holds the blueprint plus a static marketing site that is explicitly not the application (blueprint §0, §35.1).

Everything here is enabling work, and it is front-loaded for one reason: three decisions made in this phase are extremely expensive to change later — the monorepo boundary between web and workers (ADR-003), the single-schema-source rule (ADR-005), and the token architecture for theming (ADR-014). The existing repository already demonstrates the cost of getting the last one wrong: its dark mode collapses `--primary` to pure white and loses the brand colour entirely, because colours were defined inside media queries rather than as a complete palette on `:root`.

---

## 2. Phase Goals

- `pnpm install && pnpm dev` works from a clean clone on Windows and macOS.
- A Next.js 16 App Router app deploys to a real preview URL from CI.
- A separate workers service builds, containerises, and deploys independently of the web app.
- A Drizzle migration can be authored, applied, and rolled back against a branched database.
- The §26 design tokens exist as CSS custom properties and render correctly in light, dark, and system themes.
- Twelve base UI primitives exist with all six input states and both themes.
- Sentry captures a deliberately thrown error from both web and workers.

---

## 3. Features Delivered

- Monorepo workspace with four packages and two apps.
- Next.js 16 App Router application skeleton with route groups for marketing, auth, app, and admin.
- Independently deployable workers service.
- PostgreSQL schema pipeline with migrations, seeds, and per-PR database schemas.
- Design token system and base component library from blueprint §26.
- Configuration-driven app shell: bottom tab bar on mobile, sidebar on desktop.
- CI: typecheck, lint, unit test, build, preview deploy.

---

## 4. Architecture Impact

- Introduces the `apps/api` / `apps/workers` split — the boundary that keeps the delivery engine alive during a bad web deploy (ADR-003).
- Introduces `packages/db` as the single schema source shared by both apps (ADR-005).
- Introduces `packages/shared` for Zod schemas and domain types crossing the app/worker boundary.
- Establishes the theming contract every later screen depends on (ADR-014).
- Establishes the result/error envelope used by every server action and route handler (ADR-023).

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-01-01](module-01/MOD-01-01.md) | Repository, Toolchain & Data Layer | Provide a reproducible development environment and a deployment path, so that from PHASE-02 onward every task is about product behaviour rather than plumbing. | critical | pending |
| [MOD-01-02](module-02/MOD-01-02.md) | Design System Foundation | Provide the visual and interaction foundation every screen in every later phase is built from, so no screen re-invents a button, a sheet, or a theme. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** None — this phase can start immediately.

- **External:** AWS Organization with production / preview / shared-services accounts, Aurora PostgreSQL cluster, ECR repositories, Cloudflare R2 bucket, Sentry project, GitHub repository with Actions enabled and OIDC trust configured.
- **Design:** blueprint §26 tokens are fully specified, so this phase is not blocked on further design work (assumption AS-2).
- **Technical:** none — this is the root of the dependency graph.

---

## 7. Phase Deliverables

- Running monorepo with CI green on `main`.
- Preview deployment per pull request, with an isolated database branch.
- `packages/db` with an initial migration and a realistic seed script.
- Token stylesheet plus Tailwind preset.
- Component library covering buttons, inputs, sheets, dialogs, toasts, and the skeleton/empty/error templates.
- App shell with working responsive navigation.
- `docs/` architecture notes committed alongside the code.

---

## 8. Phase Acceptance Criteria

- [ ] A clean clone reaches a running dev server in under five minutes with only documented prerequisites.
- [ ] CI blocks a pull request on a type error, a lint error, or a failing test.
- [ ] A migration applied to a PR preview schema does not affect any other PR schema on the shared Aurora cluster.
- [ ] Switching the OS theme flips the app between light and dark with no unstyled flash and no lost brand colour.
- [ ] Every component primitive passes an axe check with zero serious or critical violations.
- [ ] A thrown test error appears in Sentry from both `apps/api` and `apps/workers`.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Next.js 16 breaking changes cause repeated rework | medium | Every framework task requires reading `node_modules/next/dist/docs/` first (ADR-002). Budget a spike task before the scaffold. |
| Token architecture repeats the existing repo bug (dark-mode-only definitions) | high | TASK on tokens has an explicit acceptance criterion asserting a complete palette on bare `:root`, plus a test that renders in all three theme states. |
| Monorepo tooling friction on Windows | medium | pnpm + Turborepo are both well-supported on Windows; CI runs Linux, so a Windows-specific break is caught by a local-dev smoke check in the setup task. |
| Over-building the design system before screens exist | medium | Scope is fixed to the twelve primitives the R1 screens actually use; anything else waits. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder can open the preview URL and see a themed, navigable empty shell
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§18 Technical architecture`
- `§19 Repository structure`
- `§26 Design system`
- `§21 Phase 1`
- `ADR-001 → ADR-025`
