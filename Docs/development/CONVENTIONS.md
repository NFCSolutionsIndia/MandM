# Conventions

Applies to every task. Where a task's §6 conflicts with this document, the task wins and the conflict should be recorded in its §20.

## Repository layout

Per blueprint §19/§37 and ADR-003:

```
apps/api            Node HTTP API — /api/v1, the only entry point for the apps
apps/admin          admin.mydomain.com — the admin console (Next.js)
apps/site           mydomain.com — marketing pages AND /c/[token], /s/[token] (Next.js)
apps/workers        delivery engine, media pipeline, scheduled jobs
apps/ios            native iOS app — Swift 6 · SwiftUI
apps/android        native Android app — Kotlin 2 · Jetpack Compose
packages/shared     zod schemas, domain types, constants — source of the OpenAPI contract
packages/db         drizzle schema + migrations — SINGLE SOURCE (PostgreSQL, ADR-005)
packages/emails     react-email templates
packages/config     eslint, tsconfig, tailwind preset
infra/              AWS CDK stacks (TASK-006, ADR-019)
Docs/development    this plan

There is NO member-facing web application. Everything a member touches is in the
native apps; `/app/*` paths are screen identifiers and universal-link targets, not
web pages.
```

## Route and screen identifiers

`/app/*` paths — `/app/timeline`, `/app/capsule/[id]` and the rest — are **screen
identifiers in the native apps**, and the universal-link targets that open them. They are
not web pages and no web server serves them. The only paths a browser ever resolves are:

| Host | Paths | Served by |
|---|---|---|
| `mydomain.com` | `/`, `/pricing`, `/features`, `/blog`, … | `apps/site` |
| `mydomain.com` | `/c/[token]` — recipient unlock, **server-rendered, works with JS disabled** | `apps/site` |
| `mydomain.com` | `/s/[token]` — share link | `apps/site` |
| `admin.mydomain.com` | `/*` — the admin console | `apps/admin` |
| `api.mydomain.com` | `/api/v1/*` | `apps/api` |

## Naming

| Thing | Convention | Example |
|---|---|---|
| Directories | kebab-case | `src/features/capsule/` |
| React components | PascalCase file + named export | `CapsuleCountdown.tsx` |
| Hooks | `use` prefix | `useUploadQueue.ts` |
| Server actions | verb-first, `Action` suffix | `sealCapsuleAction` |
| Zod schemas | `Schema` suffix | `SealCapsuleSchema` |
| DB tables | snake_case plural | `capsule_recipients` |
| DB columns | snake_case | `occurred_precision` |
| Enums | snake_case values, `VARCHAR` + `CHECK` — never a native enum type (ADR-005) | `'sealed' | 'delivering'` |
| DB ids | native `uuid` in PostgreSQL, canonical UUID string at every boundary (ADR-027) | `id`, `vault_id` |
| DB timestamps | `timestamptz` UTC — **`TIMESTAMP` is banned** (ADR-024) | `unlock_at`, `created_at` |
| Env vars | SCREAMING_SNAKE | `R2_BUCKET_MEDIA` |
| Test files | co-located `__tests__` | `features/capsule/__tests__/seal.test.ts` |

## Feature module shape

Every `src/features/<domain>/` contains:

```
components/     UI owned by this domain
actions.ts      server actions (mutations)
queries.ts      read functions — ALL go through lib/authz
schema.ts       zod schemas (re-exported from packages/shared where shared)
hooks/          client hooks
types.ts
__tests__/
```

**No feature module may query another feature's tables directly** (ADR-004). Cross-domain reads go through the owning module's `queries.ts`.

## Authorization — the one rule

Every read and every write calls into `lib/authz`. No exceptions, including admin paths.

```
requestor + resource  →  lib/authz  →  { allowed, role, reason }
```

- Scope every query by `vault_id` resolved from the **session**.
- Treat client-supplied ids as filters, never as authorization.

**Row-level security backs this rule up since 2026-09-29** (ADR-009), and neither layer excuses the other; treat every one of these as non-negotiable rather than as guidance:

- **Never import the Drizzle client inside `src/features/**`.** Feature code calls repository functions in `lib/db`; the ESLint rule that enforces this is a CI gate, not a warning.
- **Every repository function takes a `VaultScope` as its first parameter.** Only `lib/authz` can construct one. If you find yourself wanting to write a query without a scope, that is the design telling you the authorization step is missing.
- **A new table requires:** a `vault_id` column, an index on it, a repository module, and its cell in the permission-matrix test — all in the same PR as the migration. On Postgres this was one line, "a new RLS policy in the same migration"; the replacement is more work, not less, and that is the price of the engine choice.
- **Never disable the post-query scope guard**, even in a hot path. If it fires, that is a privacy incident in progress, not a performance problem.

## Error handling

Per ADR-023. Server actions return `{ ok: true, data } | { ok: false, error: { code, message, field? } }`. **Do not throw for expected failures.** Unexpected failures throw and are captured by Sentry with the user-facing message reduced to a generic apology plus a support reference.

Error copy follows §33.2: **what is wrong + how to fix it.** "PIN code must be 6 digits", never "Invalid input".

## Status vocabulary

Only `pending` · `progress` · `completed`. Set in each document's status field and mirrored in `PROJECT_PROGRESS.md`. A parent is `completed` only when every child is.

## Testing

| Layer | Tool | Rule |
|---|---|---|
| Unit / integration | Vitest | Business rules and authz get direct unit tests |
| Component | Vitest + jsdom + Testing Library | Assert on roles and accessible names, not class names |
| API | Vitest against route handlers | Every documented error code has a test |
| Permissions | Vitest against `lib/authz` + real PostgreSQL (Testcontainers) | Every permission-matrix cell has a **positive and a negative** test (ADR-018) |
| E2E | Playwright | Critical path, **plus offline and install flows** |
| A11y | axe in Playwright | Zero serious/critical violations on every shipped screen |

## Accessibility floor (blueprint §26.8)

WCAG 2.2 AA. Contrast 4.5:1 text / 3:1 UI. **Coral `#FF6B5E` must never be used for small text on white** — it fails 4.5:1; it is valid for large text, icons, and fills only. Touch targets ≥ 44×44px. Visible focus ring. `prefers-reduced-motion` variant for every animation. Never colour alone for status.

## Copy rules (blueprint §33.11)

Warm, human, second person. Emoji sparing and purposeful. **Never call a memory a "file", "asset", or "record" in user-facing text.** Real-feel content in all seeds and fixtures — Indian and global names, realistic dates. **Never lorem ipsum.**

## Commits and branches

Conventional commits with the task id: `feat(capsule): seal transaction + job row [TASK-092]`.
**One commit per task** — a task is the unit of work and of review.

### One branch per EPIC, not per task

```
epic/EPIC-01-01-01-01-workspace-scaffold
  ├── feat(web): … [TASK-002]
  ├── feat(workers): … [TASK-003]
  └── feat(shared): … [TASK-004]
        ↓ merge when every task in the epic is `completed`
      main
```

- Branch from `main` when the first task of an epic starts.
- One commit per task on that branch, each running the full gates before it lands.
- **Merge to `main` only when every task in the epic is `completed`.** An epic is the
  smallest unit that leaves the codebase coherent; a half-finished epic on `main` means
  `main` describes a state nobody intended.
- Delete the branch after merge.

**Why not per task:** a task branch produces stacked branches that must merge in order,
and a conflict in `PROJECT_PROGRESS.md` on every single one, for no gain while the
project has one contributor and no CI. **Why not straight to `main`:** an epic left
half-done on `main` is worse than one left half-done on a branch.

Revisit at TASK-005 and TASK-006: once CI gates pull requests and previews are
provisioned per PR, a smaller unit may earn its keep. Record the change here if so.

### A task whose status is `progress`

An epic cannot merge while any of its tasks is `progress`. If a task is blocked on work
in a later phase — as TASK-002 is blocked on TASK-013 for one acceptance criterion — the
blocker goes in that task's §20, and the epic merges only once the team accepts the
blocker in writing. Do not silently promote a blocked task to `completed` to unblock a
merge; that is how an acceptance criterion quietly stops meaning anything.
