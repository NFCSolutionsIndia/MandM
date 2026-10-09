# TASK-104 — Set Up Status Page, On-Call Rota and Launch Analytics Funnels

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-104 |
| Phase | [PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout](../../../../PHASE-10.md) |
| Module | [MOD-10-02 — Production Readiness & Staged Rollout](../../../MOD-10-02.md) |
| Sprint | [SPR-10-02-01 — Feature Flags, Rollout, Monitoring & Analytics](../../SPR-10-02-01.md) |
| Epic | [EPIC-10-02-01-01 — Feature Flags, Staged Rollout, Monitoring & Analytics](../EPIC-10-02-01-01.md) |
| Type | devops |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-103`, `TASK-099` |
| Blueprint refs | `§31.11`, `ADR-020`, `ADR-021`, `§17.2` |

---

## 1. Objective

Publish a status page, establish the on-call rota with the delivery alert routed to it, and instrument the activation and retention funnels plus the two cost ratios.

---

## 2. Context

ADR-020 requires the delivery-SLA monitor and calls its alert "the most important one in the company". §31.11 and §17.2 specify the metrics: the activation funnel, retention cohorts, delivery success by channel, and **storage cost per paying user plus conversion on the capsule-horizon paywall specifically**.

---

## 3. Problem Statement

PHASE-08 wired the alert and PHASE-09 tested it. This task puts a human on the other end. Without a rota, the alert is a notification into a void — and the failure it detects is the one the product cannot survive silently.

---

## 4. Expected Outcome

A public status page, a staffed rota with the delivery alert routed and verified, and funnels that answer whether the product works from the first user onward.

---

## 5. Requirements

### Functional Requirements

- Public status page fed by real health checks: app, delivery scheduler, media pipeline, storage.
- On-call rota with escalation, and the delivery watchdog alert routed to it.
- Activation funnel: signup → onboarding complete → first memory → **first capsule sealed**.
- Retention cohorts; delivery success by channel; **open rate on delivered capsules**.
- Install rate; offline usage share; upload failure rate.
- **Storage cost per paying user** and **capsule-horizon paywall conversion**, instrumented separately.
- A documented event taxonomy with no PII.

### Technical Requirements

- Status checks are synthetic and independent of the app's own reporting, so an outage cannot make the status page claim health.
- Analytics is first-party PostHog with no PII and **never media content** (ADR-021).
- The horizon paywall funnel is a distinct event so it can be measured alone, as §17.2 requires.
- The rota is verified by firing a test alert and confirming a human acknowledges it.

---

## 6. Implementation Instructions

1. Set up the status page with synthetic checks from outside the infrastructure — a status page fed by the app it monitors is worthless during an outage.
2. Include a delivery-scheduler health indicator, since that is the component whose failure matters most and is least visible to users.
3. Establish the on-call rota with escalation, and **route the delivery watchdog alert to it**. Then fire a test alert and confirm a human acknowledges it within the target — an untested rota is an assumption.
4. Instrument the activation funnel with `first capsule sealed` as the terminal step, because that is the moment the product's value is realised.
5. Instrument retention cohorts, delivery success by channel, and **open rate on delivered capsules** — §31.11 lists it, and it is the closest thing to a measure of whether the product achieves its purpose.
6. Instrument install rate, offline usage share, and upload failure rate.
7. **Instrument the two ratios §17.2 demands: storage cost per paying user, and conversion on the capsule-horizon paywall as its own funnel step.**
8. Write the event taxonomy document, and add a test asserting no event payload contains an email address, a note, or a media reference.

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
infra/status-page/checks.md
docs/ON_CALL.md
apps/api/src/lib/analytics/events.ts
docs/EVENT_TAXONOMY.md
apps/api/src/lib/analytics/__tests__/no-pii.test.ts
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

- Status checks are external and independent of the app.
- **The delivery alert is routed to a human and the routing is tested.**
- No PII and no media content in any analytics event (ADR-021).
- The horizon paywall funnel is instrumented separately (§17.2).

---

## 13. Edge Cases

- The status page hosted on the same infrastructure as the app — must not be; a shared outage would take both down.
- A delivery alert firing outside working hours — the rota must cover it, and the runbook must say what to do without deep context.
- An alert acknowledged but not acted on — escalation after a timeout.
- An analytics event accidentally including an email in a property — the no-PII test catches it; run it in CI.
- A funnel step that cannot be measured because the event was never added — audit the funnel end to end against real usage before launch.
- Storage cost data lagging by a billing period — report it with the lag stated rather than as current.
- A test alert left in the rota's history causing confusion — label it clearly.

---

## 14. Error Handling

- A monitoring gap is a launch blocker for the delivery path specifically. Other gaps can be accepted with a recorded rationale.

---

## 15. Security Considerations

- Analytics carries no PII or content; the no-PII test is a privacy control in the blocking gate.

---

## 16. Testing Requirements

### Integration Tests

- Status checks report accurately when a component is deliberately degraded.
- Funnel events fire in the correct order for a real signup-to-seal journey.

### Security Tests

- **No analytics event payload contains an email address, note text, or media reference.**

---

## 17. Acceptance Criteria

- [ ] Status page live with external checks, including delivery-scheduler health.
- [ ] **On-call rota published and the delivery alert routed and verified by a test alert a human acknowledged.**
- [ ] Activation funnel terminating at first capsule sealed.
- [ ] Retention, channel success, and capsule open rate instrumented.
- [ ] **Storage cost per paying user and horizon paywall conversion both instrumented separately.**
- [ ] Event taxonomy documented; no-PII test in the blocking gate.
- [ ] Funnel verified end to end against a real journey before launch.

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
TASK-103
    ↓
TASK-099
    ↓
TASK-104
```


---

## 20. Implementation Notes

- Fire a real test alert and make sure a real person acknowledges it. This is the last verification that the product's central promise is monitored by a human rather than by a configuration file.
- The two ratios from §17.2 are the numbers that will decide whether the pricing model survives. Instrument them before there is data to lose.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-10-02-01-01](../EPIC-10-02-01-01.md).
3. Read the parent Sprint — [SPR-10-02-01](../../SPR-10-02-01.md).
4. Read the parent Module — [MOD-10-02](../../../MOD-10-02.md).
5. Read the parent Phase — [PHASE-10](../../../../PHASE-10.md).
6. Read the relevant blueprint sections: `§31.11`, `ADR-020`, `ADR-021`, `§17.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
