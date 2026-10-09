module.exports = {
  id: 'PHASE-01', name: 'Foundation & Architecture', release: 'Release 1',
  objective: 'Stand up an empty but production-shaped monorepo, design system, and data layer that every later phase builds on.',
  business: 'Nothing ships to users, but every later week is faster or slower depending on this fortnight.',
  technical: 'Monorepo, Next.js 16 app, workers service, Postgres + Drizzle migration pipeline, design tokens, CI/CD, observability.',
  priority: 'critical', deps: [], effort: '~2 weeks',
  outcome: 'A deployed empty shell on a real URL, green CI, a working migration pipeline, and a token-driven component library.',
  purpose: `This phase exists because the project has **no codebase**. The repository today holds the blueprint plus a static marketing site that is explicitly not the application (blueprint §0, §35.1).

Everything here is enabling work, and it is front-loaded for one reason: three decisions made in this phase are extremely expensive to change later — the monorepo boundary between web and workers (ADR-003), the single-schema-source rule (ADR-005), and the token architecture for theming (ADR-014). The existing repository already demonstrates the cost of getting the last one wrong: its dark mode collapses \`--primary\` to pure white and loses the brand colour entirely, because colours were defined inside media queries rather than as a complete palette on \`:root\`.`,
  goals: [
    '\`pnpm install && pnpm dev\` works from a clean clone on Windows and macOS.',
    'A Next.js 16 App Router app deploys to a real preview URL from CI.',
    'A separate workers service builds, containerises, and deploys independently of the web app.',
    'A Drizzle migration can be authored, applied, and rolled back against a branched database.',
    'The §26 design tokens exist as CSS custom properties and render correctly in light, dark, and system themes.',
    'Twelve base UI primitives exist with all six input states and both themes.',
    'Sentry captures a deliberately thrown error from both web and workers.',
  ],
  features: [
    'Monorepo workspace with four packages and two apps.',
    'Next.js 16 App Router application skeleton with route groups for marketing, auth, app, and admin.',
    'Independently deployable workers service.',
    'Postgres schema pipeline with migrations, seeds, and per-PR database branches.',
    'Design token system and base component library from blueprint §26.',
    'Configuration-driven app shell: bottom tab bar on mobile, sidebar on desktop.',
    'CI: typecheck, lint, unit test, build, preview deploy.',
  ],
  arch: [
    'Introduces the \`apps/web\` / \`apps/workers\` split — the boundary that keeps the delivery engine alive during a bad web deploy (ADR-003).',
    'Introduces \`packages/db\` as the single schema source shared by both apps (ADR-005).',
    'Introduces \`packages/shared\` for Zod schemas and domain types crossing the app/worker boundary.',
    'Establishes the theming contract every later screen depends on (ADR-014).',
    'Establishes the result/error envelope used by every server action and route handler (ADR-023).',
  ],
  depDetail: [
    '**External:** Neon project, Vercel project, Fly.io org, Sentry project, GitHub repository with Actions enabled.',
    '**Design:** blueprint §26 tokens are fully specified, so this phase is not blocked on further design work (assumption AS-2).',
    '**Technical:** none — this is the root of the dependency graph.',
  ],
  deliverables: [
    'Running monorepo with CI green on \`main\`.',
    'Preview deployment per pull request, with an isolated database branch.',
    '\`packages/db\` with an initial migration and a realistic seed script.',
    'Token stylesheet plus Tailwind preset.',
    'Component library covering buttons, inputs, sheets, dialogs, toasts, and the skeleton/empty/error templates.',
    'App shell with working responsive navigation.',
    '\`docs/\` architecture notes committed alongside the code.',
  ],
  ac: [
    'A clean clone reaches a running dev server in under five minutes with only documented prerequisites.',
    'CI blocks a pull request on a type error, a lint error, or a failing test.',
    'A migration applied to a PR branch database does not affect any other branch.',
    'Switching the OS theme flips the app between light and dark with no unstyled flash and no lost brand colour.',
    'Every component primitive passes an axe check with zero serious or critical violations.',
    'A thrown test error appears in Sentry from both \`apps/web\` and \`apps/workers\`.',
  ],
  risks: [
    ['Next.js 16 breaking changes cause repeated rework', 'medium', 'Every framework task requires reading `node_modules/next/dist/docs/` first (ADR-002). Budget a spike task before the scaffold.'],
    ['Token architecture repeats the existing repo bug (dark-mode-only definitions)', 'high', 'TASK on tokens has an explicit acceptance criterion asserting a complete palette on bare `:root`, plus a test that renders in all three theme states.'],
    ['Monorepo tooling friction on Windows', 'medium', 'pnpm + Turborepo are both well-supported on Windows; CI runs Linux, so a Windows-specific break is caught by a local-dev smoke check in the setup task.'],
    ['Over-building the design system before screens exist', 'medium', 'Scope is fixed to the twelve primitives the R1 screens actually use; anything else waits.'],
  ],
  gate: 'A stakeholder can open the preview URL and see a themed, navigable empty shell',
  trace: ['§18 Technical architecture', '§19 Repository structure', '§26 Design system', '§21 Phase 1', 'ADR-001 → ADR-025'],

  modules: [
    /* ============================= MOD-01-01 ============================= */
    {
      id: 'MOD-01-01', name: 'Repository, Toolchain & Data Layer',
      purpose: 'Create the workspace, the two deployable apps, the schema pipeline, and CI.',
      priority: 'critical',
      objective: 'Provide a reproducible development environment and a deployment path, so that from PHASE-02 onward every task is about product behaviour rather than plumbing.',
      business: [
        'Reduces the cost of every subsequent engineering week.',
        'Makes preview environments available to product and design for continuous review.',
        'Establishes the operational separation that protects the delivery guarantee (workers deploy independently of web).',
      ],
      functional: [
        'A developer can clone, install, and run both apps locally.',
        'A developer can author a schema change and apply it as a migration.',
        'A pull request produces an isolated preview environment with its own database.',
        'The seed script creates a believable multi-user dataset for development.',
      ],
      backend: [
        'Next.js 16 App Router with route groups: `(marketing)`, `(auth)`, `(app)`, `admin`, plus `api/` route handlers.',
        'Workers service as a long-running Node container with a claim loop skeleton.',
        'Shared Zod schema package consumed by both.',
        'Result/error envelope helpers (ADR-023) available from `packages/shared`.',
      ],
      db: [
        'Postgres on Neon with a branch per pull request.',
        'Drizzle schema in `packages/db/schema/`, migrations in `packages/db/migrations/`.',
        'No application tables yet beyond what PHASE-02 needs — this module delivers the *pipeline*, not the domain model.',
        'RLS enabled at the database level from the first migration so no table can be added without a policy (ADR-009).',
      ],
      integrations: ['Neon', 'Vercel', 'Fly.io', 'Sentry', 'GitHub Actions'],
      security: [
        'No secrets in the repository; enforced by a pre-commit scanner and CI secret scanning (blueprint §20.8).',
        'Separate credentials per environment; least-privilege storage credentials.',
        'Preview environments use branched databases with synthetic seed data only — never production data.',
      ],
      testing: [
        'A smoke test that the app boots and renders the shell.',
        'A migration test that applies and rolls back cleanly against an ephemeral database.',
        'CI must fail on typecheck, lint, or test failure.',
      ],
      ac: [
        'Clean-clone bootstrap documented in the root README and verified by a second developer.',
        'CI pipeline green on `main` with all four gates active.',
        'Preview deploy with isolated database demonstrated on a throwaway PR.',
        'Sentry receives errors from both apps.',
      ],
      trace: ['§19', '§18.1', '§21 Phase 1'],

      sprints: [
        {
          id: 'SPR-01-01-01', name: 'Monorepo & Application Scaffold',
          objective: 'A running, deployable, empty monorepo.',
          priority: 'critical', deps: [], duration: '~1 week',
          goal: 'From a clean clone, `pnpm install && pnpm dev` starts the web app and the workers service, and a push to a branch produces a preview deployment.',
          inScope: [
            'pnpm workspace + Turborepo configuration.',
            'Next.js 16 App Router scaffold with route groups and a placeholder page per group.',
            'Workers service scaffold with a claim-loop skeleton that logs and exits cleanly.',
            '`packages/config` (eslint, tsconfig, tailwind preset) and `packages/shared` (result envelope, first Zod schemas).',
            'CI workflow and hosting projects.',
            'Sentry in both apps.',
          ],
          outScope: [
            'Any domain model or business logic.',
            'Authentication (PHASE-02).',
            'Design tokens and components (SPR-01-02-01).',
            'Actual job handlers (PHASE-05).',
          ],
          approach: [
            'Scaffold `apps/web` with `create-next-app` at the pinned version, then strip it back to route groups only.',
            'Read `node_modules/next/dist/docs/` before touching config — this release has breaking changes from earlier conventions (ADR-002).',
            'Workers is a plain TypeScript Node service, not a Next.js app: it must be buildable and runnable without the web app present.',
            'Turborepo pipeline: `typecheck`, `lint`, `test`, `build`, with `packages/*` as dependencies of `apps/*`.',
          ],
          archChanges: [
            'Creates the web/worker deployment boundary.',
            'Creates the shared-package boundary that prevents duplicated Zod schemas.',
          ],
          deliverables: ['Committed monorepo', 'Green CI on `main`', 'Preview URL from a PR', 'Sentry events from both apps'],
          testing: ['Shell smoke test', 'Workers boot-and-exit test', 'CI gate verification on a deliberately broken PR'],
          ac: [
            'Both apps build from a clean install.',
            'CI runs all four gates and blocks on failure.',
            'A PR produces a working preview URL.',
          ],
          dod: ['Root README documents prerequisites and the bootstrap sequence', 'A second developer completes bootstrap unaided'],
          trace: ['§19', '§18.1'],

          epics: [
            {
              id: 'EPIC-01-01-01-01', name: 'Workspace & Package Scaffold',
              objective: 'Create the monorepo skeleton with all six workspaces and shared configuration.',
              value: 'Every later task depends on knowing where code goes. Ambiguity here produces a codebase nobody can navigate by month three.',
              functional: [
                'Six workspaces exist: `apps/web`, `apps/workers`, `packages/shared`, `packages/db`, `packages/emails`, `packages/config`.',
                'Shared ESLint, TypeScript, and Tailwind configuration is consumed, not duplicated.',
                'A single command runs typecheck, lint, and test across the whole repo.',
              ],
              technical: [
                'pnpm workspaces with a lockfile committed.',
                'Turborepo pipeline with correct `dependsOn` so `packages/*` build before `apps/*`.',
                'TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, path aliases per workspace.',
                'Node version pinned via `.nvmrc` and `engines`.',
              ],
              security: ['`.gitignore` covers all `.env*` variants before any secret exists', 'Pre-commit secret scanner installed'],
              testing: ['A trivial test in each package proves the test runner resolves workspace imports'],
              ac: [
                'All six workspaces resolve each other by alias, not relative path.',
                '`pnpm typecheck` passes across the repo.',
                'Turborepo caches a second identical run.',
              ],
              trace: ['§19', 'ADR-003'],
              tasks: [
                {
                  name: 'Initialise pnpm + Turborepo Workspace', type: 'devops', priority: 'critical',
                  trace: ['§19', 'ADR-003'],
                  obj: 'Create the monorepo root with pnpm workspaces and a Turborepo pipeline covering typecheck, lint, test, and build.',
                  ctx: 'This is the first task in the project. Nothing exists yet except the blueprint, this plan, and a static marketing site under `src/` that is a reference only and must not be modified or migrated.',
                  why: 'Without a workspace boundary, shared Zod schemas and the database schema get duplicated between the web app and the workers service, and the two drift. Blueprint §19 requires `packages/db` to be a single source of truth; that is only enforceable inside a workspace.',
                  out: 'A repository root containing `pnpm-workspace.yaml`, `turbo.json`, a root `package.json` with scripts, and six empty-but-valid workspace directories. `pnpm install` succeeds. `pnpm typecheck` runs and passes trivially.',
                  fr: [
                    'Workspaces declared: `apps/*` and `packages/*`.',
                    'Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`.',
                    'Turborepo tasks with `dependsOn: ["^build"]` where appropriate and correct output caching.',
                  ],
                  tr: [
                    'pnpm 9+; Node pinned in `.nvmrc` and `package.json#engines`.',
                    '`packageManager` field set so Corepack activates the right pnpm.',
                    'Turborepo `turbo.json` declares `outputs` for `build` so caching works.',
                    'Root `tsconfig.json` with `strict: true` and `noUncheckedIndexedAccess: true`, extended by each workspace.',
                  ],
                  impl: [
                    'Create the repository root files: `package.json` (private, no dependencies beyond turbo and typescript), `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `.editorconfig`.',
                    '`.gitignore` must cover `node_modules`, `.next`, `.turbo`, `dist`, `out`, `.env`, `.env.*` (but allow `.env.example`), and `*.log`. **Do this before any secret could be created.**',
                    'Create the six workspace directories, each with a minimal `package.json` naming itself `@mm/<name>` and a `tsconfig.json` extending the root.',
                    'Configure Turborepo tasks: `build`, `typecheck`, `lint`, `test`, `dev` (persistent, no cache).',
                    'Verify that `packages/shared` can be imported from `apps/web` by alias `@mm/shared` and that typecheck resolves it.',
                    'Add a root `README.md` documenting prerequisites (Node version, pnpm, Corepack) and the exact bootstrap commands.',
                    'Do **not** touch the existing `src/`, `next.config.ts`, or `package.json` at the repository root that belong to the static marketing site — see §20 for how to handle the collision.',
                  ],
                  files: [
                    'package.json                  (new root workspace manifest)',
                    'pnpm-workspace.yaml',
                    'turbo.json',
                    'tsconfig.base.json',
                    '.nvmrc',
                    '.gitignore                    (extend, do not replace)',
                    '.editorconfig',
                    'README.md',
                    'apps/web/package.json',
                    'apps/workers/package.json',
                    'packages/shared/package.json',
                    'packages/db/package.json',
                    'packages/emails/package.json',
                    'packages/config/package.json',
                  ],
                  rules: [
                    'The existing static marketing site must remain buildable until PHASE-10 replaces it, or must be moved in one deliberate commit — decide and record in §20, do not leave it half-moved.',
                    'No workspace may depend on `apps/*`; dependencies flow packages → apps only.',
                  ],
                  edge: [
                    'A root `package.json` already exists for the static site. Either relocate that site to `legacy/marketing-static/` in a single commit, or namespace the new root and keep the old one — **pick one, record it, and do not leave two competing roots.**',
                    'Windows path length limits with deep `node_modules`: pnpm\'s symlinked store mitigates this, but verify on the Windows dev machine.',
                    'Corepack disabled on the developer machine — README must say how to enable it.',
                  ],
                  err: ['Workspace resolution failure must surface as a typecheck error, not a runtime error — verify by importing a symbol that does not exist and confirming CI would catch it.'],
                  sec: [
                    '`.gitignore` covering all `.env*` variants is part of this task, not a later one.',
                    'No dependency added here may require a postinstall script; audit what `turbo` pulls in.',
                  ],
                  tests: { unit: ['A trivial passing test in `packages/shared` proves the runner resolves workspace TypeScript.'] },
                  ac: [
                    '`pnpm install` completes from a clean clone with no peer-dependency errors.',
                    '`pnpm typecheck` exits 0.',
                    '`pnpm build` exits 0 (trivially, since nothing is built yet).',
                    'A second `pnpm build` is served from the Turborepo cache.',
                    'The decision about the existing static site is recorded in this task\'s §20 and in the README.',
                    'No `.env` file can be committed — verified by attempting to add one and observing it ignored.',
                  ],
                  notes: [
                    'Record here which option was taken for the existing static site, and why.',
                    'Pin exact versions rather than ranges for `next`, `react`, and `react-dom` — this Next.js release has breaking changes and a floating range will produce confusing failures.',
                  ],
                },
                {
                  name: 'Scaffold Next.js 16 Web Application with Route Groups', type: 'frontend', priority: 'critical',
                  deps: ['TASK-001'], trace: ['§19', '§28.5', 'ADR-002'],
                  obj: 'Create `apps/web` as a Next.js 16 App Router application with the route-group structure from blueprint §28.5 and a placeholder page in each group.',
                  ctx: 'The PWA serves three audiences from one codebase: public marketing, the authenticated app, and the admin console — plus public tokenised routes for capsule unlock and sharing. Route groups keep their layouts and bundles separate so a marketing visitor never downloads app code.',
                  why: 'Getting route grouping wrong forces a later restructure that touches every page. It also determines whether `/c/[token]` can be server-rendered independently of the app shell — which blueprint §29.24 requires as a hard constraint, because a capsule opened in 2046 must work with JavaScript disabled.',
                  out: 'A Next.js app that starts with `pnpm dev`, serves a distinct placeholder at `/`, `/login`, `/app`, `/admin`, and `/c/test`, with each group carrying its own layout. The marketing group renders without importing any app-shell code.',
                  fr: [
                    'Route groups `(marketing)`, `(auth)`, `(app)` plus non-grouped `admin/`, `c/[token]`, `s/[token]`, `api/`.',
                    'Each group has its own `layout.tsx`.',
                    'A placeholder page renders in each group, identifying which group it belongs to.',
                    '`/c/[token]` renders server-side with no client component in its tree.',
                  ],
                  tr: [
                    'Next.js pinned exactly; React 19; TypeScript strict.',
                    '**Read `node_modules/next/dist/docs/` before writing any config or route file** — conventions in this release differ from earlier ones (ADR-002, project `AGENTS.md`).',
                    'No `output: "export"` — this application requires a server runtime, unlike the existing static site.',
                    'Root layout sets `lang`, viewport, and theme-colour meta.',
                    'Path alias `@/*` → `apps/web/src/*`.',
                  ],
                  impl: [
                    'Read the relevant guide in `node_modules/next/dist/docs/` first. Do not carry over App Router patterns from memory.',
                    'Create `apps/web/src/app/` with the route groups listed in §5 above.',
                    'Give `(marketing)` a layout with no app chrome; give `(app)` a layout that will later host the navigation shell (TASK for the shell comes later — leave a clearly marked placeholder).',
                    'Create `c/[token]/page.tsx` as an async server component that renders static text. **Add a comment stating that no client component may be introduced into this route** and why (blueprint §29.24).',
                    'Configure `next.config.ts` minimally: typed routes if available, image config, and nothing speculative.',
                    'Add `apps/web/src/app/layout.tsx` with the font loading strategy stubbed — actual fonts arrive with the token task.',
                    'Verify each group\'s bundle: the marketing page must not include app-shell JavaScript. Record the observed first-load JS per group in §20 as a baseline.',
                  ],
                  archDiagram: `apps/web/src/app/
├── (marketing)/     public, indexable, no app chrome
├── (auth)/          signup, login, verify, welcome
├── (app)/           authenticated shell  ← bottom nav / sidebar lives here
├── admin/           separate auth realm (PHASE-08)
├── c/[token]/       RECIPIENT UNLOCK — server-only, must work without JS
├── s/[token]/       public share view
└── api/             route handlers: webhooks, upload, media URLs, push`,
                  files: [
                    'apps/web/next.config.ts',
                    'apps/web/tsconfig.json',
                    'apps/web/src/app/layout.tsx',
                    'apps/web/src/app/(marketing)/layout.tsx',
                    'apps/web/src/app/(marketing)/page.tsx',
                    'apps/web/src/app/(auth)/layout.tsx',
                    'apps/web/src/app/(auth)/login/page.tsx',
                    'apps/web/src/app/(app)/layout.tsx',
                    'apps/web/src/app/(app)/page.tsx',
                    'apps/web/src/app/admin/page.tsx',
                    'apps/web/src/app/c/[token]/page.tsx',
                    'apps/web/src/app/s/[token]/page.tsx',
                    'apps/web/src/app/not-found.tsx',
                  ],
                  ui: `Placeholders only — no design work in this task. Each page renders its group name and route as plain text so the routing structure is visually verifiable. The \`not-found.tsx\` page should already carry the warm tone the product requires ("This page has slipped away") rather than a bare 404, because it is cheap to do now and easy to forget later.`,
                  rules: [
                    '`/c/[token]` must remain free of client components for the life of the project. Any change adding interactivity there must instead use a progressively-enhanced form or a separate route.',
                    'No route group may import from another group\'s layout.',
                  ],
                  edge: [
                    'A token route colliding with a marketing slug — reserve `c`, `s`, `m`, `j`, `g`, `n`, `api`, `app`, `admin` as forbidden marketing slugs and document the list.',
                    'Trailing-slash behaviour differing between preview and production — set it explicitly rather than relying on the default.',
                  ],
                  err: ['A missing token renders the not-found page, never a stack trace.'],
                  sec: [
                    'Set baseline security headers now (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors none`) so no route ever ships without them. CSP with nonces comes in PHASE-09; add a permissive-but-present policy now with a TODO referencing that phase.',
                    '`/c/[token]` and `/s/[token]` must send `X-Robots-Tag: noindex, noarchive` from this task onward — a shared memory must never be indexable, and adding it later risks a window of exposure.',
                  ],
                  tests: {
                    e2e: ['Playwright test asserting each of the five placeholder routes returns 200 and contains its expected marker text.'],
                    unit: ['A test asserting `/c/[token]` response HTML contains the placeholder content when JavaScript is disabled in the browser context.'],
                  },
                  ac: [
                    '`pnpm dev` serves all five placeholder routes.',
                    '`/c/test` renders correct content with JavaScript disabled in Playwright.',
                    'Marketing route first-load JS is measurably smaller than the app route, and the numbers are recorded in §20.',
                    '`noindex` header present on `/c/*` and `/s/*`.',
                    'Baseline security headers present on every route.',
                    'The `node_modules/next/dist/docs/` guide consulted, with any deviation from remembered conventions noted in §20.',
                  ],
                  notes: [
                    'Record the observed first-load JS per route group — it is the baseline for the performance budget in PHASE-09.',
                    'Record anything in this Next.js release that differed from expectation, so later tasks do not rediscover it.',
                  ],
                },
                {
                  name: 'Scaffold Independently Deployable Workers Service', type: 'backend', priority: 'critical',
                  deps: ['TASK-001'], trace: ['§18.4', '§35.2', 'ADR-003', 'ADR-006'],
                  obj: 'Create `apps/workers` as a standalone TypeScript Node service with a job-claim loop skeleton, buildable and runnable without the web application.',
                  ctx: 'The delivery engine is the most critical process in the product: a capsule promised for 2046 must be delivered. Blueprint §35.2 requires it to be separately deployable so it keeps running while a web deploy is rolling or being rolled back.',
                  why: 'If the scheduler lives inside the web app, a bad web deploy can silently stop deliveries — the one failure the product cannot survive. Establishing the separation now costs an afternoon; retrofitting it later means moving the most safety-critical code in the system.',
                  out: 'A container-ready service with a tick loop that claims nothing (no handlers yet), logs a heartbeat, handles SIGTERM gracefully, and exits cleanly. It builds and runs with `apps/web` absent from the filesystem.',
                  fr: [
                    'A tick loop with a configurable interval (default 60s) and a graceful-shutdown path.',
                    'A handler registry keyed by job kind, empty at this stage.',
                    'Structured JSON logging with a correlation id per tick.',
                    'Health endpoint or heartbeat suitable for the platform health check.',
                  ],
                  tr: [
                    'Plain TypeScript compiled to `dist/`; no Next.js dependency.',
                    'Dockerfile using a slim Node base; multi-stage so the runtime image excludes dev dependencies.',
                    'Reads configuration from environment variables only, validated at boot by a Zod schema from `@mm/shared` — **fail fast and loudly on missing configuration rather than starting degraded.**',
                    'SIGTERM handler that stops claiming new work, waits for in-flight work up to a timeout, then exits.',
                  ],
                  impl: [
                    'Create `apps/workers/src/index.ts` with the tick loop, a handler map, and the shutdown handler.',
                    'Create `apps/workers/src/config.ts` that parses and validates environment variables at boot and throws with a readable message listing every missing key.',
                    'Create `apps/workers/src/lib/logger.ts` emitting structured JSON with level, timestamp, correlation id, and job kind where relevant.',
                    'Create a placeholder `apps/workers/src/handlers/index.ts` exporting an empty registry with a comment naming the handlers that will land in PHASE-05 (`capsule-delivery`, `delivery-watchdog`) and PHASE-04 (`transcode-video`, `generate-thumbnails`).',
                    'Write the multi-stage `Dockerfile` and a `.dockerignore`.',
                    'Prove independence: build the image in a context where `apps/web` is excluded, and confirm it succeeds.',
                    'Add graceful-shutdown logging so a deploy shows exactly when claiming stopped and when the last job finished.',
                  ],
                  archDiagram: `apps/workers (Fly.io container, independent of Vercel deploys)
   │  every 60s
   ├──▶ claim jobs:  SELECT ... FOR UPDATE SKIP LOCKED   (PHASE-05)
   ├──▶ dispatch to handler registry by job kind
   └──▶ structured log per tick + per job

Handlers arriving later:
  PHASE-04  transcode-video · generate-thumbnails
  PHASE-05  capsule-delivery · delivery-watchdog · integrity-sweep`,
                  files: [
                    'apps/workers/src/index.ts',
                    'apps/workers/src/config.ts',
                    'apps/workers/src/lib/logger.ts',
                    'apps/workers/src/handlers/index.ts',
                    'apps/workers/Dockerfile',
                    'apps/workers/.dockerignore',
                    'apps/workers/tsconfig.json',
                    'fly.toml',
                  ],
                  rules: [
                    'The workers service must never import from `apps/web`. Shared code goes through `packages/shared` or `packages/db`.',
                    'The service must refuse to start on invalid configuration rather than running in a degraded state — a silently degraded delivery engine is worse than a stopped one, because a stopped one alerts.',
                  ],
                  edge: [
                    'Overlapping ticks if a tick outlives its interval — guard with a re-entrancy flag from the start.',
                    'Clock skew between the container and the database — always use database time (`now()`) for claim comparisons, never container time. Add a comment stating this, because it is the kind of thing a later contributor "simplifies".',
                    'SIGKILL after SIGTERM timeout leaving a job locked — the lock must carry an expiry so an abandoned job is reclaimable (implemented in PHASE-05, noted here).',
                  ],
                  err: [
                    'A handler throwing must not kill the loop: catch per job, log with the job id, and continue.',
                    'Configuration errors exit with a non-zero code and a message naming every missing variable.',
                  ],
                  sec: [
                    'Container runs as a non-root user.',
                    'No database credentials in the image; injected at runtime.',
                    'Note for PHASE-04: the media-processing worker must run with no network egress beyond storage, since FFmpeg parsing untrusted media is an RCE surface (blueprint §20.4). Structure the handler registry so that worker can be a separate deployment if needed.',
                  ],
                  tests: {
                    unit: [
                      'Config validation rejects a missing required variable with a message naming it.',
                      'Tick loop does not re-enter while a tick is in flight.',
                      'A throwing handler is caught and the loop continues.',
                    ],
                    integration: ['Service boots, logs a heartbeat, receives SIGTERM, and exits 0 within the shutdown timeout.'],
                  },
                  ac: [
                    'Docker image builds with `apps/web` excluded from the build context.',
                    'Service starts, logs structured heartbeats, and exits 0 on SIGTERM.',
                    'Missing configuration produces a clear failure naming the variables.',
                    'A deliberately throwing handler does not stop the loop.',
                    'Container runs as non-root, verified by inspecting the running process.',
                  ],
                  notes: [
                    'Keep this service boring. It is the piece of the system that must still work in ten years.',
                    'The handler registry shape decided here is the extension point for every scheduled behaviour in the product — On This Day, recaps, integrity sweeps, purges.',
                  ],
                },
                {
                  name: 'Create Shared Package: Result Envelope, Zod Base, Domain Constants', type: 'backend', priority: 'high',
                  deps: ['TASK-001'], trace: ['ADR-022', 'ADR-023', '§33'],
                  obj: 'Establish `packages/shared` with the discriminated result type, the error-code registry, and the domain constants that both apps need.',
                  ctx: 'ADR-023 requires every server action to return a discriminated union rather than throwing for expected failures, so forms can render field-level errors. ADR-022 requires every boundary to validate with a Zod schema whose definition is shared, not duplicated.',
                  why: 'If the error contract is invented per feature, the UI ends up with a dozen ways to display a validation failure, and blueprint §33.2 ("error copy = what is wrong + how to fix it") becomes impossible to enforce. Deciding the shape once, in code, makes it the path of least resistance.',
                  out: 'A package exporting `Result<T>`, `ok()`, `err()`, a frozen `ERROR_CODES` map, Zod helpers, and shared enums (occasion kinds, capsule states, roles) that both apps import.',
                  fr: [
                    '`Result<T, E>` discriminated on `ok`.',
                    '`ok(data)` and `err(code, message, field?)` constructors.',
                    'A machine-stable error-code registry with a TypeScript union type derived from it.',
                    'Shared enums matching the blueprint data model: vault roles, capsule states, occasion types, media kinds, precision levels.',
                    'Reusable Zod primitives: email, E.164 phone, non-empty display name accepting international characters, ISO timestamp.',
                  ],
                  tr: [
                    'Zero runtime dependencies other than Zod.',
                    'No Node-only or browser-only APIs — this package is imported by both.',
                    'Error codes are `SCREAMING_SNAKE` and never reused for a different meaning once shipped.',
                  ],
                  impl: [
                    'Create `packages/shared/src/result.ts` with the `Result` type and constructors.',
                    'Create `packages/shared/src/errors.ts` with a frozen object of codes grouped by domain (`AUTH_*`, `AUTHZ_*`, `VALIDATION_*`, `QUOTA_*`, `CAPSULE_*`, `UPLOAD_*`, `RATE_LIMIT_*`) and a derived union type.',
                    'Create `packages/shared/src/enums.ts` with the shared domain enums taken from blueprint §10 and §34. Do not invent values; copy them.',
                    'Create `packages/shared/src/zod.ts` with the reusable primitives. **The name validator must accept letters, spaces, hyphens, and apostrophes across Unicode — an ASCII-only rule would reject a large share of the target market** (blueprint §29.3).',
                    'Create `packages/shared/src/index.ts` re-exporting the public surface.',
                    'Write tests that lock the error-code registry: a test that fails if a code is removed or renamed, so the contract cannot break silently.',
                  ],
                  files: [
                    'packages/shared/src/result.ts',
                    'packages/shared/src/errors.ts',
                    'packages/shared/src/enums.ts',
                    'packages/shared/src/zod.ts',
                    'packages/shared/src/index.ts',
                    'packages/shared/src/__tests__/errors.test.ts',
                    'packages/shared/src/__tests__/zod.test.ts',
                  ],
                  data: `No database tables. This task defines the **shared enum values** that later migrations must match exactly:

- \`vault_role\`: \`owner\` | \`admin\` | \`contributor\` | \`viewer\`
- \`capsule_state\`: \`draft\` | \`sealed\` | \`delivering\` | \`delivered\` | \`opened\` | \`cancelled\` | \`failed\`
- \`occurred_precision\`: \`exact\` | \`day\` | \`month\` | \`year\`
- \`media_kind\`: \`image\` | \`video\` | \`audio\`
- \`unlock_kind\`: \`datetime\` | \`milestone\` | \`manual\`
- \`memory_visibility\`: \`private\` | \`vault\` | \`link\` | \`recipients\`

Later migrations import these rather than restating them, so the database and the application cannot diverge.`,
                  rules: [
                    'An error code, once shipped, is never repurposed. Add a new code instead.',
                    'Every error code must have user-facing copy that says what is wrong and how to fix it — the registry holds the code and a default message; screens may override the message but never the code.',
                  ],
                  edge: [
                    'Unicode names: "Ravi Kumar", "Ravi-Kumar", "O\'Brien", and Devanagari or Tamil script must all validate.',
                    'E.164 validation must be country-aware, not a bare regex — a 10-digit Indian number and a 9-digit UK number are both valid in their country context.',
                    'Zod version differences between apps — the package must be the only place Zod is pinned.',
                  ],
                  err: ['This task defines error handling for the whole system; it has no runtime errors of its own.'],
                  sec: ['Error messages must never leak whether an account exists (blueprint §29.5) — provide a dedicated non-enumerating code and message for that case so screens cannot get it wrong.'],
                  tests: {
                    unit: [
                      'Result constructors narrow correctly under TypeScript (type-level test).',
                      'Error registry snapshot test fails if a code is renamed or removed.',
                      'Name validator accepts Unicode, hyphens, and apostrophes; rejects a single character and empty input.',
                      'E.164 validator accepts valid IN, US, and GB numbers and rejects malformed input for each.',
                    ],
                  },
                  ac: [
                    'Both apps import from `@mm/shared` successfully.',
                    'Error-code snapshot test in place and passing.',
                    'Unicode and E.164 validators pass the cases in §13.',
                    'Shared enums match blueprint §10/§34 exactly, verified line by line.',
                  ],
                  notes: [
                    'This package is the contract surface of the whole system. Changes to it are breaking changes; treat it accordingly.',
                    'Resist adding utilities here. It is for contracts, not a junk drawer.',
                  ],
                },
              ],
            },
            {
              id: 'EPIC-01-01-01-02', name: 'CI/CD, Environments & Observability',
              objective: 'Every push is typechecked, linted, tested, built, and deployed to an isolated preview with its own database; errors from both apps reach Sentry.',
              value: 'Preview-per-PR lets product and design review real behaviour continuously instead of at the end of a phase. Error tracking from day one means the first production bug is diagnosable rather than a mystery.',
              stories: [['developer', 'every pull request to produce a working preview with its own data', 'I can demonstrate and review real behaviour without touching production']],
              functional: [
                'CI runs typecheck, lint, test, and build on every push and blocks merge on failure.',
                'Each pull request gets a preview deployment and an isolated Neon database branch.',
                'Workers deploys to Fly.io on merge to `main`.',
                'Uncaught errors from both apps appear in Sentry with source maps and release tagging.',
              ],
              technical: [
                'GitHub Actions with pnpm and Turborepo remote caching.',
                'Neon branch created on PR open and destroyed on close.',
                'Environment-scoped secrets; no production credentials available to preview builds.',
                'Sentry release created per deploy, with source-map upload.',
              ],
              security: [
                'Secret scanning enabled in CI.',
                'Dependency audit runs on every PR and fails on a known critical advisory.',
                'Preview environments never receive production database or storage credentials.',
              ],
              testing: ['A deliberately broken PR proves each CI gate blocks', 'A thrown error in each app proves Sentry ingestion'],
              ac: [
                'Merge is blocked by a type error, a lint error, and a failing test — each demonstrated.',
                'Preview URL and isolated database verified on a throwaway PR.',
                'Sentry shows a symbolicated stack trace from both apps.',
              ],
              trace: ['§18.1', '§20.8', '§21 Phase 1'],
              tasks: [
                {
                  name: 'Configure CI Pipeline with Blocking Quality Gates', type: 'devops', priority: 'critical',
                  deps: ['TASK-001'], trace: ['§21 Phase 1', 'ADR-018'],
                  obj: 'Create a GitHub Actions workflow that runs typecheck, lint, unit tests, and build on every push and pull request, and blocks merge on any failure.',
                  ctx: 'This is the only mechanism that keeps quality from decaying as the task count grows into the hundreds. It must exist before feature work begins, not after.',
                  why: 'A permission bug in this product is a privacy incident (blueprint §20.2). The permission-matrix tests planned for PHASE-02 and PHASE-09 are only protective if a failing one actually blocks a merge.',
                  out: 'A workflow that runs on push and pull request, caches pnpm and Turborepo, executes four gates in parallel where possible, and is configured as a required status check on `main`.',
                  fr: [
                    'Triggers: push to `main`, and all pull requests.',
                    'Jobs: `typecheck`, `lint`, `test`, `build`.',
                    'pnpm store and Turborepo cache restored between runs.',
                    'Job summary reporting test counts and build output sizes.',
                  ],
                  tr: [
                    'Node version from `.nvmrc`; Corepack enabled.',
                    'Concurrency group per ref with cancel-in-progress for PRs, but **never** for `main`.',
                    '`--frozen-lockfile` install so a stale lockfile fails loudly.',
                    'Fail fast disabled, so all four gates report rather than only the first failure.',
                  ],
                  impl: [
                    'Create `.github/workflows/ci.yml` with a shared setup composite action or reusable steps for checkout, Corepack, Node, and pnpm install.',
                    'Add the four gate jobs. Run `typecheck`, `lint`, and `test` in parallel; `build` may depend on nothing but will benefit from the Turborepo cache.',
                    'Add pnpm store caching keyed on the lockfile hash, and Turborepo caching keyed on lockfile plus source hash.',
                    'Add a dependency audit step that fails on a critical advisory, and a secret-scanning step.',
                    'Configure branch protection on `main` requiring all four checks. Record in §20 that this is a repository setting, not a file, so it is not lost.',
                    'Verify by opening a throwaway PR that deliberately fails each gate in turn.',
                  ],
                  files: [
                    '.github/workflows/ci.yml',
                    '.github/actions/setup/action.yml',
                    '.github/dependabot.yml',
                  ],
                  rules: [
                    'A red gate blocks merge. No override without a recorded reason.',
                    '`main` runs are never cancelled mid-flight.',
                  ],
                  edge: [
                    'A stale lockfile after a dependency change — `--frozen-lockfile` must fail rather than silently resolve.',
                    'Cache poisoning across branches — scope cache keys to include the lockfile hash.',
                    'Flaky test making the gate untrustworthy — quarantine policy: a flaky test is fixed or deleted within one working day, never retried into green. Record this policy in §20.',
                  ],
                  err: ['Every failure must name the failing workspace and command in the job summary, so the cause is visible without opening logs.'],
                  sec: ['Secret scanning and dependency audit are part of this task, not a later hardening phase.', 'Workflow permissions set to least privilege (`contents: read` by default).'],
                  tests: { integration: ['A throwaway PR demonstrating each of the four gates blocking independently.'] },
                  ac: [
                    'All four gates run on a pull request.',
                    'Each gate demonstrably blocks merge when failing.',
                    'Second run of an unchanged branch is substantially faster due to caching.',
                    'Branch protection configured and recorded in §20.',
                    'Dependency audit and secret scanning active.',
                  ],
                  notes: ['Keep CI under ten minutes. Beyond that, developers start working around it, and the gates stop protecting anything.'],
                },
                {
                  name: 'Provision Hosting, Environments, and Per-PR Database Branches', type: 'devops', priority: 'critical',
                  deps: ['TASK-002', 'TASK-003', 'TASK-005'], trace: ['§18.1', 'ADR-005', 'ADR-019'],
                  obj: 'Connect the repository to Vercel (web) and Fly.io (workers), and wire Neon branch-per-pull-request so every preview has isolated data.',
                  ctx: 'Blueprint §18.1 chooses Vercel for the app and Fly.io for workers precisely because long-running media and delivery work is the wrong shape for serverless. Neon branching gives preview environments real, isolated data.',
                  why: 'Without isolated preview data, reviewers either test against shared state that others are mutating, or against production — the latter being unacceptable for a product holding family photographs.',
                  out: 'A pull request produces a web preview URL backed by its own database branch. Merging to `main` deploys web to production and workers to Fly. Environments have separate, least-privilege credentials.',
                  fr: [
                    'Vercel project linked, building `apps/web` from the monorepo.',
                    'Fly.io app for `apps/workers` deployed on merge to `main`.',
                    'Neon branch created on PR open, migrated, seeded, and destroyed on PR close.',
                    'Three environments: development, preview, production, with distinct secrets.',
                  ],
                  tr: [
                    'Turborepo-aware Vercel build so unchanged packages are cached.',
                    'Fly deploy from CI using a deploy token, not a personal credential.',
                    'Preview `DATABASE_URL` injected per deployment from the created branch.',
                    'Health check configured on the Fly service so a failed deploy does not replace a working one.',
                  ],
                  impl: [
                    'Link the Vercel project; set the root directory and build command for the monorepo; confirm `packages/*` are included in the build context.',
                    'Create the Fly app and `fly.toml` with a health check; add a `deploy-workers.yml` workflow triggered on merge to `main`.',
                    'Add a `preview-db.yml` workflow: on PR opened/reopened create a Neon branch, run migrations, run the seed, and expose the connection string to the Vercel preview; on PR closed, delete the branch.',
                    'Create `.env.example` listing every variable with a comment on its purpose and where to obtain it. Never commit real values.',
                    'Set environment-scoped secrets in Vercel and Fly. Verify a preview build cannot read production secrets.',
                    'Document the whole environment topology in the README, including how to run against a local Postgres.',
                  ],
                  archDiagram: `PR opened
   ├─▶ Neon: create branch ──▶ migrate ──▶ seed
   └─▶ Vercel: preview deploy (DATABASE_URL = branch)

merge to main
   ├─▶ Vercel: production deploy (apps/web)
   └─▶ Fly.io: deploy apps/workers  ← independent of the web deploy

PR closed
   └─▶ Neon: delete branch`,
                  files: [
                    '.github/workflows/deploy-workers.yml',
                    '.github/workflows/preview-db.yml',
                    'fly.toml',
                    '.env.example',
                    'vercel.json',
                    'README.md  (environment section)',
                  ],
                  rules: [
                    'Production credentials never reach a preview environment or a developer machine.',
                    'Workers deploy independently of web — a failed web deploy must not block or roll back the delivery engine (ADR-003).',
                    'Every preview database is seeded with synthetic data only.',
                  ],
                  edge: [
                    'Neon branch limit reached on a busy day — the cleanup workflow must run on PR close *and* a scheduled sweep should reap branches older than seven days.',
                    'A migration that fails on a preview branch must fail the preview deploy loudly, not deploy against an unmigrated database.',
                    'Fly health check failing after deploy — confirm the previous version keeps serving.',
                    'Monorepo build on Vercel missing a workspace package — verify explicitly rather than assuming.',
                  ],
                  err: ['Any environment-provisioning failure must fail the workflow with a message naming the platform and the operation, never silently produce a preview pointing at the wrong database.'],
                  sec: [
                    'Least-privilege tokens for Vercel, Fly, and Neon, each scoped to the single project.',
                    'Verify that a preview deployment cannot connect to the production database — attempt it once and record the result in §20.',
                    'Storage credentials for workers must allow writing derivatives but not deleting originals (blueprint §20.8).',
                  ],
                  tests: { integration: ['Throwaway PR demonstrating: branch created, migrated, seeded, preview reachable, branch deleted on close.'] },
                  ac: [
                    'A pull request yields a reachable preview URL backed by its own database.',
                    'Closing the pull request deletes the database branch.',
                    'Merging deploys web and workers independently.',
                    'A preview build provably cannot reach production data.',
                    '`.env.example` lists every required variable with no real values.',
                  ],
                  notes: ['Record the exact IAM/token scopes granted, so PHASE-09 can audit them rather than rediscover them.'],
                },
                {
                  name: 'Integrate Sentry Error Tracking Across Web and Workers', type: 'devops', priority: 'high',
                  deps: ['TASK-002', 'TASK-003'], trace: ['§18.1', 'ADR-020'],
                  obj: 'Wire Sentry into both applications with release tagging, source maps, and PII scrubbing appropriate to a product holding family media.',
                  ctx: 'ADR-020 pairs Sentry with a bespoke delivery-SLA monitor built in PHASE-05. This task delivers the general error channel; the delivery watchdog is separate and more important.',
                  why: 'The first production error will happen during the staged rollout. Without symbolicated traces and release tagging, diagnosing it costs days. Adding Sentry later also means the earliest, most informative failures are lost.',
                  out: 'Uncaught errors and unhandled rejections from both apps appear in Sentry with readable stack traces, tagged to a release, with no user content and no personally identifying data in the payload.',
                  fr: [
                    'Server-side and client-side capture in `apps/web`; process-level capture in `apps/workers`.',
                    'Release created per deploy with source maps uploaded and not publicly served.',
                    'Environment tagging (development / preview / production).',
                    'A deliberate test error route or command in each app.',
                  ],
                  tr: [
                    'Sampling: 100% of errors; traces sampled low (10%) to control cost.',
                    '`beforeSend` scrubs request bodies, headers, and any field that could contain user content.',
                    'Source maps uploaded during the build and then withheld from the public bundle.',
                  ],
                  impl: [
                    'Install and configure the Sentry SDK in `apps/web` for both server and client runtimes, following the current Next.js integration guidance.',
                    'Configure `apps/workers` with process-level handlers for `uncaughtException` and `unhandledRejection` that log, capture, and then exit non-zero so the platform restarts the container.',
                    'Implement `beforeSend` scrubbing: strip request bodies, cookies, and authorization headers; **allow-list** the fields that may be sent rather than trying to deny-list what may not.',
                    'Wire release and environment tagging into both deploy workflows.',
                    'Add a `/api/debug/error` route (non-production only) and a workers CLI flag that each throw deliberately, to prove ingestion.',
                    'Verify a symbolicated stack trace appears for both apps, then confirm source maps are not fetchable from the public origin.',
                  ],
                  files: [
                    'apps/web/sentry.client.config.ts',
                    'apps/web/sentry.server.config.ts',
                    'apps/web/src/app/api/debug/error/route.ts',
                    'apps/workers/src/lib/sentry.ts',
                    'apps/workers/src/index.ts  (wire process handlers)',
                    '.github/workflows/ci.yml  (source-map upload step)',
                  ],
                  rules: [
                    '**No memory content, no media, no note text, and no email addresses may ever reach Sentry.** This product holds family photographs and messages intended for after death; an error-tracking payload is not an acceptable place for any of it.',
                    'The debug error endpoint must be unreachable in production.',
                  ],
                  edge: [
                    'A validation error containing user-typed content — scrub the value, keep the field name.',
                    'Very high error volume from a single bad deploy — configure a rate limit so Sentry cost cannot spike without bound.',
                    'Source maps accidentally served publicly, exposing internals — verify explicitly.',
                  ],
                  err: ['Sentry itself failing must never break a request or kill the worker loop: capture calls are fire-and-forget with a timeout.'],
                  sec: [
                    'Allow-list scrubbing, not deny-list.',
                    'DSN is not a secret but the auth token for source-map upload is — scope it to the single project.',
                    'Confirm production has no debug error route.',
                  ],
                  tests: {
                    unit: [
                      '`beforeSend` removes a payload containing a simulated note body and email address, and the test asserts they are absent.',
                      'Workers process handler captures and exits non-zero.',
                    ],
                    integration: ['Deliberate error in each app appears in Sentry with a symbolicated frame.'],
                  },
                  ac: [
                    'Symbolicated traces visible from both apps.',
                    'Release and environment tags correct.',
                    'Scrubbing test proves no user content in the payload.',
                    'Source maps not fetchable from the public origin.',
                    'Debug error route absent in production.',
                  ],
                  notes: ['The delivery-SLA watchdog in PHASE-05 is a different and more important alert channel. Do not conflate them; a Sentry error is "something broke", a missed unlock is "we broke a promise".'],
                },
              ],
            },
          ],
        },
        {
          id: 'SPR-01-01-02', name: 'Database Foundation & Migration Pipeline',
          objective: 'A working, tested schema pipeline with RLS enabled from the first migration.',
          priority: 'critical', deps: ['SPR-01-01-01'], duration: '~3 days',
          goal: 'A developer can author a schema change, generate a migration, apply it, roll it back, and seed realistic data — and no table can be added without an RLS policy.',
          inScope: [
            '`packages/db` with Drizzle configuration, client, schema directory, and migration directory.',
            'Initial migration establishing extensions, enums from `@mm/shared`, and the RLS convention.',
            'Seed script with realistic content.',
            'Migration test harness.',
          ],
          outScope: ['Domain tables (PHASE-02 and PHASE-03 own theirs)', 'Query helpers (they belong to feature modules)'],
          approach: [
            'Drizzle schema is the source; migrations are generated and committed, never hand-edited after review.',
            'Enable `pgcrypto`, `citext`, and `pg_trgm` in the first migration; `vector` is deferred to R2.',
            'Establish RLS as a convention with a template policy, so PHASE-02 inherits it rather than inventing it.',
          ],
          archChanges: ['Introduces `packages/db` as the single schema source consumed by both apps (ADR-005).'],
          deliverables: ['`packages/db` package', 'Initial migration', 'Seed script', 'Migration test'],
          testing: ['Apply-and-rollback test against an ephemeral database', 'Seed idempotency test'],
          ac: ['A migration applies and rolls back cleanly', 'Seed produces a believable dataset', 'RLS convention documented and demonstrated'],
          dod: ['Migration workflow documented in the README', '`packages/db` exports a single configured client'],
          trace: ['§10', 'ADR-005', 'ADR-009'],
          epics: [
            {
              id: 'EPIC-01-01-02-01', name: 'Schema Pipeline & Seed Data',
              objective: 'Make schema change a safe, repeatable, tested operation, with row-level security switched on before the first row of user data exists.',
              value: 'Every domain phase depends on this. Enabling RLS from migration one means no table is ever added without a policy — which is the difference between defence-in-depth and a good intention.',
              stories: [['developer', 'to change the schema with a generated, reviewable migration', 'schema changes are auditable and reversible rather than ad-hoc SQL']],
              functional: [
                'Drizzle config, client, and directory structure exist.',
                'A first migration enables required extensions and creates the shared enums.',
                'A seed script creates realistic users, members, events, and memories for development.',
                'A test proves migrations apply and roll back.',
              ],
              technical: [
                'Drizzle Kit generates migrations from schema; generated SQL is reviewed and committed.',
                'The client is environment-aware and safe for both serverless (web) and long-running (workers) contexts.',
                'RLS enabled with a documented template policy.',
              ],
              db: [
                'Extensions: `pgcrypto` (UUIDs), `citext` (case-insensitive email), `pg_trgm` (typo-tolerant search).',
                'Enums created from the `@mm/shared` values so database and application cannot diverge.',
                'RLS enabled by default; a checklist item requires a policy with every new table.',
              ],
              security: [
                'RLS as a second line of defence beneath `lib/authz` (ADR-009).',
                'Seed data is synthetic; no real personal data ever enters a development database.',
              ],
              testing: ['Migration apply/rollback', 'Seed idempotency', 'A test asserting RLS is enabled on every table in the public schema'],
              ac: ['Migration pipeline works end to end', 'RLS-enabled assertion test in place', 'Seed data reads as real content, not placeholders'],
              trace: ['§10', '§20.2', 'ADR-005'],
              tasks: [
                {
                  name: 'Create Database Package with Drizzle Client and Migration Pipeline', type: 'database', priority: 'critical',
                  deps: ['TASK-001'], trace: ['§10', '§19', 'ADR-005'],
                  obj: 'Create `packages/db` exporting a configured Drizzle client and a working generate/apply/rollback migration workflow.',
                  ctx: 'Blueprint §19 requires `packages/db` to be the single schema source shared by `apps/web` and `apps/workers`. Both need the same client with different connection characteristics: the web app is short-lived per request, the workers service holds a long-lived pool.',
                  why: 'Two copies of a schema always diverge, and a divergence between the delivery engine and the app means a capsule row the worker cannot read. One package, one schema, no drift.',
                  out: 'A package with `schema/`, `migrations/`, a `client.ts` that works in both runtimes, and root scripts `db:generate`, `db:migrate`, `db:rollback`, `db:seed`.',
                  fr: [
                    'Drizzle Kit configured against the schema directory.',
                    'Client factory suitable for serverless (per-request) and long-running (pooled) use.',
                    'Scripts for generate, migrate, rollback, and seed.',
                    'Migration files committed and reviewable as SQL.',
                  ],
                  tr: [
                    'Connection string from environment, validated by a Zod schema at import.',
                    'Serverless driver for the web runtime; pooled driver for workers — selected by an explicit flag, not by guessing the runtime.',
                    'Statement timeout set conservatively so a runaway query cannot hold a connection indefinitely.',
                    'Migrations are forward-only in production; rollback exists for development and for a tested emergency path.',
                  ],
                  impl: [
                    'Create `packages/db/drizzle.config.ts` pointing at `schema/` and `migrations/`.',
                    'Create `packages/db/src/client.ts` exporting `createClient({ mode: "serverless" | "pooled" })`. Do **not** auto-detect the runtime; make the caller state its intent, because a pooled client in a serverless function exhausts connections silently.',
                    'Create `packages/db/src/schema/index.ts` as the aggregation point; leave it nearly empty — domain tables belong to their phases.',
                    'Add root scripts `db:generate`, `db:migrate`, `db:rollback`, `db:seed`.',
                    'Write `packages/db/src/migrate.ts` as a programmatic runner so CI and the preview workflow can invoke it without the Drizzle CLI.',
                    'Document the workflow in the README: change schema → generate → **review the generated SQL** → commit both.',
                    'Set a conservative `statement_timeout` and `idle_in_transaction_session_timeout` on the client.',
                  ],
                  archDiagram: `packages/db/schema/*.ts      ← the single source of truth
        │ drizzle-kit generate
        ▼
packages/db/migrations/*.sql  ← reviewed and committed
        │ db:migrate
        ▼
Postgres (Neon)  ◀── apps/web  (serverless client, per request)
                 ◀── apps/workers (pooled client, long-lived)`,
                  files: [
                    'packages/db/drizzle.config.ts',
                    'packages/db/src/client.ts',
                    'packages/db/src/migrate.ts',
                    'packages/db/src/schema/index.ts',
                    'packages/db/src/index.ts',
                    'packages/db/migrations/.gitkeep',
                    'packages/db/src/__tests__/migrate.test.ts',
                  ],
                  data: `No domain tables in this task. It delivers the **pipeline**.

The client contract:

\`\`\`ts
createClient({ mode: 'serverless' })  // apps/web — one connection per request
createClient({ mode: 'pooled' })      // apps/workers — long-lived pool
\`\`\`

Every later migration is generated from \`packages/db/src/schema/\` and committed as reviewed SQL. Generated SQL is **read before committing** — Drizzle occasionally produces a destructive statement for a rename, and on a table holding irreplaceable family media that must never reach production unexamined.`,
                  rules: [
                    'Generated migration SQL is always read before commit. A rename that Drizzle emits as drop-and-recreate must be rewritten by hand.',
                    'Production migrations are forward-only. Rollback is a development and emergency tool, and any emergency use is rehearsed first.',
                    'No feature code may create its own database client; all access goes through `@mm/db`.',
                  ],
                  edge: [
                    'Connection exhaustion when a pooled client is used in a serverless function — prevented by requiring an explicit mode, and worth an assertion that logs loudly if the wrong mode is used in the wrong runtime.',
                    'A migration that succeeds locally and fails on Neon due to a permission difference — the preview workflow must run migrations, so this surfaces on a PR rather than in production.',
                    'Two developers generating migrations concurrently, producing conflicting sequence numbers — document the resolution (regenerate after rebase, never hand-merge).',
                    'A long-running migration locking a table — note the requirement that later migrations on large tables use `CONCURRENTLY` for index creation.',
                  ],
                  err: ['A failed migration must exit non-zero with the failing statement printed, and must not leave a partially applied state without saying so.'],
                  sec: [
                    'Connection string is a secret; never logged, never in an error message.',
                    'The application role must not be a superuser; it needs no `CREATE EXTENSION` right after the initial migration.',
                    'Statement timeout limits the blast radius of a pathological query.',
                  ],
                  tests: {
                    integration: [
                      'Apply all migrations to an ephemeral database, then roll back, and assert the schema returns to its prior state.',
                      'Assert the serverless and pooled clients both connect and execute a trivial query.',
                    ],
                    unit: ['Config validation fails with a clear message when the connection string is absent or malformed.'],
                  },
                  ac: [
                    '`pnpm db:generate` produces a migration from a schema change.',
                    '`pnpm db:migrate` applies it to a branch database.',
                    '`pnpm db:rollback` reverses it.',
                    'Both client modes connect successfully from their respective apps.',
                    'Migration workflow documented in the README, including the "read the generated SQL" rule.',
                  ],
                  notes: [
                    'The explicit-mode decision is deliberate. Runtime auto-detection is the kind of convenience that produces an outage at the worst moment.',
                    'Keep migrations small. A migration that does one thing is a migration that can be reasoned about at 2am.',
                  ],
                },
                {
                  name: 'Author Initial Migration: Extensions, Shared Enums, and RLS Convention', type: 'database', priority: 'critical',
                  deps: ['TASK-007'], trace: ['§10', '§20.2', 'ADR-009'],
                  obj: 'Create migration 0001 enabling required Postgres extensions, creating the shared domain enums, and establishing the row-level-security convention every later table must follow.',
                  ctx: 'ADR-009 makes `lib/authz` the single authorization chokepoint, with RLS as a second line of defence so an application bug alone cannot leak cross-tenant data. That is only true if RLS is on from the beginning.',
                  why: 'Retrofitting RLS across thirty tables after the fact is a large, risky migration that nobody schedules. Establishing it in migration 0001 with a documented template makes it the default rather than a project.',
                  out: 'Migration 0001 applied: `pgcrypto`, `citext`, and `pg_trgm` enabled; every enum from `@mm/shared` created; a documented RLS policy template plus a test that fails if any future table lacks RLS.',
                  fr: [
                    'Extensions enabled: `pgcrypto`, `citext`, `pg_trgm`.',
                    'Enums created matching `@mm/shared/enums` exactly: vault role, capsule state, occurred precision, media kind, unlock kind, memory visibility.',
                    'An RLS policy template documented with a worked example.',
                    'A test that enumerates tables in the public schema and fails if any has RLS disabled.',
                  ],
                  tr: [
                    '`citext` for the email column type so uniqueness is case-insensitive without a functional index.',
                    '`pg_trgm` now, because PHASE-03 search needs it and adding an extension later requires elevated rights.',
                    '`vector` deliberately **not** enabled — semantic search is R2 (ADR-010, ADR-017).',
                    'Enum values must be byte-identical to the TypeScript union in `@mm/shared`.',
                  ],
                  impl: [
                    'Write the schema definitions for the enums in `packages/db/src/schema/enums.ts`, importing the value arrays from `@mm/shared` so the two cannot drift.',
                    'Generate migration 0001 and **read the SQL**. Confirm extension statements and enum creation are as expected.',
                    'Add the RLS convention: a short `packages/db/RLS.md` documenting the template — enable RLS on the table, add a policy scoping rows by the vault the current application role may access, and a comment naming the `lib/authz` rule it mirrors.',
                    'Write the guard test: query `pg_tables` joined against `pg_class.relrowsecurity` for the public schema and assert every table has RLS enabled, with an explicit allow-list for tables that legitimately do not (for example a migrations bookkeeping table).',
                    'Run against a fresh branch database and confirm the guard test passes with zero tables, then add a scratch table without RLS and confirm the test fails.',
                  ],
                  files: [
                    'packages/db/src/schema/enums.ts',
                    'packages/db/migrations/0001_extensions_enums_rls.sql',
                    'packages/db/RLS.md',
                    'packages/db/src/__tests__/rls-enabled.test.ts',
                  ],
                  data: `**Extensions:** \`pgcrypto\` (\`gen_random_uuid()\`), \`citext\` (case-insensitive email), \`pg_trgm\` (trigram similarity for typo-tolerant search in PHASE-03).

**Enums** — values imported from \`@mm/shared\` so the database and the application cannot diverge:

| Enum | Values |
|---|---|
| \`vault_role\` | owner, admin, contributor, viewer |
| \`capsule_state\` | draft, sealed, delivering, delivered, opened, cancelled, failed |
| \`occurred_precision\` | exact, day, month, year |
| \`media_kind\` | image, video, audio |
| \`unlock_kind\` | datetime, milestone, manual |
| \`memory_visibility\` | private, vault, link, recipients |

**RLS convention** (see \`packages/db/RLS.md\`): every table holding user data enables RLS and carries a policy scoping rows to vaults the session may access. The policy mirrors — never replaces — the \`lib/authz\` rule. Two independent layers, both required.

\`vector\` is **not** enabled. Semantic search is Release 2 (ADR-010).`,
                  rules: [
                    'Enum values are copied from `@mm/shared`, never retyped. A mismatch between database and application enum is a class of bug that surfaces only at runtime, in production, on real user data.',
                    'Every future table enables RLS in the same migration that creates it. The guard test enforces this.',
                    'Adding a table to the RLS allow-list requires a comment justifying it.',
                  ],
                  edge: [
                    'An enum value added later requires `ALTER TYPE ... ADD VALUE`, which cannot run inside a transaction in some Postgres versions — note this in `RLS.md` so a later contributor is not surprised.',
                    'Extension creation requires elevated privileges the application role may not have — run extensions in this first migration while the setup role is available, and record that in §20.',
                    '`citext` comparison behaviour with Unicode — verify that two email addresses differing only in case collide as intended.',
                  ],
                  err: ['Migration failure must name the failing statement. A partially applied extension list must be visible, not silent.'],
                  sec: [
                    'RLS is the defence-in-depth layer for the highest-severity risk in the product (cross-tenant leak, gap analysis R-2). It is not optional and not deferrable.',
                    'The guard test is a security control, not a hygiene test — it belongs in the blocking CI gate.',
                  ],
                  tests: {
                    db: [
                      'Assert all three extensions are present after migration.',
                      'Assert each enum exists with exactly the expected values, compared against the `@mm/shared` arrays.',
                      'Guard test: every public-schema table has RLS enabled, except an explicit allow-list.',
                      'Negative test: adding a table without RLS makes the guard test fail.',
                    ],
                  },
                  ac: [
                    'Migration 0001 applies cleanly to a fresh database.',
                    'All three extensions present.',
                    'Enum values match `@mm/shared` exactly, asserted by test rather than by inspection.',
                    'RLS guard test passes, and demonstrably fails for a table without RLS.',
                    '`packages/db/RLS.md` documents the template with a worked example.',
                    '`vector` is not enabled.',
                  ],
                  notes: [
                    'This is a small migration with outsized importance. The guard test is what makes the RLS convention survive contact with a growing team.',
                    'Record in §20 which database role ran the extension statements, since the application role should not retain that privilege.',
                  ],
                },
                {
                  name: 'Build Development Seed Script with Realistic Content', type: 'database', priority: 'medium',
                  deps: ['TASK-008'], trace: ['§36', 'gap G-7'],
                  obj: 'Create an idempotent seed script that populates a development or preview database with believable users, members, events, memories, and capsules.',
                  ctx: 'Blueprint §36 is explicit: real-feel content only — Indian and global names, realistic dates, genuine emotional copy, **never lorem ipsum**. Gap G-7 records that the blueprint does not specify seed data, so this is a recommended addition.',
                  why: 'Placeholder data hides real problems. A timeline seeded with "Test Memory 1" will never reveal that long member names break the card layout, that a year-precision memory sorts oddly, or that an empty note reads badly. It also makes every preview review feel like a test harness rather than a product.',
                  out: 'A script creating a small cast of users with interlocking members, events across past and future, memories with varied media kinds and date precisions, and capsules in several states — runnable repeatedly without duplicating rows.',
                  fr: [
                    'At least three users with distinct situations: a new user with almost nothing, an active user with a populated archive, and a user with pending capsules including one long-horizon.',
                    'Members with relationships, birthdays, and mixed contact completeness — including one deliberately missing a contact method, to exercise the delivery-blocked warning.',
                    'Events spanning past and future, with recurrence and reminder offsets.',
                    'Memories with `occurred_precision` values of `exact`, `month`, and `year`.',
                    'Capsules in `draft`, `sealed`, `delivered`, and `opened` states.',
                    'Idempotent: re-running updates rather than duplicating.',
                  ],
                  tr: [
                    'Deterministic — a fixed seed value so the dataset is identical across runs and machines, which makes screenshot review and E2E assertions stable.',
                    'No network calls. Media assets reference small committed fixture files or placeholder keys, not remote URLs.',
                    'Refuses to run against production, checked by an explicit environment guard.',
                  ],
                  impl: [
                    'Create `packages/db/src/seed/index.ts` with a `--reset` flag that truncates in dependency order, and a default mode that upserts.',
                    'Write `packages/db/src/seed/fixtures.ts` with the cast. Use real-feeling names spanning the target market — a mix such as Riya, Aarav, Priya, Ravi alongside global names — and write **genuine emotional copy** for notes and titles, as §36 requires. This matters: the copy in the seed becomes the copy everyone reviews the product against.',
                    'Add an environment guard that throws if the connection string looks like production or if `NODE_ENV === "production"` without an explicit override flag.',
                    'Include the deliberately awkward cases: a very long member name, a name in a non-Latin script, a memory with no note, a year-precision memory from 1974, a capsule scheduled beyond the free horizon, and a member with no phone or email.',
                    'Wire `pnpm db:seed` and call it from the preview-database workflow.',
                    'Write a test asserting the script is idempotent: run twice, assert row counts are equal.',
                  ],
                  files: [
                    'packages/db/src/seed/index.ts',
                    'packages/db/src/seed/fixtures.ts',
                    'packages/db/src/seed/__tests__/idempotent.test.ts',
                    'packages/db/src/seed/fixtures/  (small committed media placeholders)',
                  ],
                  data: `Writes only to tables that exist at the time it runs. Because domain tables arrive in PHASE-02 and PHASE-03, this script starts small and is **extended by later tasks** — each phase that adds a table adds its fixtures here. Note that expectation in the file header so it is not treated as finished.`,
                  rules: [
                    '**Never lorem ipsum.** Every string a reviewer will read must be plausible product content (§36).',
                    'The script must be safe to run repeatedly and must refuse to touch production.',
                    'Deterministic output — no random values without a fixed seed, because non-deterministic fixtures make E2E tests flaky.',
                  ],
                  edge: [
                    'Foreign-key ordering on truncate — truncate in reverse dependency order or use a single `TRUNCATE ... CASCADE` with an explicit comment.',
                    'A later phase adding a required column breaks the seed — the idempotency test in CI catches this on the PR that adds the column.',
                    'Timezone-sensitive fixtures drifting as real time passes: express dates relative to a fixed reference date passed in, not to `now()`, so "in 3 days" stays meaningful and does not silently become the past.',
                  ],
                  err: ['A seed failure must name the fixture and table that failed, and must roll back the whole run rather than leaving a half-populated database.'],
                  sec: [
                    'No real personal data, ever. All fixtures are invented.',
                    'The production guard is a hard requirement — a seed run against production would be catastrophic and unrecoverable.',
                  ],
                  tests: {
                    integration: [
                      'Run seed twice; assert identical row counts and no duplicate keys.',
                      'Assert the environment guard throws for a production-looking connection string.',
                    ],
                  },
                  ac: [
                    'Seed runs against a fresh branch database and produces the documented cast.',
                    'Running twice does not duplicate data.',
                    'Guard prevents execution against production.',
                    'No placeholder or lorem-ipsum text anywhere in the fixtures.',
                    'Awkward cases from §6 are present, so layout and logic bugs surface during review rather than in production.',
                    'Preview-database workflow invokes the seed successfully.',
                  ],
                  notes: [
                    'Treat the fixture copy as product copy. It will be seen in every screenshot, demo, and review for the life of the project.',
                    'Each later phase must extend the fixtures when it adds a table; note this in that phase\'s definition of done.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    /* ============================= MOD-01-02 ============================= */
    {
      id: 'MOD-01-02', name: 'Design System Foundation',
      purpose: 'Turn blueprint §26 into working tokens, primitives, and an app shell.',
      priority: 'critical',
      objective: 'Provide the visual and interaction foundation every screen in every later phase is built from, so no screen re-invents a button, a sheet, or a theme.',
      business: [
        'The product\'s differentiator is emotional, not functional — the design system is how that is delivered consistently.',
        'Grandparents are core users, not edge cases: accessibility is built into the primitives rather than audited at the end.',
      ],
      functional: [
        'Light, dark, and system themes work with no unstyled flash and no lost brand colour.',
        'Twelve base primitives cover every interaction the Release 1 screens need.',
        'The app shell renders bottom tab navigation on mobile and a sidebar on desktop, driven by configuration.',
      ],
      ui: [
        'Tokens per §26.3–26.5: coral `#FF6B5E`, plum `#4A2545`, gold `#F4C95D`, warm neutrals, full dark palette.',
        'Fraunces for emotional headers, Inter for UI (§26.4).',
        'Radius, elevation, and a four-tier motion scale including the 1200ms ceremonial timing used for capsule seal and unwrap.',
        'Every primitive in all states, both themes, with a `prefers-reduced-motion` variant.',
        'Skeleton, empty, and error templates as reusable components, because §33.9 requires every list to have all three.',
      ],
      security: ['No third-party font or asset host beyond Google Fonts; no analytics or tracker in the component layer.'],
      testing: [
        'Component tests asserting on accessible roles and names, not class names.',
        'axe checks with zero serious or critical violations.',
        'A theming test rendering in all three theme states.',
        'A contrast test asserting coral is never used for small text on white.',
      ],
      ac: [
        'Theme switching works across light, dark, and system with no flash.',
        'All twelve primitives exist with documented states in both themes.',
        'App shell navigation is configuration-driven and responsive.',
        'Zero serious or critical axe violations across the primitive set.',
      ],
      trace: ['§26', '§28.1', '§28.2', '§33'],
      sprints: [
        {
          id: 'SPR-01-02-01', name: 'Design Tokens, Primitives & App Shell',
          objective: 'A themed, accessible component foundation and a working responsive shell.',
          priority: 'critical', deps: ['SPR-01-01-01'], duration: '~1 week',
          goal: 'A developer can build any Release 1 screen using only existing primitives and tokens, in either theme, without writing a raw colour value.',
          inScope: ['Token stylesheet and Tailwind preset', 'Font loading', 'Twelve primitives', 'Skeleton/empty/error templates', 'Theme provider and toggle', 'Configuration-driven app shell'],
          outScope: ['Any product screen', 'Feature-specific components', 'Marketing site design (PHASE-10)'],
          approach: [
            'Tokens as CSS custom properties consumed through a Tailwind v4 preset, so a component never contains a hex value.',
            'Radix primitives as the behavioural base; styling is ours, accessibility is theirs.',
            'Build the shell as configuration so the Release 3 navigation change (Timeline → Gifts) is a config edit, not a rewrite (gap analysis §3 item 3).',
          ],
          archChanges: ['Establishes the theming contract in ADR-014 that every later component depends on.'],
          deliverables: ['`packages/config` Tailwind preset', 'Token stylesheet', 'Component library with tests', 'App shell'],
          testing: ['Component tests', 'axe checks', 'Three-state theme test', 'Contrast assertions'],
          ac: ['No hard-coded colour in any component', 'Theme test passes in all three states', 'axe clean'],
          dod: ['A short usage note for each primitive committed alongside it'],
          trace: ['§26', '§28.1'],
          epics: [
            {
              id: 'EPIC-01-02-01-01', name: 'Design Tokens & Theming',
              objective: 'Implement the §26 token system correctly in all three theme states, avoiding the bug present in the existing repository.',
              value: 'Theming done wrong is visible on every screen and expensive to fix later. The existing repo demonstrates the exact failure: its dark mode sets `--primary` to pure white, so the brand colour vanishes in dark mode.',
              stories: [['user with dark mode enabled', 'the app to respect my system theme and still look like itself', 'it feels considered rather than inverted']],
              functional: ['Light, dark, and system themes', 'A user-facing override that wins in both directions', 'No flash of unstyled or wrong-theme content'],
              technical: [
                'Complete light palette on bare `:root`.',
                'Only changed tokens redefined under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`.',
                'Same tokens redefined under `:root[data-theme="dark"]` so an explicit choice wins.',
                'Theme preference persisted and applied before first paint.',
              ],
              ui: ['Every colour, radius, shadow, spacing step, and motion duration from §26.3–26.5 exposed as a token'],
              security: ['Theme preference in `localStorage` only; wrapped in try/catch since a private window can throw on access'],
              testing: ['Render in all three states', 'Assert no token is defined only inside a media query', 'Contrast assertions for the coral small-text rule'],
              ac: ['All three theme states correct', 'Brand colour present in dark mode', 'No unstyled flash'],
              trace: ['§26.3', '§26.4', '§26.5', 'ADR-014'],
              tasks: [
                {
                  name: 'Implement Design Token System for Light, Dark, and System Themes', type: 'frontend', priority: 'critical',
                  deps: ['TASK-002'], trace: ['§26.3', '§26.5', 'ADR-014'],
                  obj: 'Create the complete token stylesheet and Tailwind v4 preset implementing every colour, radius, elevation, spacing, and motion value from blueprint §26, correct in light, dark, and system themes.',
                  ctx: 'Blueprint §26.3 specifies the full palette and the exact implementation rule. ADR-014 restates it because the existing repository gets it wrong in an instructive way: it defines dark-mode values in a `.dark` block that sets `--primary` to `#FFFFFF`, so the brand coral disappears entirely in dark mode.',
                  why: 'Every screen in every later phase consumes these tokens. A structural mistake here appears on all of them, and fixing it late means touching every component. The three-state requirement (explicit light, explicit dark, and unset system) is where implementations usually break — a design that only handles a `.dark` class fails for users on system default.',
                  out: 'A token stylesheet plus Tailwind preset where every §26 value is available as a semantic token, correct in all three theme states, with a theme provider that applies the preference before first paint and a toggle that overrides the system in both directions.',
                  fr: [
                    'Every colour token from §26.3, light and dark.',
                    'Type scale, radii, elevation, spacing, and the four motion tiers from §26.4–26.5, including the 1200ms ceremonial tier.',
                    'Status chip colours mapped to semantic tokens (scheduled, processing, delivered, opened, reacted, failed, cancelled, sealed).',
                    'Theme provider supporting `light`, `dark`, and `system`; user choice persisted.',
                    'No flash of wrong theme on load.',
                  ],
                  tr: [
                    '**Complete light palette on bare `:root`.** No token may have its only definition inside a media query or an attribute selector.',
                    'Dark overrides under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`.',
                    'Dark overrides repeated under `:root[data-theme="dark"]` so an explicit choice wins in both directions.',
                    '`body` gets an explicit token background — never transparent.',
                    'Tailwind v4 preset in `packages/config` maps tokens to utility names so components never contain a hex value.',
                    'Fraunces and Inter loaded with `font-display: swap`, subset to Latin plus ₹, with a real fallback stack.',
                  ],
                  impl: [
                    'Create `apps/web/src/styles/tokens.css`. Write the **entire light palette** on bare `:root` first, then add the two dark blocks. Follow the §26.3 rule literally — this is the one part of this task where creative deviation causes the exact bug being avoided.',
                    'Add the non-colour tokens: type scale, radii, elevation (with the dark-mode variant using a 1px border plus a lower-opacity shadow, since shadows read poorly on dark surfaces), spacing, and the four motion durations.',
                    'Create `packages/config/tailwind-preset.ts` mapping tokens to semantic utility names (`bg-surface`, `text-primary`, `rounded-card`, `shadow-md`, `duration-ceremonial`).',
                    'Configure fonts in the root layout: Fraunces for display, Inter for UI, both with fallback stacks and `swap`.',
                    'Create `apps/web/src/components/providers/ThemeProvider.tsx` reading the stored preference and applying `data-theme` before hydration. Wrap every storage access in try/catch — a private window can throw on access, not merely return null.',
                    'Build a theme toggle cycling light → dark → system, with an accessible label announcing the current state.',
                    'Write the guard test described in §16: parse `tokens.css` and fail if any custom property appears **only** inside a media query or attribute selector. This is what stops the bug recurring six months from now.',
                    'Write the contrast test asserting coral `#FF6B5E` against `--surface` fails 4.5:1 and is therefore not permitted for small text — encode this as a lint-able rule or a documented test, since §26.8 makes it binding.',
                  ],
                  archDiagram: `packages/config/tailwind-preset.ts      semantic utilities
        │
apps/web/src/styles/tokens.css          :root  (COMPLETE light palette)
        │                               @media dark + :root:not([data-theme="light"])
        │                               :root[data-theme="dark"]
        ▼
ThemeProvider  →  sets data-theme before paint
        ▼
every component  →  uses utilities only, never a hex value`,
                  files: [
                    'apps/web/src/styles/tokens.css',
                    'apps/web/src/styles/globals.css',
                    'packages/config/tailwind-preset.ts',
                    'apps/web/src/components/providers/ThemeProvider.tsx',
                    'apps/web/src/components/ui/ThemeToggle.tsx',
                    'apps/web/src/app/layout.tsx  (fonts + provider)',
                    'apps/web/src/styles/__tests__/tokens.test.ts',
                  ],
                  ui: `**Theme toggle:** a single control cycling light → dark → system. Icon reflects the *current* state; the accessible name states both the current state and the next ("Theme: dark. Activate for system."). Minimum 44×44px target (§26.8).

**No flash:** the provider must set \`data-theme\` on the document before first paint. A brief inline script in the document head reading the stored preference is acceptable and is the standard solution; document why it is inline.

**Reduced motion:** the motion tokens must have \`prefers-reduced-motion\` variants at the token level, so a component gets the correct behaviour by using the token rather than by remembering to handle it.`,
                  rules: [
                    '**No component may contain a raw colour value.** Enforced by a lint rule if practical, by review otherwise.',
                    '**No token may be defined only inside a media query or attribute selector** — the guard test enforces this.',
                    'Coral `#FF6B5E` is never used for small text on white; it is valid for large text, icons, and fills only (§26.8).',
                    'Fraunces is reserved for emotional moments — headers, capsule reveals, celebratory copy. UI chrome, forms, tables, and admin are always Inter (§26.4).',
                  ],
                  edge: [
                    'Private browsing where `localStorage` access **throws** rather than returning null — wrap every read and write in try/catch and render correctly with no stored value.',
                    'System theme changing while the app is open with preference set to `system` — the media query listener must update live.',
                    'A user with an explicit light preference on a device in dark mode — the `:root[data-theme="light"]` path must win, which is exactly what the media-query guard exists for.',
                    'Font loading failure — the fallback stack must be genuinely similar in metrics, or layout shifts noticeably.',
                    'Forced-colors / high-contrast mode — verify the UI remains usable; do not fight the OS.',
                  ],
                  err: ['Storage failure must never break rendering: fall back to `system` silently.'],
                  sec: ['No external asset host beyond Google Fonts. No tracker in the styling layer.'],
                  tests: {
                    unit: [
                      'Guard test: no custom property is defined only inside a media query or attribute selector.',
                      'Contrast test: computed contrast of coral on surface is below 4.5:1, documenting why small text is prohibited; `--text-primary` on `--surface` and `--bg` exceeds 4.5:1 in both themes.',
                    ],
                    component: [
                      'Render a token-consuming component in explicit light, explicit dark, and unset system; assert the resolved background and brand colour differ appropriately and that brand colour is present in dark mode.',
                      'Theme toggle announces the current state and cycles all three values.',
                      'Storage throwing does not prevent render.',
                    ],
                    a11y: ['axe check on the toggle with zero serious or critical violations.'],
                  },
                  ac: [
                    'Every §26.3 colour token exists in light and dark.',
                    'Non-colour tokens from §26.4–26.5 exist, including the four motion tiers.',
                    'Guard test passes and demonstrably fails when a token is moved inside a media query.',
                    '**Brand coral is present and correct in dark mode** — the specific bug in the existing repository does not recur.',
                    'All three theme states render correctly, verified by test.',
                    'No flash of wrong theme on a hard reload.',
                    'Storage access wrapped in try/catch; private-window render verified.',
                    'No raw colour value in any component created by this task.',
                  ],
                  notes: [
                    'Read blueprint §26.3 and ADR-014 before starting, and follow the implementation rule literally. The failure mode is well documented in the existing repository and is easy to reproduce by accident.',
                    'The guard test is the durable part of this task. Tokens can be adjusted later; the structural rule must hold.',
                  ],
                },
              ],
            },
            {
              id: 'EPIC-01-02-01-02', name: 'Core UI Primitives',
              objective: 'Build the twelve primitives every Release 1 screen needs, accessible and themed, with all documented states.',
              value: 'Twelve components built once, correctly, replace dozens built inconsistently. Accessibility built into the primitive means every screen inherits it rather than being audited into compliance.',
              stories: [['user relying on a screen reader', 'every control to announce what it is and what it does', 'I can use the product independently']],
              functional: [
                'Buttons in five variants × five states.',
                'Inputs in six states including async-checking.',
                'Bottom sheet, dialog, toast, undo snackbar.',
                'Chips, avatars, status chips, progress (bar/ring/upload).',
                'Skeleton, empty, and error templates.',
              ],
              technical: [
                'Radix primitives underneath for focus management, dismissal, and ARIA.',
                'Focus moves into a sheet or dialog on open, is trapped, and returns to the trigger on close (§33.17).',
                'Every component consumes tokens only.',
              ],
              ui: ['All states in both themes', 'Reduced-motion variants', '≥44×44px targets', 'Visible focus ring'],
              security: ['No `dangerouslySetInnerHTML` anywhere in the primitive layer'],
              testing: ['Role-and-name assertions', 'Keyboard interaction', 'Focus return', 'axe per component'],
              ac: ['Twelve primitives complete with documented states', 'Keyboard and screen-reader operable', 'axe clean'],
              trace: ['§26.9', '§33'],
              tasks: [
                {
                  name: 'Build Form Primitives: Button, Field, Input, Textarea, Select, OTP', type: 'frontend', priority: 'critical',
                  deps: ['TASK-010'], trace: ['§26.9', '§33.1', '§33.2', '§33.3'],
                  obj: 'Build the form primitive set with every documented state and the validation behaviour required by blueprint §33.',
                  ctx: 'Blueprint §33 sets binding rules for every form in the product: validate on blur, re-validate on change only after the first error, disable the primary button until valid, show a spinner in place of the label while submitting, and prevent double submission. Encoding those rules in the primitives is the only way they hold across forty screens.',
                  why: 'If each form implements validation timing itself, some will validate on the first keystroke — which §33.1 explicitly forbids because it punishes a user mid-typing. Building the behaviour into `Field` and `Button` makes the correct pattern the easy one.',
                  out: 'Button (5 variants × 5 states), Field wrapper handling label/hint/error/required, Input, Textarea with character counter, Select, and an OTP input — all themed, accessible, and implementing the §33 timing rules.',
                  fr: [
                    'Button variants: primary, secondary, tertiary, destructive, icon. States: default, hover, pressed, disabled, loading.',
                    'Loading state replaces the label with a spinner and blocks repeat submission.',
                    'Field renders label, optional hint, error text at 13px, and required marker; associates all of them with the control via `aria-describedby` and `aria-invalid`.',
                    'Input supports leading/trailing adornments and an async-checking state showing a spinner then ✓ or ✕.',
                    'Textarea supports a live character counter.',
                    'OTP input: six boxes, auto-advance, paste of a full code, `autocomplete="one-time-code"`, backspace moving focus back.',
                    'Error state adds a border, an icon, and helper text — never colour alone (§26.8).',
                  ],
                  tr: [
                    'Validation timing implemented in the Field/form layer: on blur first, then on change **only after** an error has been shown.',
                    'Double-submit prevented at the handler, not merely by disabling the button.',
                    'Field shake animation fires only on a submit attempt, never on blur (§33.2), and respects reduced motion.',
                    'OTP uses `autocomplete="one-time-code"` so iOS keyboard autofill works — WebOTP is Chromium-only, so the design must not depend on programmatic auto-fill (§29.0).',
                  ],
                  impl: [
                    'Build `Button` with variants and states from tokens. The loading state must keep the button width stable so the layout does not jump.',
                    'Build `Field` as the wrapper owning label, hint, error, and ARIA wiring. Every other input primitive composes inside it rather than duplicating that logic.',
                    'Build `Input`, `Textarea` (with counter), and `Select` (Radix Select for keyboard and screen-reader behaviour).',
                    'Build `OtpInput`: six single-character boxes, auto-advance on entry, backspace to the previous box, full-code paste distributed across boxes, and `autocomplete="one-time-code"` on the first box. Test paste explicitly — it is the primary path on iOS.',
                    'Implement the validation timing rules in a small `useFieldValidation` hook so forms cannot get the timing wrong by accident.',
                    'Add the async-checking state used later for email uniqueness, promo codes, and PIN serviceability (§33.4): spinner, then ✓ or ✕ with a reason.',
                    'Write a usage note per primitive showing the correct and incorrect pattern side by side.',
                  ],
                  files: [
                    'apps/web/src/components/ui/Button.tsx',
                    'apps/web/src/components/ui/Field.tsx',
                    'apps/web/src/components/ui/Input.tsx',
                    'apps/web/src/components/ui/Textarea.tsx',
                    'apps/web/src/components/ui/Select.tsx',
                    'apps/web/src/components/ui/OtpInput.tsx',
                    'apps/web/src/hooks/useFieldValidation.ts',
                    'apps/web/src/components/ui/__tests__/Button.test.tsx',
                    'apps/web/src/components/ui/__tests__/Field.test.tsx',
                    'apps/web/src/components/ui/__tests__/OtpInput.test.tsx',
                  ],
                  ui: `**Button** — 5 variants × 5 states, in both themes. Loading replaces the label with a spinner at a fixed width. Minimum 44×44px. Disabled primary buttons must still be focusable enough to explain themselves: where a button is disabled pending validity, a tap shows a tooltip or inline message saying what is missing (§29.3 requires exactly this for the terms checkbox) rather than doing nothing.

**Field** — label above, control, then hint or error below at 13px. Error adds border, icon, and text.

**OtpInput** — six boxes, generous spacing, large type. Paste of a six-character code fills all boxes. On error the boxes take an error border and shake **once**, on submit only.

All states designed and tested in light and dark.`,
                  rules: [
                    'Never validate on the first keystroke (§33.1).',
                    'Error copy states what is wrong and how to fix it (§33.2). The primitive must accept that copy; it must not generate "Invalid input".',
                    'A disabled primary button must be able to explain why it is disabled.',
                    'Never colour alone for state — always an icon or text as well.',
                  ],
                  edge: [
                    'Paste of a code with spaces or a trailing newline into the OTP input — normalise before distributing.',
                    'Paste of a code longer or shorter than six characters — take the first six digits, ignore non-digits.',
                    'Autofill filling a password field after hydration, leaving internal state stale — read the DOM value on mount.',
                    'A very long validation message wrapping and pushing layout — the Field must reserve or animate space smoothly.',
                    'Rapid double-tap on a slow connection — the handler-level guard, not the disabled attribute, is what prevents the duplicate submission.',
                    'Screen-reader announcement of an error appearing after blur — the error region needs a polite live region so it is announced without stealing focus.',
                  ],
                  err: ['A submit handler that throws must leave the button recoverable, not stuck in the loading state — reset in a `finally`.'],
                  sec: ['No `dangerouslySetInnerHTML`.', 'Password inputs must not disable paste — blocking paste actively harms password-manager users.'],
                  tests: {
                    component: [
                      'Button renders each variant and state; loading state prevents a second click from calling the handler.',
                      'Field associates label, hint, and error with the control, asserted via accessible name and description.',
                      'Validation fires on blur, not on the first keystroke; after an error it re-validates on change.',
                      'OTP: typing advances, backspace retreats, pasting a six-digit code fills all boxes, pasting a spaced code normalises.',
                      'Error state renders an icon in addition to colour.',
                    ],
                    a11y: ['axe check on each primitive in both themes, zero serious or critical violations.', 'Full keyboard traversal of a composed form with a visible focus ring at every stop.'],
                  },
                  ac: [
                    'All six primitives implemented with every documented state in both themes.',
                    'Validation timing matches §33.1, proven by test.',
                    'Double-submit prevented at the handler level, proven by test.',
                    'OTP paste works, including a spaced or padded code.',
                    'Disabled primary buttons can explain themselves.',
                    'axe clean across all primitives.',
                    'Usage note committed for each primitive.',
                  ],
                  notes: [
                    'These primitives carry the §33 rules for the entire product. Time spent here is repaid on every form in every later phase.',
                    'The OTP paste path is the primary flow on iOS, where WebOTP does not exist. Test it on a real device before considering this done.',
                  ],
                },
                {
                  name: 'Build Overlay & Feedback Primitives: Sheet, Dialog, Toast, Snackbar', type: 'frontend', priority: 'high',
                  deps: ['TASK-010'], trace: ['§26.9', '§33.5', '§33.17', '§29.13'],
                  obj: 'Build the bottom sheet, confirmation dialog, toast, and undo snackbar with correct focus management and the destructive-action confirmation pattern.',
                  ctx: 'Blueprint §28.1 makes sheets the primary pattern for quick actions on mobile so context is never lost, and §33.5 requires every destructive action to show a confirmation stating its consequence — with typed confirmation for irreversible ones.',
                  why: 'Focus management is the part of overlay UI that is almost always wrong and is invisible to sighted mouse users. Getting it right in the primitive means every sheet in the product is usable by keyboard and screen reader, rather than each one being fixed after an audit.',
                  out: 'Sheet (bottom on mobile, centred on desktop), Dialog with a confirm variant supporting typed confirmation, Toast with variants, and an undo Snackbar — all with correct focus behaviour and reduced-motion variants.',
                  fr: [
                    'Sheet: swipe-to-dismiss on touch, backdrop click, Escape; snaps to content height.',
                    'Dialog: confirm variant taking a consequence description and an optional required typed phrase.',
                    'Toast: success, error, info variants; auto-dismiss with a pause on hover or focus.',
                    'Snackbar: action button (Undo) with a timeout, and a queue so two undos do not overwrite each other.',
                    'Focus moves in on open, is trapped, and returns to the trigger on close.',
                  ],
                  tr: [
                    'Radix Dialog as the base for both Sheet and Dialog so focus trap, scroll lock, and ARIA are correct.',
                    'Toast and Snackbar render in a portal above the tab bar, respecting safe-area insets.',
                    'Reduced-motion variants substitute a cross-fade for slide animations.',
                    'Route-aware sheets: PHASE-03 will mount the create sheet as an intercepted route, so the Sheet must work both as a controlled component and inside a route boundary.',
                  ],
                  impl: [
                    'Build `Sheet` on Radix Dialog with bottom positioning on small viewports and centred positioning above the tablet breakpoint. Add swipe-to-dismiss on touch with a velocity threshold, and make sure a swipe attempt that does not dismiss returns smoothly.',
                    'Build `Dialog`, then a `ConfirmDialog` wrapper taking `title`, `consequence`, `confirmLabel`, and optional `typedConfirmation`. When `typedConfirmation` is supplied, the confirm button stays disabled until the phrase matches exactly.',
                    'Build `Toast` with a provider and imperative API, variants, and pause-on-hover/focus. Auto-dismiss must not apply to error toasts that require acknowledgement.',
                    'Build `Snackbar` for undo, with a queue and a clearly labelled action button.',
                    'Implement focus management explicitly and test it: focus moves to the first focusable element or the sheet container on open, is trapped, and returns to the triggering element on close (§33.17).',
                    'Ensure the toast layer sits above the bottom tab bar and honours `env(safe-area-inset-bottom)`.',
                  ],
                  files: [
                    'apps/web/src/components/ui/Sheet.tsx',
                    'apps/web/src/components/ui/Dialog.tsx',
                    'apps/web/src/components/ui/ConfirmDialog.tsx',
                    'apps/web/src/components/ui/Toast.tsx',
                    'apps/web/src/components/ui/ToastProvider.tsx',
                    'apps/web/src/components/ui/Snackbar.tsx',
                    'apps/web/src/components/ui/__tests__/Sheet.test.tsx',
                    'apps/web/src/components/ui/__tests__/ConfirmDialog.test.tsx',
                  ],
                  ui: `**Sheet** — bottom-anchored on mobile with a drag handle, rounded top corners at the card radius, backdrop scrim. Centred modal above the tablet breakpoint. Content scrolls internally; the page behind never scrolls.

**ConfirmDialog** — title, a plain-language consequence sentence, then actions with the destructive action visually distinct but **not** the default focus target. For irreversible actions, a text input requiring an exact typed phrase, with the confirm button disabled until it matches (§33.5).

**Toast** — top on desktop, above the tab bar on mobile. Success auto-dismisses; error persists until dismissed.

**Snackbar** — bottom, with a single Undo action and a visible timeout.

All with reduced-motion variants (cross-fade instead of slide).`,
                  rules: [
                    'Every destructive action uses ConfirmDialog with a consequence sentence, never a bare "Are you sure?" (§33.5).',
                    'Irreversible actions require typed confirmation.',
                    'Focus always returns to the trigger on close.',
                    'The destructive button is never the initially focused element.',
                  ],
                  edge: [
                    'Nested overlays — a confirm dialog opened from inside a sheet must trap focus in the dialog and return it to the sheet, not to the page.',
                    'Swipe-to-dismiss conflicting with a scrollable area inside the sheet — only the drag handle and the non-scrolled region should initiate dismissal.',
                    'Two undo snackbars queued in quick succession — the second must not silently discard the first action\'s undo window.',
                    'A toast appearing while a sheet is open — it must remain visible and reachable.',
                    'Keyboard-only user on mobile viewport — swipe is unavailable, so Escape and an explicit close button must both work.',
                    'Reduced motion plus swipe-to-dismiss — the dismissal must still feel immediate rather than instant-and-jarring.',
                  ],
                  err: ['A toast triggered from a failed action must carry actionable copy, not "Something went wrong" — the primitive accepts the copy and must not supply a generic default.'],
                  sec: ['Overlay content must not be rendered from unsanitised HTML.'],
                  tests: {
                    component: [
                      'Sheet: opens, traps focus, closes on Escape and backdrop click, returns focus to the trigger.',
                      'ConfirmDialog: confirm disabled until the typed phrase matches exactly, including case.',
                      'Destructive action is not the initially focused element.',
                      'Toast: success auto-dismisses, error persists, hover pauses the timer.',
                      'Snackbar: two queued undos both remain actionable.',
                      'Nested dialog-in-sheet returns focus to the sheet.',
                    ],
                    a11y: ['axe on each overlay, zero serious or critical violations.', 'Keyboard-only open, operate, and dismiss for each overlay.'],
                  },
                  ac: [
                    'All four primitives implemented with both themes and reduced-motion variants.',
                    'Focus enters, is trapped, and returns — proven by test for each overlay.',
                    'Typed confirmation works and is case-exact.',
                    'Toast layer respects safe-area insets and sits above the tab bar.',
                    'Nested overlay focus behaviour correct.',
                    'axe clean.',
                  ],
                  notes: [
                    'The Sheet built here becomes the create-memory surface in PHASE-03 and the seal-capsule surface in PHASE-05. Make it composable enough to host a multi-step flow.',
                    'ConfirmDialog will be used for capsule cancellation and account deletion — the two most consequential actions in the product. Its consequence copy slot must accept rich content, such as a list of affected recipients.',
                  ],
                },
                {
                  name: 'Build Display Primitives: Chip, Avatar, StatusChip, Progress, Countdown', type: 'frontend', priority: 'high',
                  deps: ['TASK-010'], trace: ['§26.9', '§26.3', '§29.7', '§29.16'],
                  obj: 'Build the display primitives that carry state and identity across the product, including the status chip vocabulary and the countdown component central to the capsule experience.',
                  ctx: 'Status appears everywhere in this product — memory delivery states, upload progress, order states, moderation states. Blueprint §26.3 defines a status-chip colour vocabulary; §29.7 and §29.16 both surface live countdowns as primary content.',
                  why: 'The countdown is not decoration. It is how a pending capsule becomes emotionally real, and blueprint §1 identifies that pending promise as the product\'s central retention mechanic. It appears on Home, on the timeline\'s future band, and on the capsule detail screen, so it must be a single well-behaved component.',
                  out: 'Chip (filter/selectable/relationship), Avatar with group stacking and initials fallback, StatusChip covering the documented vocabulary, Progress (bar, ring, upload with pause/cancel affordances), and Countdown rendering long durations humanely.',
                  fr: [
                    'Chip variants: filter (toggleable), selectable (multi-select), relationship (display), each with a removable option.',
                    'Avatar: image, initials fallback, deterministic background from the name, size scale, and a stacked group with an overflow count.',
                    'StatusChip mapping the §26.3 vocabulary to tokens with an icon per state.',
                    'Progress: determinate bar, ring for countdowns and completion, and an upload variant exposing pause, resume, and cancel.',
                    'Countdown: live, accessible, and readable at every scale from seconds to decades.',
                  ],
                  tr: [
                    'Countdown updates via a single shared interval, not one timer per instance — a timeline can render dozens.',
                    'Countdown pauses when the document is hidden and resynchronises on visibility change, so a backgrounded tab does not drift or burn battery.',
                    'Avatar initials derived correctly for single-word, multi-word, and non-Latin names.',
                    'StatusChip never conveys state by colour alone.',
                  ],
                  impl: [
                    'Build `Chip` with its variants and an optional remove affordance that is a real button with an accessible name.',
                    'Build `Avatar` with an initials fallback. Derive initials in a way that works for "Riya", "Riya Sharma", and names in Devanagari or Tamil script — take the first grapheme of up to two words rather than slicing by code unit, or a two-character emoji name will render as broken text.',
                    'Build `StatusChip` with a map from state to token and icon, covering: scheduled, processing, delivered, opened, reacted, failed, cancelled, sealed.',
                    'Build `Progress` with bar, ring, and upload variants. The upload variant must expose pause, resume, cancel, and retry — PHASE-04 depends on it (§29.28 queued-actions tray).',
                    'Build `Countdown` taking a target instant and a timezone. Format adaptively: seconds when under a minute, then minutes, hours, days, and for long horizons "4 years 32 days" as §29.16 specifies. Use `tabular-nums` so digits do not jitter.',
                    'Give Countdown an accessible representation: a `time` element with a machine-readable `datetime`, and a polite live region that updates at a **coarse** interval (not every second) so a screen reader is not flooded.',
                    'Implement the shared-interval scheduler and the visibility-change resynchronisation.',
                  ],
                  files: [
                    'apps/web/src/components/ui/Chip.tsx',
                    'apps/web/src/components/ui/Avatar.tsx',
                    'apps/web/src/components/ui/AvatarGroup.tsx',
                    'apps/web/src/components/ui/StatusChip.tsx',
                    'apps/web/src/components/ui/Progress.tsx',
                    'apps/web/src/components/ui/Countdown.tsx',
                    'apps/web/src/hooks/useSharedTick.ts',
                    'apps/web/src/lib/format/duration.ts',
                    'apps/web/src/components/ui/__tests__/Countdown.test.tsx',
                    'apps/web/src/components/ui/__tests__/Avatar.test.tsx',
                  ],
                  ui: `**StatusChip** — pill with an icon plus a text label. Colour from the §26.3 vocabulary. Never colour alone.

**Countdown** — tabular numerals so digits do not shift. Adaptive units:

${'```'}
under 1 min   "in 42 seconds"
under 1 hour  "in 18 minutes"
under 1 day   "in 4 hours"
under 60 days "in 22 days"
beyond        "in 4 years 32 days"
${'```'}

Rendered as a \`<time datetime="...">\` element so assistive technology and crawlers get the exact instant. The visible text updates on the shared tick; the live region updates coarsely.

**Progress (upload variant)** — bar with a percentage, the byte count, and pause/cancel controls, plus a retry affordance in the failed state.`,
                  rules: [
                    'Status is never conveyed by colour alone (§26.8).',
                    'A countdown to a past instant renders as "due" or "delivering", never a negative number.',
                    'Countdown must state the recipient-relevant timezone where one applies — a capsule delivering "in 4 hours" means little without knowing whose 4 hours (§33.6).',
                  ],
                  edge: [
                    'A target date decades away — must not overflow or produce an absurd unit like "in 1,461 days" where "in 4 years" is meant.',
                    'A target instant that passes while the component is mounted — must transition to the due state without a flash of negative time.',
                    'Crossing a DST boundary between now and the target — compute from absolute instants, never by adding 24-hour days.',
                    'A backgrounded tab for hours — resynchronise on visibility change rather than trusting accumulated ticks.',
                    'Dozens of countdowns on one timeline screen — the shared tick is what keeps this affordable; verify with a rendered list of 50.',
                    'A single-grapheme or emoji display name in Avatar — must not produce mojibake.',
                    'A very long relationship label in a Chip — must truncate with an accessible full value.',
                  ],
                  err: ['An invalid or missing target date must render a neutral placeholder, not `NaN` or `Invalid Date`.'],
                  sec: ['Avatar image URLs are signed and time-limited from PHASE-04 onward; the component must tolerate an expired URL by falling back to initials rather than showing a broken image.'],
                  tests: {
                    component: [
                      'Countdown formats each documented range correctly.',
                      'Countdown across a DST boundary produces the correct day count.',
                      'Countdown transitions to due when the target passes while mounted.',
                      'Fifty countdowns share a single interval (assert timer count).',
                      'Avatar initials correct for single-word, multi-word, non-Latin, and emoji names.',
                      'StatusChip renders an icon for every state in the vocabulary.',
                      'Upload progress exposes pause, cancel, and retry with accessible names.',
                    ],
                    a11y: ['Countdown exposes a machine-readable `datetime` and does not flood the live region.', 'axe on all display primitives.'],
                  },
                  ac: [
                    'All five primitives implemented in both themes.',
                    'Countdown correct across all documented ranges, including multi-year and DST transitions.',
                    'Shared tick verified — fifty instances, one interval.',
                    'Avatar initials correct for non-Latin and emoji names.',
                    'StatusChip covers the full vocabulary with icons.',
                    'Upload progress exposes pause, resume, cancel, retry.',
                    'axe clean.',
                  ],
                  notes: [
                    'The Countdown is one of the most emotionally important components in the product. It is worth more care than a typical primitive.',
                    'Duration formatting belongs in `lib/format/duration.ts` and will be reused by email templates and the recipient unlock page, which cannot use React state — keep the formatter pure and framework-free.',
                  ],
                },
                {
                  name: 'Build Skeleton, Empty, and Error State Templates', type: 'frontend', priority: 'high',
                  deps: ['TASK-010'], trace: ['§33.9', '§29', '§26.9'],
                  obj: 'Build reusable skeleton, empty-state, and error-state templates so every list and screen in the product satisfies blueprint §33.9 without re-inventing them.',
                  ctx: 'Blueprint §33.9 is unambiguous: **every** list must have skeleton loading, an empty state with illustration and CTA, an error state with retry, and an end-of-list marker. Section §29 then specifies a distinct empty state for nearly every screen.',
                  why: 'Empty and error states are where a product either feels considered or feels unfinished, and they are the states most often skipped under time pressure. Making them templates — with a required CTA slot — makes the complete version cheaper to build than the incomplete one.',
                  out: 'A `Skeleton` primitive plus composed skeletons for card, list-row, and grid layouts; an `EmptyState` taking illustration, headline, body, and a required primary action; an `ErrorState` with a retry handler; and an `EndOfList` marker.',
                  fr: [
                    'Skeleton with shimmer, respecting reduced motion (static tint instead of animation).',
                    'Composed skeletons matching the real card, row, and grid geometry so there is no layout shift when content arrives.',
                    'EmptyState with slots for illustration, headline, supporting copy, primary action, and optional secondary action.',
                    'ErrorState with a message, a retry button, and an optional detail disclosure.',
                    'EndOfList marker for finite lists.',
                    'An offline variant of ErrorState distinguishing "you are offline" from "this failed".',
                  ],
                  tr: [
                    'Skeleton geometry must match the loaded component\'s dimensions — verified by a test comparing rendered heights, because §29.6 requires a stable-height grid with zero layout shift.',
                    'EmptyState requires a primary action by type — an empty state with no way forward is a dead end and the type system should prevent it.',
                    'ErrorState retry receives the original request context so retry is genuine, not a page reload.',
                  ],
                  impl: [
                    'Build `Skeleton` as a token-driven shimmer block with width, height, and radius props. Under `prefers-reduced-motion`, render a static tint rather than an animation.',
                    'Build `CardSkeleton`, `ListRowSkeleton`, and `GridSkeleton` that mirror the geometry of the real components. Write a test asserting the skeleton and loaded heights match within a tolerance — this is what prevents the layout shift §29.6 forbids.',
                    'Build `EmptyState` with a **required** `primaryAction` prop. Include an `illustration` slot; commit simple, warm SVG placeholders now and let design replace them, so no screen ships with a blank area.',
                    'Build `ErrorState` with `message`, `onRetry`, and an optional collapsible detail. Add an `offline` variant whose copy states that cached content is shown and new items will sync (§29.7).',
                    'Build `EndOfList` — a quiet marker, not a loud banner.',
                    'Write usage notes showing the four states of a single list side by side, so the pattern is obvious to anyone building a new screen.',
                  ],
                  files: [
                    'apps/web/src/components/ui/Skeleton.tsx',
                    'apps/web/src/components/ui/skeletons/CardSkeleton.tsx',
                    'apps/web/src/components/ui/skeletons/ListRowSkeleton.tsx',
                    'apps/web/src/components/ui/skeletons/GridSkeleton.tsx',
                    'apps/web/src/components/ui/EmptyState.tsx',
                    'apps/web/src/components/ui/ErrorState.tsx',
                    'apps/web/src/components/ui/EndOfList.tsx',
                    'apps/web/src/components/illustrations/  (placeholder SVGs)',
                    'apps/web/src/components/ui/__tests__/states.test.tsx',
                  ],
                  ui: `**EmptyState** — centred illustration, headline in Fraunces, one or two lines of warm supporting copy, then a primary button and optional secondary text link. Copy is warm and second person, never a bare "No data" (§33.11).

Reference copy from the blueprint, to be used verbatim where specified:

- Home, new user: "Your memory box is empty — let's create your first one" (§29.7)
- Timeline: a stylised empty timeline showing the Now divider, so the future band is visible as something waiting (§29.12)
- Notifications: "Nothing new — we will tell you when something arrives" (§29.8)
- Members: "Add the people who matter — we will help you remember their milestones" (§29.11)

**ErrorState** — icon, a message saying what failed and what to do, a retry button, optional details. The offline variant reads "Showing your saved memories — new items will sync" (§29.7).`,
                  rules: [
                    'Every list uses all four states. A screen shipped without them fails review (§33.9).',
                    'An EmptyState must always offer a way forward.',
                    'Offline is a distinct state, not an error (§33.14). Never show a failure message for a working offline experience.',
                    'Error copy says what is wrong and what to do (§33.2).',
                  ],
                  edge: [
                    'A list that is empty because a filter excluded everything — this is a different empty state from a genuinely empty collection, and it must offer "clear filters" rather than "create your first" (§29.6, §29.9).',
                    'An error after partial data has loaded — show the loaded items plus an inline retry for the failed portion, never replace loaded content with a full-screen error.',
                    'Offline with cached content available — show the content with a banner, not an error.',
                    'A skeleton that renders longer than a second or two feels broken; consider a secondary message after a threshold.',
                    'An illustration missing in dark mode — the placeholder SVGs must use tokens, not baked colours.',
                  ],
                  err: ['This task defines error presentation; its own failure mode is a missing retry handler, which the type system should prevent.'],
                  sec: ['Error details disclosure must never expose a stack trace, a query, or an internal identifier to an end user.'],
                  tests: {
                    component: [
                      'Skeleton height matches the loaded component height within tolerance for card, row, and grid.',
                      'Reduced motion renders a static skeleton with no animation.',
                      'EmptyState requires a primary action (type-level test).',
                      'ErrorState retry invokes the supplied handler.',
                      'Offline variant renders distinct copy from the error variant.',
                      'Filtered-empty renders a clear-filters action rather than a create action.',
                    ],
                    a11y: ['Skeletons are hidden from assistive technology or announced as "loading", not read as content.', 'axe on all state templates.'],
                  },
                  ac: [
                    'Skeleton, EmptyState, ErrorState, and EndOfList implemented in both themes.',
                    'Skeleton geometry matches loaded geometry, proven by test.',
                    'EmptyState cannot be constructed without a primary action.',
                    'Offline variant distinct from the error variant.',
                    'Filtered-empty distinct from truly-empty.',
                    'Placeholder illustrations use tokens and render correctly in dark mode.',
                    'axe clean; skeletons not read as content.',
                  ],
                  notes: [
                    'The blueprint specifies exact empty-state copy for many screens. Use it verbatim where given — it was written deliberately and it sets the product\'s voice.',
                    'These templates are the cheapest quality win in the project. Every screen gets them for free from here on.',
                  ],
                },
              ],
            },
            {
              id: 'EPIC-01-02-01-03', name: 'Application Shell & Navigation',
              objective: 'Build the configuration-driven responsive shell: bottom tab bar on mobile, sidebar on desktop.',
              value: 'Navigation is the frame every screen lives in. Making it configuration-driven means the planned Release 3 change — Timeline giving up its tab to Gifts — is a config edit and an announcement, not a refactor.',
              stories: [
                ['mobile user', 'the main actions within reach of my thumb', 'I can use the app one-handed while holding a child'],
                ['desktop user', 'a persistent sidebar and keyboard shortcuts', 'I can work through a large archive efficiently'],
              ],
              functional: [
                'Mobile: five-item bottom tab bar with a raised centre create action.',
                'Tablet: tab bar in portrait, icon rail in landscape.',
                'Desktop: persistent sidebar plus a top command bar with global search.',
                'Tab bar hides on scroll down, returns on scroll up.',
                'Safe-area insets honoured.',
              ],
              technical: [
                'Navigation defined as a configuration array with release gating, so items can be added or swapped without touching layout code.',
                'Active state derived from the route, with the filled icon variant for the active tab (§26.6).',
                'The centre create action opens a sheet, not a route — context is never lost (§28.1).',
              ],
              ui: ['§28.1 structure: Home · Occasions · (+) · Timeline · Me', 'Filled icons for active state', '≥44×44px targets', 'Scroll-away behaviour'],
              security: ['Navigation must not reveal the existence of routes the session cannot access'],
              testing: ['Responsive behaviour at three breakpoints', 'Active state per route', 'Keyboard traversal', 'Safe-area rendering'],
              ac: ['Shell renders correctly at all three breakpoints', 'Navigation is configuration-driven', 'Keyboard and screen-reader operable'],
              trace: ['§28.1', '§28.2', 'gap G-3'],
              tasks: [
                {
                  name: 'Build Configuration-Driven Responsive Navigation Shell', type: 'frontend', priority: 'critical',
                  deps: ['TASK-011', 'TASK-012'], trace: ['§28.1', '§28.2', '§26.6'],
                  obj: 'Build the application shell with a mobile bottom tab bar, a tablet rail, and a desktop sidebar, all driven by a single navigation configuration.',
                  ctx: 'Blueprint §28.1 resolves a conflict between two proposed navigation structures in favour of a staged version: Release 1 ships `Home · Occasions · (+) · Timeline · Me`, and at Release 3 Gifts replaces Timeline. §28.1 also requires that such a change be announced in-app, never silent.',
                  why: 'Gap analysis §3 item 3 records this planned change explicitly. Hard-coding five tabs guarantees a refactor later; a configuration array with release gating makes it a one-line change plus an announcement. The scroll-away and safe-area behaviours are also easy to get wrong in ways that make an installed PWA feel like a website.',
                  out: 'An `(app)` layout rendering a bottom tab bar below 768px, an icon rail on tablet landscape, and a sidebar with a command bar above 1024px — from one config array — with correct active states, scroll-away behaviour, and safe-area handling.',
                  fr: [
                    'Five navigation items from configuration: Home, Occasions, Create (centre), Timeline, Me.',
                    'Create is a raised centre action in `--primary` that opens a sheet rather than navigating.',
                    'Active tab uses the filled icon variant and is announced as current to assistive technology.',
                    'Tab bar translates out of view on scroll down and back on scroll up.',
                    'Desktop sidebar with the same items plus secondary destinations, and a top command bar hosting global search.',
                    'Each config item can declare a minimum release so unreleased items are omitted entirely.',
                  ],
                  tr: [
                    'One config module is the single source of navigation truth; layout components read it and never hard-code items.',
                    'Active detection from the current pathname with correct handling of nested routes.',
                    '`env(safe-area-inset-bottom)` applied so the bar clears the iOS home indicator.',
                    'Scroll-away implemented with a passive scroll listener and a transform, not by changing layout, so it cannot cause reflow jank.',
                    'The bar must not obscure the last item of a scrolled list — the content area needs bottom padding equal to the bar height.',
                  ],
                  impl: [
                    'Create `apps/web/src/config/navigation.ts` exporting the item array: key, label, href or action, icon (outline and filled), and `minRelease`.',
                    'Build `BottomTabBar` reading the config. Render the centre item as a raised button that invokes the create sheet.',
                    'Build `Sidebar` and `CommandBar` for desktop from the same config, with the sidebar adding secondary destinations (Members, Settings).',
                    'Build `AppShell` selecting the correct navigation for the viewport, and place it in the `(app)` layout.',
                    'Implement scroll-away with a passive listener and a translate transform, with a small threshold so a minor scroll does not flicker the bar. Disable the behaviour under `prefers-reduced-motion`.',
                    'Apply safe-area padding to the bar and matching bottom padding to the scroll container. Verify on a device with a home indicator, or in a simulator with insets enabled.',
                    'Add `aria-current="page"` to the active item and ensure the label is always available to assistive technology even when visually reduced to an icon.',
                    'Add the keyboard shortcuts from §28.2 (`n` new, `/` search, `Esc` close) on desktop only, and make sure they never fire while focus is inside a text field.',
                  ],
                  archDiagram: `config/navigation.ts   ← single source; items carry minRelease
        │
        ├── BottomTabBar    (< 768px)   Home · Occasions · (+) · Timeline · Me
        ├── IconRail        (tablet landscape)
        └── Sidebar + CommandBar (>= 1024px)
                │
        (app)/layout.tsx  →  AppShell  →  {children}

Release 3: swap Timeline for Gifts in the config + in-app announcement (§28.1)`,
                  files: [
                    'apps/web/src/config/navigation.ts',
                    'apps/web/src/components/layout/AppShell.tsx',
                    'apps/web/src/components/layout/BottomTabBar.tsx',
                    'apps/web/src/components/layout/IconRail.tsx',
                    'apps/web/src/components/layout/Sidebar.tsx',
                    'apps/web/src/components/layout/CommandBar.tsx',
                    'apps/web/src/hooks/useScrollDirection.ts',
                    'apps/web/src/app/(app)/layout.tsx',
                    'apps/web/src/components/layout/__tests__/AppShell.test.tsx',
                  ],
                  ui: `**Mobile (< 768px)**

${'```'}
┌───────────────────────────────────────────────────────┐
│   🏠 Home    📅 Occasions    ➕    🕰 Timeline   👤 Me  │
└───────────────────────────────────────────────────────┘
${'```'}

Centre ➕ is raised, coral, and larger than its neighbours. It opens a sheet — it is not a route. Icons switch to the filled variant when active. Labels always present. Bar clears the home indicator via safe-area inset.

**Tablet portrait** — same tab bar. **Tablet landscape** — left icon rail.

**Desktop (≥ 1024px)** — persistent sidebar (Home, Occasions, Create, Timeline, Members, Settings) plus a top command bar with global search and ⌘K. Keyboard shortcuts active.

All in both themes, with a reduced-motion variant that disables scroll-away.`,
                  rules: [
                    'Navigation items come from configuration only. A hard-coded item in a layout is a defect.',
                    'The create action never navigates — losing the current screen to start a memory is the friction the sheet pattern exists to avoid (§28.1).',
                    'Unreleased items are omitted, not disabled — a disabled nav item is a promise (§28.4).',
                    'Navigation never reveals a route the session cannot reach.',
                  ],
                  edge: [
                    'A route not present in the config — nothing should appear active; do not fall back to marking Home active, which misleads.',
                    'Nested route such as `/app/memory/123` — the Timeline tab should read as active; define the matching rule explicitly rather than relying on prefix coincidence.',
                    'Scroll-away triggering on a short list that barely scrolls, or on a bounce/overscroll — require a threshold and ignore negative overscroll.',
                    'Keyboard shortcut firing while typing in the note field — shortcuts must be suppressed when focus is in an editable element.',
                    'Landscape phone, where a bottom bar consumes scarce vertical space — verify the layout remains usable.',
                    'Very long localised labels overflowing a tab — plan truncation with the full name available to assistive technology.',
                    'Safe-area inset of zero on Android — padding must not leave a visible gap.',
                  ],
                  err: ['A navigation target that fails to load must leave the shell intact and show the error inside the content area, never replace the whole screen.'],
                  sec: ['Do not render items for routes the session lacks; the shell is not an access-control mechanism, but it must not advertise what it cannot open.'],
                  tests: {
                    component: [
                      'Renders the tab bar below 768px, the rail on tablet landscape, and the sidebar above 1024px.',
                      'Active item derives from the route, including a nested route.',
                      'An unknown route marks nothing active.',
                      'Create invokes the sheet and does not change the route.',
                      'An item with a future `minRelease` is absent from the DOM.',
                      'Scroll-away hides and restores the bar past the threshold, and is disabled under reduced motion.',
                      'Keyboard shortcuts do not fire while focus is in a text field.',
                    ],
                    a11y: [
                      '`aria-current="page"` on the active item.',
                      'Every item has an accessible name even when the label is visually minimised.',
                      'Full keyboard traversal with a visible focus ring; axe clean at all three breakpoints.',
                    ],
                    e2e: ['Playwright: navigate all four routable tabs at mobile and desktop viewports; assert the shell persists and the active state follows.'],
                  },
                  ac: [
                    'Shell renders correctly at mobile, tablet, and desktop breakpoints.',
                    'All items come from `config/navigation.ts`; no hard-coded item anywhere.',
                    'Swapping Timeline for Gifts in the config changes the bar with no component edit — demonstrate this in a scratch commit and revert it.',
                    'Create opens a sheet and does not navigate.',
                    'Safe-area insets verified on a device or simulator with a home indicator.',
                    'Scroll-away works with a threshold and is disabled under reduced motion.',
                    'Shortcuts suppressed inside editable fields.',
                    'axe clean at all three breakpoints; `aria-current` correct.',
                  ],
                  notes: [
                    'Demonstrating the Release 3 tab swap during this task, then reverting it, is the cheapest possible proof that the configuration abstraction actually works. Do it.',
                    'The create sheet is only a placeholder here; PHASE-03 fills it with the real capture flow.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
