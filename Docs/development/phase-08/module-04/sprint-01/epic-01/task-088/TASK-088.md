# TASK-088 — Implement Report, Block and CSAM Hash-Matching on Upload

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-088 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-04 — Trust & Safety and the Operator Console](../../../MOD-08-04.md) |
| Sprint | [SPR-08-04-01 — Report, Block & Moderation Queue](../../SPR-08-04-01.md) |
| Epic | [EPIC-08-04-01-01 — Report, Block, CSAM Matching & Moderation Queue](../EPIC-08-04-01-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-081`, `TASK-049` |
| Blueprint refs | `§11.6`, `§16.2`, `§20.4`, `§27.4` |

---

## 1. Objective

Build report and block, and add CSAM hash-matching to the upload pipeline as the single documented exception to the no-scanning commitment.

---

## 2. Context

Blueprint §11.6 commits to no proactive scanning of private content, with one exception: "CSAM hash-matching (PhotoDNA-class) on upload, as legally required — this is a specific, documented exception to the no-scanning commitment and must be disclosed in the privacy policy."

---

## 3. Problem Statement

Both halves matter. The report path is what gives users recourse and the company a lawful takedown process. The hash-matching exception is legally required, and the honesty requirement around it is what keeps the broader privacy commitment credible — a privacy promise with an undisclosed exception is not a privacy promise.

---

## 4. Expected Outcome

A report flow, a block list, and hash-matching in the upload pipeline with a documented escalation path — plus the privacy-policy disclosure.

---

## 5. Requirements

### Functional Requirements

- Report any shared resource with a reason and optional detail.
- Block a user or a member: no further shares or capsules from them.
- CSAM hash-matching on every upload, before the asset becomes available.
- A match creates a high-severity flag and follows a documented legal escalation.
- The privacy policy discloses the matching.

### Technical Requirements

- Hash matching runs in the media pipeline. It must run **before** the asset is viewable, which means the ready state depends on it.
- A match must not be silently ignorable: it creates a flag with the highest severity and follows a specified procedure.
- Report submission is rate-limited to prevent weaponising the queue.
- Blocks are bidirectional in effect for sharing: a blocked person cannot share to the blocker either.

---

## 6. Implementation Instructions

1. Write the schema for `reports`, `moderation_flags`, and `blocks` per §34.11; generate and read the migration; add tenant isolation.
2. Build the report flow: reachable from a shared memory or a received capsule, with a reason picker and optional detail. Confirm submission clearly — a report with no acknowledgement feels ignored.
3. Build blocking: from a member or from a received capsule. A block prevents future shares and capsules in both directions.
4. Integrate the hash-matching provider into the media pipeline, running before the asset is marked ready.
5. **Write the escalation procedure as a document**, not just code: who is notified, in what timeframe, what is preserved, and what is reported to which authority. This is a legal process with a technical trigger, and the procedure must exist before the trigger does.
6. Add the privacy-policy disclosure text and make sure PHASE-10 includes it.
7. Rate-limit report submission.
8. Write the test asserting an unmatched upload proceeds normally and a matched one does not become viewable.

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
packages/db/src/schema/moderation.ts
packages/db/migrations/0018_moderation.sql
apps/api/src/features/moderation/actions.ts
apps/api/src/features/moderation/components/ReportSheet.tsx
apps/workers/src/handlers/hash-match.ts
docs/CSAM_ESCALATION.md
apps/api/src/features/moderation/__tests__/report.test.ts
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

- **CSAM hash-matching is the only proactive scanning of private content** (§11.6), and it is disclosed.
- A match blocks the asset from becoming viewable.
- A match follows the documented escalation; it cannot be dismissed by a single operator.
- Blocks prevent sharing in both directions.
- Report submission is rate-limited.

---

## 13. Edge Cases

- A false positive — the escalation procedure must include a review path, because the consequence of a wrong match is severe for the user.
- The matching provider being unavailable — decide: block the upload, or allow with a deferred check? **Recommend deferring the ready state rather than allowing content through**, and document it.
- A report on content the reporter cannot actually see (a stale link) — accept the report but note the access state.
- A user reporting the same item repeatedly — deduplicate into one flag with a count.
- A block on a capsule sender whose capsule is already sealed to the blocker — decide whether delivery proceeds; recommend blocking delivery and notifying the sender neutrally, and record it.
- A report used to harass (mass reporting) — rate limits plus a reporter-reputation note for the queue.
- A blocked member who is also a vault co-owner (Release 2) — note the interaction for that phase.

---

## 14. Error Handling

- A matching failure must not silently allow the asset through; the asset stays not-ready and an alert fires.

---

## 15. Security Considerations

- The escalation procedure is a legal control; it must be documented and reviewed before the code ships.
- Matched content must be preserved per legal requirement, not deleted, and access to it must be tightly controlled and audited.
- Hash values are not reversible, so this is not content inspection in the ordinary sense — say so accurately in the disclosure rather than overclaiming privacy.

---

## 16. Testing Requirements

### Integration Tests

- Unmatched upload becomes viewable normally.
- **Matched upload does not become viewable and creates a high-severity flag.**
- Provider unavailable defers the ready state rather than allowing content through.
- Duplicate reports deduplicate into one flag with a count.
- Block prevents sharing in both directions.
- Report submission is rate-limited.

---

## 17. Acceptance Criteria

- [ ] Report and block implemented scoped through `lib/authz`.
- [ ] Hash matching runs before an asset is viewable.
- [ ] **`docs/CSAM_ESCALATION.md` written and reviewed before the code ships.**
- [ ] Privacy-policy disclosure text drafted and handed to PHASE-10.
- [ ] Provider-unavailable behaviour documented and implemented.
- [ ] Blocks bidirectional; reports rate-limited and deduplicated.

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
TASK-081
    ↓
TASK-049
    ↓
TASK-088
```


---

## 20. Implementation Notes

- Write the escalation document first. This is a legal process with a technical trigger, and the trigger without the process is worse than useless.
- The disclosure wording must be accurate about what hash-matching is and is not. Overclaiming privacy here would undermine everything else the privacy page says.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-04-01-01](../EPIC-08-04-01-01.md).
3. Read the parent Sprint — [SPR-08-04-01](../../SPR-08-04-01.md).
4. Read the parent Module — [MOD-08-04](../../../MOD-08-04.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§11.6`, `§16.2`, `§20.4`, `§27.4` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
