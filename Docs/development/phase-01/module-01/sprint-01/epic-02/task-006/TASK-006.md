# TASK-006 — Provision AWS Infrastructure, Environments, and Per-PR Database Schemas

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-006 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-02 — CI/CD, Environments & Observability](../EPIC-01-01-01-02.md) |
| Type | devops |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-005` |
| Blueprint refs | `§18.1`, `ADR-005`, `ADR-012`, `ADR-019`, `ADR-028` |

---

## 1. Objective

Stand up the AWS account topology and deploy both applications: `apps/api` and `apps/workers` as independent ECS Fargate services, Aurora PostgreSQL Serverless v2 as the database, and a per-PR preview schema so every pull request has isolated data.

---

## 2. Context

ADR-019 puts both applications on ECS Fargate: Next.js 16 needs a server runtime, and long-running media and delivery work is the wrong shape for serverless functions. ADR-028 separates the accounts so a preview environment can never hold a credential that reaches production data.

**This task carries the sharpest regression from the original plan.** The blueprint assumed Neon's branch-per-PR, which gave every pull request an isolated database with real data in seconds. Aurora has no equivalent. The replacement — a schema per PR on a shared preview cluster — is isolated and fast but **seeded, not branched**, so preview data is only as good as the seed (TASK-010).

---

## 3. Problem Statement

Without isolated preview data, reviewers either test against shared state that others are mutating, or against production — the latter being unacceptable for a product holding family photographs.

Without separate ECS services, a bad web deploy can take the delivery engine with it. A capsule promised for a date does not care that the marketing page was broken at the time (ADR-003, ADR-028).

---

## 4. Expected Outcome

A pull request produces a reachable web preview backed by its own PostgreSQL schema. Merging to `main` deploys web and workers through **separate pipelines**. Three environments exist with distinct, least-privilege credentials, and CI authenticates to AWS by OIDC with no long-lived access keys anywhere.

---

## 5. Requirements

### Functional Requirements

- **Three AWS accounts** under an Organization: production, staging/preview, shared services (ADR-028).
- **ECS Fargate service for `apps/api`**, behind an ALB, with CloudFront in front.
- **Two ECS Fargate services for `apps/workers`** — delivery engine and media pipeline — with **different task roles** (ADR-012).
- **Aurora PostgreSQL Serverless v2**, multi-AZ, in private subnets, reachable only from the application security groups.
- **Per-PR schema** on the shared preview cluster: created on PR open, migrated, seeded, dropped on PR close.
- `.env.example` listing every variable with its purpose and where to obtain it.

### Technical Requirements

- **AWS CDK in TypeScript**, in a new `infra/` workspace, reviewed like application code.
- **GitHub Actions → AWS via OIDC role assumption.** No long-lived AWS access keys in GitHub, ever.
- **Separate workflows** for web and workers so neither can block the other.
- Secrets in **AWS Secrets Manager**, injected as ECS secret references — never plaintext in a task definition.
- ALB health check configured so a failed deploy does not replace a working task set.
- Turborepo-aware Docker builds with layer caching, so unchanged packages do not rebuild.
- Media pipeline tasks run in a **private subnet with no NAT** and a task role carrying object-storage access only (ADR-012).

---

## 6. Implementation Instructions

1. Create the `infra/` workspace (CDK app, `@mm/infra`), wired into the pnpm workspace and Turborepo per TASK-001's conventions.
2. Define the network stack: VPC, public/private subnets, security groups, and the private-subnet-no-NAT arrangement for media tasks.
3. Define the data stack: Aurora PostgreSQL Serverless v2 cluster, multi-AZ, private. Create the application database user with DML but **no DDL** (ADR-009 Control 4) and a separate migration user used only by CI.
4. Define the compute stack: ECR repositories, one ECS service for web behind an ALB + CloudFront, two ECS services for workers with distinct task roles.
5. Set up OIDC: an IAM role per account trusted by this repository, scoped to the branches that may deploy to it.
6. Write `deploy-web.yml` and `deploy-workers.yml` as **separate workflows**. Verify by deploying one while the other is deliberately broken.
7. Write `preview-env.yml`: on PR open create the schema `pr_<number>`, run migrations, run the seed, expose `DATABASE_URL` to the preview service; on PR close, drop it. Add a scheduled sweep that drops schemas older than seven days.
8. Create `.env.example`. Never commit real values.
9. Document the environment topology in the README, including how to run against a local PostgreSQL in Docker.
10. **Verify the isolation claim:** attempt to reach the production database from a preview task and record the failure in §20. Do not skip this — it is the one control this whole task exists to provide.

---

## 7. Architecture

```text
PR opened
   ├─▶ Aurora preview cluster: CREATE SCHEMA pr_<n> ──▶ migrate ──▶ seed
   └─▶ ECS preview service: deploy (DATABASE_URL → pr_<n>)

merge to main
   ├─▶ deploy-web.yml     ──▶ ECS service: web        (ALB + CloudFront)
   └─▶ deploy-workers.yml ──▶ ECS service: delivery   ← independent pipeline
                          └─▶ ECS service: media      ← no DB credentials

PR closed
   └─▶ Aurora preview cluster: DROP SCHEMA pr_<n>
