# TASK-004 — Create Shared Package: Result Envelope, Zod Base, Domain Constants

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-004 |
| Phase | [PHASE-01 — Foundation & Architecture](../../../../PHASE-01.md) |
| Module | [MOD-01-01 — Repository, Toolchain & Data Layer](../../../MOD-01-01.md) |
| Sprint | [SPR-01-01-01 — Monorepo & Application Scaffold](../../SPR-01-01-01.md) |
| Epic | [EPIC-01-01-01-01 — Workspace & Package Scaffold](../EPIC-01-01-01-01.md) |
| Type | backend |
| Priority | high |
| Status | completed |
| Dependencies | `TASK-001` |
| Blueprint refs | `ADR-022`, `ADR-023`, `§33` |

---

## 1. Objective

Establish `packages/shared` with the discriminated result type, the error-code registry, and the domain constants that both apps need.

---

## 2. Context

ADR-023 requires every server action to return a discriminated union rather than throwing for expected failures, so forms can render field-level errors. ADR-022 requires every boundary to validate with a Zod schema whose definition is shared, not duplicated.

---

## 3. Problem Statement

If the error contract is invented per feature, the UI ends up with a dozen ways to display a validation failure, and blueprint §33.2 ("error copy = what is wrong + how to fix it") becomes impossible to enforce. Deciding the shape once, in code, makes it the path of least resistance.

---

## 4. Expected Outcome

A package exporting `Result<T>`, `ok()`, `err()`, a frozen `ERROR_CODES` map, Zod helpers, and shared enums (occasion kinds, capsule states, roles) that both apps import.

---

## 5. Requirements

### Functional Requirements

- `Result<T, E>` discriminated on `ok`.
- `ok(data)` and `err(code, message, field?)` constructors.
- A machine-stable error-code registry with a TypeScript union type derived from it.
- Shared enums matching the blueprint data model: vault roles, capsule states, occasion types, media kinds, precision levels.
- Reusable Zod primitives: email, E.164 phone, non-empty display name accepting international characters, ISO timestamp.

### Technical Requirements

- Zero runtime dependencies other than Zod.
- No Node-only or browser-only APIs — this package is imported by both.
- Error codes are `SCREAMING_SNAKE` and never reused for a different meaning once shipped.

---

## 6. Implementation Instructions

1. Create `packages/shared/src/result.ts` with the `Result` type and constructors.
2. Create `packages/shared/src/errors.ts` with a frozen object of codes grouped by domain (`AUTH_*`, `AUTHZ_*`, `VALIDATION_*`, `QUOTA_*`, `CAPSULE_*`, `UPLOAD_*`, `RATE_LIMIT_*`) and a derived union type.
3. Create `packages/shared/src/enums.ts` with the shared domain enums taken from blueprint §10 and §34. Do not invent values; copy them.
4. Create `packages/shared/src/zod.ts` with the reusable primitives. **The name validator must accept letters, spaces, hyphens, and apostrophes across Unicode — an ASCII-only rule would reject a large share of the target market** (blueprint §29.3).
5. Create `packages/shared/src/index.ts` re-exporting the public surface.
6. Write tests that lock the error-code registry: a test that fails if a code is removed or renamed, so the contract cannot break silently.

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
packages/shared/src/result.ts
packages/shared/src/errors.ts
packages/shared/src/enums.ts
packages/shared/src/zod.ts
packages/shared/src/index.ts
packages/shared/src/__tests__/errors.test.ts
packages/shared/src/__tests__/zod.test.ts
```

---

## 9. Data Model

No database tables. This task defines the **shared enum values** that later migrations must match exactly:

- `vault_role`: `owner` | `admin` | `contributor` | `viewer`
- `capsule_state`: `draft` | `sealed` | `delivering` | `delivered` | `opened` | `cancelled` | `failed`
- `occurred_precision`: `exact` | `day` | `month` | `year`
- `media_kind`: `image` | `video` | `audio`
- `unlock_kind`: `datetime` | `milestone` | `manual`
- `memory_visibility`: `private` | `vault` | `link` | `recipients`

Later migrations import these rather than restating them, so the database and the application cannot diverge.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- An error code, once shipped, is never repurposed. Add a new code instead.
- Every error code must have user-facing copy that says what is wrong and how to fix it — the registry holds the code and a default message; screens may override the message but never the code.

---

## 13. Edge Cases

- Unicode names: "Ravi Kumar", "Ravi-Kumar", "O'Brien", and Devanagari or Tamil script must all validate.
- E.164 validation must be country-aware, not a bare regex — a 10-digit Indian number and a 9-digit UK number are both valid in their country context.
- Zod version differences between apps — the package must be the only place Zod is pinned.

---

## 14. Error Handling

- This task defines error handling for the whole system; it has no runtime errors of its own.

---

## 15. Security Considerations

- Error messages must never leak whether an account exists (blueprint §29.5) — provide a dedicated non-enumerating code and message for that case so screens cannot get it wrong.

---

## 16. Testing Requirements

### Unit Tests

- Result constructors narrow correctly under TypeScript (type-level test).
- Error registry snapshot test fails if a code is renamed or removed.
- Name validator accepts Unicode, hyphens, and apostrophes; rejects a single character and empty input.
- E.164 validator accepts valid IN, US, and GB numbers and rejects malformed input for each.

---

## 17. Acceptance Criteria

- [x] Both apps import from `@mm/shared` successfully.
- [x] Error-code snapshot test in place and passing.
- [x] Unicode and E.164 validators pass the cases in §13.
- [x] Shared enums match blueprint §10/§34 exactly, verified line by line.

---

## 18. Definition of Done

- [x] Implementation complete and matches §4 Expected Outcome
- [x] Tests from §16 implemented
- [x] All tests passing locally — CI is created in TASK-005
- [x] Error handling from §14 implemented
- [x] Security considerations from §15 satisfied
- [x] All §17 acceptance criteria verified
- [x] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [x] No regression in existing tests
- [x] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-001
    ↓
TASK-004
```


