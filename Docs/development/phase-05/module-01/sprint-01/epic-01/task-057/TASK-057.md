# TASK-057 — Create Capsule Schema with Recipients, Attempts and Replies

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-057 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-01 — Capsule Creation & Sealing](../../../MOD-05-01.md) |
| Sprint | [SPR-05-01-01 — Capsule Model, Seal Transaction & Authorization](../../SPR-05-01-01.md) |
| Epic | [EPIC-05-01-01-01 — Capsule Model & Transactional Seal](../EPIC-05-01-01-01.md) |
| Type | database |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-048`, `TASK-030` |
| Blueprint refs | `§10 Capsule`, `§34.6`, `§11.4` |

---

## 1. Objective

Create `capsules`, `capsule_recipients`, `delivery_attempts`, and `capsule_replies` per blueprint §10 and §34.6, scoped through `lib/authz` and the scheduler index.

---

## 2. Context

Blueprint §10 defines all four entities and flags one index as critical: "`(state, unlock_at)` is the hot path for the scheduler and must stay tight." Section §34.6 extends replies into the richer reaction model.

---

## 3. Problem Statement

`delivery_attempts` is the table that makes the delivery guarantee an operational fact rather than a marketing claim — blueprint §10 says exactly that: "without this table the delivery guarantee is a marketing claim rather than an operational fact." And the recipient contact fields are a *snapshot*, not a join to the member record, because a capsule sealed in 2026 must still know where it was addressed even if the member row is later edited or merged.

---

## 4. Expected Outcome

Four tables with scope columns, indexes, and matrix cells, the scheduler index, hashed versioned recipient tokens, and contact snapshots that survive later member edits.

---

## 5. Requirements

### Functional Requirements

- `capsules`: id, owner_id, memory_id, title, sender_note, state, unlock_kind, unlock_at, unlock_timezone, milestone_member_id, milestone_spec, sealed_at, editable_until, delivered_at, first_opened_at, cancelled_at, created_at.
- `capsule_recipients`: id, capsule_id, member_id (nullable), name, email, phone, preferred_channel, access_token_hash, token_version, delivered_at, opened_at, last_verified_at.
- `delivery_attempts`: id, capsule_id, recipient_id, channel, attempt_no, provider, provider_message_id, status, error_code, attempted_at, next_retry_at.
- `capsule_replies`: id, capsule_id, recipient_id, kind, emoji, body, media_asset_id, created_at.
- Entitlement snapshot fields recording the horizon and pending allowance evaluated at seal time.

### Technical Requirements

- Index on `(state, unlock_at)` — the scheduler claim query must use it; assert via query plan.
- Unique index on `(capsule_id, recipient_id, channel, attempt_no)` so a retry cannot double-log.
- Recipient contact stored as a **snapshot** alongside the nullable `member_id`.
- `access_token_hash` with `token_version` so a leaked link can be rotated without destroying the capsule.
- tenant isolation: capsules and recipients readable by the owner; replies readable by the owner; `delivery_attempts` is service-and-owner readable.
- `unlock_at` as `timestamptz` UTC plus `unlock_timezone` (ADR-024).

---

## 6. Implementation Instructions

1. Write the schema for all four tables from §10 and §34.6; generate and read the migration.
2. Add the `(state, unlock_at)` index and verify with `EXPLAIN` that the intended claim query uses it — a scheduler doing a sequential scan across millions of capsules is a latent outage.
3. Store recipient contact as a snapshot. Add a comment explaining why: a member edited or merged years later must not change where an existing capsule was addressed. The `member_id` remains for display and for the merge-follows-survivor rule from TASK-035.
4. Add the attempt uniqueness constraint, which is what makes the delivery worker safely retryable.
5. Add scope enforcement. **The recipient-facing read path is not tenant isolation-based** — recipients have no session; they present a token, and the unlock page resolves it server-side. Document this explicitly so nobody later "fixes" the missing recipient policy.
6. Add the entitlement snapshot columns so a later downgrade cannot invalidate an existing promise (§17.2 item 4).
7. Extend the seed fixtures with capsules in `draft`, `sealed`, `delivered`, and `opened`, including one with a twenty-year horizon.

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
packages/db/src/schema/capsule.ts
packages/db/migrations/0010_capsules.sql
apps/api/src/features/capsule/schema.ts
packages/db/src/seed/fixtures.ts  (extend)
packages/db/src/__tests__/capsule-rls.test.ts
```