```

---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
infra/package.json                    (@mm/infra — new workspace)
infra/bin/app.ts
infra/lib/network-stack.ts
infra/lib/data-stack.ts               Aurora PostgreSQL Serverless v2
infra/lib/web-stack.ts                ECS + ALB + CloudFront
infra/lib/workers-stack.ts            two ECS services, two task roles
infra/lib/ci-oidc-stack.ts
apps/site/Dockerfile
apps/workers/Dockerfile
.github/workflows/deploy-web.yml
.github/workflows/deploy-workers.yml
.github/workflows/preview-env.yml
.env.example
README.md                             (environment section)
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

- Production credentials never reach a preview environment or a developer machine.
- Workers deploy independently of web — a failed web deploy must not block or roll back the delivery engine (ADR-003, ADR-028).
- Every preview schema is seeded with synthetic data only. **Never a copy of production.**
- The media pipeline task role never carries database credentials (ADR-012).

---

## 13. Edge Cases

- **Preview schemas accumulating** on a busy week — cleanup runs on PR close *and* a scheduled sweep reaps anything older than seven days. Aurora Serverless v2 scales with load, so abandoned schemas cost money as well as clutter.
- **A migration that fails on a preview schema** must fail the preview deploy loudly, never deploy against a half-migrated database. PostgreSQL DDL is transactional (TASK-009 §14), so a failed migration rolls back whole — but the workflow still drops and recreates rather than retrying in place, because a preview schema is cheap and a half-trusted one is not.
- **ALB health check failing after deploy** — confirm ECS keeps the previous task set serving and the deployment circuit breaker rolls back.
- **Docker build missing a workspace package** — verify the build context includes `packages/*` explicitly rather than assuming.
- **Aurora Serverless v2 scale-to-minimum cold behaviour** — measure the first-query latency after idle and record it. If it lands on the `/c/[token]` path it is a product problem, not an infrastructure one.
- **OIDC trust policy too broad** — scope the role's trust to this repository *and* the specific branches or environments, not to the whole organization.

---

## 14. Error Handling

- Any environment-provisioning failure must fail the workflow with a message naming the stack and the operation, never silently produce a preview pointing at the wrong database.
- A preview deploy whose schema creation failed must not fall back to any shared database. Fail closed.

---

## 15. Security Considerations

- **Least-privilege IAM throughout.** Separate roles for CI deploy, web tasks, delivery tasks, and media tasks. The media task role has object-storage access and nothing else (ADR-012).
- **No long-lived AWS keys.** OIDC only, in every workflow.
- The application database user has DML and **no DDL** (ADR-009 Control 4). Verify by attempting a `CREATE TABLE` as that user and recording the failure.
- **Verify that a preview deployment cannot connect to the production database** — attempt it once and record the result in §20. This is an acceptance criterion, not a nice-to-have.
- Storage credentials for workers must allow writing derivatives but not deleting originals (blueprint §20.8).
- Aurora encrypted at rest with a customer-managed KMS key; automated backups copied cross-region from day one (ADR-028).

---

## 16. Testing Requirements

### Integration Tests

- Throwaway PR demonstrating: schema created, migrated, seeded, preview reachable, schema dropped on close.
- Deliberately break the web deploy and confirm the workers pipeline still deploys — the ADR-003 independence claim, actually tested.
- Attempt production access from a preview task; assert failure.
- Attempt DDL as the application database user; assert failure.

---

## 17. Acceptance Criteria

- [ ] A pull request yields a reachable preview URL backed by its own PostgreSQL schema.
- [ ] Closing the pull request drops the schema; the scheduled sweep reaps orphans.
- [ ] Merging deploys web and workers through independent pipelines, **demonstrated by breaking one**.
- [ ] A preview build provably cannot reach production data.
- [ ] The application database user provably cannot execute DDL.
- [ ] The media task role provably holds no database credential.
- [ ] No long-lived AWS access key exists in GitHub; all authentication is OIDC.
- [ ] `.env.example` lists every required variable with no real values.
- [ ] Aurora cold-start latency after idle measured and recorded in §20.

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
TASK-005
    ↓
TASK-006
```

---

## 20. Implementation Notes

- Record the measured Aurora Serverless v2 cold-start latency. If it is material, the mitigation is a minimum ACU floor above zero — cost against latency, decided with real numbers rather than assumed.
- Record the result of the production-access attempt from a preview task, and the DDL attempt as the application user. Both are security controls, and an untested control is not a control.
- Record which engine version was provisioned (ADR-005 asks for this to be verified rather than assumed).
- The `infra/` workspace is new and was not part of TASK-001's six workspaces — add it to the workspace list in the README and CONVENTIONS when it lands.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-02](../EPIC-01-01-01-02.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. **Blueprint §18.1 names Vercel, Fly.io and Neon and is superseded** — read the stack-change note and ADR-005, ADR-012, ADR-019, ADR-028 in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) instead.
7. Confirm the account topology and credential boundaries before provisioning anything.
8. **This Next.js release has breaking changes from earlier conventions — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code** (project `AGENTS.md`).

While implementing:

9. Implement **only** the scope of this task. Do not opportunistically refactor unrelated code.
10. Do not modify files owned by other tasks unless this task's §8 lists them.
11. Create or update the tests named in §16.
12. Run `pnpm lint`, `pnpm typecheck`, and the relevant test command.
13. Verify every §17 acceptance criterion explicitly, one at a time — including the four that require deliberately attempting something and observing it fail.

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
