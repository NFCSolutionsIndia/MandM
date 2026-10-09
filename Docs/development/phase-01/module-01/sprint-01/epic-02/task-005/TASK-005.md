# TASK-005 — Configure CI Pipeline with Blocking Quality Gates

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-005 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-02 — CI/CD, Environments & Observability](../EPIC-01-01-01-02.md) |
| Type | devops |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-001` |
| Blueprint refs | `§21 Phase 1`, `ADR-018` |

---

## 1. Objective

Create a GitHub Actions workflow that runs typecheck, lint, unit tests, and build on every push and pull request, and blocks merge on any failure.

---

## 2. Context

This is the only mechanism that keeps quality from decaying as the task count grows into the hundreds. It must exist before feature work begins, not after.

---

## 3. Problem Statement

A permission bug in this product is a privacy incident (blueprint §20.2). The permission-matrix tests planned for PHASE-02 and PHASE-09 are only protective if a failing one actually blocks a merge.

---

## 4. Expected Outcome

A workflow that runs on push and pull request, caches pnpm and Turborepo, executes four gates in parallel where possible, and is configured as a required status check on `main`.

---

## 5. Requirements

### Functional Requirements

- Triggers: push to `main`, and all pull requests.
- Jobs: `typecheck`, `lint`, `test`, `build`.
- pnpm store and Turborepo cache restored between runs.
- Job summary reporting test counts and build output sizes.

### Technical Requirements

- Node version from `.nvmrc`; Corepack enabled.
- Concurrency group per ref with cancel-in-progress for PRs, but **never** for `main`.
- `--frozen-lockfile` install so a stale lockfile fails loudly.
- Fail fast disabled, so all four gates report rather than only the first failure.

---

## 6. Implementation Instructions

1. Create `.github/workflows/ci.yml` with a shared setup composite action or reusable steps for checkout, Corepack, Node, and pnpm install.
2. Add the four gate jobs. Run `typecheck`, `lint`, and `test` in parallel; `build` may depend on nothing but will benefit from the Turborepo cache.
3. Add pnpm store caching keyed on the lockfile hash, and Turborepo caching keyed on lockfile plus source hash.
4. Add a dependency audit step that fails on a critical advisory, and a secret-scanning step.
5. Configure branch protection on `main` requiring all four checks. Record in §20 that this is a repository setting, not a file, so it is not lost.
6. Verify by opening a throwaway PR that deliberately fails each gate in turn.

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
.github/workflows/ci.yml
.github/actions/setup/action.yml
.github/dependabot.yml
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

- A red gate blocks merge. No override without a recorded reason.
- `main` runs are never cancelled mid-flight.

---

## 13. Edge Cases

- A stale lockfile after a dependency change — `--frozen-lockfile` must fail rather than silently resolve.
- Cache poisoning across branches — scope cache keys to include the lockfile hash.
- Flaky test making the gate untrustworthy — quarantine policy: a flaky test is fixed or deleted within one working day, never retried into green. Record this policy in §20.

---

## 14. Error Handling

- Every failure must name the failing workspace and command in the job summary, so the cause is visible without opening logs.

---

## 15. Security Considerations

- Secret scanning and dependency audit are part of this task, not a later hardening phase.
- Workflow permissions set to least privilege (`contents: read` by default).

---

## 16. Testing Requirements

### Integration Tests

- A throwaway PR demonstrating each of the four gates blocking independently.

---

## 17. Acceptance Criteria

- [ ] All four gates run on a pull request.
- [ ] Each gate demonstrably blocks merge when failing.
- [ ] Second run of an unchanged branch is substantially faster due to caching.
- [ ] Branch protection configured and recorded in §20.
- [ ] Dependency audit and secret scanning active.

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
TASK-001
    ↓
TASK-005
```


---

## 20. Implementation Notes

- Keep CI under ten minutes. Beyond that, developers start working around it, and the gates stop protecting anything.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-02](../EPIC-01-01-01-02.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§21 Phase 1`, `ADR-018` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
