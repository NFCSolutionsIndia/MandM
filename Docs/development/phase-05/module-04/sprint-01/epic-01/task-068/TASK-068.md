# TASK-068 — Build Who-Can-See Panel with Active Links and Access Log

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-068 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-04 — Private Sharing](../../../MOD-05-04.md) |
| Sprint | [SPR-05-04-01 — Share Links & Access Visibility](../../SPR-05-04-01.md) |
| Epic | [EPIC-05-04-01-01 — Share Links & Who-Can-See Panel](../EPIC-05-04-01-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-067` |
| Blueprint refs | `§11.3`, `§11.5`, `§24.1` |

---

## 1. Objective

Build the per-memory "who can see this" panel and the account-level active-links list, both with one-tap revocation.

---

## 2. Context

Blueprint §11.3 requires that "the owner sees a live list of every active link, its view count, and when it was last opened, and can kill any of them in one tap". Section §24.1 frames this as a competitive improvement: making privacy visible rather than merely claimed.

---

## 3. Problem Statement

Blueprint §24.1 puts it directly: "The existing site *asserts* '256-bit AES' and 'bank-level security'. The new product shows a live panel, an access log the user can read, and one-tap revocation. Demonstrated control beats claimed encryption — and it is honest, which the current copy is not quite."

---

## 4. Expected Outcome

A panel on every memory answering "who can reach this", and a settings screen listing every active link across the account, both allowing immediate revocation.

---

## 5. Requirements

### Functional Requirements

- Per-memory panel: vault members with roles, active share links with view counts, and capsule recipients with delivery state.
- One-tap revoke per link.
- Account-level active-links list in privacy settings.
- Access log showing who viewed what and when, at country granularity.
- Empty state when nothing is shared.

### Technical Requirements

- The panel reads through the sharing and capsule modules' public queries (ADR-004).
- Revocation is optimistic with rollback on failure, since the user expects it to be instant.
- The access log is sourced from the PHASE-08 `AuditLog`; until that lands, source from share view counts and capsule opens, and note the handoff.

---

## 6. Implementation Instructions

1. Build the panel as a sheet opened from the memory overflow menu, listing three groups: members, links, and capsule recipients.
2. For each link show the permission, expiry, view count, last viewed, and a revoke action.
3. For each capsule recipient show the delivery and open state, and make clear that a delivered capsule cannot be un-delivered — §11.4 states this honestly and the UI should too.
4. Implement optimistic revocation with rollback, and a confirmation for links that have been viewed (since revoking one someone is using is a more consequential act).
5. Build the account-level list in privacy settings, grouped by memory, with the same actions.
6. Render the access log at country granularity — enough to be meaningful, not enough to be creepy about a family member's location.
7. Write the empty state warmly: nothing shared is the default and should not read as a deficiency.

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
apps/api/src/features/sharing/components/WhoCanSeePanel.tsx
apps/api/src/features/sharing/components/ActiveLinksList.tsx
apps/<ios|android>/features/settings/privacy/page.tsx
apps/api/src/features/sharing/queries.ts
apps/api/src/features/sharing/__tests__/who-can-see.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Per-memory panel** — three groups, plainly labelled:

```
Who can see this

In your vault
  You (owner)

Links
  View only · no expiry · 4 views · last opened 2 days ago      [revoke]

Capsule recipients
  Ella Sharma · delivered 4 Jun 2044 · opened
    A delivered capsule cannot be taken back.
```

The honest line about delivered capsules matters: §11.4 says retracting a delivered gift "is not a coherent promise", and the UI should say so rather than implying more control than exists.

**Account-level list** in privacy settings, grouped by memory, same actions.

**Access log** — country granularity only.

**Empty state** — "Nothing is shared. Only you can see your memories."

---

## 12. Business Rules

- The panel tells the truth, including that a delivered capsule cannot be recalled (§11.4).
- Revocation is one tap, with a confirmation only for links that have been viewed.
- The access log is country-granular, not precise location.
- Nothing shared is the default state and reads as reassuring, not empty.

---

## 13. Edge Cases

- A memory with twelve active links — group and paginate rather than a wall.
- A link revoked from another device while the panel is open — revalidate and reflect it.
- A capsule recipient not yet delivered — show that content is not yet visible to them, which is a reassurance worth stating.
- A revocation that fails — roll back the optimistic state and explain.
- A member whose access came via a shared vault (Release 2) — the panel must be extensible to that source without a redesign.
- An access log with no entries — say so plainly rather than showing an empty table.
- A very long list at account level — group by memory and paginate.

---

## 14. Error Handling

- A failed revocation must be unmistakable, because the user believes access is gone. Roll back the UI and say what happened.

---

## 15. Security Considerations

- Owner-only.
- The access log must not expose a viewer's precise location or IP.

---

## 16. Testing Requirements

### Component Tests

- Panel renders all three groups with correct states.
- Delivered capsule shows the honest cannot-be-recalled line.
- Revocation is optimistic and rolls back on failure.
- Viewed links require confirmation to revoke.
- Empty state reads as reassuring.

### E2E Tests

- Share a memory, view it in another context, open the panel, see the view count, revoke, and confirm the link stops working.

### Accessibility Tests

- axe; revoke actions have accessible names naming what they revoke.

---

## 17. Acceptance Criteria

- [ ] Per-memory panel and account-level list both implemented, all five states, both themes.
- [ ] One-tap revocation with optimistic update and rollback.
- [ ] Delivered-capsule honesty line present.
- [ ] Access log at country granularity.
- [ ] Extensible to shared-vault membership without redesign.
- [ ] Empty state reassuring.
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
TASK-067
    ↓
TASK-068
```


---

## 20. Implementation Notes

- This panel is the product's privacy claim made concrete. The honest line about delivered capsules is more valuable than a comfortable one.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-04-01-01](../EPIC-05-04-01-01.md).
3. Read the parent Sprint — [SPR-05-04-01](../../SPR-05-04-01.md).
4. Read the parent Module — [MOD-05-04](../../../MOD-05-04.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§11.3`, `§11.5`, `§24.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
