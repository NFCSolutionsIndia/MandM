# TASK-056 — Build Progressive Image and Adaptive Video Components

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-056 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-03 — Derivative Processing & Secure Delivery](../../../MOD-04-03.md) |
| Sprint | [SPR-04-03-01 — Derivatives, Metadata & Signed Delivery](../../SPR-04-03-01.md) |
| Epic | [EPIC-04-03-01-02 — Signed-URL Delivery & Media Components](../EPIC-04-03-01-02.md) |
| Type | frontend |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-055`, `TASK-053` |
| Blueprint refs | `§12.3`, `§12.7`, `§29.10` |

---

## 1. Objective

Build the media components: progressive images with blurhash and `srcset`, adaptive HLS video, and an audio player with waveform — all tolerant of expired URLs and slow connections.

---

## 2. Context

Blueprint §12.3 defines the four-tier loading order (blurhash → 320 thumb → 1280 preview → original) and §12.7 requires `Save-Data` and `effectiveType` awareness with deferred originals and deferred autoplay.

---

## 3. Problem Statement

These components are how the performance work in this phase reaches the user. They also carry a specific robustness requirement: a signed URL expires after five minutes, so a page left open must degrade to the blurhash rather than showing a broken image icon. Blueprint §29.7 (member list) already notes this expectation explicitly.

---

## 4. Expected Outcome

Three components used everywhere media appears, delivering instant blurhash placeholders, correct `srcset` selection, adaptive video, and graceful behaviour on expiry and on slow connections.

---

## 5. Requirements

### Functional Requirements

- `Img`: blurhash placeholder, `srcset` and `sizes` across the four widths, format negotiation via the browser's `Accept`, lazy loading, fixed aspect ratio.
- `Video`: HLS with adaptive start quality, poster frame, captions slot, and no autoplay on a metered connection.
- `AudioPlayer`: waveform scrubbing from the pre-computed data, with keyboard control.
- Expired signed URL falls back to the blurhash and silently refreshes.
- Processing state shown for assets still transcoding.

### Technical Requirements

- Fixed aspect-ratio containers so there is zero layout shift — this is what the PHASE-03 grid depends on.
- URL refresh driven by the expiry returned from the minting endpoint, pre-emptively rather than on failure.
- HLS via a lightweight player where the browser lacks native support; Safari plays HLS natively and should use that path.
- `Save-Data` and `effectiveType` gate original loading and autoplay.

---

## 6. Implementation Instructions

1. Build `Img` with a blurhash canvas or CSS placeholder beneath the real image, fading in on load. Fix the aspect ratio from stored dimensions so the box is correct before anything loads.
2. Generate `srcset` from the available variants and set `sizes` per usage context. Do not offer widths the asset does not have.
3. Implement pre-emptive URL refresh: track the expiry, refresh shortly before it, and on an unexpected 403 fall back to the blurhash and refresh once.
4. Build `Video` using native HLS on Safari and a lightweight player elsewhere. Start at a lower rung and let it climb (§12.2).
5. Suppress autoplay and defer original loading when `Save-Data` is set or `effectiveType` is slow (§12.7).
6. Build `AudioPlayer` rendering the pre-computed waveform, with click-to-seek and keyboard arrow seeking.
7. Implement the processing state for assets with `transcode_status` not yet ready, with a per-asset retry when failed.
8. Verify zero layout shift by measuring CLS with throttled media, as PHASE-03 requires of the grid.

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
apps/site/src/components/media/Img.tsx
apps/site/src/components/media/Video.tsx
apps/site/src/components/media/AudioPlayer.tsx
apps/site/src/components/media/Blurhash.tsx
apps/site/src/hooks/useSignedUrl.ts
apps/site/src/components/media/__tests__/img.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Img** — blurhash instantly, then the thumb, then the preview on detail view. Fixed aspect ratio box from stored dimensions, so nothing moves.

**Video** — poster frame, then adaptive playback starting low and climbing. On a metered connection, no autoplay and a tap-to-load affordance rather than a silent 40 MB download.

**AudioPlayer** — waveform with a progress fill, click or arrow-key to seek, duration readout. The waveform is decorative for assistive technology; duration and position are exposed as text.

**Processing state** — a calm "Still processing" with a spinner, not a broken tile. **Failed state** — a per-asset retry.

---

## 12. Business Rules

- Zero layout shift: aspect ratio fixed before load.
- An expired URL falls back to the blurhash, never a broken image icon.
- No autoplay and no original download on a metered or slow connection (§12.7).
- Never offer a `srcset` width the asset does not have.

---

## 13. Edge Cases

- A signed URL expiring while the page is open for an hour — pre-emptive refresh handles it; test by fast-forwarding the expiry.
- An asset still transcoding when first viewed — processing state, then automatic appearance when ready.
- A failed transcode — per-asset retry, not a broken player.
- A 900px source with a `sizes` request for 2048 — use the largest available.
- Safari native HLS versus the player library elsewhere — verify both paths.
- A video with no poster (extraction failed) — fall back to the blurhash rather than a black rectangle.
- `Save-Data` set — no autoplay, and originals require an explicit tap.
- A very long audio file — waveform data must be decimated for rendering, and seeking must remain accurate.
- Reduced motion — no fade-in animation on image load.

---

## 14. Error Handling

- A per-asset failure never replaces surrounding content; it shows inline with a retry.

---

## 15. Security Considerations

- Signed URLs only; a component must never construct a bucket URL.
- Captions and file names are user content: render as text.

---

## 16. Testing Requirements

### Component Tests

- **CLS is zero with throttled media loading.**
- blurhash renders before any network request.
- `srcset` contains only available widths.
- Expired URL falls back to blurhash and refreshes once.
- Processing state shown for a not-ready asset; resolves when ready.
- Failed asset shows a retry.
- `Save-Data` suppresses autoplay and original loading.
- Reduced motion disables the fade-in.

### E2E Tests

- Open a memory with a video on a throttled profile; playback starts at a low rung and climbs.

### Accessibility Tests

- axe on all three components; audio position exposed as text; video has a captions slot; waveform hidden from assistive technology.

---

## 17. Acceptance Criteria

- [ ] Three components implemented and used by the PHASE-03 screens.
- [ ] **Zero layout shift measured.**
- [ ] Expired URL falls back to blurhash and refreshes.
- [ ] Processing and failed states handled per asset.
- [ ] Adaptive video verified on Safari native and the fallback player.
- [ ] `Save-Data` behaviour correct.
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
TASK-055
    ↓
TASK-053
    ↓
TASK-056
```


---

## 20. Implementation Notes

- These components replace the PHASE-03 placeholders. Re-run the PHASE-03 grid benchmark after wiring them in, since real media changes the numbers.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-03-01-02](../EPIC-04-03-01-02.md).
3. Read the parent Sprint — [SPR-04-03-01](../../SPR-04-03-01.md).
4. Read the parent Module — [MOD-04-03](../../../MOD-04-03.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§12.3`, `§12.7`, `§29.10` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
