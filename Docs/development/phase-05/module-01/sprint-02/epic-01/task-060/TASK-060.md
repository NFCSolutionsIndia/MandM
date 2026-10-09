# TASK-060 — Build Seal Flow Screen with Plain-Language Summary Block

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-060 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-01 — Capsule Creation & Sealing](../../../MOD-05-01.md) |
| Sprint | [SPR-05-01-02 — Seal Flow & Capsule Detail Screens](../../SPR-05-01-02.md) |
| Epic | [EPIC-05-01-02-01 — Seal Flow & Capsule Detail](../EPIC-05-01-02-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-058`, `TASK-012` |
| Blueprint refs | `§29.15`, `§33.16` |

---

## 1. Objective

Build the seal screen: recipient picker, unlock condition, channel preview, the plain-language summary, and the ceremonial confirmation.

---

## 2. Context

Blueprint §29.15 specifies every element, and singles out the summary block: *"On 4 June 2039, Ella will receive this by email and text. You can edit or cancel it any time before then."* It also states that the no-usable-channel hard block is "the one place friction is correct".

---

## 3. Problem Statement

This screen asks the user to make a commitment they cannot verify for years. Its job is to make the commitment completely legible before it is made — who, what, when, how, and what can still be changed. Every ambiguity here becomes a support question or a broken expectation later.

---

## 4. Expected Outcome

A seal screen that makes the promise explicit in one readable sentence, blocks only where blocking is correct, and confirms with a real success state rather than a toast.

---

## 5. Requirements

### Functional Requirements

- Memory preview.
- Recipient picker: saved members, or ad-hoc email/phone, multiple recipients.
- Unlock condition: exact date and time, or a member age milestone.
- Channel preview showing the ordered channels that will be tried, with unavailable ones greyed and the reason stated.
- **Summary block** in plain language stating who, what, when, and how, plus what can still be changed.
- Edit and revocation policy stated before confirmation.
- Primary action `Seal this capsule` with a 1.2s ceremonial animation and a real success screen.
- Gate failures render specific copy: pending limit, horizon limit, unverified email, no usable channel.

### Technical Requirements

- Both timezones displayed when they differ (§33.6).
- Milestone selection resolves and **shows the resolved date** before sealing, so the user sees the actual day.
- Channel availability derives from the recipient's verified contacts and the tier, per the gap-analysis resolution.
- Ceremonial animation respects reduced motion.
- Offline: sealing is blocked with the honest explanation from §9.4; the draft persists.

---

## 6. Implementation Instructions

1. Build the screen as a multi-step sheet reusing the PHASE-01 Sheet, so it can open over the memory detail without losing context.
2. Build the recipient picker over the member module, showing the undeliverable badge inline and offering a one-tap fix.
3. Build the unlock selector with date and milestone modes. **In milestone mode, show the resolved absolute date immediately** — "Ella turns 18 on 4 June 2044" — because a user committing to a milestone deserves to see the day.
4. Build the channel preview with drag-to-reorder per §29.15, rendering only channels the tier and contacts permit and stating why others are unavailable.
5. Build the summary block. This is the screen's centrepiece: one or two sentences, in the user's own terms, naming the recipient, the date in their timezone and the recipient's, the channels, and the fact that it can be cancelled until then.
6. Map each gate error to specific copy with the remedy: upgrade for horizon and pending limits, verify for email, add contact for channel.
7. Implement the ceremonial seal animation with a reduced-motion variant, then a real success screen with `View scheduled` and `Create another`.
8. Block sealing offline with the §9.4 explanation, saving the draft.

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
apps/<ios|android>/features/capsule/new/page.tsx
apps/api/src/features/capsule/components/SealFlow.tsx
apps/api/src/features/capsule/components/RecipientPicker.tsx
apps/api/src/features/capsule/components/UnlockSelector.tsx
apps/api/src/features/capsule/components/ChannelPreview.tsx
apps/api/src/features/capsule/components/SummaryBlock.tsx
apps/api/src/features/capsule/components/SealCeremony.tsx
apps/api/src/features/capsule/__tests__/seal-flow.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.15. Multi-step sheet: recipients → when → review.

**Summary block** — the centrepiece, in plain language:

```
On 4 June 2044, Ella will receive this by email.
That is 4 June 2044 at 9:00 am in Mumbai — 6,502 days from today.
You can edit or cancel this any time before then.
```

**Channel preview** — drag to reorder, with reasons for anything unavailable:

```
1. In-app        ✓
2. Email         ✓  ella@example.com
   SMS           —  Premium plan
   WhatsApp      —  Premium plan
```

**Gate copy** — specific, with the remedy:
- horizon: "This one needs to wait until 2044. Free plans schedule up to a year ahead — Premium removes the limit."
- pending: "You have 3 memories already waiting."
- channel: "Ella has no email or phone yet — add one so we can deliver this." with a fix link.

**Success** — a real screen, not a toast: "Sealed. 6,502 days to go."

---

## 12. Business Rules

- The summary block appears before confirmation, always.
- Both timezones shown when they differ.
- Milestone mode shows the resolved absolute date.
- No usable channel is a hard block with a fix link — the one correct place for friction (§29.15).
- Confirmation is a real success state, not a toast (§29.15).
- Sealing offline is blocked with an honest explanation, never silently queued.

---

## 13. Edge Cases

- Several recipients in different timezones — the summary must handle it without becoming unreadable; state the recipient-local time per recipient or state the sender time plus a note.
- A milestone already passed — reject with the resolved date named.
- A recipient added and then made undeliverable mid-flow — re-validate before sealing.
- Horizon limit hit by one day — the copy should name the actual limit rather than being vague.
- A free user at the pending limit — offer both upgrade and "cancel an existing one" as paths.
- Reduced motion — the ceremony becomes a clear state change, not a jarring instant one.
- A very distant date (fifty years) — the day count is large; format it readably.
- Sealing interrupted by a step-up re-auth requirement — the pending seal must resume or abort cleanly, never half-commit.

---

## 14. Error Handling

- Every gate failure keeps the entered state and offers the remedy in place. Losing a composed capsule to a validation error is unacceptable.

---

## 15. Security Considerations

- Server-side validation is authoritative; the client copy of the gates is convenience only.

---

## 16. Testing Requirements

### Component Tests

- Summary block renders accurate recipient, date, both timezones, and channels.
- Milestone mode shows the resolved date.
- Unavailable channels show the reason.
- Each gate failure renders its specific copy with the remedy.
- Reduced motion replaces the ceremony.
- Offline blocks sealing and preserves the draft.

### E2E Tests

- Seal a capsule to a member for two minutes ahead and confirm the success screen and the countdown on Home.

### Accessibility Tests

- axe on every step; focus moves through the sheet correctly; the summary is a readable region, not a decorative block.

---

## 17. Acceptance Criteria

- [ ] Screen implemented per §29.15 with all five states in both themes.
- [ ] Summary block accurate, including both timezones.
- [ ] Milestone resolved date displayed before sealing.
- [ ] All four gate errors render specific, actionable copy.
- [ ] No-usable-channel hard block with a working fix link.
- [ ] Real success screen; ceremony has a reduced-motion variant.
- [ ] Offline blocked with the §9.4 copy and the draft preserved.
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
TASK-012
    ↓
TASK-060
```


---

## 20. Implementation Notes

- Spend the time on the summary block. It is the sentence the user will remember when they wonder, years later, whether they set it up correctly.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-01-02-01](../EPIC-05-01-02-01.md).
3. Read the parent Sprint — [SPR-05-01-02](../../SPR-05-01-02.md).
4. Read the parent Module — [MOD-05-01](../../../MOD-05-01.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§29.15`, `§33.16` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
