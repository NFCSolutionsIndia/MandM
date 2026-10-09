# TASK-091 — Build Delivery Health Dashboard, Job Queue and System Health

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-091 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-04 — Trust & Safety and the Operator Console](../../../MOD-08-04.md) |
| Sprint | [SPR-08-04-02 — Operator Console — Delivery Health, Jobs & Break-Glass](../../SPR-08-04-02.md) |
| Epic | [EPIC-08-04-02-01 — Admin Realm, Delivery Health & Break-Glass Access](../EPIC-08-04-02-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-090`, `TASK-064` |
| Blueprint refs | `§31.2`, `§16.1`, `ADR-020` |

---

## 1. Objective

Build the delivery health dashboard, the job queue view, and the system health strip — and wire the delivery watchdog alert to a paging channel.

---

## 2. Context

Blueprint §31.2 lists the content, and §16.1 calls delivery health "the most important internal screen in the company", requiring "alerting if any capsule passes its `unlock_at` without a successful attempt".

---

## 3. Problem Statement

PHASE-05 built the watchdog. This task makes it visible and makes it page a human. A watchdog whose alert goes to an unwatched inbox is not a watchdog — ADR-020 says the alert must route to a paging channel and must never be routine.

---

## 4. Expected Outcome

A dashboard that answers "are deliveries working?" in one glance, a job queue view for diagnosing stalls, and a wired paging alert.

---

## 5. Requirements

### Functional Requirements

- Delivery health: capsules due today and this week, failed deliveries needing intervention, per-channel success rate, retry backlog, oldest pending capsule, and **at-risk items past unlock without a successful attempt**.
- Job queue: state and kind breakdown, stuck jobs (locked and expired), attempt distribution, manual re-run.
- System health strip: scheduler lag, transcode backlog, storage totals and cost, error rate, p95 latency.
- Live ops feed: recent signups, failed deliveries (clickable to retry), and integrity-sweep findings.
- The watchdog alert wired to a paging channel.

### Technical Requirements

- Queries must be efficient enough to run frequently without loading the primary database; consider a read replica or cached aggregates and document the choice.
- Manual re-run is audited and idempotent — re-running a delivery must not double-send.
- The at-risk query is the same one the watchdog uses, so the screen and the alert can never disagree.

---

## 6. Implementation Instructions

1. Build the dashboard with the §31.2 KPI cards and charts. Put the at-risk count first and make it visually loud when non-zero — that number is the product's health.
2. **Use the same query as the watchdog for the at-risk count**, so the screen and the alert cannot diverge.
3. Build the job queue view with stuck-job detection (locked past expiry) and a manual re-run that is audited and idempotent.
4. Build the system health strip from worker metrics and storage totals, including the storage-cost-per-paying-user ratio §31.11 asks for.
5. Build the live ops feed with failed deliveries clickable to retry.
6. Wire the PHASE-05 watchdog alert to a paging channel and **test it by injecting a missed unlock in staging**. Record the routing in the runbook.
7. Surface the integrity-sweep findings from PHASE-05 here.

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
apps/admin/src/app/page.tsx
apps/admin/src/app/delivery/page.tsx
apps/admin/src/app/jobs/page.tsx
apps/api/src/features/admin/delivery/queries.ts
apps/api/src/features/admin/components/HealthStrip.tsx
apps/workers/src/lib/alerting.ts  (wire paging)
apps/api/src/features/admin/__tests__/delivery-health.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §31.2. **At-risk count first**, large, and red when non-zero:

```
  0  capsules past unlock without a successful attempt      ← must always be 0
 12  due today          98.7%  delivery success (24h)
  3  failed, needs action    2  retry backlog
      oldest pending: 6,502 days out
```

Channel breakdown donut, scheduler lag, transcode backlog, storage cost per paying user.

Live ops feed with failed deliveries clickable to retry.

---

## 12. Business Rules

- **The at-risk count uses the same query as the watchdog.**
- Manual re-run is idempotent and audited.
- The paging alert is tested by injection, not assumed.
- Admin queries must not degrade the primary database.

---

## 13. Edge Cases

- A non-zero at-risk count — the screen must make it impossible to miss, and the alert must already have fired.
- A manual re-run on an already-delivered capsule — must be a no-op, not a second delivery.
- A stuck job whose lock expired — reclaimable; the view should offer that action.
- A very large job table — the queue view must paginate and use indexes.
- The dashboard queried frequently by several operators — cache aggregates or use a replica; document which.
- A paging channel outage — decide on a secondary route and record it in the runbook.
- Storage cost data unavailable — show the metric as unknown rather than zero, because zero reads as good news.

---

## 14. Error Handling

- A failed dashboard query degrades that card only; the at-risk count must be the most robust query on the page.

---

## 15. Security Considerations

- Operator role required; support cannot reach delivery internals containing recipient addresses.
- Every manual re-run audited.

---

## 16. Testing Requirements

### Integration Tests

- **Injected missed unlock appears in the at-risk count and fires the paging alert.**
- At-risk count matches the watchdog query exactly.
- Manual re-run on a delivered capsule is a no-op.
- Stuck job detection identifies an expired lock.
- Support role cannot access delivery internals.

---

## 17. Acceptance Criteria

- [ ] Dashboard implemented per §31.2 with the at-risk count first and prominent.
- [ ] **At-risk query shared with the watchdog.**
- [ ] Job queue with stuck detection and idempotent audited re-run.
- [ ] System health including storage cost per paying user.
- [ ] **Paging alert wired and tested by injection in staging.**
- [ ] Admin queries do not degrade the primary database; the approach is documented.

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
TASK-090
    ↓
TASK-064
    ↓
TASK-091
```


---

## 20. Implementation Notes

- Test the paging alert by actually causing it in staging. An untested alert is an assumption, and this is the one alert the company cannot afford to have wrong.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-04-02-01](../EPIC-08-04-02-01.md).
3. Read the parent Sprint — [SPR-08-04-02](../../SPR-08-04-02.md).
4. Read the parent Module — [MOD-08-04](../../../MOD-08-04.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§31.2`, `§16.1`, `ADR-020` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
