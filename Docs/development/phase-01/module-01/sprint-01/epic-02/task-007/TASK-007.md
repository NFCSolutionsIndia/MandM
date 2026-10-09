# TASK-007 — Integrate Sentry Error Tracking Across Web and Workers

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-007 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-02 — CI/CD, Environments & Observability](../EPIC-01-01-01-02.md) |
| Type | devops |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-002`, `TASK-003` |
| Blueprint refs | `§18.1`, `ADR-020` |

---

## 1. Objective

Wire Sentry into both applications with release tagging, source maps, and PII scrubbing appropriate to a product holding family media.

---

## 2. Context

ADR-020 pairs Sentry with a bespoke delivery-SLA monitor built in PHASE-05. This task delivers the general error channel; the delivery watchdog is separate and more important.

---

## 3. Problem Statement

The first production error will happen during the staged rollout. Without symbolicated traces and release tagging, diagnosing it costs days. Adding Sentry later also means the earliest, most informative failures are lost.

---

## 4. Expected Outcome

Uncaught errors and unhandled rejections from both apps appear in Sentry with readable stack traces, tagged to a release, with no user content and no personally identifying data in the payload.

---

## 5. Requirements

### Functional Requirements

- Server-side and client-side capture in `apps/api`; process-level capture in `apps/workers`.
- Release created per deploy with source maps uploaded and not publicly served.
- Environment tagging (development / preview / production).
- A deliberate test error route or command in each app.

### Technical Requirements

- Sampling: 100% of errors; traces sampled low (10%) to control cost.
- `beforeSend` scrubs request bodies, headers, and any field that could contain user content.
- Source maps uploaded during the build and then withheld from the public bundle.

---

## 6. Implementation Instructions

1. Install and configure the Sentry SDK in `apps/api` for both server and client runtimes, following the current Next.js integration guidance.
2. Configure `apps/workers` with process-level handlers for `uncaughtException` and `unhandledRejection` that log, capture, and then exit non-zero so the platform restarts the container.
3. Implement `beforeSend` scrubbing: strip request bodies, cookies, and authorization headers; **allow-list** the fields that may be sent rather than trying to deny-list what may not.
4. Wire release and environment tagging into both deploy workflows.
5. Add a `/api/debug/error` route (non-production only) and a workers CLI flag that each throw deliberately, to prove ingestion.
6. Verify a symbolicated stack trace appears for both apps, then confirm source maps are not fetchable from the public origin.

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
apps/site/sentry.client.config.ts
apps/site/sentry.server.config.ts
apps/site/src/app/api/debug/error/route.ts
apps/workers/src/lib/sentry.ts
apps/workers/src/index.ts  (wire process handlers)
.github/workflows/ci.yml  (source-map upload step)
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

- **No memory content, no media, no note text, and no email addresses may ever reach Sentry.** This product holds family photographs and messages intended for after death; an error-tracking payload is not an acceptable place for any of it.
- The debug error endpoint must be unreachable in production.

---

## 13. Edge Cases

- A validation error containing user-typed content — scrub the value, keep the field name.
- Very high error volume from a single bad deploy — configure a rate limit so Sentry cost cannot spike without bound.
- Source maps accidentally served publicly, exposing internals — verify explicitly.

---

## 14. Error Handling

- Sentry itself failing must never break a request or kill the worker loop: capture calls are fire-and-forget with a timeout.

---

## 15. Security Considerations

- Allow-list scrubbing, not deny-list.
- DSN is not a secret but the auth token for source-map upload is — scope it to the single project.
- Confirm production has no debug error route.

---

## 16. Testing Requirements

### Unit Tests

- `beforeSend` removes a payload containing a simulated note body and email address, and the test asserts they are absent.
- Workers process handler captures and exits non-zero.

### Integration Tests

- Deliberate error in each app appears in Sentry with a symbolicated frame.

---

## 17. Acceptance Criteria

- [ ] Symbolicated traces visible from both apps.
- [ ] Release and environment tags correct.
- [ ] Scrubbing test proves no user content in the payload.
- [ ] Source maps not fetchable from the public origin.
- [ ] Debug error route absent in production.

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
TASK-002
    ↓
TASK-003
    ↓
TASK-007
```


---

## 20. Implementation Notes

- The delivery-SLA watchdog in PHASE-05 is a different and more important alert channel. Do not conflate them; a Sentry error is "something broke", a missed unlock is "we broke a promise".

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-02](../EPIC-01-01-01-02.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§18.1`, `ADR-020` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
