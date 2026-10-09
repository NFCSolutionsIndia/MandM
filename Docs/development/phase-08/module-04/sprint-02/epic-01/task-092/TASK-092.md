# TASK-092 — Build User Lookup with Break-Glass Content Access

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-092 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-04 — Trust & Safety and the Operator Console](../../../MOD-08-04.md) |
| Sprint | [SPR-08-04-02 — Operator Console — Delivery Health, Jobs & Break-Glass](../../SPR-08-04-02.md) |
| Epic | [EPIC-08-04-02-01 — Admin Realm, Delivery Health & Break-Glass Access](../EPIC-08-04-02-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-090` |
| Blueprint refs | `§16.3`, `§31.3`, `gap G-8` |

---

## 1. Objective

Build support user lookup showing account state without content, and the break-glass workflow requiring a reason, a second approver, an audit entry, and a notification to the user.

---

## 2. Context

Blueprint §31.3 states the rule: "support roles see **no memory content**. Viewing content requires break-glass — a reason string, a second approver, an audit entry, **and a notification to the user**." Gap G-8 records that the blueprint requires a second approver but specifies no mechanism, and assigns that design to this task.

---

## 3. Problem Statement

This is the screen where an operational need and a privacy promise meet. Support genuinely needs to help users; users genuinely need to know their family photographs are not casually browsable. The break-glass design is what allows both: capability exists, but every use is deliberate, approved, recorded, and disclosed.

---

## 4. Expected Outcome

A lookup screen useful for support without exposing content, and a break-glass workflow that makes content access possible but never casual or invisible.

---

## 5. Requirements

### Functional Requirements

- Lookup by email or id showing plan, storage, counts, verification state, devices, and recent errors — **no content**.
- Tabs for subscription and payments, members and nominees, devices and sessions with revoke, and activity log.
- Actions: activate/deactivate with a required reason, password-reset email, GDPR export and delete.
- Break-glass: request with a reason, a second approver, a time-boxed grant, an audit entry, and a notification to the user.
- Read-only, time-boxed impersonation view, heavily audited.

### Technical Requirements

- The lookup query must be structurally unable to return content — it selects counts and metadata, never note text or media keys.
- Break-glass grants a time-boxed capability recorded in `break_glass_access`, checked by `lib/authz` as an admin grant path.
- The second approver must be a different admin with an approving role; self-approval is impossible.
- The user notification is sent on grant, not on use, so they know before or as it happens.

---

## 6. Implementation Instructions

1. Build the lookup screen. **Write the query to select only counts and metadata** — a test should assert that no content field can appear in the response.
2. Build the tabs, including device and session management with revoke (reusing PHASE-02 functionality).
3. Implement activate and deactivate with a mandatory reason, audited.
4. Design and implement break-glass per gap G-8: an admin requests access with a reason; a **different** admin with an approving role grants it; the grant is time-boxed (recommend 60 minutes); an audit entry is written; and the user is notified immediately.
5. Make break-glass a recognised grant path in `lib/authz` rather than a bypass, so the audit write and the matrix still apply.
6. Implement the read-only impersonation view, time-boxed and audited, with a persistent banner making the state unmistakable to the operator.
7. Write the tests: no content without break-glass; self-approval impossible; user notified on grant.

---

## 7. Architecture

```text
support lookup ──▶ counts, plan, devices, errors   ← NO content, structurally

break-glass
  admin A requests + reason
        ▼
  admin B (different, approving role) grants      ← self-approval impossible
        ▼
  time-boxed capability (60 min) in break_glass_access
  audit entry written (synchronously)
  USER NOTIFIED immediately
        ▼
  lib/authz recognises the grant → content readable, every read audited
        ▼
  expiry → capability gone
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/admin/src/app/users/page.tsx
apps/admin/src/app/users/[id]/page.tsx
apps/api/src/features/admin/users/queries.ts
apps/api/src/features/admin/break-glass.ts
apps/api/src/lib/authz/resolve-grant.ts  (admin grant path)
packages/emails/src/templates/BreakGlassNotice.tsx
apps/api/src/features/admin/__tests__/break-glass.test.ts
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

- **Support lookup cannot return content, structurally.**
- Break-glass requires a different admin to approve; self-approval is impossible.
- The user is notified on grant, not after use.
- Break-glass is time-boxed and expires automatically.
- Break-glass is a recognised grant path in `lib/authz`, not a bypass.

---

## 13. Edge Cases

- **A support agent attempting to view content without break-glass — refused.** The defining test.
- An admin approving their own request — impossible.
- A break-glass grant expiring mid-session — access ends; the operator must request again.
- A user notified about break-glass who objects — there must be a documented path for them to raise it; note it in the runbook.
- A break-glass request for a deleted account — allowed for compliance purposes, but the notification cannot be delivered; record the handling.
- Two admins requesting break-glass on the same user simultaneously — each is a separate grant with separate audit entries and separate notifications.
- An impersonation view attempting a write — must be impossible; read-only means read-only.
- A break-glass grant used to view content that is itself in the moderation queue — both audit paths fire; that is correct.

---

## 14. Error Handling

- A break-glass grant that cannot write its audit entry must not take effect. Unaudited access is the failure mode this whole design exists to prevent.

---

## 15. Security Considerations

- Structural absence of content in the support query, not a filtered-out field.
- Second approver enforced server-side.
- Time-boxed grants with automatic expiry.
- Every read under break-glass audited individually, not just the grant.
- Impersonation strictly read-only.

---

## 16. Testing Requirements

### Integration Tests

- **Support role cannot retrieve any content field, asserted against the response shape.**
- Break-glass request cannot be self-approved.
- Grant is time-boxed and expires.
- User notified on grant.
- Every read under break-glass writes an audit entry.
- Audit-write failure prevents the grant taking effect.
- Impersonation cannot write.

---

## 17. Acceptance Criteria

- [ ] Lookup shows account state with no content, proven by response-shape assertion.
- [ ] **Break-glass requires a second approver, is time-boxed, audited, and notifies the user** — each proven by test.
- [ ] Break-glass implemented as an `authz` grant path, not a bypass.
- [ ] Impersonation read-only and audited.
- [ ] Audit-write failure blocks the grant.
- [ ] Objection path for notified users documented in the runbook.

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
TASK-092
```


---

## 20. Implementation Notes

- Notifying the user on grant rather than after use is the choice that makes this trustworthy. It also means the notification copy needs care — it will alarm people, and it should be honest without being frightening.
- Gap G-8 is resolved by this task. Record the approval mechanism in the gap analysis.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-04-02-01](../EPIC-08-04-02-01.md).
3. Read the parent Sprint — [SPR-08-04-02](../../SPR-08-04-02.md).
4. Read the parent Module — [MOD-08-04](../../../MOD-08-04.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§16.3`, `§31.3`, `gap G-8` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
