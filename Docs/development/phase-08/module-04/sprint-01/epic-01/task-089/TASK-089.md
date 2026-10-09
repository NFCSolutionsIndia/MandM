# TASK-089 — Build Moderation Queue with SLA Timers and Appeals

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-089 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-04 — Trust & Safety and the Operator Console](../../../MOD-08-04.md) |
| Sprint | [SPR-08-04-01 — Report, Block & Moderation Queue](../../SPR-08-04-01.md) |
| Epic | [EPIC-08-04-01-01 — Report, Block, CSAM Matching & Moderation Queue](../EPIC-08-04-01-01.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-088` |
| Blueprint refs | `§31.4`, `§16.2` |

---

## 1. Objective

Build the moderation queue with media preview, auto-flag reasons, SLA timers, actions, an appeals tab, and a policy reference panel — with the private-content boundary enforced architecturally.

---

## 2. Context

Blueprint §31.4 specifies the queue and states the boundary: "only *shared, reported, or auto-flagged* content enters this queue. **Private vault content is never proactively browsed** beyond legally required CSAM hash-matching on upload — and that boundary is enforced architecturally, not by policy alone."

---

## 3. Problem Statement

A moderation queue is a window into user content, and the temptation to make it a general browsing tool is real. Enforcing the boundary in the query layer — so private unreported content is simply not reachable — is what makes the privacy commitment structural rather than a matter of operator discipline.

---

## 4. Expected Outcome

A queue that lets operators act quickly and consistently on reported and flagged content, and cannot reach anything else.

---

## 5. Requirements

### Functional Requirements

- Queue of flagged items with auto-flag reason, media preview, reporter info, and an SLA timer.
- Actions: approve, remove, warn, escalate.
- Appeals tab for removed content.
- Policy quick-reference side panel.
- Every action audited and the affected user notified with a reason.

### Technical Requirements

- **The queue query can only return items with a report or a flag.** There is no code path from the queue to arbitrary private content.
- SLA timer computed from flag creation, with severity-based targets.
- Actions write audit entries and dispatch a notification to the affected user.
- Media preview uses the same signed-URL path with an admin grant, so access is logged like any other.

---

## 6. Implementation Instructions

1. Build the queue screen in the admin route group, listing flags ordered by severity then SLA urgency.
2. **Write the query so it joins from `moderation_flags` or `reports`** — never from memories or media directly. Add a test asserting that an unreported private memory cannot appear in the queue.
3. Render media preview through the signed-URL endpoint with an admin grant, so the access is audited exactly like a user's (the PHASE-08 audit write covers it).
4. Implement the four actions, each writing an audit entry and dispatching a notification with a reason to the affected user.
5. Build the appeals tab: a removal can be appealed, and an appeal is reviewed by a **different** operator than the one who removed it.
6. Build the policy quick-reference panel so decisions are consistent; inconsistent moderation is worse than slow moderation.
7. Add SLA targets by severity and surface breaches prominently.

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
apps/admin/src/app/moderation/page.tsx
apps/api/src/features/admin/moderation/queries.ts
apps/api/src/features/admin/moderation/actions.ts
apps/api/src/features/admin/moderation/components/QueueItem.tsx
apps/api/src/features/admin/moderation/components/PolicyPanel.tsx
apps/api/src/features/admin/moderation/__tests__/boundary.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §31.4. Queue rows: media thumbnail, flag reason and severity, reporter (or "auto"), SLA countdown, and four actions.

Policy panel pinned to the side so the operator does not have to remember the rules.

Appeals tab shows removed items with the original decision and the appealing user's statement.

SLA breach is visually prominent — a queue with silent breaches is not a queue with an SLA.

---

## 12. Business Rules

- **Only reported or flagged content is reachable from the queue** — enforced in the query, not by convention.
- Every action is audited and the affected user is notified with a reason.
- An appeal is reviewed by a different operator.
- Admin media access is logged like any other access.

---

## 13. Edge Cases

- **An unreported private memory must not be reachable from the queue** — the defining test.
- A flag whose content was deleted by the owner before review — resolve as moot, recording that.
- An item with several reports — one queue entry with a count, not several.
- An SLA breach — surfaced prominently and reported as a metric.
- An appeal by a user whose account is suspended — must still be possible; suspension cannot remove the right to appeal.
- An operator acting on their own reported content — prevent it; a self-review is not a review.
- A CSAM flag — must not be actionable by a single operator; it follows the escalation document.

---

## 14. Error Handling

- A failed action must not leave the item in an ambiguous state; either the action applied and was audited, or neither.

---

## 15. Security Considerations

- The boundary is the security control here.
- Admin media access flows through the audited signed-URL path.
- Self-review prevented; appeals reviewed by a different operator.

---

## 16. Testing Requirements

### Integration Tests

- **An unreported private memory cannot appear in the queue.**
- Reported content appears with the correct reason and SLA.
- Each action writes an audit entry and notifies the user.
- Appeal is routed to a different operator.
- Self-review is prevented.
- Deleted content resolves as moot.
- Multiple reports collapse into one entry with a count.

---

## 17. Acceptance Criteria

- [ ] Queue implemented per §31.4 with SLA timers and four actions.
- [ ] **Boundary enforced in the query and proven by test.**
- [ ] Every action audited with a user notification.
- [ ] Appeals tab with different-operator review.
- [ ] Policy panel present.
- [ ] SLA breaches surfaced and measured.
- [ ] CSAM flags follow the escalation document rather than a single-operator action.

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
TASK-088
    ↓
TASK-089
```


---

## 20. Implementation Notes

- The boundary test is the one that matters. Write it first, and make it obvious enough that nobody widens the query later without noticing.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-04-01-01](../EPIC-08-04-01-01.md).
3. Read the parent Sprint — [SPR-08-04-01](../../SPR-08-04-01.md).
4. Read the parent Module — [MOD-08-04](../../../MOD-08-04.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§31.4`, `§16.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
