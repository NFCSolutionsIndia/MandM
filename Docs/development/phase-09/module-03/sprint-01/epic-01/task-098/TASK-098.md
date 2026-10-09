# TASK-098 — Execute Backup Restore Drill and Load Test the Media Path

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-098 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-03 — Resilience & Operational Readiness](../../../MOD-09-03.md) |
| Sprint | [SPR-09-03-01 — Load Testing, Restore Drill & Delivery Failure Injection](../../SPR-09-03-01.md) |
| Epic | [EPIC-09-03-01-01 — Restore Drill, Load Testing & Delivery Failure Injection](../EPIC-09-03-01-01.md) |
| Type | devops |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-006`, `TASK-049` |
| Blueprint refs | `§12.6`, `§20.10`, `§21 Phase 9` |

---

## 1. Objective

Restore the database and media from actual backups into a clean environment, measure RTO and RPO, and load test the upload and signed-URL paths.

---

## 2. Context

Blueprint §12.6 requires "quarterly restore drills — a backup nobody has restored is a rumour" and §20.10 requires "documented RTO/RPO". §21 Phase 9 also requires "load testing on upload and signed-URL minting".

---

## 3. Problem Statement

Backup configuration is easy; restore is where the gaps appear — a missing credential, an untested storage sync, a database version mismatch, an assumption that someone knows the procedure. Doing it once before launch converts a hope into a documented capability. The load test matters because signed-URL minting sits on the hot path of every gallery scroll.

---

## 4. Expected Outcome

A completed restore into a clean environment with measured RTO and RPO, a load-test report for the media path, and a runbook written from the actual experience.

---

## 5. Requirements

### Functional Requirements

- Restore PostgreSQL from PITR and from a `pg_dump` logical backup, into a clean environment.
- Restore media from the cross-provider backup (B2 or equivalent).
- Verify integrity after restore: checksums match, capsule job rows intact.
- Measure and record RTO and RPO.
- Load test: concurrent uploads and signed-URL minting at a realistic multiple of expected launch traffic.
- A runbook written from the drill, not from theory.

### Technical Requirements

- The restore must use only documented procedures and credentials available to an on-call engineer — **no shortcuts, no tribal knowledge.**
- Verify the restored database against the source with row counts and checksums.
- Load test from a distributed source so edge rate limits are exercised realistically.
- Measure p95 latency on minting under load, since a slow mint stalls every gallery.

---

## 6. Implementation Instructions

1. Provision a clean environment with no access to production configuration beyond the documented restore credentials.
2. Restore PostgreSQL from PITR to a chosen point, and separately from a `pg_dump` logical backup. Record how long each took and what data was lost relative to the target point.
3. Restore media from the cross-provider backup and verify checksums against the database records — this is the step most likely to reveal a gap, because the cross-provider sync is the least-exercised path.
4. **Verify capsule integrity specifically:** every sealed capsule must still have a valid job row after restore, or the restore has silently broken the product's core promise. Run the integrity sweep against the restored environment.
5. Measure and record RTO and RPO honestly, including time spent finding credentials or reading documentation.
6. Load test the upload session and minting endpoints at a realistic multiple of launch traffic, from distributed sources, measuring p95 and error rates.
7. Write the runbook from what actually happened, including the parts that were harder than expected.

---

## 7. Architecture

```text
RESTORE DRILL (clean environment, documented procedure only)
  PostgreSQL PITR ──▶ restore ──▶ verify row counts + checksums
  pg_dump    ──▶ restore ──▶ compare
  Media (B2 cross-provider) ──▶ restore ──▶ verify checksums vs DB
  ──▶ RUN INTEGRITY SWEEP: every sealed capsule still has a valid job row
  ──▶ measure RTO / RPO honestly (including time spent reading docs)

LOAD TEST
  concurrent uploads · signed-URL minting at N× launch traffic
  measure p95, error rate, edge rate-limit behaviour
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
docs/RUNBOOK_RESTORE.md
docs/RESTORE_DRILL_RECORD.md
docs/LOAD_TEST_RESULTS.md
scripts/restore-drill.sh
scripts/load-test/
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

- **No shortcuts and no tribal knowledge** — the drill uses only documented procedures.
- Capsule job-row integrity is verified after restore.
- RTO and RPO are measured honestly, including time spent orienting.
- The runbook reflects what happened, not what was planned.

---

## 13. Edge Cases

- **A restored database whose capsule job rows are missing or stale — this would silently break the delivery guarantee.** Verify explicitly with the integrity sweep.
- A media object present in the database but missing from the backup — the sweep catches it; record how many.
- A PostgreSQL version mismatch between backup and restore target.
- A missing credential discovered mid-drill — record it as a finding and fix the documentation; this is exactly what the drill is for.
- A cross-provider sync lagging further behind than expected — measure the actual RPO for media separately from the database.
- Load test tripping edge rate limits — confirm the limits behave as designed rather than raising them to make the test pass.
- Minting p95 degrading under load — batching should mitigate; if not, that is a finding.

---

## 14. Error Handling

- Any step that cannot be completed from documentation is a finding, not a workaround.

---

## 15. Security Considerations

- The drill environment must be destroyed afterwards, and any restored production data handled per policy for the duration.

---

## 16. Testing Requirements

### Integration Tests

- Restored database row counts and checksums match the source.
- **Integrity sweep on the restored environment finds no orphaned capsule jobs.**

### Performance Tests

- Upload and minting endpoints under load: p95 and error rate recorded; edge limits behave as designed.

---

## 17. Acceptance Criteria

- [ ] Restore completed from both PITR and a logical dump into a clean environment.
- [ ] Media restored from the cross-provider backup and checksums verified.
- [ ] **Capsule job-row integrity verified after restore.**
- [ ] RTO and RPO measured and recorded honestly.
- [ ] Load-test results recorded with p95 and error rates.
- [ ] Every gap found during the drill fixed in the documentation.
- [ ] `docs/RUNBOOK_RESTORE.md` written from the actual drill.

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
TASK-006
    ↓
TASK-049
    ↓
TASK-098
```


---

## 20. Implementation Notes

- Expect the drill to find something. If it finds nothing, question whether it was a real drill.
- The capsule job-row check is the one restore verification unique to this product. A restore that loses the schedule loses the promise.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-03-01-01](../EPIC-09-03-01-01.md).
3. Read the parent Sprint — [SPR-09-03-01](../../SPR-09-03-01.md).
4. Read the parent Module — [MOD-09-03](../../../MOD-09-03.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§12.6`, `§20.10`, `§21 Phase 9` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