---

## 20. Implementation Notes

### The E.164 validator: a bug found by writing the test, and what it changed

§5 requires zero runtime dependencies beyond Zod. §13 requires country-aware phone
validation. Those pull against each other, and the first attempt got it wrong.

I hand-rolled a table of national-number lengths, including `'44': [9, 10]` for the UK.
Writing the test exposed that **UK national numbers are legitimately 7, 9 or 10 digits** —
`0800 1111` has a 7-digit national number. The table would have **rejected valid UK
numbers**, which is precisely the failure §13 warns about, in the country §13 names as
its example.

**What changed, and why it is the right shape:** a false rejection here is far worse than
a false acceptance. A false rejection stops a real person adding a real recipient, which
can stop a capsule being delivered. A false acceptance is caught by Twilio at send time
(PHASE-07). So the table now length-checks **only where the rule is unambiguous**:

| Code | Lengths | Why listed |
|---|---|---|
| `+91` | 10 | Every Indian NSN is 10 digits. Primary market. |
| `+1` | 10 | NANP is always 10. |

Everything else — the UK included — gets **structure-only** validation. The table carries
a comment explaining that the UK's absence is deliberate, so nobody "completes" it later
and reintroduces the bug.

**Do not add a country to that table without checking every valid length for it.** When
in doubt, leave it out.

### Two more validators that would have shipped wrong

- **Unicode names need `\p{M}`, not just `\p{L}`.** "रवि" is र + व + ि, where ि (U+093F)
  is a spacing *combining mark*, not a letter. A `\p{L}`-only rule rejects most Hindi and
  Tamil names outright — in an India-first product. Tested against Devanagari, Tamil,
  Bengali, Arabic and Han, plus both apostrophes (`'` and `’` — a phone types the second).
- **`Intl` accepts `"IST"` as a timezone.** It resolves without throwing, so the obvious
  `try/catch` validator accepted it. "IST" is India, Ireland *and* Israel — exactly the
  ambiguity ADR-024 exists to prevent. The validator now requires a real IANA
  `Area/Location` name (or `UTC`).

### Account enumeration is prevented by construction, and tested

§15 and blueprint §29.5 require that an error never reveal whether an account exists.
Rather than trusting reviewers to notice, there is **no code that could express it** —
and `__tests__/errors.test.ts` fails if one is ever added, matching on
`NO_SUCH_ACCOUNT | ACCOUNT_NOT_FOUND | USER_NOT_FOUND | EMAIL_NOT_REGISTERED | UNKNOWN_USER`.

A second test asserts the `AUTH_CREDENTIALS_REJECTED` message stays true whether or not
the account exists. Sign-in is the natural place for someone to add "no account with that
address" for helpfulness; on a private memory product that turns the form into an
enumeration oracle for anyone holding a list of email addresses.

`AUTHZ_DENIED` is deliberately identical for "does not exist" and "you may not see it",
for the same reason.

### The enums were copied from the blueprint, and one value was deliberately dropped

§6.3 says do not invent values. Each enum in `enums.ts` cites its blueprint line:

