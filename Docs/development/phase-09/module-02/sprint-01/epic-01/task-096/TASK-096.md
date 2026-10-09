# TASK-096 — Build Critical-Path, Offline and Install E2E Suites

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-096 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-02 — Quality, Accessibility & Performance](../../../MOD-09-02.md) |
| Sprint | [SPR-09-02-01 — E2E Coverage, Accessibility Audit & Device Lab](../../SPR-09-02-01.md) |
| Epic | [EPIC-09-02-01-01 — End-to-End, Accessibility & Device Verification](../EPIC-09-02-01-01.md) |
| Type | testing |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-077`, `TASK-066` |
| Blueprint refs | `§21 Phase 9`, `ADR-018`, `§9.4` |

---

## 1. Objective

Build the Playwright suites covering the full critical path plus the offline and first-launch flows that an app cannot be shipped without testing.

---

## 2. Context

Blueprint §18.1 specifies "Playwright (E2E, **including offline and install flows**)". The critical path is the product's promise end to end: signup → capture → seal → deliver → open → reply.

---

## 3. Problem Statement

This suite is what allows the team to change anything with confidence. It also covers the two flows most likely to break silently: offline sync, where a failure looks like nothing happening, and install, where a manifest change can break the installed experience without touching any page.

---

## 4. Expected Outcome

Three suites — critical path, offline, and install — running in CI, with the passkey and capsule-delivery paths automated rather than manual.

---

## 5. Requirements

### Functional Requirements

- Critical path: signup with OTP, passkey creation, member add, event create, memory capture and create, capsule seal, accelerated delivery, recipient open, reply, sender notification.
- Offline: airplane-mode capture and create, reload, reconnect, unattended sync, seal blocked offline.
- Install: manifest validity, install criteria, standalone launch, share-target ingest, update prompt deferral during an upload.
- Negative paths: expired token, revoked share, pre-delivery access attempt.

### Technical Requirements

- Virtual authenticator for WebAuthn so passkey flows are automated.
- Delivery accelerated by seeding an `unlock_at` in the near past and running the worker, rather than waiting.
- Offline simulated via Playwright's context offline mode, plus at least one real-device manual run recorded.
- Deterministic seed data so assertions are stable.

---

## 6. Implementation Instructions

1. Build the critical-path spec as one continuous journey rather than isolated steps, because the integration points are where failures live.
2. Use the virtual authenticator for passkey registration and login.
3. Accelerate delivery by seeding a capsule with a past `unlock_at` and invoking the worker directly, then assert the email was sent (via a test mail sink) and the unlock page renders.
4. **Include the JavaScript-disabled assertion for `/c/[token]`** — this is the property most likely to regress silently, since a well-meaning refactor could introduce a client component.
5. Build the offline suite: capture and create offline, reload, reconnect, and assert the memory exists server-side with no user action. Assert the seal action is blocked offline.
6. Build the install suite: manifest validity, install criteria, standalone launch reaching `/app`, share-target ingest, and **update-prompt deferral during an active upload**.
7. Add the negative paths for token states.
8. Wire all three suites into CI, and record the runtime so the suite does not silently grow past the ten-minute budget.

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
apps/site/e2e/critical-path.spec.ts
apps/site/e2e/offline.spec.ts
apps/site/e2e/install.spec.ts
apps/site/e2e/tokens.spec.ts
apps/site/e2e/fixtures/  (seeded accounts, mail sink)
.github/workflows/e2e.yml
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

- The critical path is one continuous journey, not isolated steps.
- **The JavaScript-disabled assertion for `/c/[token]` is mandatory** and must never be removed.
- Delivery is accelerated by seeding, never by waiting.
- Seed data is deterministic.

---

## 13. Edge Cases

- A flaky step — fix or delete within a working day, per the PHASE-01 policy. A retried-into-green E2E suite protects nothing.
- The mail sink not receiving in time — poll with a timeout rather than a fixed sleep.
- Offline simulation differing from real device behaviour — run at least one real-device pass manually and record it.
- Install criteria differing between Chrome versions — pin the browser version in CI.
- The update-prompt deferral test needing a genuinely in-flight upload — throttle the network to keep one in flight rather than mocking a flag.
- Virtual authenticator not covering cross-device passkeys — verify that case manually.

---

## 14. Error Handling

- A failing E2E suite blocks merge. A quarantined test must have an owner and a deadline.

---

## 15. Security Considerations

- The token negative paths are part of this suite as well as the security suite; duplication here is acceptable because they protect different regressions.

---

## 16. Testing Requirements

### E2E Tests

- **Full critical path: signup → capture → seal → deliver → open → reply → sender notified.**
- **`/c/[token]` renders and functions with JavaScript disabled.**
- Offline capture and create, reconnect, unattended sync.
- Seal blocked offline with the draft preserved.
- Install criteria, standalone launch, share-target ingest.
- **Update prompt deferred during an in-flight upload.**
- Expired, revoked, and pre-delivery token states.

---

## 17. Acceptance Criteria

- [ ] All three suites green in CI.
- [ ] Critical path covers the full journey including the reply and sender notification.
- [ ] JavaScript-disabled assertion present and passing.
- [ ] Offline round trip and seal block both covered.
- [ ] Install and update-deferral covered.
- [ ] Suite runtime recorded and within the CI budget.
- [ ] One real-device offline pass recorded in §20.

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
TASK-077
    ↓
TASK-066
    ↓
TASK-096
```


---

## 20. Implementation Notes

- The JavaScript-disabled test is the cheapest possible protection for the product's most unusual architectural commitment. Guard it.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-02-01-01](../EPIC-09-02-01-01.md).
3. Read the parent Sprint — [SPR-09-02-01](../../SPR-09-02-01.md).
4. Read the parent Module — [MOD-09-02](../../../MOD-09-02.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§21 Phase 9`, `ADR-018`, `§9.4` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
