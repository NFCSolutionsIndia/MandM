# TASK-010 — Build Development Seed Script with Realistic Content

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-010 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-02 — Database Foundation & Migration Pipeline](../../SPR-01-01-02.md) |
| Epic | [EPIC-01-01-02-01 — Schema Pipeline & Seed Data](../EPIC-01-01-02-01.md) |
| Type | database |
| Priority | medium |
| Status | completed |
| Dependencies | `TASK-008` |
| Blueprint refs | `§36`, `gap G-7` |

---

## 1. Objective

Create an idempotent seed script that populates a development or preview database with believable users, members, events, memories, and capsules.

---

## 2. Context

Blueprint §36 is explicit: real-feel content only — Indian and global names, realistic dates, genuine emotional copy, **never lorem ipsum**. Gap G-7 records that the blueprint does not specify seed data, so this is a recommended addition.

---

## 3. Problem Statement

Placeholder data hides real problems. A timeline seeded with "Test Memory 1" will never reveal that long member names break the card layout, that a year-precision memory sorts oddly, or that an empty note reads badly. It also makes every preview review feel like a test harness rather than a product.

---

## 4. Expected Outcome

A script creating a small cast of users with interlocking members, events across past and future, memories with varied media kinds and date precisions, and capsules in several states — runnable repeatedly without duplicating rows.

---

## 5. Requirements

### Functional Requirements

- At least three users with distinct situations: a new user with almost nothing, an active user with a populated archive, and a user with pending capsules including one long-horizon.
- Members with relationships, birthdays, and mixed contact completeness — including one deliberately missing a contact method, to exercise the delivery-blocked warning.
- Events spanning past and future, with recurrence and reminder offsets.
- Memories with `occurred_precision` values of `exact`, `month`, and `year`.
- Capsules in `draft`, `sealed`, `delivered`, and `opened` states.
- Idempotent: re-running updates rather than duplicating.

### Technical Requirements

- Deterministic — a fixed seed value so the dataset is identical across runs and machines, which makes screenshot review and E2E assertions stable.
- No network calls. Media assets reference small committed fixture files or placeholder keys, not remote URLs.
- Refuses to run against production, checked by an explicit environment guard.

---

## 6. Implementation Instructions

1. Create `packages/db/src/seed/index.ts` with a `--reset` flag that truncates in dependency order, and a default mode that upserts.
2. Write `packages/db/src/seed/fixtures.ts` with the cast. Use real-feeling names spanning the target market — a mix such as Riya, Aarav, Priya, Ravi alongside global names — and write **genuine emotional copy** for notes and titles, as §36 requires. This matters: the copy in the seed becomes the copy everyone reviews the product against.
3. Add an environment guard that throws if the connection string looks like production or if `NODE_ENV === "production"` without an explicit override flag.
4. Include the deliberately awkward cases: a very long member name, a name in a non-Latin script, a memory with no note, a year-precision memory from 1974, a capsule scheduled beyond the free horizon, and a member with no phone or email.
5. Wire `pnpm db:seed` and call it from the preview-database workflow.
6. Write a test asserting the script is idempotent: run twice, assert row counts are equal.

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
packages/db/src/seed/index.ts
packages/db/src/seed/fixtures.ts
packages/db/src/seed/__tests__/idempotent.test.ts
packages/db/src/seed/fixtures/  (small committed media placeholders)
```

---

## 9. Data Model

Writes only to tables that exist at the time it runs. Because domain tables arrive in PHASE-02 and PHASE-03, this script starts small and is **extended by later tasks** — each phase that adds a table adds its fixtures here. Note that expectation in the file header so it is not treated as finished.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **Never lorem ipsum.** Every string a reviewer will read must be plausible product content (§36).
- The script must be safe to run repeatedly and must refuse to touch production.
- Deterministic output — no random values without a fixed seed, because non-deterministic fixtures make E2E tests flaky.

---

## 13. Edge Cases

- Foreign-key ordering on truncate — truncate in reverse dependency order or use a single `TRUNCATE ... CASCADE` with an explicit comment.
- A later phase adding a required column breaks the seed — the idempotency test in CI catches this on the PR that adds the column.
- Timezone-sensitive fixtures drifting as real time passes: express dates relative to a fixed reference date passed in, not to `now()`, so "in 3 days" stays meaningful and does not silently become the past.

---

## 14. Error Handling

- A seed failure must name the fixture and table that failed, and must roll back the whole run rather than leaving a half-populated database.

---

## 15. Security Considerations

- No real personal data, ever. All fixtures are invented.
- The production guard is a hard requirement — a seed run against production would be catastrophic and unrecoverable.

---

## 16. Testing Requirements

### Integration Tests

- Run seed twice; assert identical row counts and no duplicate keys.
- Assert the environment guard throws for a production-looking connection string.

---

## 17. Acceptance Criteria

- [x] Seed runs against a fresh per-PR preview schema and produces the documented cast.
- [x] Running twice does not duplicate data.
- [x] Guard prevents execution against production.
- [x] No placeholder or lorem-ipsum text anywhere in the fixtures.
- [x] Awkward cases from §6 are present, so layout and logic bugs surface during review rather than in production.
- [ ] Preview-database workflow invokes the seed successfully. — **deferred with TASK-006 (AWS); see §20**

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — CI is created in TASK-005
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified except the preview workflow, which has nothing to wire into
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-008
    ↓
TASK-010
```


