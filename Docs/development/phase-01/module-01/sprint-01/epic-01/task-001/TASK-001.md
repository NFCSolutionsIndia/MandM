# TASK-001 — Initialise pnpm + Turborepo Workspace

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-001 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-01 — Workspace & Package Scaffold](../EPIC-01-01-01-01.md) |
| Type | devops |
| Priority | critical |
| Status | completed |
| Dependencies | None |
| Blueprint refs | `§19`, `ADR-003` |

---

## 1. Objective

Create the monorepo root with pnpm workspaces and a Turborepo pipeline covering typecheck, lint, test, and build.

---

## 2. Context

This is the first task in the project. Nothing exists yet except the blueprint, this plan, and a static marketing site under `src/` that is a reference only and must not be modified or migrated.

---

## 3. Problem Statement

Without a workspace boundary, shared Zod schemas and the database schema get duplicated between the web app and the workers service, and the two drift. Blueprint §19 requires `packages/db` to be a single source of truth; that is only enforceable inside a workspace.

---

## 4. Expected Outcome

A repository root containing `pnpm-workspace.yaml`, `turbo.json`, a root `package.json` with scripts, and six empty-but-valid workspace directories. `pnpm install` succeeds. `pnpm typecheck` runs and passes trivially.

---

## 5. Requirements

### Functional Requirements

- Workspaces declared: `apps/*` and `packages/*`.
- Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`.
- Turborepo tasks with `dependsOn: ["^build"]` where appropriate and correct output caching.

### Technical Requirements

- pnpm 9+; Node pinned in `.nvmrc` and `package.json#engines`.
- `packageManager` field set so Corepack activates the right pnpm.
- Turborepo `turbo.json` declares `outputs` for `build` so caching works.
- Root `tsconfig.json` with `strict: true` and `noUncheckedIndexedAccess: true`, extended by each workspace.

---

## 6. Implementation Instructions

