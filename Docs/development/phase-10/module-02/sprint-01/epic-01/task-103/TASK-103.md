# TASK-103 — Implement Feature Flags and Execute Staged Rollout

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-103 |
| Phase | [PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout](../../../../PHASE-10.md) |
| Module | [MOD-10-02 — Production Readiness & Staged Rollout](../../../MOD-10-02.md) |
| Sprint | [SPR-10-02-01 — Feature Flags, Rollout, Monitoring & Analytics](../../SPR-10-02-01.md) |
| Epic | [EPIC-10-02-01-01 — Feature Flags, Staged Rollout, Monitoring & Analytics](../EPIC-10-02-01-01.md) |
| Type | devops |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-090` |
| Blueprint refs | `ADR-025`, `§21 Phase 10` |

---

## 1. Objective

Build the database-backed feature flag system with percentage and segment targeting, and execute the four-stage rollout with documented stop conditions.

---

## 2. Context

ADR-025 chooses database-backed flags evaluated server-side, "needed for the staged rollout (PHASE-10) and for per-AI-feature kill switches at R2. No third-party flag vendor at this scale." Blueprint §21 Phase 10 specifies the stages: internal → 50 friends and family → waitlist → open.

---

## 3. Problem Statement

The staged rollout is what limits the cost of anything missed in PHASE-09. Each stage has a stop condition, and the flag is what makes stopping a single action rather than a deploy — which matters because the moment you most need to stop is the moment a deploy is riskiest.

---

## 4. Expected Outcome

A flag system with percentage rollout and kill switches, and a documented rollout executed stage by stage with stop conditions checked at each.

---

## 5. Requirements

### Functional Requirements

- `FeatureFlag` per §34.12: key, rollout percentage, segment spec, kill-switch marker.
- Server-side evaluation with a stable per-user bucketing so a user does not flip between states.
- Signup gated by a flag during early stages.
- Kill switches for the AI features (Release 2) declared now.
- A documented rollout plan with a stop condition per stage.
- An admin screen to change a flag without a deploy.

### Technical Requirements

- Bucketing by a hash of user id and flag key, so assignment is stable and independent per flag.
- Flags cached briefly server-side to avoid a query per request, with a short TTL so a kill switch takes effect quickly. **Document the maximum propagation delay** — a kill switch nobody knows the latency of is not a kill switch.
- Evaluated server-side only; a client-side flag is a hint.

---

## 6. Implementation Instructions

1. Write the `feature_flags` schema per §34.12; add the admin screen from §31.13.
2. Implement evaluation with stable bucketing and a short cache TTL. Record the propagation delay in §20 and in the runbook.
3. Gate signup behind a flag for the early stages.
4. Declare the AI kill switches now, so Release 2 inherits them rather than adding them under pressure.
5. Write the rollout plan with the four stages and a **stop condition per stage** — for example: any at-risk capsule, an error rate above a threshold, an upload failure rate above a threshold, or any privacy-related report.
6. Execute the stages. At each, hold for a defined period and check the stop conditions before proceeding.
7. Verify the one-action stop by actually flipping the flag in staging and confirming access closes within the documented propagation delay.

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
packages/db/src/schema/feature-flags.ts
packages/db/migrations/0020_feature_flags.sql
apps/api/src/lib/flags/evaluate.ts
apps/admin/src/app/settings/flags/page.tsx
docs/ROLLOUT_PLAN.md
apps/api/src/lib/flags/__tests__/bucketing.test.ts
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

- Flags are evaluated server-side.
- Bucketing is stable per user per flag.
- **The kill-switch propagation delay is documented.**
- Each rollout stage has a written stop condition, checked before proceeding.

---

## 13. Edge Cases

- A user who was in a rollout and then drops out because the percentage was lowered — decide whether existing users retain access; recommend yes, since revoking access to an archive is worse than a slower rollout. Record it.
- A flag change during an active user session — takes effect within the propagation delay; verify that a mid-session change does not break a flow midway.
- A kill switch flipped during an upload — the upload should complete; a kill switch closes new access, not existing work.
- Bucketing collisions across flags — independent per flag key; test.
- A flag row missing — default to off for a rollout flag and on for a kill switch, so the safe default differs by flag type. Document this, because it is easy to get backwards.
- A stop condition triggered at 2am — the runbook must say who acts and how, not just what to watch.

---

## 14. Error Handling

- A flag evaluation failure defaults to the safe state per flag type, never to open access.

---

## 15. Security Considerations

- Flags gate access; a client-evaluated flag would be trivially bypassable.

---

## 16. Testing Requirements

### Unit Tests

- Bucketing stable per user per flag and independent across flags.
- Missing flag defaults to the documented safe state per type.

### Integration Tests

- **Flipping a flag closes access within the documented propagation delay.**
- A kill switch does not interrupt an in-flight upload.

---

## 17. Acceptance Criteria

- [ ] Flag system implemented with percentage and segment targeting, evaluated server-side.
- [ ] Admin screen allows changes without a deploy.
- [ ] **Propagation delay documented and verified.**
- [ ] AI kill switches declared for Release 2.
- [ ] `docs/ROLLOUT_PLAN.md` written with a stop condition per stage.
- [ ] One-action stop verified in staging.
- [ ] Existing-access-retention decision recorded.

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
TASK-103
```


---

## 20. Implementation Notes

- Document the propagation delay prominently. In an incident, the difference between "off in 10 seconds" and "off in 5 minutes" changes what you do.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-10-02-01-01](../EPIC-10-02-01-01.md).
3. Read the parent Sprint — [SPR-10-02-01](../../SPR-10-02-01.md).
4. Read the parent Module — [MOD-10-02](../../../MOD-10-02.md).
5. Read the parent Phase — [PHASE-10](../../../../PHASE-10.md).
6. Read the relevant blueprint sections: `ADR-025`, `§21 Phase 10` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