| Enum | Blueprint | Verified |
|---|---|---|
| `vault_role` | §10 `VaultMember.role`, line 1042 | owner · admin · contributor · viewer |
| `capsule_state` | §10 `Capsule.state`, line 1066 | draft · sealed · delivering · delivered · opened · cancelled · failed |
| `unlock_kind` | §10 `Capsule.unlock_kind`, line 1066 | datetime · milestone · manual |
| `occurred_precision` | §10 `Memory.occurred_precision`, line 1049 | exact · day · month · year |
| `media_kind` | §10 `MediaAsset.kind`, line 1056 | image · video · audio |
| `memory_visibility` | §10 `Memory.visibility`, line 1049 | private · vault · link · recipients |

**The blueprint lists a FOURTH `unlock_kind` — `posthumous`, marked `[V2]`** — which
TASK-004 §9 omits. Correctly: Release 1 does not ship it, and the heir/death-verification
model behind it is explicitly deferred pending legal counsel per jurisdiction (ADR-026).
The omission is now documented in `enums.ts` so nobody "fixes" it without adding the
protocol it depends on.

**Found but NOT added:** blueprint line ~1040 also defines `Vault.type`
(`personal | shared | legacy`). It is a genuine shared enum, but §9 lists six and §9 is
the scope. It will be needed by TASK-026 (vault ownership); noting it here so it is not
rediscovered from scratch.

### Zod is pinned here and nowhere else (§13)

`zod` moved out of `apps/workers` and into `packages/shared`, which re-exports `z`. Both
apps now `import { z } from '@mm/shared'`.

Two copies of Zod in one process produce schema-instance mismatches — an object built
with one copy fails `instanceof` checks in the other — and the resulting errors point
nowhere near the cause. **Do not add `zod` to an app's `package.json`.**

### `parseEnv` relocated from apps/workers, as TASK-003 §20 asked

`apps/workers/src/config.ts` now uses the shared helper, and `apps/api/src/lib/env.ts`
uses the same one — so both deployables fail identically on bad configuration: every
problem at once, in plain text (legible without `jq` by someone staring at a crash-looping
task), refusing to start rather than running degraded.

`ConfigError` became `EnvError` in the move. It was never shipped, so renaming it costs
nothing — unlike an error *code*, which §12 forbids renaming for exactly this reason.

### Verification of §17 acceptance criteria

| Criterion | Result | How |
|---|---|---|
| Both apps import from `@mm/shared` successfully | Pass | `apps/workers/src/config.ts` and `apps/api/src/lib/env.ts` both import `parseEnv`, `EnvError` and `z` from it. Proven at runtime by tests in both apps, and at bundle time by `pnpm build` — tsup inlines it for workers, Next transpiles it for web. |
| Error-code snapshot test in place and passing | Pass | `errors.test.ts` locks 43 codes. Removing or renaming one fails; adding one without updating the lock also fails, so new codes are reviewed deliberately. |
| Unicode and E.164 validators pass the cases in §13 | Pass | Devanagari, Tamil, Bengali, Arabic, Han, both apostrophes, hyphens and initials accepted; single characters, digits and markup rejected. Indian 10-digit and UK 7/9/10-digit numbers all accepted; wrong-length IN and NANP numbers rejected. |
| Shared enums match blueprint §10/§34 exactly | Pass | Table above, cited line by line, with the `posthumous [V2]` omission recorded. |

Also verified beyond §17:

- **68 tests** across the three workspaces that have them (34 shared, 8 web, 26 workers).
- **Registry hygiene** — every code is SCREAMING_SNAKE, every message is non-trivial, and
  a test fails if any user-facing message calls a memory an "asset" or a "record"
  (CONVENTIONS forbids that vocabulary).
- **`isErrorCode` is not fooled by inherited properties** — it uses `Object.hasOwn`, so
  `isErrorCode('toString')` is `false`.
- Workspace gates green: typecheck, lint, test, build across six workspaces.

### Left deliberately undone

No feature schemas — those belong to the features that own them, re-exported through here
only where genuinely shared (CONVENTIONS). No `NEXT_PUBLIC_*` schema yet: nothing needs
one, and inventing it now would invite putting a secret in it.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-01-01-01-01](../EPIC-01-01-01-01.md).
3. Read the parent Sprint — [SPR-01-01-01](../../SPR-01-01-01.md).
4. Read the parent Module — [MOD-01-01](../../../MOD-01-01.md).
5. Read the parent Phase — [PHASE-01](../../../../PHASE-01.md).
6. Read the relevant blueprint sections: `ADR-022`, `ADR-023`, `§33` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
