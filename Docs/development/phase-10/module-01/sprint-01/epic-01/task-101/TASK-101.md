# TASK-101 — Publish Pricing Page, Legal Pages and Complete the Appendix B Claim Audit

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-101 |
| Phase | [PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout](../../../../PHASE-10.md) |
| Module | [MOD-10-01 — Marketing Site & Honest Claims](../../../MOD-10-01.md) |
| Sprint | [SPR-10-01-01 — Marketing Site, Pricing, Legal & Claim Correction](../../SPR-10-01-01.md) |
| Epic | [EPIC-10-01-01-01 — Marketing Site & Claim Correction](../EPIC-10-01-01-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-100`, `TASK-085` |
| Blueprint refs | `Appendix B`, `§17.2`, `§11.6`, `§30.3` |

---

## 1. Objective

Publish one coherent pricing page matching §17.2, publish the legal pages including the CSAM disclosure, and complete a line-by-line audit of every Appendix B claim.

---

## 2. Context

Blueprint Appendix B lists ten inherited claims that "cannot ship as-is", including "unlimited storage", "military-grade security" implying end-to-end encryption, fabricated testimonials and statistics, download buttons for apps that do not exist, and two contradictory pricing tables.

---

## 3. Problem Statement

This is the task that protects the product's central asset. §37 states it directly: "This product sells trust as its primary feature. Every shortcut taken against that is a shortcut taken against the only thing that makes it defensible." A user who checks one claim and finds it false has learned something about every other claim.

---

## 4. Expected Outcome

One pricing page matching the decided model exactly, legal pages including the required disclosures, and a committed audit record resolving all ten Appendix B rows.

---

## 5. Requirements

### Functional Requirements

- One pricing page: Free and Premium per §17.2, with Family marked as coming, region-aware currency, and the free-tier sentence from §17.2.
- Legal pages: Terms, Privacy Policy, Refund Policy, DPA.
- The privacy policy includes the CSAM hash-matching disclosure from PHASE-08.
- The Terms include the two written policies: memories are never deleted for non-payment, and a sealed capsule is never cancelled for non-payment.
- An audit document resolving every Appendix B row.
- The published delivery guarantee linked from the privacy page.

### Technical Requirements

- Pricing values come from the shared plan constants, so the page cannot drift from the enforced entitlements.
- Legal pages are content-managed so they can be updated without a deploy, with a "last updated" stamp.
- The audit is a committed checklist, so a future copy change can be checked against it.

---

## 6. Implementation Instructions

1. **Build the pricing page from the shared plan constants**, not from hand-written copy. If the page and the entitlements can disagree, they eventually will.
2. Use the §17.2 free-tier sentence verbatim: "Free forever: unlimited memories, 10 GB of space, and up to 3 memories scheduled a year ahead."
3. Mark Family as coming rather than listing it as available.
4. Write the legal pages. Include the CSAM disclosure drafted in PHASE-08, worded accurately about what hash-matching is and is not.
5. **Write the two never-for-non-payment policies into the Terms.** §17.2 item 4 requires them to be "written into the Terms, not left as implementation behaviour".
6. Write the encryption language honestly: server-side AES-256, explicitly **not** end-to-end. §20.7 requires this and Appendix B flags the current wording as overstating.
7. Work through Appendix B row by row. For each: state what the existing claim was, what the product actually does, and what the site now says. Commit it as `docs/CLAIM_AUDIT.md`.
8. Remove the iOS and Android download buttons unless store shells exist; replace with the install CTA.
9. Remove all fabricated statistics and testimonials. Use real numbers or none, and real testimonials or none.
10. Publish `docs/DELIVERY-GUARANTEE.md` at a public URL and link it from the privacy page.

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
apps/site/src/app/pricing/page.tsx
apps/site/src/app/terms/page.tsx
apps/site/src/app/privacy-policy/page.tsx
apps/site/src/app/refund-policy/page.tsx
apps/site/src/app/delivery-guarantee/page.tsx
docs/CLAIM_AUDIT.md
apps/site/src/app/__tests__/pricing-consistency.test.ts
```

---

## 9. Data Model

No schema changes. One consistency requirement:

**The pricing page renders from `packages/shared/src/constants/plans.ts`** — the same constants the entitlement gates read. A test asserts the page reflects the constants, so marketing and enforcement cannot diverge.

**Appendix B rows to resolve, each recorded in `docs/CLAIM_AUDIT.md`:**

| Inherited claim | Resolution |
|---|---|
| "Unlimited Storage — stored forever" | Replaced with the §17.2 tiers |
| "Military-grade security... strictly yours" | Honest: AES-256 in transit and at rest, explicitly **not** end-to-end |
| "99.9% Delivery SLA" | Replaced by the published delivery guarantee with real measured rates |
| "12,450 Memories Saved" / "12,450 reviews" | Removed; real numbers or none |
| Three named testimonials | Removed until real ones exist |
| "Download for iOS / Android" | Replaced with "Install the app" |
| "Facial Recognition" | Removed; not built, and legally gated |
| "Assign heirs to inherit your vault" | Labelled as roadmap, clearly |
| "5 memory uploads per month" vs "5GB" | One pricing page per §17.2 |
| "Bank-level encryption" | Specific, verifiable language |

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Every claim on the site must correspond to shipped functionality.**
- Pricing renders from the shared constants.
- Encryption language is honest about not being end-to-end (§20.7).
- The two never-for-non-payment policies are in the Terms.
- No fabricated statistics or testimonials.
- The delivery guarantee is published, including its limits.

---

## 13. Edge Cases

- A claim that is true for Premium but not Free — must be qualified, not stated generally.
- A roadmap feature a visitor might read as available — label it explicitly.
- Regional currency where the constants hold one price — the page must show the right currency per region without the entitlements differing.
- A legal page needing an urgent correction — CMS-managed so it does not need a deploy.
- The delivery guarantee stating a limit that sales would rather not mention (a forwarded capsule link works for anyone who has it) — **state it anyway**; that honesty is the point of publishing it.
- A testimonial from a real early user — usable, with permission, and clearly attributed.
- A-7 unresolved, so no wind-down policy can be published — say nothing rather than implying one exists.

---

## 14. Error Handling

- A pricing-consistency test failure blocks deploy. Marketing and enforcement disagreeing is a defect, not a copy issue.

---

## 15. Security Considerations

- The CSAM disclosure must be accurate about the mechanism; overclaiming privacy would undermine the whole page.

---

## 16. Testing Requirements

### Unit Tests

- **Pricing page values match the shared plan constants.**

### Integration Tests

- Legal pages render with a "last updated" stamp.
- The delivery guarantee is publicly reachable.

### E2E Tests

- No download-store buttons present unless store shells exist.
- No fabricated statistic strings present anywhere in the marketing bundle.

---

## 17. Acceptance Criteria

- [ ] One pricing page rendering from the shared constants, with the consistency test passing.
- [ ] Free-tier sentence verbatim from §17.2.
- [ ] Legal pages published, including the CSAM disclosure and both never-for-non-payment policies.
- [ ] Encryption language honest about not being end-to-end.
- [ ] **`docs/CLAIM_AUDIT.md` committed with all ten Appendix B rows resolved.**
- [ ] No fabricated statistics or testimonials anywhere.
- [ ] Delivery guarantee published and linked, including its limits.

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
TASK-100
    ↓
TASK-085
    ↓
TASK-101
```


---

## 20. Implementation Notes

- The claim audit is the deliverable that protects everything else. Do it line by line and commit the record so a future copy change can be checked against it.
- A-7 remains unresolved. Publish nothing about a wind-down policy rather than inventing one.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-10-01-01-01](../EPIC-10-01-01-01.md).
3. Read the parent Sprint — [SPR-10-01-01](../../SPR-10-01-01.md).
4. Read the parent Module — [MOD-10-01](../../../MOD-10-01.md).
5. Read the parent Phase — [PHASE-10](../../../../PHASE-10.md).
6. Read the relevant blueprint sections: `Appendix B`, `§17.2`, `§11.6`, `§30.3` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