---

## 9. Data Model

Four tables per §10 and §34.6.

**`(state, unlock_at)` is the scheduler hot path.** Verify with `EXPLAIN` that the claim query uses it.

**Recipient contact is a snapshot, not a join.** A capsule sealed in 2026 must still know the address it was sent to, even if the member record is edited, merged, or deleted in 2035. `member_id` stays for display and for the merge rule (TASK-035), but delivery uses the snapshot.

**Recipients read via token, not via vault scope.** They have no session. The unlock page resolves a hashed token server-side. There is deliberately no recipient scope enforcement; do not add one to "fix" the asymmetry.

**Entitlement snapshot at seal time** (§17.2 item 4). A lapsed subscription must never invalidate an existing promise, so the horizon allowance is recorded when sealed and never re-evaluated.

**`delivery_attempts`** is the auditable proof behind the delivery guarantee. Unique on `(capsule, recipient, channel, attempt_no)` so retries cannot double-log.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Recipient contact is a snapshot; delivery never depends on a live member row.
- Entitlements are snapshotted at seal and never re-evaluated.
- Recipients authenticate by token, not by session.
- The attempt log is append-only in practice: statuses update, rows are never deleted.

---

## 13. Edge Cases

- A member deleted after a capsule was sealed to them — the snapshot keeps delivery possible; the UI shows the name from the snapshot.
- A member merged away — delivery follows the survivor per TASK-035, but the snapshot address remains authoritative unless the owner updates it.
- A recipient with no `member_id` (ad-hoc email entry) — fully supported.
- A capsule whose memory is deleted — blocked by the PHASE-03 guard; verify the hook is now wired.
- A twenty-year `unlock_at` — no arithmetic overflow anywhere; test with a 2046 date.
- Two recipients with the same email on one capsule — allowed but deduplicated at delivery; decide and document.
- A token rotated (version bumped) — the old link must stop working immediately.

---

## 14. Error Handling

- A constraint violation on the attempt log must be treated as "already logged" and not as a failure, since that is the correct retry semantics.

---

## 15. Security Considerations

- Tokens hashed with versioning.
- No recipient scope enforcement by design; token resolution is the access path.
- Pre-delivery invisibility is enforced in authz and at the media endpoint, not by the absence of a policy here.

---

## 16. Testing Requirements

### Integration Tests

- Deleting a member leaves the capsule deliverable via the snapshot.

### Database Tests

- tenant isolation: another user cannot read these capsules, recipients, or replies.
- Scheduler claim query uses the `(state, unlock_at)` index (assert via plan).
- Attempt uniqueness prevents double-logging.
- A 2046 `unlock_at` stores and reads correctly.

---

## 17. Acceptance Criteria

- [ ] Four tables created scoped through `lib/authz` and the required indexes.
- [ ] Scheduler index verified by query plan.
- [ ] Contact snapshot behaviour proven by deleting a member and confirming deliverability.
- [ ] Entitlement snapshot columns present.
- [ ] Attempt uniqueness enforced.
- [ ] Token versioning in place.
- [ ] Recipient-token access model documented in the schema comments.
- [ ] Seed fixtures include a twenty-year capsule.

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
TASK-048
    ↓
TASK-030
    ↓
TASK-057
```


---

## 20. Implementation Notes

- The snapshot-versus-join decision is the kind of thing a later contributor will try to normalise. The comment explaining why must be unmissable.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-01-01-01](../EPIC-05-01-01-01.md).
3. Read the parent Sprint — [SPR-05-01-01](../../SPR-05-01-01.md).
4. Read the parent Module — [MOD-05-01](../../../MOD-05-01.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§10 Capsule`, `§34.6`, `§11.4` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
