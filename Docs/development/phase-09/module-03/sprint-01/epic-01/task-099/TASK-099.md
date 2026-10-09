# TASK-099 — Inject Delivery Failure Modes and Verify Detection

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-099 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-03 — Resilience & Operational Readiness](../../../MOD-09-03.md) |
| Sprint | [SPR-09-03-01 — Load Testing, Restore Drill & Delivery Failure Injection](../../SPR-09-03-01.md) |
| Epic | [EPIC-09-03-01-01 — Restore Drill, Load Testing & Delivery Failure Injection](../EPIC-09-03-01-01.md) |
| Type | testing |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-064`, `TASK-091` |
| Blueprint refs | `§18.4`, `§12.6`, `gap R-1`, `ADR-020` |

---

## 1. Objective

Inject every delivery failure mode the design claims to handle, in staging, and verify the watchdog, the integrity sweep, and the alerting all catch it.

---

## 2. Context

Gap R-1 is the critical risk: "the delivery guarantee is not actually durable — a bug loses a scheduled job and a capsule silently never arrives." The mitigation listed is exactly this task: "Tested with injected failures in PHASE-09."

---

## 3. Problem Statement

Every safety mechanism in the delivery design is an assumption until it has caught a real failure. The watchdog, the integrity sweep, the retry ladder, the lock expiry, and the paging alert have all been unit-tested; this task exercises them together against deliberately broken state, which is the only way to know the system as a whole responds.

---

## 4. Expected Outcome

A documented injection exercise covering six failure modes, with evidence that each was detected and, where designed, recovered — plus fixes for anything that was not.

---

## 5. Requirements

### Functional Requirements

- Inject: a deleted job row for a sealed capsule; a worker crashed mid-delivery; a corrupted media checksum; a total provider outage; a capsule past unlock with no attempt; a stale recipient contact.
- Verify detection by the watchdog, the integrity sweep, or the retry ladder as designed.
- Verify the paging alert fires for the missed unlock.
- Verify recovery where the design claims it: lock expiry reclaims the crashed job; the retry ladder recovers from provider outage.
- Record results and remediate anything undetected.

### Technical Requirements

- Injection performed in staging with the real watchdog and sweep schedules running, not with mocked components.
- Each injection is isolated so attribution is unambiguous.
- The paging alert routes to a test channel for the exercise, and the routing is then restored and re-verified.

---

## 6. Implementation Instructions

1. Prepare staging with a set of sealed capsules at varying horizons.
2. **Delete a job row** for a sealed capsule and confirm the monthly integrity sweep reports it as an orphan. This is the failure gap R-1 names specifically.
3. **Kill a worker mid-delivery** and confirm the lock expires and the job is reclaimed without a duplicate send — verify against the attempt log.
4. **Corrupt a media checksum** and confirm the integrity sweep detects and alerts.
5. **Simulate a total email provider outage** (both Resend and SES) and confirm the retry ladder backs off over days and eventually escalates to notifying the sender.
6. **Force a capsule past its unlock with no attempt** and confirm the watchdog fires and pages within the alerting window.
7. **Make a recipient contact stale** and confirm the sweep flags it and the capsule detail screen shows the freshness prompt.
8. For each, record what happened, how quickly, and whether the response matched the design. Remediate any undetected case and re-run.
9. Restore the alert routing and verify it once more, because a test channel left in place would be the worst possible outcome of this exercise.

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
scripts/inject-delivery-failures.ts
docs/DELIVERY_FAILURE_INJECTION.md
docs/RUNBOOK_DELIVERY_FAILURE.md
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

- Injection runs against the real watchdog and sweep, not mocks.
- Each failure mode is injected in isolation.
- **The alert routing is restored and re-verified after the exercise.**
- Any undetected failure mode is remediated and re-tested before the phase closes.

---

## 13. Edge Cases

- **A deleted job row for a capsule due in twenty years — the sweep is the only thing that will ever catch it.** This is the single most important injection.
- A worker killed exactly between the attempt insert and the provider call — the attempt log should show an attempt with no outcome; verify the retry handles it without double-sending.
- A provider outage lasting longer than the retry window — escalation to the sender must happen rather than silent failure.
- A checksum corruption on a capsule that is not yet due — detected by the sweep well before delivery, which is the point.
- Several failures at once — the alerting must not collapse into a single unclear signal.
- The watchdog firing for a capsule that was legitimately cancelled — must not fire; verify the negative case too.
- An injection that reveals an undetected mode — that is a finding, and the phase cannot close until it is handled.

---

## 14. Error Handling

- An undetected failure mode is a blocking finding. The delivery guarantee cannot be claimed if a mode it covers is not actually detected.

---

## 15. Security Considerations

- Injection is performed in staging only, with clearly synthetic data.

---

## 16. Testing Requirements

### Integration Tests

- **Deleted job row detected as an orphan by the integrity sweep.**
- **Crashed worker's job reclaimed after lock expiry with no duplicate send.**
- Corrupted checksum detected and alerted.
- Total provider outage backs off and escalates to the sender.
- **Missed unlock fires the paging alert within the window.**
- Stale contact flagged and surfaced on capsule detail.
- A cancelled past-unlock capsule does not fire the watchdog.

---

## 17. Acceptance Criteria

- [ ] All six failure modes injected in staging against the real watchdog and sweep.
- [ ] Each detected as designed, with evidence recorded.
- [ ] Recovery verified where the design claims it.
- [ ] The negative case (cancelled capsule) verified not to fire.
- [ ] Any undetected mode remediated and re-tested.
- [ ] **Alert routing restored and re-verified.**
- [ ] `docs/DELIVERY_FAILURE_INJECTION.md` and `docs/RUNBOOK_DELIVERY_FAILURE.md` written.

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
TASK-064
    ↓
TASK-091
    ↓
TASK-099
```


---

## 20. Implementation Notes

- The deleted-job-row injection is the one that matters most. It is the exact failure gap R-1 describes, and the integrity sweep is the only mechanism that would ever catch it for a long-horizon capsule.
- Restoring the alert routing is easy to forget and would quietly disable the most important alert in the company.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-03-01-01](../EPIC-09-03-01-01.md).
3. Read the parent Sprint — [SPR-09-03-01](../../SPR-09-03-01.md).
4. Read the parent Module — [MOD-09-03](../../../MOD-09-03.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§18.4`, `§12.6`, `gap R-1`, `ADR-020` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
