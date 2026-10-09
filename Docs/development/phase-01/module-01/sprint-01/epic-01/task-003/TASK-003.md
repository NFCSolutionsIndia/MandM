# TASK-003 — Scaffold Independently Deployable Workers Service

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-003 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-01 — Workspace & Package Scaffold](../EPIC-01-01-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | completed |
| Dependencies | `TASK-001` |
| Blueprint refs | `§18.4`, `§35.2`, `ADR-003`, `ADR-006` |

---

## 1. Objective

Create `apps/workers` as a standalone TypeScript Node service with a job-claim loop skeleton, buildable and runnable without the web application.

---

## 2. Context

The delivery engine is the most critical process in the product: a capsule promised for 2046 must be delivered. Blueprint §35.2 requires it to be separately deployable so it keeps running while a web deploy is rolling or being rolled back.

---

## 3. Problem Statement

If the scheduler lives inside the web app, a bad web deploy can silently stop deliveries — the one failure the product cannot survive. Establishing the separation now costs an afternoon; retrofitting it later means moving the most safety-critical code in the system.

---

## 4. Expected Outcome

A container-ready service with a tick loop that claims nothing (no handlers yet), logs a heartbeat, handles SIGTERM gracefully, and exits cleanly. It builds and runs with `apps/api` absent from the filesystem.

---

## 5. Requirements

### Functional Requirements

- A tick loop with a configurable interval (default 60s) and a graceful-shutdown path.
- A handler registry keyed by job kind, empty at this stage.
- Structured JSON logging with a correlation id per tick.
- Health endpoint or heartbeat suitable for the platform health check.

### Technical Requirements

- Plain TypeScript compiled to `dist/`; no Next.js dependency.
- Dockerfile using a slim Node base; multi-stage so the runtime image excludes dev dependencies.
- Reads configuration from environment variables only, validated at boot by a Zod schema from `@mm/shared` — **fail fast and loudly on missing configuration rather than starting degraded.**
- SIGTERM handler that stops claiming new work, waits for in-flight work up to a timeout, then exits.

---

## 6. Implementation Instructions

1. Create `apps/workers/src/index.ts` with the tick loop, a handler map, and the shutdown handler.
2. Create `apps/workers/src/config.ts` that parses and validates environment variables at boot and throws with a readable message listing every missing key.
3. Create `apps/workers/src/lib/logger.ts` emitting structured JSON with level, timestamp, correlation id, and job kind where relevant.
4. Create a placeholder `apps/workers/src/handlers/index.ts` exporting an empty registry with a comment naming the handlers that will land in PHASE-05 (`capsule-delivery`, `delivery-watchdog`) and PHASE-04 (`transcode-video`, `generate-thumbnails`).
5. Write the multi-stage `Dockerfile` and a `.dockerignore`.
6. Prove independence: build the image in a context where `apps/api` is excluded, and confirm it succeeds.
7. Add graceful-shutdown logging so a deploy shows exactly when claiming stopped and when the last job finished.

---

## 7. Architecture

```text
apps/workers (ECS Fargate container, independent of the web service's deploys)
   │  every 60s
   ├──▶ claim jobs:  SELECT ... FOR UPDATE SKIP LOCKED   (PHASE-05)
   ├──▶ dispatch to handler registry by job kind
   └──▶ structured log per tick + per job

Handlers arriving later:
  PHASE-04  transcode-video · generate-thumbnails
  PHASE-05  capsule-delivery · delivery-watchdog · integrity-sweep
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/workers/src/index.ts
apps/workers/src/config.ts
apps/workers/src/lib/logger.ts
apps/workers/src/handlers/index.ts
apps/workers/Dockerfile
apps/workers/.dockerignore
apps/workers/tsconfig.json
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

- The workers service must never import from `apps/api`. Shared code goes through `packages/shared` or `packages/db`.
- The service must refuse to start on invalid configuration rather than running in a degraded state — a silently degraded delivery engine is worse than a stopped one, because a stopped one alerts.

---

## 13. Edge Cases

- Overlapping ticks if a tick outlives its interval — guard with a re-entrancy flag from the start.
- Clock skew between the container and the database — always use database time (`now()`) for claim comparisons, never container time. Add a comment stating this, because it is the kind of thing a later contributor "simplifies".
- SIGKILL after SIGTERM timeout leaving a job locked — the lock must carry an expiry so an abandoned job is reclaimable (implemented in PHASE-05, noted here).

---

## 14. Error Handling

- A handler throwing must not kill the loop: catch per job, log with the job id, and continue.
- Configuration errors exit with a non-zero code and a message naming every missing variable.

---

## 15. Security Considerations

- Container runs as a non-root user.
- No database credentials in the image; injected at runtime.
- Note for PHASE-04: the media-processing worker must run with no network egress beyond storage, since FFmpeg parsing untrusted media is an RCE surface (blueprint §20.4). Structure the handler registry so that worker can be a separate deployment if needed.

---

## 16. Testing Requirements

### Unit Tests

- Config validation rejects a missing required variable with a message naming it.
- Tick loop does not re-enter while a tick is in flight.
- A throwing handler is caught and the loop continues.

### Integration Tests

- Service boots, logs a heartbeat, receives SIGTERM, and exits 0 within the shutdown timeout.

---

## 17. Acceptance Criteria

- [x] Docker image builds with `apps/api` excluded from the build context.
- [x] Service starts, logs structured heartbeats, and exits 0 on SIGTERM.
- [x] Missing configuration produces a clear failure naming the variables.
- [x] A deliberately throwing handler does not stop the loop.
- [x] Container runs as non-root, verified by inspecting the running process.

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
TASK-001
    ↓
TASK-003
```


---

## 20. Implementation Notes

### The build had to change: `tsc` cannot emit a runnable worker

TASK-001 made internal packages "just-in-time" — `@mm/shared` and `@mm/db` export
`./src/index.ts`, which is **TypeScript source**. That is fine for `apps/api`, because
Next transpiles workspace packages. It does not work here.

Compiling this service with plain `tsc` emits `import { ... } from '@mm/shared'`, and at
runtime Node resolves that to a `.ts` file it cannot execute. The service would build
green and then fail on first boot — in a container, in a deploy.

**Resolution: bundle with tsup (esbuild).** `build` is now `tsup`, not `tsc`, producing a
single self-contained `dist/index.js` (542 KB). This pays for itself three times:

1. Workspace imports are resolved at build time, so the runtime never sees `@mm/*`.
2. **The runtime image needs no `node_modules` at all** — no pnpm inside the container,
   no workspace symlinks to reproduce, nothing to diverge between `pnpm install` and
   `docker run`.
3. The attack surface of a container that runs unattended for years is one file plus Node.

**Consequence for PHASE-04:** `sharp` and any other native dependency must be marked
`external` in `tsup.config.ts` and installed in the runtime image. Bundling a native
module does not work. This is noted in the config file itself, not just here.

### SIGTERM cannot be verified on Windows — verified in Docker instead

Testing graceful shutdown on the Windows dev machine gave **exit 143 and no shutdown
logs at all**. That is not a bug in the service: Windows has no POSIX signals, and MSYS
`kill -TERM` terminates the process rather than delivering a signal Node can trap.

Verified in the container instead, which is where it matters (ADR-019 runs this on ECS
Fargate, Linux):

```
docker stop -t 30 mm-w     →  exit code 0, in 1.7s

{"message":"shutdown signal received","signal":"SIGTERM"}
{"message":"stopped claiming new work","inFlight":false}
{"message":"no work in flight; shutdown is immediate","waitedMs":0}
{"message":"health endpoint closed"}
{"message":"worker stopped","signal":"SIGTERM","drained":true,"waitedMs":0,"uptimeMs":18099}
```

**Anyone testing shutdown behaviour must do it in a container.** A local `kill` on
Windows proves nothing either way.

Related, and deliberate: the Dockerfile uses `CMD ["node", "dist/index.js"]` in exec
form. The shell form would make `sh` PID 1, and `sh` does not forward SIGTERM — the
graceful path would never run and every deploy would SIGKILL in-flight deliveries.

### The handler-group seam (§15), built before it is needed

`handlers/index.ts` makes every handler declare a `group` — `'delivery'` or `'media'` —
even though the registry is empty.

ADR-012 requires the media pipeline to run with **no database credentials and no network
egress beyond storage**, because FFmpeg parsing untrusted user media is a known RCE
surface. That means a separate ECS service with a different IAM task role (ADR-028).
Splitting the process later is only cheap if the registry already distinguishes the two,
so the seam exists now, while there is no pressure to skip it.

### Deviations from the task text

- **§5 asks for the config schema to come from `@mm/shared`.** That package has no Zod
  base — it is created in TASK-004, which runs *after* this task. The schema lives in
  `apps/workers/src/config.ts` for now. **TASK-004 should move the reusable `parseEnv`
  helper to `@mm/shared`** so the web app validates its environment identically; the
  note is in the file as well as here.
- **§8 names `apps/workers/.dockerignore`; the file is `Dockerfile.dockerignore`.** The
  image must be built from the repository root (it needs `packages/*`), and Docker reads
  the ignore file relative to the *context*, not the Dockerfile. BuildKit's
  `<dockerfile>.dockerignore` convention keeps the rules colocated with this Dockerfile
  and scoped to it, instead of putting a workers-specific `apps/api` exclusion at the
  repository root where every future image would inherit it.
- **No `pino`/`winston`.** `lib/logger.ts` is ~80 lines with no dependencies. On a
  service meant to run untouched for years, each dependency is future attack surface and
  a future upgrade. The `Logger` interface is the seam if log volume ever justifies one.

### pnpm blocked esbuild's install script — and it did not matter

`pnpm install` reported `Ignored build scripts: esbuild@0.27.7`. Left unapproved
deliberately, and tested rather than assumed: **tsup builds correctly anyway**, because
modern esbuild ships platform binaries as `optionalDependencies` rather than fetching
them in a postinstall.

TASK-001 §15's "no dependency may require a postinstall script" posture therefore still
holds across the repository. Worth re-checking whenever a build tool is added.

### Image size

325 MB, on `node:24.11.1-slim`. Almost all of that is the base image; the application
is 542 KB.

Smaller options exist — `alpine` (musl, risky once FFmpeg arrives) or `distroless`
(no shell, which complicates debugging a delivery incident). Neither is worth the
trade today. **TASK-006 should pin the base image by digest**, not by tag, so a rebuilt
image is byte-identical.

### Verification of §17 acceptance criteria

| Criterion | Result | How |
|---|---|---|
| Docker image builds with `apps/api` excluded | Pass | `docker build -f apps/workers/Dockerfile .` succeeded; the build log contains **zero** references to `apps/api`. Excluded via `Dockerfile.dockerignore`. |
| Service starts, logs structured heartbeats, exits 0 on SIGTERM | Pass | Container ran, emitted one JSON line per tick with a per-tick `correlationId`; `docker stop` → **exit 0** in 1.7 s with the full shutdown trace. |
| Missing configuration produces a clear failure naming the variables | Pass | Two bad variables reported **together**, then **exit 78** (`EX_CONFIG`, distinguishing bad config from a crash). Message ends "Nothing was claimed, and no delivery was attempted." |
| A deliberately throwing handler does not stop the loop | Pass | 5 unit tests, including one that runs **three consecutive ticks** against a permanently-throwing handler and asserts all three complete — proving the interval survives, not merely one tick. |
| Container runs as non-root | Pass | `uid=1000 gid=1000 user=node` inside the running image. |

Also verified beyond §17:

- **§13 re-entrancy** — three concurrent `tickOnce()` calls yield `maxConcurrent === 1`.
- **§13 database time** — no claim logic exists yet, but the requirement is written into
  the header of `tick.ts` as a warning against "simplifying" it to `Date.now()`, which
  is exactly how a skewed container would deliver a capsule early.
- **§14 claim failure** — a database outage is caught; the tick logs and the next one
  retries rather than the loop dying.
- **Health vs readiness** — `/health` stays 200 while the process lives; `/ready` flips
  to 503 the moment shutdown begins, so a rolling deploy stops routing before the task
  disappears.
- **Log serialisation** — `Error` objects are unwrapped; without that, `JSON.stringify`
  logs `"error": {}` and an incident loses its only useful detail.
- **26 unit tests**, all green. Workspace gates green across six workspaces.

### Left deliberately undone

No handlers — this task builds the loop, not the work (PHASE-04, PHASE-05). No database
client: `DATABASE_URL` is optional until TASK-008, and `claimJobs` is a stub returning
an empty batch, injected so TASK-062 can drop in the real
`FOR UPDATE SKIP LOCKED` query without restructuring anything.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-01](../EPIC-01-01-01-01.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§18.4`, `§35.2`, `ADR-003`, `ADR-006` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
