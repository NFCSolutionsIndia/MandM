# TASK-061 — Build Capsule Detail Screen with Countdown and Delivery History

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-061 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-01 — Capsule Creation & Sealing](../../../MOD-05-01.md) |
| Sprint | [SPR-05-01-02 — Seal Flow & Capsule Detail Screens](../../SPR-05-01-02.md) |
| Epic | [EPIC-05-01-02-01 — Seal Flow & Capsule Detail](../EPIC-05-01-02-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-058`, `TASK-013` |
| Blueprint refs | `§29.16`, `§24.2` |

---

## 1. Objective

Build the sender-side capsule detail: live countdown, recipient list with contact freshness, delivery plan, full status history, and edit and cancel controls.

---

## 2. Context

Blueprint §29.16 specifies the screen, and §24.2 identifies the problem it solves: "the existing concept has a fatal invisible gap: a user seals a capsule and hears nothing for a decade, so they forget the product, change email, and cancel their card."

---

## 3. Problem Statement

This screen is the product's answer to twenty years of silence. It has to make an invisible promise feel present and verifiable — which means a live countdown, an honest delivery plan, and a visible nudge when the recipient's contact details have gone stale.

---

## 4. Expected Outcome

A screen that answers "is my capsule safe, when will it arrive, and is there anything I should do" without the user having to ask support.

---

## 5. Requirements

### Functional Requirements

- Live countdown from the PHASE-01 Countdown component.
- Recipient list with contact-freshness indicators.
- Delivery plan showing the channel order that will be tried.
- Full status history from `delivery_attempts`: sealed, reminder sent, delivered, opened, replied — with timestamps.
- `Add to this capsule` while editable; `Cancel` with a consequence-stating confirmation.
- "Refresh contact details" prompt when a contact is unverified for a long period.
- Reply, once received, shown inline.

### Technical Requirements

- Countdown rendered from cache immediately, then revalidated (§29.16).
- Status history derived from the attempt log, grouped per recipient.
- Cancellation uses the PHASE-01 ConfirmDialog with the recipients named in the consequence text.
- Contact-freshness threshold defined in one constant, shared with the Release-2 nudge job.

---

## 6. Implementation Instructions

1. Build the screen with the countdown at the top — it is the emotional anchor and should render before anything else, from cache.
2. Render the recipient list with the freshness indicator. Define "stale" once (recommend unverified for eighteen months on a capsule more than two years out, per §14) and share the constant.
3. Render the delivery plan honestly: the channels that will actually be tried, in order, given the current tier and contacts. If the tier changed since sealing, show what the snapshot guarantees, not what the current tier would allow — the promise was made against the snapshot.
4. Render the status history from the attempt log, grouped per recipient, with human timestamps. Include failed attempts and the fallback that followed, per §29.16 ("WhatsApp failed — sent via SMS instead ✓").
5. Implement `Add to this capsule` while within `editable_until`, and a clear read-only state afterwards explaining why.
6. Implement cancellation with a ConfirmDialog whose consequence text names the recipients and the date. This is a destructive action on a promise; §33.5 requires the consequence stated.
7. Add the refresh-contact prompt with a one-tap path to updating the recipient contact (which the API permits, unlike changing identity).
8. Show the reply inline once received, with a path to the memory it was copied into.

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
apps/<ios|android>/features/capsule/[id]/page.tsx
apps/api/src/features/capsule/components/CapsuleDetail.tsx
apps/api/src/features/capsule/components/DeliveryHistory.tsx
apps/api/src/features/capsule/components/ContactFreshness.tsx
apps/api/src/features/capsule/queries.ts
apps/api/src/features/capsule/__tests__/detail.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.16. Countdown at the top, large, tabular numerals.

```
        6,502 days
   until Ella opens this
   4 June 2044 · 9:00 am Mumbai

Recipients
  Ella Sharma      ella@example.com   ✓ verified 2 months ago
  Ravi Sharma      ravi@example.com   ⚠ not verified since 2026 — refresh?

Delivery plan
  1. In-app  →  2. Email

History
  Sealed                    26 Aug 2026, 4:12 pm
  (nothing further yet)
```

**Cancel** — ConfirmDialog: "Cancel this capsule? Ella will not receive it on 4 June 2044. The memory stays in your vault." Typed confirmation not required (it is reversible by re-sealing), but the consequence is stated.

**Read-only state** after `editable_until`, with the reason.

---

## 12. Business Rules

- The delivery plan reflects the entitlement snapshot, not the current tier — the promise was made against the snapshot.
- Cancellation states the consequence and names the recipients.
- The countdown renders from cache first.
- Failed attempts and their fallbacks are shown, not hidden.

---

## 13. Edge Cases

- A capsule delivering in under a minute — the countdown must transition to a delivering state without a negative value.
- A capsule past its unlock with no successful attempt — the screen must show something honest and alarming enough to prompt action, since this is the watchdog condition surfaced to the user.
- A cancelled capsule — read-only with the cancellation recorded in history.
- A capsule with five recipients at different delivery states — group clearly per recipient.
- A recipient whose contact was updated after sealing — history should show that, since it changes where delivery will go.
- A twenty-year countdown — format readably ("6,502 days" rather than a seconds count).
- A capsule whose owner downgraded their plan — the snapshot plan still shown, with a note that it is honoured.
- Reduced motion — the countdown updates without animation.

---

## 14. Error Handling

- A failed history query still renders the countdown and recipients; history degrades to a retry rather than blanking the screen.

---

## 15. Security Considerations

- Owner-only; a recipient must never reach this screen.

---

## 16. Testing Requirements

### Component Tests

- Countdown renders from cache then revalidates.
- Freshness indicator appears past the threshold.
- Delivery plan reflects the snapshot, not the current tier.
- History renders attempts including failures and fallbacks.
- Read-only state after `editable_until` explains itself.
- Cancel confirmation names recipients and date.
- Past-unlock-without-delivery state renders honestly.

### E2E Tests

- Seal, view detail, cancel, and confirm the read-only cancelled state with history.

### Accessibility Tests

- axe; countdown exposes a machine-readable datetime; history is a navigable list.

---

## 17. Acceptance Criteria

- [ ] Screen implemented per §29.16 with all five states in both themes.
- [ ] Countdown renders from cache first.
- [ ] Delivery plan honours the entitlement snapshot.
- [ ] History shows failures and fallbacks.
- [ ] Freshness prompt works with a one-tap contact update.
- [ ] Cancel states the consequence.
- [ ] Past-unlock-without-delivery surfaces honestly.
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
TASK-058
    ↓
TASK-013
    ↓
TASK-061
```


---

## 20. Implementation Notes

- This screen is the answer to §24.2's "design for the 20-year silence". The freshness prompt is the part that actually prevents the failure.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-01-02-01](../EPIC-05-01-02-01.md).
3. Read the parent Sprint — [SPR-05-01-02](../../SPR-05-01-02.md).
4. Read the parent Module — [MOD-05-01](../../../MOD-05-01.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§29.16`, `§24.2` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
