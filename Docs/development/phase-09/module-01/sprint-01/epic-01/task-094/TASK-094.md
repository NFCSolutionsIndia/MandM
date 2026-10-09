# TASK-094 — Build Cross-Tenant IDOR Suite and Commission External Penetration Test

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-094 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-01 — Security Assurance](../../../MOD-09-01.md) |
| Sprint | [SPR-09-01-01 — Authorization Assurance & Platform Security](../../SPR-09-01-01.md) |
| Epic | [EPIC-09-01-01-01 — Authorization & Tenant-Isolation Assurance](../EPIC-09-01-01-01.md) |
| Type | testing |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-093` |
| Blueprint refs | `§20.2`, `§21 Phase 9`, `gap R-2` |

---

## 1. Objective

Build an endpoint-enumerating negative-path suite attempting every cross-tenant access, and commission an external penetration test focused on IDOR and token handling.

---

## 2. Context

Blueprint §21 Phase 9 requires "an **external penetration test focused on IDOR and token handling**". §20.2 requires uuids everywhere plus a mandatory ownership check, because "unguessable is not a permission".

---

## 3. Problem Statement

Internal tests verify what was designed. A pen test finds what was not considered. Given that this product has six tokenised public routes, an unauthenticated upload path for capsule replies, and admin break-glass, the surface genuinely warrants an outside adversarial look.

---

## 4. Expected Outcome

A permanent negative-path suite enumerating endpoints, plus a pen-test report with findings triaged and high and critical items remediated.

---

## 5. Requirements

### Functional Requirements

- A suite enumerating every API route and server action, attempting access to user B's resources as user A.
- Token-handling tests: reused, expired, revoked, rotated, and forged tokens across all six tokenised routes.
- The pre-delivery capsule invisibility test, run against every endpoint.
- External pen test scoped to IDOR, token handling, the admin realm, and the unauthenticated reply upload path.
- Findings triaged with high and critical remediated or formally accepted.

### Technical Requirements

- The suite enumerates routes from the filesystem so a new endpoint without a negative test is visible.
- Token tests cover every tokenised route: `/c`, `/s`, `/m`, `/j`, `/g`, `/n` — including the ones whose features arrive in later releases, as placeholders.
- The pen test runs against staging with production-equivalent configuration, and the report is retained.

---

## 6. Implementation Instructions

1. Build the negative-path suite. Enumerate route handlers and server actions, and for each, attempt access to another user's resource. **Fail the suite when a new endpoint has no corresponding negative test**, so coverage grows with the codebase.
2. Write token-handling tests for every tokenised route: valid, reused, expired, revoked, version-rotated, and structurally-forged tokens.
3. Re-run the pre-delivery invisibility test against every endpoint that could return media, including the batch minting endpoint.
4. Test the unauthenticated reply upload path specifically: it is the only place a stranger can write media, and it deserves adversarial attention.
5. Commission the pen test **early in the phase**, scoped to IDOR, token handling, the admin realm, and the reply upload path. Provide the tester with documentation rather than making them guess.
6. Triage findings by severity, remediate high and critical, and formally accept anything lower with a recorded rationale.
7. Add a regression test for every finding, so a remediated issue cannot silently return.

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
apps/site/src/__tests__/security/idor.test.ts
apps/site/src/__tests__/security/tokens.test.ts
apps/site/src/__tests__/security/endpoint-coverage.test.ts
docs/SECURITY_REVIEW.md
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

- A new endpoint without a negative test fails the coverage check.
- Every pen-test finding gets a regression test, whether or not it is remediated immediately.
- High and critical findings are remediated or formally accepted with a recorded rationale before launch.

---

## 13. Edge Cases

- An endpoint that legitimately accepts unauthenticated access (tokenised routes) — the negative test asserts token requirements rather than session requirements.
- A forged token with a valid structure — must fail on hash comparison; test it.
- A token from one route used on another (a share token on `/c/`) — must fail; cross-route token confusion is a classic bug.
- A pen-test finding in a Release-2 placeholder route — remediate or remove the placeholder.
- A finding the team disagrees with — record the disagreement and the reasoning rather than silently closing it.
- A finding in a third-party dependency — patch or document the compensating control.

---

## 14. Error Handling

- An unremediated high or critical finding blocks launch unless formally accepted with a documented rationale and a compensating control.

---

## 15. Security Considerations

- This task is the adversarial half of the security work. Its value depends on the tester being genuinely independent and adequately scoped.

---

## 16. Testing Requirements

### Security Tests

- **Cross-tenant access denied on every enumerated endpoint.**
- **Cross-route token confusion rejected.**
- Reused, expired, revoked, rotated, and forged tokens all rejected.
- Pre-delivery capsule media unreachable through every endpoint.
- Unauthenticated reply upload path resists abuse (size, rate, type).
- A new endpoint without a negative test fails coverage.

---

## 17. Acceptance Criteria

- [ ] Negative-path suite covers every endpoint, with a coverage gate.
- [ ] Token tests cover all six tokenised routes and all six token states.
- [ ] Cross-route token confusion rejected.
- [ ] Pen test completed early in the phase, scoped as specified.
- [ ] All high and critical findings remediated or formally accepted with rationale.
- [ ] A regression test exists for every finding.
- [ ] `docs/SECURITY_REVIEW.md` written and signed off.

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
TASK-093
    ↓
TASK-094
```


---

## 20. Implementation Notes

- Book the pen test during PHASE-08. Commissioning it in week three of this phase leaves no time to fix what it finds.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-01-01-01](../EPIC-09-01-01-01.md).
3. Read the parent Sprint — [SPR-09-01-01](../../SPR-09-01-01.md).
4. Read the parent Module — [MOD-09-01](../../../MOD-09-01.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§20.2`, `§21 Phase 9`, `gap R-2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
