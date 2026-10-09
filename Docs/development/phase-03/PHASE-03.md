# PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-03 |
| Phase name | Core Domain — Members, Occasions, Memories & Timeline |
| Release | Release 1 |
| Phase objective | Build the four entities the product is actually about, and the timeline that gives them meaning. |
| Business objective | This is the first phase where a user gets something of value: an organised archive and a calendar that knows what is coming. |
| Technical objective | Member, Event, and Memory models scoped through `lib/authz`; occurrence computation; full-text search; the virtualised Past→Present→Future timeline. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-02 |
| Estimated effort | ~4 weeks |
| Modules | 4 |
| Sprints | 5 |
| Epics | 8 |
| Tasks | 16 |
| Expected outcome | A user can add the people who matter, see their occasions, create memories with real dates and meaning, and browse their life on a timeline that extends into the future. |

---

## 1. Phase Purpose

This is the largest phase in Release 1 and the one that makes the product recognisable.

Three things here are more consequential than they look.

**`occurred_at` with `occurred_precision`.** Blueprint §13.1 calls this the difference between a real family archive and a broken one. A scanned 1974 wedding photo has a *year*, not a timestamp. Every competitor collapses imported media into its upload date, and every family archivist is quietly furious about it.

**The Event entity.** Blueprint §27.3 identifies this as the most valuable addition the designer's brief made — Part I had only an `occasion` enum on a memory. The event is what converts a passive archive into a product that prompts action, and it is the shared trigger for memories, broadcasts, and gifts. Retrofitting it later is a migration, not a feature (§27.4).

**The future band.** The timeline extending forward is the product's identity (§29.12). It is built here with capsules stubbed, so PHASE-05 populates a surface that already exists.

---

## 2. Phase Goals

- A user can add members through four genuinely usable paths, including on an iPhone where the Contact Picker API does not exist.
- A user can create an event with recurrence and reminder offsets, and see it on a calendar.
- A user can create a memory with the date it *happened* and a note about what it meant.
- A user can browse a timeline that includes a visible, empty future band.
- A user can find a memory by typing a word, and rediscover one through On This Day.

---

## 3. Features Delivered

- Members with relationships, birthdays, interests, and four import paths.
- Duplicate detection and merge with defined semantics.
- Occasions engine: recurrence, reminder offsets, month/year/agenda views.
- Memories with media placeholders, date precision, occasion tags, and notes.
- Soft delete with a Trash view and a 30-day purge.
- Virtualised timeline with a Now divider and a future band.
- Gallery grid, text search, filters, favourites, On This Day.

---

## 4. Architecture Impact

- Introduces the three core domain modules under `src/features/`, each owning its schema slice with no cross-module database access (ADR-004).
- Introduces PostgreSQL full-text search with a `search_text` column and a `tsvector` GIN index, plus `pg_trgm` for trigram matching — so typo tolerance ships in R1 rather than waiting for a search engine (ADR-010).
- Introduces the reminder job kinds that PHASE-07 will deliver through.
- Extends the PHASE-01 seed fixtures with the full domain cast.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-03-01](module-01/MOD-03-01.md) | Members & Relationships | Let a user record the people who matter with as little typing as their platform allows, and keep those records accurate over years. | critical | pending |
| [MOD-03-02](module-02/MOD-03-02.md) | Occasions & Events Engine | Turn a passive archive into a product that prompts action, by knowing what is coming and reminding the user in time to do something about it. | critical | pending |
| [MOD-03-03](module-03/MOD-03-03.md) | Memories | Let a user capture what happened, when it happened, and what it meant — with the date precision a real family archive requires. | critical | pending |
| [MOD-03-04](module-04/MOD-03-04.md) | Timeline & Discovery | Show a user their life in order — including what is still coming — and let them find or rediscover any part of it. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-02

- **PHASE-02** must be complete: `lib/authz` is the gate every query in this phase passes through.
- **PHASE-04** is a peer, not a prerequisite: this phase works against seeded media placeholders, and the `MediaAsset` contract must be frozen jointly before either goes far.
- **Design:** §29.7, §29.11, §29.12, §29.14, §29.15 screens must be available from the design file.

---

## 7. Phase Deliverables

- Member, Event, Memory schema scoped through `lib/authz` and FTS.
- Four member-import paths including a public self-service page.
- Calendar with three views and event CRUD.
- Memory create, view, edit, delete with Trash.
- Timeline, gallery, search, filters, favourites, On This Day.

---

## 8. Phase Acceptance Criteria

- [ ] A memory created from a 1974 photo sorts correctly on the timeline with year precision, and does not claim to have happened today.
- [ ] A yearly event fires its reminder offsets once per year and never twice.
- [ ] Member import works on an iPhone using the file and invite-link paths.
- [ ] The timeline renders 2,000 memories without dropped frames on a mid-range Android.
- [ ] A duplicate member can be merged, and the merge semantics match the documented rule.
- [ ] Every query in the phase passes through `lib/authz`; a cross-tenant attempt fails at both layers.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Timeline performance with a large archive | high | Virtualised windowed list, cursor pagination, blurhash placeholders, and a 2,000-item benchmark as an acceptance criterion rather than an aspiration. |
| `occurred_precision` treated as decoration and ignored in sorting or display | high | Precision-aware formatting is a shared utility; tests assert a year-precision memory neither claims a day nor matches an On This Day query. |
| Contact import unusable on iOS, making member entry feel punitive | high | Four co-equal paths (§29.11); the invite link is designed as the best path rather than a fallback. |
| Recurrence and reminder duplication across timezones and DST | medium | `last_fired_for_year` guard, absolute-instant arithmetic, and explicit DST tests. |
| Event model diverging from what PHASE-05 milestones need | medium | Milestone unlock (`age:18`) is specified against this schema before it is written; a joint review with PHASE-05 scope. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder can add three family members, see their birthdays on a calendar, create a memory dated 1998, and find it by searching
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§10`
- `§13`
- `§29.7`
- `§29.9`
- `§29.11`
- `§29.12`
- `§29.13`
- `§29.14`
- `§29.15`
- `§34.1`
- `§34.2`
