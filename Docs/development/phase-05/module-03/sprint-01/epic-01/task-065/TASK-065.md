# TASK-065 — Build Server-Rendered Recipient Unlock Page

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-065 |
| Phase | [PHASE-05 — Time Capsules & The Delivery Guarantee](../../../../PHASE-05.md) |
| Module | [MOD-05-03 — Recipient Experience](../../../MOD-05-03.md) |
| Sprint | [SPR-05-03-01 — Recipient Unlock Page & Reply Loop](../../SPR-05-03-01.md) |
| Epic | [EPIC-05-03-01-01 — Recipient Unlock & Reply](../EPIC-05-03-01-01.md) |
| Type | fullstack |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-059`, `TASK-062` |
| Blueprint refs | `§29.24`, `§11.4`, `ADR-002` |

---

## 1. Objective

Build `/c/[token]` as a server-rendered page with all five states, a ceremonial reveal, and full functionality with JavaScript disabled.

---

## 2. Context

Blueprint §29.24 specifies the states and the reveal. ADR-002 and the project plan both make the constraint explicit: "`/c/[token]` is server-rendered and works with JavaScript disabled. A 2046 recipient must not be blocked by a 2026 framework assumption."

---

## 3. Problem Statement

Everything about this page is unusual because its requirements are unusual. It must work for someone with no account, on an unknown browser, possibly decades from now, at the emotional peak of the product. That combination rules out a client-rendered experience and rules out anything that depends on a framework runtime surviving.

---

## 4. Expected Outcome

A page that resolves a hashed token server-side, renders the correct one of five states, reveals the memory with ceremony where JavaScript is available and plainly where it is not, and never leaks pre-delivery content.

---

## 5. Requirements

### Functional Requirements

- Sealed state (not yet due): sender name, when it was recorded, and a countdown. **No media, no note.**
- Delivered state: the sender's note, the memory full-screen, and a reply affordance.
- Expired, revoked, and not-found states, each with warm designed copy.
- Ceremonial reveal (~1.2s) as a progressive enhancement, with an immediate render as the baseline.
- `Save a copy` download.
- A soft, non-blocking invitation to create an account.

### Technical Requirements

- **No client components anywhere in this route's tree.** The PHASE-01 scaffold added a comment saying so; honour it.
- Token resolved server-side by hash with constant-time comparison and version checking.
- Media preloaded (poster and first bytes) before the reveal animation runs, so it never stutters (§29.24).
- `noindex, nofollow, noarchive` headers.
- Rate-limited per token and per IP.
- Signed media URLs minted server-side and embedded, since the client cannot be relied upon to fetch them.

---

## 6. Implementation Instructions

1. Build the page as an async server component. **Do not introduce a client component**; the reveal is a CSS animation triggered by a server-rendered class, enhanced by a small optional script.
2. Resolve the token through `lib/authz`, using the recipient branch built in TASK-059, so pre-delivery invisibility is enforced by the same chokepoint as everything else.
3. Render the sealed state with the countdown as server-rendered text plus a `<time datetime>` element. Without JavaScript the countdown is static; that is acceptable and honest, and the date is what matters.
4. Render the delivered state: note first, then media. Mint signed URLs server-side and embed them.
5. Implement the reveal as a CSS transition with a `prefers-reduced-motion` variant. Where JavaScript is present, preload the poster and first media bytes before triggering it.
6. Strip the app chrome entirely. §29.24 requires "no chrome, no branding competing for attention" — this page is the memory and nothing else.
7. Implement all five states with warm, specific copy. The not-yet-due state is a countdown page, **not an error** (§29.24).
8. Add `Save a copy` as a plain link to a server-minted download URL, so it works without JavaScript.
9. Add the soft signup invitation at the bottom — present, unobtrusive, never blocking.
10. Record `opened_at` on first view and notify the sender. **Do this server-side on render**, since a client-side beacon would miss no-JS visitors.
11. Write the defining test: render with JavaScript disabled in Playwright and assert the note and media are present.

---

## 7. Architecture

```text
GET /c/[token]        ← no client components in this tree
  ├─ resolve token (hashed, constant-time, version-checked)
  ├─ lib/authz recipient branch
  │     delivered_at IS NULL  ──▶ SEALED state: sender + date + countdown only
  │     delivered              ──▶ DELIVERED state
  │     revoked / expired / unknown ──▶ designed states
  │
  ├─ mint signed media URLs SERVER-SIDE and embed
  ├─ record opened_at + notify sender   (server-side, so no-JS visitors count)
  └─ render: note first, then media, CSS reveal, no app chrome

