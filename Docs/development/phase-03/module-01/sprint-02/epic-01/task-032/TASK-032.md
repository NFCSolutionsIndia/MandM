# TASK-032 — Implement vCard and CSV Member Import with Validation Report

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-032 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-01 — Members & Relationships](../../../MOD-03-01.md) |
| Sprint | [SPR-03-01-02 — Member Import Paths & Deduplication](../../SPR-03-01-02.md) |
| Epic | [EPIC-03-01-02-01 — Import Paths](../EPIC-03-01-02-01.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-030` |
| Blueprint refs | `§29.11`, `§29.0` |

---

## 1. Objective

Build the file-based import path: drag-and-drop or picker for `.vcf` and `.csv`, with a mapping preview and a per-row validation report.

---

## 2. Context

Blueprint §29.11 makes this "the primary import path on iOS and desktop" and requires it to "feel first-class: drag-and-drop on desktop, file picker on mobile, sample template download".

---

## 3. Problem Statement

The Contact Picker API does not exist on iOS Safari. Without a genuinely good file path, every iPhone user types every member by hand — which for a family archivist with thirty relatives is enough friction to abandon the product. This is not a fallback; for half the audience it is the path.

---

## 4. Expected Outcome

A working import accepting vCard and CSV, showing a mapping preview with a per-row status ("38 ready · 2 need a birthday"), and importing only the rows the user confirms.

---

## 5. Requirements

### Functional Requirements

- Accept `.vcf` (vCard 3.0 and 4.0) and `.csv`.
- Drag-and-drop on desktop; file picker on mobile.
- Downloadable CSV template.
- Column mapping UI for CSV with sensible auto-detection.
- Per-row validation report with counts and an inline reason per failing row.
- User selects which rows to import; nothing is imported without confirmation.
- Duplicate rows against existing members flagged before import, not after.

### Technical Requirements

- Parse client-side so no file is uploaded until the user confirms — this is both faster and better for privacy.
- Streaming or chunked parse so a 5,000-contact export does not freeze the tab.
- Tolerant parsing: a malformed row is reported and skipped, never fatal to the whole file.
- Name, phone, and email validated with the `@mm/shared` validators, so Unicode names and country-aware phone numbers behave identically to manual entry.

---

## 6. Implementation Instructions

1. Build the upload surface with drag-and-drop and a file input, stating accepted types and size limits up front (§33.7).
2. Implement vCard parsing covering `FN`, `N`, `TEL`, `EMAIL`, `BDAY`, and `ANNIVERSARY`. Handle both 3.0 and 4.0 date formats, including partial dates such as `--0314` (day and month, no year) which map directly to `birthday_precision`.
3. Implement CSV parsing with header auto-detection and a manual mapping fallback. Provide the downloadable template so a user assembling a list by hand has a known-good shape.
4. Build the validation report: total rows, ready rows, rows needing attention with a per-row reason, and rows that duplicate an existing member.
5. Let the user deselect rows. Import only what is confirmed, in a single transaction, and report the result.
6. Run duplicate detection against existing members using the trigram index before import, so the user resolves collisions once rather than cleaning up afterwards.
7. Handle very large files by parsing in chunks with progress, and cap the row count with a clear message rather than a silent truncation (§33 "no silent caps").

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
apps/api/src/features/member/components/ImportSheet.tsx
apps/api/src/features/member/components/ImportReport.tsx
apps/api/src/features/member/import/parse-vcard.ts
apps/api/src/features/member/import/parse-csv.ts
apps/api/src/features/member/import/validate-rows.ts
apps/api/src/features/member/actions.ts  (bulk create)
apps/site/public/member-import-template.csv
apps/api/src/features/member/import/__tests__/parse-vcard.test.ts
apps/api/src/features/member/import/__tests__/parse-csv.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Presented as one of four equal options in the Add Member sheet, labelled "Upload a file" with the accepted types stated.

Desktop shows a drop zone; mobile shows a button. Both link the template download.

**Report** — the substance of this screen:

```
40 contacts found
  38 ready to add
   1 needs a birthday      (Priya Sharma)
   1 looks like a duplicate (Ravi Kumar — already added)
```

Each row is selectable, with the reason inline. Import button states the count: "Add 38 members".

---

## 12. Business Rules

- Nothing is imported without explicit confirmation.
- A malformed row is reported and skipped; it never fails the whole file.
- Row caps are stated, never silent (§33 no-silent-caps).
- Parsing happens client-side; the file is not uploaded.

---

## 13. Edge Cases

- vCard partial birthdays (`--0314`, `1974`) — map to `birthday_precision` rather than inventing a full date.
- vCard with multiple `TEL` or `EMAIL` entries — take the preferred one, and record in §20 which rule was used.
- CSV with a byte-order mark, semicolon delimiters, or CRLF endings — all common from spreadsheet exports; handle all three.
- CSV with quoted fields containing commas and newlines.
- Non-Latin names in a Latin-1-encoded CSV — detect encoding or state the requirement clearly rather than importing mojibake.
- A 5,000-row file — chunked parse with progress; no frozen tab.
- A file that is not actually vCard or CSV despite its extension — fail with a clear message naming what was expected.
- An empty file, or a file with headers only.

---

## 14. Error Handling

- A parse failure names the line number and the reason. A partial import must report exactly which rows were added.

---

## 15. Security Considerations

- Client-side parsing means contact data is not transmitted until confirmed — state this in the UI, because it is a genuine privacy benefit worth communicating.
- Bulk create is rate-limited and row-capped to prevent using import as an amplification vector.
- Imported contact data is personal data belonging to third parties; it is covered by export and deletion like any other member data.

---

## 16. Testing Requirements

### Unit Tests

- vCard 3.0 and 4.0 both parse.
- Partial birthdays map to the correct precision.
- CSV with BOM, semicolons, and CRLF all parse.
- Quoted fields with embedded commas and newlines parse.
- Malformed row is skipped and reported, not fatal.
- Row cap is reported explicitly.

### Component Tests

- Report renders counts and per-row reasons; deselecting a row excludes it from the import count.

### E2E Tests

- Upload a 40-row file on a mobile viewport, deselect one row, import, and see 39 members.

### Accessibility Tests

- Drop zone is keyboard operable; the report table is navigable and its statuses are announced.

---

## 17. Acceptance Criteria

- [ ] vCard and CSV both import successfully, including the awkward formats in §13.
- [ ] Partial birthdays preserved with correct precision.
- [ ] Validation report shows counts and per-row reasons.
- [ ] Nothing imports without confirmation.
- [ ] Row caps stated, not silent.
- [ ] 5,000-row file parses without freezing the tab.
- [ ] Verified on a real iPhone.
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
TASK-032
```


---

## 20. Implementation Notes

- Record the multi-value `TEL`/`EMAIL` selection rule in §20.
- This path carries the iOS experience. Give it the polish the Contact Picker would have had.

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
