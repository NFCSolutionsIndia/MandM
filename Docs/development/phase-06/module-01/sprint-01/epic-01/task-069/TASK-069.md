# TASK-069 — Create Web App Manifest with Icons, Shortcuts and Share Target

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-069 |
| Phase | [PHASE-06 — The apps — offline store, sync & background upload](../../../../PHASE-06.md) |
| Module | [MOD-06-01 — Store release & platform integration](../../../MOD-06-01.md) |
| Sprint | [SPR-06-01-01 — Store listings, first launch & share extension](../../SPR-06-01-01.md) |
| Epic | [EPIC-06-01-01-01 — Store listings, icons & first-launch experience](../EPIC-06-01-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-002` |
| Blueprint refs | `§9.2`, `§9.6` |

---

## 1. Objective

Create the manifest with a stable id, standalone display, brand colours, maskable icons, app shortcuts, and a share-target declaration.

---

## 2. Context

Blueprint §9.2 specifies the full manifest: `display: standalone`, a stable `id`, `start_url: /app`, brand `theme_color` and `background_color`, maskable icons at 192 and 512, shortcuts for **Add a moment** and **Timeline**, and `share_target` so the OS share sheet can send media into the app.

---

## 3. Problem Statement

The manifest is the difference between a bookmark and an app. Two details are easy to get wrong: a missing stable `id` means a later manifest change can be treated as a different app and orphan the installed instance, and non-maskable icons get letterboxed or cropped badly on Android adaptive-icon launchers.

---

## 4. Expected Outcome

A valid manifest producing a correctly-branded standalone install on Android and iOS, with working shortcuts and a share target route.

---

## 5. Requirements

### Functional Requirements

- Stable `id`, `name`, `short_name`, `description`.
- `display: standalone`, `start_url: /app`, `scope: /`.
- `theme_color` and `background_color` from the §26.3 tokens (plum background, per the splash design).
- Icons: 192 and 512 in both `any` and `maskable` purposes, plus `apple-touch-icon` and iOS splash images.
- Shortcuts: Add a moment (`/app/new`), Timeline (`/app/timeline`).
- `share_target` accepting images and videos via POST multipart.

### Technical Requirements

- Generated via `app/manifest.ts` so tokens and copy come from one source.
- Maskable icons designed with the required safe zone — a logo filling the full square gets clipped on adaptive launchers.
- `theme_color` should suit both themes or be paired with a `media` variant where supported.
- Share target handler accepts files and redirects into the create flow with them staged.

---

## 6. Implementation Instructions

1. Create `apps/site/src/app/manifest.ts` returning the manifest, pulling colours from the token constants rather than hard-coding hex values.
2. Set a stable `id` and record in §20 that it must never change, because changing it orphans existing installs.
3. Produce the icon set including maskable variants with correct safe-zone padding. Verify on an Android launcher with circular masking.
4. Add `apple-touch-icon` links and iOS splash images in the root layout, since iOS ignores the manifest for these.
5. Declare the two shortcuts and verify they appear on long-press of the installed icon.
6. Declare `share_target` with `method: POST`, `enctype: multipart/form-data`, accepting `image/*` and `video/*`.
7. Validate the manifest with a linter and with Chrome's install criteria; record any warnings in §20.

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
apps/site/src/app/manifest.ts
apps/site/public/icons/  (192, 512, maskable variants)
apps/site/public/splash/  (iOS splash images)
apps/site/src/app/layout.tsx  (apple-touch-icon, splash links)
apps/site/src/app/__tests__/manifest.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Icons must read correctly at 48px on a home screen and under circular masking. The maskable variant needs the logo inside the safe zone — a common failure is a full-bleed logo losing its edges on adaptive launchers.

Splash uses the plum `background_color` from §26.3, matching the TASK-046 splash design so launch feels continuous.

---

## 12. Business Rules

- The manifest `id` never changes.
- Colours come from tokens, not literals.
- Maskable icons respect the safe zone.
- `start_url` is `/app`, so an installed launch lands in the product, not on marketing.

---

## 13. Edge Cases

- A user installing while signed out — `/app` redirects to login with `next` preserved; verify the installed launch handles this cleanly rather than looping.
- iOS ignoring `theme_color` and shortcuts — the walkthrough and meta tags cover what they can.
- A launcher that crops aggressively — maskable safe zone handles it; verify visually.
- A dark-mode device with a light `theme_color` — decide whether to vary it and record the choice.
- Manifest served with the wrong content type — verify the response headers.

---

## 14. Error Handling

- An invalid manifest silently disables install. The lint test in CI is what prevents that being discovered by a user.

---

## 15. Security Considerations

- `scope` must not be broader than needed; a scope of `/` is correct here because the app spans route groups, but note it.

---

## 16. Testing Requirements

### Unit Tests

- Manifest contains all required fields and valid icon entries.

### E2E Tests

- Chrome install criteria satisfied; installed launch reaches `/app`.

---

## 17. Acceptance Criteria

- [ ] Manifest valid and passing install criteria on Android Chrome.
- [ ] Maskable icons verified under circular masking.
- [ ] Shortcuts appear and work.
- [ ] iOS touch icon and splash present.
- [ ] `start_url` lands in the app; signed-out launch handled.
- [ ] Stable `id` documented as immutable in §20.

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
TASK-002
    ↓
TASK-069
```


---

## 20. Implementation Notes

- Record the `id` prominently. Changing it later is one of those mistakes that only surfaces as "why did all our installs disappear".

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-06-01-01-01](../EPIC-06-01-01-01.md).
3. Read the parent Sprint — [SPR-06-01-01](../../SPR-06-01-01.md).
4. Read the parent Module — [MOD-06-01](../../../MOD-06-01.md).
5. Read the parent Phase — [PHASE-06](../../../../PHASE-06.md).
6. Read the relevant blueprint sections: `§9.2`, `§9.6` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