Works with JavaScript disabled. Asserted by test.
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/site/src/app/c/[token]/page.tsx
apps/site/src/app/c/[token]/states.tsx
apps/api/src/features/capsule/resolve-token.ts
apps/site/src/app/c/[token]/reveal.css
apps/site/src/app/c/[token]/__tests__/no-js.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.24. **No app chrome. No navigation. No logo competing with the memory.**

**Sealed (not yet due)**

```
        Riya left something for you.
        It opens on 4 June 2044.

              6,502 days
```

Nothing else. No media, no note, no hint of content.

**Delivered** — the sender's note in Fraunces, then the memory full-screen. Reveal is slow (~1.2s) and deliberate, because ceremony is the point. Under reduced motion it is a clean cross-fade.

Below: `Reply` · `Save a copy` · and, quietly, "Keep your own moments" — an invitation, never a wall.

**Expired** — "This link has expired — ask Riya to resend it."
**Revoked** — neutral, unalarming.
**Not found** — identical to revoked, so nothing is disclosed.

---

## 12. Business Rules

- **No client components in this route.**
- Pre-delivery: sender name and date only. No media, no note, not even a thumbnail.
- The not-yet-due state is a countdown page, not an error.
- No account is ever required to view.
- `noindex, nofollow, noarchive`.
- Revoked and not-found are indistinguishable.
- `opened_at` is recorded server-side on render.

---

## 13. Edge Cases

- **JavaScript disabled — note and media must render.** The defining test.
- A token used before delivery — countdown page, and the media must be unreachable even by guessing a URL.
- A capsule cancelled before delivery — neutral revoked state.
- A very old browser with no CSS grid — the layout must degrade to a readable single column.
- Images blocked or media unsupported — the note must still carry the moment, and a download link must be present.
- A recipient opening the link repeatedly — `opened_at` records the first only; the sender is notified once.
- Several recipients sharing one link — not possible; each recipient has their own token.
- A recipient forwarding their link to someone else — it works, because it is a bearer token. Note this as a stated limit in the guarantee document rather than pretending otherwise.
- A media file still transcoding at delivery time — render the note and a processing state, and notify the sender; do not present a broken player at the emotional peak.
- Reduced motion — cross-fade instead of reveal.

---

## 14. Error Handling

- Every failure state is a designed page with warm copy. There is no scenario in which this page shows a stack trace or a bare 404.

---

## 15. Security Considerations

- Constant-time token comparison; version honoured.
- **Pre-delivery invisibility enforced through authz, not by omitting the markup.**
- Rate-limited per token and IP.
- `noindex` headers.
- Signed URLs minted server-side and short-lived.
- Forwardability is an accepted property of a bearer token; document it rather than implying it cannot happen.

---

## 16. Testing Requirements

### Integration Tests

- Pre-delivery token shows the countdown and no content.
- Cancelled capsule shows the neutral state.
- Repeated opens record `opened_at` once and notify once.
- Transcoding media renders the note plus a processing state.

### E2E Tests

- **Render with JavaScript disabled: note and media present, download link works.**
- Reveal runs with JavaScript enabled and is replaced by a cross-fade under reduced motion.

### Accessibility Tests

- axe with and without JavaScript; heading order sensible; media has accessible names; countdown exposes a machine-readable datetime.

### Security Tests

- **Pre-delivery media unreachable via the signed-URL endpoint using the recipient token.**
- Revoked and not-found responses are byte-identical.
- `noindex` headers present.

---

## 17. Acceptance Criteria

- [ ] **Page fully functional with JavaScript disabled, proven by test.**
- [ ] All five states implemented with designed copy, both themes.
- [ ] Pre-delivery shows sender and date only; media unreachable, proven by security test.
- [ ] Reveal is a progressive enhancement with a reduced-motion variant.
- [ ] No app chrome; no client components in the route.
- [ ] `opened_at` recorded server-side and the sender notified once.
- [ ] `noindex` headers present; revoked and not-found indistinguishable.
- [ ] Forwardability documented as a stated limit.
- [ ] axe clean in both JavaScript states.

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
TASK-059
    ↓
TASK-062
    ↓
TASK-065
```


---

## 20. Implementation Notes

- This is the page where restraint matters most. Every element added competes with the reason it exists.
- The no-JS requirement is not theoretical: it is what makes the twenty-year promise technically credible, and it is cheap to honour if done from the start.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-05-03-01-01](../EPIC-05-03-01-01.md).
3. Read the parent Sprint — [SPR-05-03-01](../../SPR-05-03-01.md).
4. Read the parent Module — [MOD-05-03](../../../MOD-05-03.md).
5. Read the parent Phase — [PHASE-05](../../../../PHASE-05.md).
6. Read the relevant blueprint sections: `§29.24`, `§11.4`, `ADR-002` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
