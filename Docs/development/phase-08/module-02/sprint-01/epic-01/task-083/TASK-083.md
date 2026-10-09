# TASK-083 — Implement Full Data Export with Streaming Archive

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-083 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-02 — Data Rights — Export & Deletion](../../../MOD-08-02.md) |
| Sprint | [SPR-08-02-01 — Export & Account Deletion](../../SPR-08-02-01.md) |
| Epic | [EPIC-08-02-01-01 — Data Export & Account Deletion](../EPIC-08-02-01-01.md) |
| Type | backend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-081`, `TASK-028` |
| Blueprint refs | `§20.9`, `§24.1` |

---

## 1. Objective

Build the export job: every original file plus a JSON manifest covering every entity, assembled as a streaming archive and delivered by a signed link valid seven days.

---

## 2. Context

Blueprint §20.9: "a full archive on demand — every original file plus a JSON manifest of all metadata, memories, capsules, and people, assembled as a background job and delivered as a signed download link valid 7 days. No paywall, no watermark, no degradation."

---

## 3. Problem Statement

Export is the concrete proof that the archive belongs to the user. It is also the thing most services quietly make difficult, which is exactly why doing it properly is a differentiator worth the effort. Streaming matters because a mature vault is hundreds of gigabytes and buffering it would exhaust any machine.

---

## 4. Expected Outcome

A background job producing a complete archive, a manifest that a person could actually use to reconstruct their data, and a signed download link — with no charge and no degradation.

---

## 5. Requirements

### Functional Requirements

- Manifest covering: user, profile, preferences, vaults, memories with all metadata and precision, media asset records, members, events, capsules with recipients and delivery history, replies, shares, notifications, audit history.
- Every original media file at full quality.
- Streaming archive assembly.
- Signed download link valid seven days.
- Email on completion.
- Step-up authentication required to request.
- A cooldown between requests.

### Technical Requirements

- Streaming ZIP written directly to storage rather than buffered in memory.
- Manifest as JSON with a documented schema and a README inside the archive explaining the structure.
- Progress recorded so the UI can show something meaningful on a large export.
- Originals referenced by their manifest entries so the mapping between files and metadata is unambiguous.

---

## 6. Implementation Instructions

1. Implement the export handler in the workers service, iterating the user's entities and streaming a ZIP to storage.
2. Write the manifest to cover every entity listed in §5. **Include a human-readable README inside the archive** explaining the folder structure and the manifest schema — an export nobody can interpret is not really an export.
3. Stream media originals into the archive by their storage key, naming files predictably and recording the mapping in the manifest.
4. Record progress so the UI can show percentage rather than an indefinite spinner.
5. On completion, mint a seven-day signed URL and email it.
6. Require step-up authentication to request, and add a cooldown so export cannot be used as a resource-exhaustion vector.
7. Write the completeness test against a seeded account: assert every entity type appears in the manifest and every media file appears in the archive.

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
apps/workers/src/handlers/export-archive.ts
apps/workers/src/lib/zip-stream.ts
apps/api/src/features/data-rights/actions.ts
apps/<ios|android>/features/settings/data/page.tsx
packages/emails/src/templates/ExportReady.tsx
apps/workers/src/handlers/__tests__/export.test.ts
```

---

## 9. Data Model

No new tables beyond an export-request record: id, user_id, state, requested_at, completed_at, download_key, expires_at, progress.

**Manifest contents** — every entity the user owns, including capsule delivery history and audit entries. The point is reconstructability: someone with this archive and no access to the product should be able to understand what they have.

A README inside the archive explains the structure. This is the difference between an export and a data dump.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Originals at full quality. No watermark, no degradation, no paywall (§20.9).
- The manifest covers every entity, not just memories.
- A README explains the structure.
- Step-up authentication required; a cooldown prevents abuse.

---

## 13. Edge Cases

- A 500 GB vault — streaming handles it, but the job must be resumable or at least restartable without starting from zero. Decide and document.
- A media file missing from storage — record it in the manifest as missing rather than failing the whole export.
- An export requested twice — the cooldown blocks the second with a clear message and the existing link if still valid.
- An export whose download link expires before use — allow re-minting without regenerating the archive, if it still exists.
- An account deleted while an export is in flight — cancel the export and remove the archive.
- A ZIP exceeding filesystem or tooling limits — use ZIP64; verify with a large synthetic export.
- Non-ASCII filenames from member names or titles — encode correctly so the archive extracts properly on Windows and macOS.

---

## 14. Error Handling

- A partial export must not be delivered as complete. Either finish, or report failure with what was and was not included.

---

## 15. Security Considerations

- Step-up authentication required.
- The download link is signed, short-lived, and single-purpose.
- The archive contains the user's own data only — verify no cross-vault content can be included via a shared vault the user does not own.

---

## 16. Testing Requirements

### Integration Tests

- **Manifest completeness against a seeded account: every entity type present.**
- Every media original present in the archive with a correct manifest mapping.
- Missing storage object recorded as missing rather than failing the export.
- ZIP64 handles a large synthetic export.
- Non-ASCII filenames extract correctly.
- Cooldown blocks a rapid second request.
- Account deletion cancels an in-flight export.

---

## 17. Acceptance Criteria

- [ ] Export covers every entity and every original, verified against a seeded account.
- [ ] Streaming assembly handles a large vault without exhausting memory.
- [ ] README included and accurate.
- [ ] Signed seven-day link, emailed on completion.
- [ ] Step-up required; cooldown enforced.
- [ ] Missing objects reported rather than failing.
- [ ] Resumability decision recorded in §20.

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
TASK-028
    ↓
TASK-083
```


---

## 20. Implementation Notes

- The README is a small thing that makes the export genuinely useful rather than technically compliant. Write it as if for a non-technical family member.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-02-01-01](../EPIC-08-02-01-01.md).
3. Read the parent Sprint — [SPR-08-02-01](../../SPR-08-02-01.md).
4. Read the parent Module — [MOD-08-02](../../../MOD-08-02.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§20.9`, `§24.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