1. Create the repository root files: `package.json` (private, no dependencies beyond turbo and typescript), `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `.editorconfig`.
2. `.gitignore` must cover `node_modules`, `.next`, `.turbo`, `dist`, `out`, `.env`, `.env.*` (but allow `.env.example`), and `*.log`. **Do this before any secret could be created.**
3. Create the six workspace directories, each with a minimal `package.json` naming itself `@mm/<name>` and a `tsconfig.json` extending the root.
4. Configure Turborepo tasks: `build`, `typecheck`, `lint`, `test`, `dev` (persistent, no cache).
5. Verify that `packages/shared` can be imported from `apps/api` by alias `@mm/shared` and that typecheck resolves it.
6. Add a root `README.md` documenting prerequisites (Node version, pnpm, Corepack) and the exact bootstrap commands.
7. Do **not** touch the existing `src/`, `next.config.ts`, or `package.json` at the repository root that belong to the static marketing site — see §20 for how to handle the collision.

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
package.json                  (new root workspace manifest)
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
.nvmrc
.gitignore                    (extend, do not replace)
.editorconfig
README.md
apps/site/package.json
apps/workers/package.json
packages/shared/package.json
packages/db/package.json
packages/emails/package.json
packages/config/package.json
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

- The existing static marketing site must remain buildable until PHASE-10 replaces it, or must be moved in one deliberate commit — decide and record in §20, do not leave it half-moved.
- No workspace may depend on `apps/*`; dependencies flow packages → apps only.

---

## 13. Edge Cases

- A root `package.json` already exists for the static site. Either relocate that site to `legacy/marketing-static/` in a single commit, or namespace the new root and keep the old one — **pick one, record it, and do not leave two competing roots.**
- Windows path length limits with deep `node_modules`: pnpm's symlinked store mitigates this, but verify on the Windows dev machine.
- Corepack disabled on the developer machine — README must say how to enable it.

---

## 14. Error Handling

- Workspace resolution failure must surface as a typecheck error, not a runtime error — verify by importing a symbol that does not exist and confirming CI would catch it.

---

## 15. Security Considerations

- `.gitignore` covering all `.env*` variants is part of this task, not a later one.
- No dependency added here may require a postinstall script; audit what `turbo` pulls in.

---

## 16. Testing Requirements

### Unit Tests

- A trivial passing test in `packages/shared` proves the runner resolves workspace TypeScript.

---

## 17. Acceptance Criteria

- [x] `pnpm install` completes from a clean clone with no peer-dependency errors.
- [x] `pnpm typecheck` exits 0.
- [x] `pnpm build` exits 0 (trivially, since nothing is built yet).
- [x] A second `pnpm build` is served from the Turborepo cache.
- [x] The decision about the existing static site is recorded in this task's §20 and in the README.
- [x] No `.env` file can be committed — verified by attempting to add one and observing it ignored.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — CI is created in TASK-005 and will run these same four gates
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

_No prerequisite tasks — this task can start immediately._


---

## 20. Implementation Notes

### Decision: the existing static marketing site — **there was none** (§13 edge case resolved)

At the time this task ran, the repository contained exactly two tracked paths: `Docs/` and
`MM_PWA_BLUEPRINT.md`. There was **no `src/`, no `next.config.ts` and no root
`package.json`** for a static marketing site — the collision described in §2 and §13 does
not exist in this repository.

**Option taken: neither relocate nor namespace — the new root is the only root.** Nothing
was moved to `legacy/marketing-static/`, because there was nothing to move. There is one
`package.json` at the repository root and it belongs to this monorepo. This is recorded in
the README under "Repository history" so a second developer does not go looking for the
site. The marketing route group is built fresh in `apps/site/src/app/`
(TASK-002) and replaced at PHASE-10, not migrated.

### Version pins and why

Exact versions, not ranges, per this section's original instruction — extended to every
dependency rather than only `next` / `react` / `react-dom` (which this task does not
install; TASK-002 does).

| Package | Pinned | Reasoning |
|---|---|---|
| Node | `24.11.1` | Current LTS line. `.nvmrc` plus `engines: ">=24.11.0 <25.0.0"`. Comfortably above Next.js 16's `>=20.9.0`. |
| pnpm | `10.34.5` | Satisfies the "pnpm 9+" requirement. `11.24.0` was published three days before this task ran; the 10.x line is still actively maintained and is the conservative choice for the first commit in the repository. Revisit when pnpm 11 has a longer track record. |
| turbo | `2.10.12` | Latest. |
| TypeScript | `5.9.3` | **Deliberately not `7.0.2`.** TypeScript 7 is the native-port compiler; `typescript-eslint@8.68.0` declares `typescript: ">=4.8.4 <6.1.0"`, so TS 7 would break linting today. 5.9.3 is the last 5.x and is supported by every tool in this stack. Revisit once typescript-eslint and Next.js both support 7.x. |
| ESLint | `10.9.1` with `typescript-eslint@8.68.0` | typescript-eslint 8.68 declares support for ESLint `^10.0.0`, so the pairing is sanctioned rather than forced. |
| Vitest | `4.1.11` | Latest. |

### Deviations from §8, and why

- **`packages/config/tsconfig/base.json` holds the real compiler options**, and the root
  `tsconfig.base.json` is a thin `extends` of it. The first attempt put the options at the
  root and had `@mm/config` reach back up with `../../../tsconfig.base.json`; Vitest 4's
  oxc-based tsconfig loader resolves that relative hop against the **symlink** path inside
  `node_modules` rather than the real path, and failed with
  `Failed to load tsconfig 'node_modules/tsconfig.base.json'`. Owning the options inside
  `packages/config` removes the upward hop entirely and matches CONVENTIONS, which already
  assigns tsconfig to `packages/config`. Both files listed in §8 still exist.
- **A minimal ESLint flat config was created in `packages/config`.** No task in
  SPR-01-01-01 owns ESLint explicitly, but the sprint scope and EPIC-01-01-01-01 §5 both
  require shared lint configuration to be consumed rather than duplicated, and this task's
  Definition of Done requires `pnpm lint` to be clean. The config is base-only
  (`@eslint/js` recommended, typescript-eslint recommended, four project rules); the
  React/Next and Node layers belong to TASK-002 and TASK-003.
- **Internal packages export TypeScript source** (`"exports": "./src/index.ts"`) rather
  than a compiled `dist`. This is Turborepo's "just-in-time package" pattern: no build step
  between editing `packages/shared` and seeing the change in `apps/api`, and no
  stale-`dist` class of bug. `turbo.json` still declares `dependsOn: ["^build"]` and
  `outputs` for `build` as §5 requires, so a package that later needs a real build
  (`packages/emails`) is already wired for it.
- **`build` in both apps is currently `tsc -p tsconfig.json`.** §4 expects `pnpm build` to
  pass trivially since nothing is built yet. TASK-002 and TASK-003 replace these with the
  real Next.js and workers builds. Until then Turborepo warns "no output files found for
  task" on `build` — expected, and it resolves once `.next/` and `dist/` exist.
- **`typecheck` and `test` declare empty `outputs`.** They are checks, not producers.
  Caching still works through log replay; the §17 cache criterion is verified via `build`.

### The `db:*` scripts exit 1 on purpose

`pnpm db:generate`, `db:migrate` and `db:seed` delegate to `packages/db`, which prints a
message naming TASK-008 / TASK-009 and exits 1. A no-op that exits 0 would let someone
believe a migration ran against a database that does not exist yet. Nothing in CI depends
on these scripts at this stage.

### Windows notes (§13)

- `corepack enable` fails with `EPERM: ... C:\Program Files\nodejs\pnpm` when Node is
  installed for all users and the shell is not elevated. The working non-elevated fix is
  `corepack enable --install-directory "$APPDATA/npm"`, since that directory is already on
  `PATH`. Turborepo shells out to the package-manager binary and fails with
  `Unable to find package manager binary` if only `corepack pnpm ...` is used, so the shims
  are required rather than optional. Both routes are documented in the README.
- **Path length:** no issue observed. pnpm's content-addressed store keeps `node_modules`
  shallow; the deepest real path after install stays well inside the Windows limit.

### Verification of §17 acceptance criteria

| Criterion | Result | How it was verified |
|---|---|---|
| `pnpm install` completes from a clean clone with no peer-dependency errors | Pass | `Done in 52.1s using pnpm v10.34.5`, 133 packages, no peer warnings. |
| `pnpm typecheck` exits 0 | Pass | `Tasks: 6 successful, 6 total`. |
| `pnpm build` exits 0 | Pass | `Tasks: 2 successful, 2 total`. |
| A second `pnpm build` is served from the Turborepo cache | Pass | `2 cached, 2 total` — `Time: 272ms >>> FULL TURBO`. `typecheck` also reached `6 cached, 6 total >>> FULL TURBO`. |
| The static-site decision is recorded in §20 and in the README | Pass | This section, plus README "Repository history". |
| No `.env` file can be committed | Pass | Created `.env.test` and `.env.example`; `git status --untracked-files=all` listed only `.env.example`. `git check-ignore -v` confirms `.env`, `.env.local` and `.env.production` are all ignored. |

Verified beyond §17:

- **§14** — appended `import { thisSymbolDoesNotExist } from '@mm/shared'` to
  `apps/site/src/workspace-check.ts`; `pnpm --filter @mm/web typecheck` failed with
  `error TS2305: Module '"@mm/shared"' has no exported member 'thisSymbolDoesNotExist'`.
  Workspace resolution failure surfaces as a typecheck error, not a runtime one. The probe
  was removed and typecheck re-run clean.
- **§15** — audited all 133 installed packages for `preinstall` / `install` / `postinstall`:
  **none declares one.** `turbo` and `typescript` pull in no lifecycle scripts.
- **§16** — `packages/shared` has two passing Vitest tests proving the runner resolves
  workspace TypeScript: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.
- **§6.5 and §12** — `apps/api` and `apps/workers` both import `@mm/shared` by alias and
  typecheck resolves it. No workspace depends on `apps/*`; dependencies flow
  packages → apps only.
- **`pnpm lint`** — `Tasks: 6 successful, 6 total`, zero warnings.

### Left to the next tasks, deliberately

`apps/api` and `apps/workers` each contain a single `workspace-check.ts` and no framework
code. Next.js belongs to TASK-002 and the workers claim loop to TASK-003. `packages/config`
has no Tailwind preset yet — that belongs to MOD-01-02, the design-system module.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-01](../EPIC-01-01-01-01.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§19`, `ADR-003` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
