# TASK-031 — Build Member List and Detail Screens

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-031 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-01 — Members & Relationships](../../../MOD-03-01.md) |
| Sprint | [SPR-03-01-01 — Member Model & CRUD](../../SPR-03-01-01.md) |
| Epic | [EPIC-03-01-01-01 — Member Entity & Management Screens](../EPIC-03-01-01-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-030`, `TASK-014` |
| Blueprint refs | `§29.11` |

---

## 1. Objective

Build the member list with next-occasion subtext and sorting, and the member detail screen with quick actions.

---

## 2. Context

Blueprint §29.11 specifies the list (avatar, name, relationship chip, next-occasion subtext, three sort modes, search, grouped headers past twenty members) and the detail screen (hero, occasions, shared memories, quick actions).

---

## 3. Problem Statement

The next-occasion subtext is what makes this screen useful rather than a contact list. "Birthday · Mar 14 · in 22 days" is the information that prompts action, and it is the reason the Events module and this one are built in the same phase.

---

## 4. Expected Outcome

A member list that sorts by upcoming occasion by default, and a detail screen that answers "what is coming up for this person and what have I made for them".

---

## 5. Requirements

### Functional Requirements

- List: avatar, name, relationship chip, next-occasion subtext.
- Sort: upcoming occasion (default), A–Z, recently added.
- Search by name.
- Grouped headers by relationship when the list exceeds twenty.
- Undeliverable members show a persistent amber indicator with a one-tap fix.
- Detail: hero card, occasions list, shared memory timeline, quick actions (Create memory, Set a reminder), edit, delete.

### Technical Requirements

- Next-occasion computed server-side from the events module so the list is one query rather than N.
- Virtualised list above a threshold, reusing the pattern from the timeline task.
- Empty state copy verbatim from §29.11: "Add the people who matter — we will help you remember their milestones".

---

## 6. Implementation Instructions

1. Build the list screen with the three sort modes; default to upcoming occasion because that is the actionable order.
2. Compute next-occasion in the query, joining the events module through its public `queries.ts` rather than reading its tables directly (ADR-004).
3. Render the amber undeliverable indicator with a tap target that opens the edit sheet focused on the contact fields — the fix must be one tap, not a hunt.
4. Build the detail screen with the shared-memory strip left as a placeholder until the memory module lands in this same phase, then wire it.
5. Use the PHASE-01 empty, loading, and error templates with the §29.11 copy.
6. Add the delete confirmation with the §29.11 wording: "This won't delete memories you've made".

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
apps/<ios|android>/features/members/page.tsx
apps/<ios|android>/features/members/[id]/page.tsx
apps/api/src/features/member/components/MemberList.tsx
apps/api/src/features/member/components/MemberCard.tsx
apps/api/src/features/member/components/MemberDetail.tsx
apps/api/src/features/member/components/UndeliverableBadge.tsx
apps/api/src/features/member/__tests__/list.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.11. List rows: avatar, name in Inter semibold, relationship chip, and subtext "Birthday · Mar 14 · in 22 days". Undeliverable members carry an amber dot plus the words "No contact" — never colour alone (§26.8).

Detail: hero card with avatar and relationship, then occasions, then a shared-memory strip, then quick actions. Delete confirmation reassures: "This won't delete memories you've made."

Empty state uses the §29.11 copy verbatim.

---

## 12. Business Rules

- Default sort is upcoming occasion, because that is the order that prompts action.
- Undeliverable state is stated in words as well as colour.
- The delete confirmation must reassure that memories survive.

---

## 13. Edge Cases

- A member with no occasions at all — subtext shows relationship only, not an empty separator.
- A member whose next occasion is today — "Birthday · today" rather than "in 0 days".
- A very long name or custom relationship — truncate with the full value available to assistive technology.
- A 29 February birthday in a non-leap year — must show a sensible next occurrence rather than failing.
- A list of 500 members — virtualise; verify scroll performance.
- A deceased member — shown distinctly and gently, and not offered as a capsule recipient.

---

## 14. Error Handling

- A failed next-occasion computation must degrade to showing the member without subtext, never blank the row.

---

## 15. Security Considerations

- Avatar URLs are signed and short-lived from PHASE-04; fall back to initials on expiry rather than a broken image.

---

## 16. Testing Requirements

### Component Tests

- Three sort modes order correctly.
- Undeliverable badge renders with text, not colour alone.
- Today's occasion renders as "today".
- 29 February birthday resolves in a non-leap year.

### E2E Tests

- Add a member, see it in the list, open detail, edit contact details, watch the undeliverable badge clear.

### Accessibility Tests

- axe on both screens; truncated names expose full value.

---

## 17. Acceptance Criteria

- [ ] Both screens implemented per §29.11 with all five states in both themes.
- [ ] Default sort is upcoming occasion.
- [ ] Undeliverable indicator has a one-tap fix.
- [ ] Empty state copy verbatim from the blueprint.
- [ ] 29 February and today-occasion cases handled.
- [ ] axe clean.

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
TASK-030
    ↓
TASK-014
    ↓
TASK-031
```


---

## 20. Implementation Notes

- The shared-memory strip depends on the memory module in this same phase; sequence the wiring after TASK-038.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-01-01-01](../EPIC-03-01-01-01.md).
3. Read the parent Sprint — [SPR-03-01-01](../../SPR-03-01-01.md).
4. Read the parent Module — [MOD-03-01](../../../MOD-03-01.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.11` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