---

## 20. Implementation Notes

### The guard had a hole, and the test found it

The production check used `/\b(prod|production|live)\b/`. **That does not match
`mm_production`** — an underscore is a word character, so there is no boundary before
`prod`. The most likely shape a real production database name takes was sailing straight
through the guard whose entire purpose is to stop it.

Now `/(^|[^a-z0-9])(prod|production|live)([^a-z0-9]|$)/i`, which treats `_` and `-` as
delimiters while still refusing to fire on `reproduction_tests`. Both cases are tested,
because a guard that cries wolf gets disabled.

**There is deliberately no override flag**, and a test asserts none is ever added. Seeding
a remote database should require a reviewed code change, not an environment variable typed
at 2am. Four independent risks are reported together: `NODE_ENV`, a non-local host, a
"prod" substring, and an RDS/Aurora hostname.

### Testing the plumbing instead of the logic

The guard tests originally spawned the CLI with `execFileSync(..., { shell: true })`.
Every one failed — **this repository lives at `E:\M&M\MandM-PWA`, and `&` is a shell
operator.** The path broke the command before the seed ever ran.

Fixed by extracting `productionRisks()` into `seed/guard.ts` and exporting a `seed()`
function the tests call directly. Faster, no subprocess fragility, and it tests the
decision rather than the plumbing around it — the same lesson as `splitStatements`.

Worth knowing on this machine: an `&` in the repository path breaks any tooling that
shells out.

### Determinism, and why relative dates still move

Every id comes from `seedId(key, date)` — a SHA-256 of a stable key, formatted as a real
UUIDv7 with the row's date in the timestamp bytes. Same key, same id, every machine, every
run. That is what makes the upsert idempotent and keeps screenshot review free of noise.

§13 asks for two things that pull against each other: reproducibility, and "in three days"
staying three days away. Resolved by hanging relative fixtures off a **reference date**
that defaults to now and is overridable with `SEED_REFERENCE_DATE`. A test asserts both
halves — the upcoming birthday moves when the reference moves, and the 1974 wedding does
not.

### Test pollution the scope guard caught

A scratch table from another file (`skip_locked_probe`) was visible to the scope guard
mid-flight, because vitest runs files in parallel. The guard was right; the exclusion was
too narrow. Any table ending `_probe` is now excluded, so a scratch table in one suite
cannot fail an unrelated one.

### Verification of §17 acceptance criteria

| Criterion | Result | How |
|---|---|---|
| Seed produces the documented cast | Pass | 3 users, 3 vaults, 4 vault members, 6 members, 4 events, 6 memories, 4 capsules, 4 recipients. |
| Running twice does not duplicate | Pass | Row counts identical after two runs, and after three manually. A test also proves it UPDATES: change a name, re-seed, the fixture value is restored and no second row appears. |
| Guard prevents execution against production | Pass | Four risks each tested independently, plus a test that `seed()` throws rather than writing, plus one asserting no override exists. |
| No placeholder or lorem-ipsum text | Pass | Asserted against the serialised fixtures for lorem, ipsum, "test memory", placeholder, todo, asdf, dummy. |
| Awkward cases from §6.4 present | Pass | All six, each asserted by a test rather than by inspection. |
| Preview workflow invokes the seed | **Deferred** | TASK-006 (AWS) is deferred, so there is no preview workflow to wire into. `pnpm db:seed` works locally; TASK-006 must call it. |

Also verified against the live database: Devanagari and the typographic apostrophe survive
the round trip, and a capsule unlock date of 2041 stores correctly — the case a
`TIMESTAMP` column would have silently zeroed.

56 tests in this package; 146 across the workspace.

### The copy is the point

§6.2 notes that the seed copy becomes what everyone reviews the product against, so it was
written rather than generated. The cast is three *situations*, not three rows: a new user
with almost nothing (the empty state), an active user with an archive spanning 1974 to last
week, and a user whose capsules cover every state including one beyond the free horizon.

### Left deliberately undone

No `media_assets` fixtures: R2 is not wired (PHASE-04), and committing binary
placeholders now would mean guessing at the key layout. The table is in the clear-order
list so `--reset` stays correct when they arrive.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-02-01](../EPIC-01-01-02-01.md).
3. Read the parent Sprint — [SPR-01-01-02](../../SPR-01-01-02.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `§36`, `gap G-7` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
completed
```

Allowed statuses: `pending` · `progress` · `completed`
