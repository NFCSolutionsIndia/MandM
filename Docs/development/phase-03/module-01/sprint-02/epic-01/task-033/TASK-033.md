# TASK-033 — Implement Contact Picker Import with Feature Detection

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-033 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-01 — Members & Relationships](../../../MOD-03-01.md) |
| Sprint | [SPR-03-01-02 — Member Import Paths & Deduplication](../../SPR-03-01-02.md) |
| Epic | [EPIC-03-01-02-01 — Import Paths](../EPIC-03-01-02-01.md) |
| Type | frontend |
| Priority | medium |
| Status | pending |
| Dependencies | `TASK-030` |
| Blueprint refs | `§29.11`, `§29.0` |

---

## 1. Objective

Add the Contact Picker path where the API exists, behind a permission primer, and hide the option entirely where it does not.

---

## 2. Context

Blueprint §29.11 requires a permission primer stating "We only read names, numbers & birthdays. Nothing is uploaded until you choose who to add", and requires the option to be offered **only when `navigator.contacts` exists** — never a button that will fail.

---

## 3. Problem Statement

A button that does nothing on iPhone is worse than no button. Feature detection is trivial and the failure mode of skipping it is a support ticket from every iOS user.

---

## 4. Expected Outcome

On Chromium/Android, a multi-select contact import with detected birthdays behind a primer. Everywhere else, the option is absent and the file and invite paths take its place.

---

## 5. Requirements

### Functional Requirements

- Render the option only when `navigator.contacts` and `ContactsManager` are present.
- Permission primer before invoking the picker.
- Request only name, tel, email, and — where supported — birthday.
- Multi-select with a review step before import.
- Duplicate check against existing members before import.

### Technical Requirements

- Feature-detect both `navigator.contacts` and the specific properties supported via `getProperties()`, since support varies.
- The API returns arrays per property; normalise to the member shape.
- The picker cannot be invoked without a user gesture — the primer's confirm button is that gesture.

---

## 6. Implementation Instructions

1. Add a capability check module so this and other platform-conditional features share one place for detection.
2. Build the primer using the PHASE-01 permission-primer component, with the §29.11 copy verbatim.
3. Invoke `navigator.contacts.select(props, { multiple: true })` from the primer's confirm action.
4. Query `getProperties()` first and request only supported properties — asking for `birthday` where unsupported throws.
5. Normalise the returned arrays, run duplicate detection, present a review list, and import on confirmation.
6. Where the API is absent, the Add Member sheet shows three options rather than four, with no explanation needed — the absence should be invisible, not apologetic.

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
apps/api/src/lib/capabilities.ts
apps/api/src/features/member/components/ContactPickerOption.tsx
apps/api/src/features/member/import/normalise-contacts.ts
apps/api/src/features/member/__tests__/contact-picker.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Option appears in the Add Member sheet as "Import from contacts" **only when supported**.

Primer, verbatim from §29.11: "We only read names, numbers & birthdays. Nothing is uploaded until you choose who to add." Confirm and "Not now", with "Not now" carrying no penalty.

After picking: a review list with checkboxes, detected birthdays shown, duplicates flagged.

---

## 12. Business Rules

- Never render the option where the API is absent.
- The primer precedes the OS prompt, always.
- "Not now" must not disable the option permanently or nag.

---

## 13. Edge Cases

- API present but `birthday` unsupported — request only supported properties.
- User cancels the picker — a normal outcome, no error.
- A contact with several phone numbers — apply the same selection rule as the file import, for consistency.
- A contact with no name — skip with a reported reason.
- Desktop Chrome, where the API exists but returns nothing useful — verify behaviour and hide the option if it is not genuinely usable.
- Permission permanently denied at OS level — detect where possible and fall back gracefully.

---

## 14. Error Handling

- A thrown API call must fall back to the other import paths with a brief explanation, never a dead end.

---

## 15. Security Considerations

- Contact data is normalised and reviewed client-side; nothing is sent until the user confirms.

---

## 16. Testing Requirements

### Component Tests

- Option hidden when `navigator.contacts` is absent.
- Primer precedes invocation.
- Unsupported properties are not requested.
- Cancellation produces no error state.

### E2E Tests

- Chromium with a mocked contacts API: pick three, review, import.

---

## 17. Acceptance Criteria

- [ ] Option present only where supported, verified on iOS Safari by its absence.
- [ ] Primer copy verbatim from §29.11.
- [ ] Only supported properties requested.
- [ ] Cancellation handled as normal.
- [ ] Duplicates flagged before import.

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
TASK-033
```


---

## 20. Implementation Notes

- `lib/capabilities.ts` created here will be reused by PHASE-06 for install and share-target detection and PHASE-07 for push.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-01-02-01](../EPIC-03-01-02-01.md).
3. Read the parent Sprint — [SPR-03-01-02](../../SPR-03-01-02.md).
4. Read the parent Module — [MOD-03-01](../../../MOD-03-01.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.11`, `§29.0` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
