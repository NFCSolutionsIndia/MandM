# TASK-044 — Build Search Screen with Full-Text Search and Shared Filters

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-044 |
| Phase | [PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline](../../../../PHASE-03.md) |
| Module | [MOD-03-04 — Timeline & Discovery](../../../MOD-03-04.md) |
| Sprint | [SPR-03-04-01 — Timeline, Search & On This Day](../../SPR-03-04-01.md) |
| Epic | [EPIC-03-04-01-02 — Search, Filters & On This Day](../EPIC-03-04-01-02.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-039`, `TASK-042` |
| Blueprint refs | `§29.9`, `§13.3`, `ADR-010` |

---

## 1. Objective

Build the search screen with grouped results across memories, members, and events, plus the filter sheet shared with timeline and gallery.

---

## 2. Context

Blueprint §29.9 specifies tabs (All / Memories / People / Events / Gifts), fuzzy matching with highlighted terms, recent searches, suggestion chips, and an offline mode that "searches cached content only and says so explicitly".

---

## 3. Problem Statement

Search is the cheap 80% of retrieval (§13.2) and it must land in Release 1 because an archive you cannot search is an archive you stop opening. The offline honesty requirement matters too: silently returning fewer results because you are offline teaches users the product is unreliable.

---

## 4. Expected Outcome

A search screen that finds memories by title, note, occasion, and person name, tolerates typos, groups results by type, and states plainly when it is searching only cached content.

---

## 5. Requirements

### Functional Requirements

- Query across memories (FTS), members (name), and events (title).
- Tabs: All / Memories / People / Events. Gifts tab hidden until Release 3.
- Highlighted matching terms.
- Recent searches; suggestion chips ("Try: summer 2019, Mum, birthdays").
- Filter sheet shared with timeline and gallery.
- Offline: search cached metadata only, with an explicit chip stating so.
- Empty results state naming the applied filters with a one-tap clear.

### Technical Requirements

- a `tsvector` GIN index on the generated `search_text` column, with `pg_trgm` alongside it. **Typo tolerance ships in R1** (ADR-010), covering transliterated spellings and partial words.
- Ranking: title above note; exact matches above fuzzy.
- Debounced input; cancel in-flight queries on change.
- Filters stored in a shared store so switching between timeline, gallery, and search preserves them.

---

## 6. Implementation Instructions

1. Implement the search query combining FTS on memories with trigram matching on member and event names, scoped through authz.
2. Rank results: weight title matches above note matches, and exact above fuzzy. Return the matched field so the UI can highlight it.
3. Build the screen with tabs and grouped results, hiding the Gifts tab via release gating.
4. Implement highlighting from the server-returned match positions rather than re-matching client-side, which would disagree with the ranking.
5. Persist recent searches locally and offer the suggestion chips from §29.9.
6. Extract the filter sheet into a shared component and a shared store, and wire it into timeline and gallery in the same task so the three genuinely share state.
7. Implement offline search over cached Room / GRDB metadata with the explicit "searching your saved memories only" chip (§29.9). Until PHASE-06 provides the cache, implement against whatever local store exists and note the handoff.
8. Build the empty-results state naming the applied filters, distinct from the no-content state.

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
apps/<ios|android>/features/search/page.tsx
apps/api/src/features/search/queries.ts
apps/api/src/features/search/components/SearchScreen.tsx
apps/api/src/features/search/components/ResultGroup.tsx
apps/api/src/features/search/components/Highlight.tsx
apps/api/src/features/search/offline-search.ts
apps/site/src/stores/filters.ts
apps/api/src/features/search/__tests__/search.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

### Endpoint

```text
internal features/search/queries.ts
```

### Request

```json
{ "q": "summer beach", "types": ["memory","member","event"], "filters": { "favourite": true } }
```

### Response

```json
{
  "memories": [{ "id": "uuid", "title": "…", "matchField": "note", "rank": 0.82 }],
  "members": [],
  "events": []
}
```

### Validation

- Query length bounded
- Types from the allowed set
- Authz scopes every result set

### Error Responses

| Status | Code | When |
|---|---|---|
| 422 | `VALIDATION_FAILED` | Query too long or malformed |
| 403 | `AUTHZ_DENIED` | No grant on the target vault |

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- Offline search states plainly that it is local-only (§29.9).
- Empty results name the applied filters and offer a one-tap clear.
- The Gifts tab is hidden, not disabled, until Release 3.
- Highlighting derives from server match data, not client re-matching.

---

## 13. Edge Cases

- A single-character query — do not run a full scan; require a minimum length and say so.
- A query matching thousands of memories — paginate; do not render everything.
- A typo one character off — trigram should still find it; test.
- A non-Latin query — behaviour depends on the text-search configuration chosen in TASK-039; test and document the limitation honestly rather than claiming support.
- A query that matches a member name and a memory note — both groups populate; ordering between groups must be stable.
- Offline with an empty cache — the local-only chip plus an empty state, not an error.
- Filters applied then the user switches to timeline — the filter must carry over, which is the point of the shared store.
- Rapid typing — debounce and cancellation must prevent a stale result overwriting a newer one.

---

## 14. Error Handling

- A failed search shows a retry within the screen; recent searches and suggestions remain usable.

---

## 15. Security Considerations

- Every result set is authz-scoped independently — a search must not leak the existence of another vault's content through a count or a ranking artefact.

---

## 16. Testing Requirements

### Unit Tests

- Ranking places title matches above note matches.
- Trigram tolerates a one-character typo.
- Minimum query length enforced.

### Integration Tests

- Results are vault-scoped; another vault's content never appears.
- Filters shared across timeline, gallery, and search.

### Component Tests

- Offline chip appears and copy is correct.
- Empty results name applied filters and clear works.
- Stale response does not overwrite a newer one.

### Accessibility Tests

- axe; results are a navigable list; highlighted terms do not break screen-reader reading order.

---

## 17. Acceptance Criteria

- [ ] Search finds by memory title, note, occasion, member name, and event title.
- [ ] Typo tolerance works.
- [ ] Results grouped in tabs; Gifts hidden.
- [ ] Filters genuinely shared across all three surfaces.
- [ ] Offline mode states local-only explicitly.
- [ ] Empty results distinct from no content.
- [ ] Non-Latin behaviour tested and documented honestly.
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
TASK-039
    ↓
TASK-042
    ↓
TASK-044
```


---

## 20. Implementation Notes

- Record the text-search configuration and its non-Latin limitations in §20. Release 2 semantic search will improve this; do not overclaim now.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-03-04-01-02](../EPIC-03-04-01-02.md).
3. Read the parent Sprint — [SPR-03-04-01](../../SPR-03-04-01.md).
4. Read the parent Module — [MOD-03-04](../../../MOD-03-04.md).
5. Read the parent Phase — [PHASE-03](../../../../PHASE-03.md).
6. Read the relevant blueprint sections: `§29.9`, `§13.3`, `ADR-010` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
