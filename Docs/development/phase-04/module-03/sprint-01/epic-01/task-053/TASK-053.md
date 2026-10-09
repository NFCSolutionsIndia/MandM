# TASK-053 — Implement Image Derivative and Blurhash Generation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-053 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-03 — Derivative Processing & Secure Delivery](../../../MOD-04-03.md) |
| Sprint | [SPR-04-03-01 — Derivatives, Metadata & Signed Delivery](../../SPR-04-03-01.md) |
| Epic | [EPIC-04-03-01-01 — Derivative Generation & Metadata Extraction](../EPIC-04-03-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-049` |
| Blueprint refs | `§12.2`, `§12.3`, `§12.4`, `ADR-012` |

---

## 1. Objective

Build the image processing handler: four widths in AVIF, WebP, and JPEG, plus blurhash, EXIF extraction with GPS stripping, and correct rotation and colour handling.

---

## 2. Context

Blueprint §12.2 specifies "AVIF → WebP → JPEG by `Accept`; widths 320/640/1280/2048; `srcset` + `sizes`; blurhash placeholder" and §12.4 requires GPS discarded unless the user opted in.

---

## 3. Problem Statement

The blurhash is what makes the grid feel instant — it is roughly 30 bytes, ships inline in the API payload, and renders before any network request for media. Rotation is the classic correctness trap: a phone photo with an EXIF orientation flag renders sideways if the flag is dropped during resize, and users notice immediately.

---

## 4. Expected Outcome

A handler producing twelve variants per image plus a blurhash, extracting metadata with GPS removed, honouring EXIF orientation, and leaving the original byte-identical.

---

## 5. Requirements

### Functional Requirements

- Widths 320, 640, 1280, 2048, each in AVIF, WebP, and JPEG.
- Blurhash computed and stored on the asset.
- EXIF extracted: dimensions, `DateTimeOriginal`, camera, lens, orientation. **GPS discarded unless opted in.**
- `captured_at` populated from `DateTimeOriginal`, which pre-fills `occurred_at`.
- HEIC and HEIF inputs converted.
- `transcode_status` moves to `ready` or `failed`, with the failure reason available to the UI.

### Technical Requirements

- sharp with `rotate()` applied from EXIF before resizing, so orientation is baked into derivatives.
- Never upscale: a 900px source produces 320 and 640 only.
- Colour profile handling: convert to sRGB for derivatives so wide-gamut originals do not render dull or oversaturated in browsers.
- The original is read-only. Derivatives are written to new keys (§12.1).
- Bounded memory: process with streams and a pixel-count ceiling so a decompression-bomb image cannot exhaust the container.

---

## 6. Implementation Instructions

1. Create `apps/workers/src/handlers/process-image.ts` receiving the asset id and storage key in the job payload.
2. Download the original to a temp path, read metadata with sharp, and **apply `rotate()` from EXIF before any resize**.
3. Generate the twelve variants, skipping widths above the source dimension. Convert to sRGB.
4. Compute the blurhash from a small downscale, not the full image.
5. Extract EXIF. **Strip GPS fields unless the user has opted into location.** Default is stripped (§12.4). Store the remainder as JSON.
6. Populate `captured_at` from `DateTimeOriginal` when present.
7. Enforce a pixel-count ceiling and reject beyond it with a clear status, to defend against decompression bombs.
8. Update the asset with variant keys, blurhash, dimensions, exif, and `transcode_status`, via the narrow callback rather than a direct database connection.
9. Write the originals-unchanged test: checksum the original before and after processing.

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
apps/workers/src/handlers/process-image.ts
apps/workers/src/lib/image.ts
apps/workers/src/lib/exif.ts
apps/workers/src/lib/blurhash.ts
apps/workers/src/handlers/__tests__/process-image.test.ts
```

---

## 9. Data Model

Updates `media_assets`: `thumb_key`, `preview_key`, `blurhash`, `width`, `height`, `captured_at`, `exif`, `transcode_variants`, `transcode_status`.

**GPS is stripped by default** (§12.4). The `exif` JSON contains camera, lens, orientation, and `DateTimeOriginal` — never coordinates, unless the user has explicitly opted into location.

**`captured_at` pre-fills `occurred_at`**, which is what makes importing an old archive land on the correct timeline dates rather than collapsing into today (§12.4).

**The original is never modified.** Derivatives are new keys. A checksum test asserts this.

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **The original is read-only.**
- EXIF orientation is applied before resizing.
- GPS is stripped unless opted in.
- Never upscale.
- Derivatives are sRGB.

---

## 13. Edge Cases

- A photo with EXIF orientation 6 (rotated 90°) — derivatives must be upright; test with a real rotated file.
- A wide-gamut Display-P3 photo — convert to sRGB or it renders wrong in most browsers.
- A HEIC from an iPhone — convert; do not reject.
- A CMYK TIFF — convert to sRGB.
- An animated GIF or WebP — decide and document: first frame only, or preserve animation. Recommend first frame for thumbs and preserve the original.
- A decompression bomb (small file, enormous pixel count) — pixel ceiling rejects it.
- A 900px source — produce 320 and 640 only; do not fabricate a 2048.
- A corrupt file that sharp cannot read — mark failed with a reason the UI can show ("This image could not be processed"), not a silent stall.
- A file with no EXIF at all — `captured_at` stays null and `occurred_at` defaults to the user's entry.

---

## 14. Error Handling

- A processing failure sets `transcode_status = failed` with a reason, and the UI shows a per-asset retry rather than a broken tile.

---

## 15. Security Considerations

- Container is non-root, has no database credentials, and no network egress beyond storage (§20.4).
- Pixel ceiling defends against decompression bombs.
- GPS stripping is a privacy control, not an optimisation.
- Temp files are removed even on failure.

---

## 16. Testing Requirements

### Unit Tests

- Blurhash produced from a downscale, not the full image.
- Width selection never upscales.

### Integration Tests

- **Original checksum unchanged after processing.**
- EXIF orientation 6 produces upright derivatives.
- Display-P3 input produces correct sRGB output.
- HEIC converts.
- **GPS absent from stored EXIF by default; present only when opted in.**
- `captured_at` populated from `DateTimeOriginal`.
- Decompression bomb rejected by the pixel ceiling.
- Corrupt file marked failed with a reason.

### Security Tests

- Container runs as non-root with no DB credentials, verified by inspection.

---

## 17. Acceptance Criteria

- [ ] Twelve variants plus blurhash produced for a typical photo.
- [ ] **Original byte-identical after processing.**
- [ ] Orientation and colour handled correctly, verified with real files.
- [ ] GPS stripped by default, present only on opt-in.
- [ ] `captured_at` populated.
- [ ] Pixel ceiling rejects a bomb.
- [ ] Failures surface with a reason.
- [ ] Container non-root, no DB credentials, no egress beyond storage.

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
TASK-049
    ↓
TASK-053
```


---

## 20. Implementation Notes

- Test orientation and colour with real camera files, not synthesised ones. Both bugs are invisible in synthetic tests and obvious to users.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-03-01-01](../EPIC-04-03-01-01.md).
3. Read the parent Sprint — [SPR-04-03-01](../../SPR-04-03-01.md).
4. Read the parent Module — [MOD-04-03](../../../MOD-04-03.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§12.2`, `§12.3`, `§12.4`, `ADR-012` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
