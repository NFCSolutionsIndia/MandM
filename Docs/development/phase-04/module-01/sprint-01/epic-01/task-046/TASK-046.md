# TASK-046 — Implement Video and Photo Capture with Codec Negotiation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-046 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-01 — In-App Capture](../../../MOD-04-01.md) |
| Sprint | [SPR-04-01-01 — Capture Components & Local Durability](../../SPR-04-01-01.md) |
| Epic | [EPIC-04-01-01-01 — Capture Modes & Codec Negotiation](../EPIC-04-01-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-041` |
| Blueprint refs | `§29.14`, `§29.0`, `§12.1` |

---

## 1. Objective

Build video capture with camera controls and duration limits, photo multi-select with reorder, and an explicit codec negotiation chain with a universal fallback.

---

## 2. Context

Blueprint §29.14 specifies the controls and limits (Free 60s, Premium 5 min) and §29.0 records that `getUserMedia`/`MediaRecorder` "supports it with codec caveats — test HEVC/H.264 paths" on iOS Safari.

---

## 3. Problem Statement

Codec support genuinely differs: Chromium records VP9 in WebM with Opus audio, Safari records H.264 in MP4 with AAC, and asking for the wrong container silently produces a zero-byte or unplayable file. A user discovering that their recording of a dying relative is unplayable is the worst outcome this product can produce, so the negotiation must be explicit and the fallback must be real.

---

## 4. Expected Outcome

A capture component that negotiates the best supported format, records within plan limits, writes the blob to the on-device store before tearing down the recorder, and falls back to the native file input where recording is unsupported.

---

## 5. Requirements

### Functional Requirements

- Camera preview with front/rear flip and torch where supported.
- Self-timer (3s / 10s) and a composition grid.
- Duration limit by plan, shown as a ring progress that fills.
- Retake and confirm.
- Photo mode: multi-select up to 20, drag to reorder, per-photo duration for slideshow output.
- Fallback: `<input type="file" accept="image/*,video/*" capture>` where `MediaRecorder` is unavailable or fails.

### Technical Requirements

- Negotiate with `MediaRecorder.isTypeSupported` against an ordered chain: `video/mp4;codecs=avc1` → `video/webm;codecs=vp9,opus` → `video/webm` → unsupported.
- Record the chosen mime type alongside the blob so the worker knows what it received.
- **Write the blob to the on-device store before stopping the stream and unmounting** — the ordering matters, because a tab discarded during teardown must not take the recording with it.
- Screen Wake Lock held while recording, released on stop.
- Constraint negotiation: request a sensible resolution and fall back rather than failing when an ideal constraint is unsatisfiable.

---

## 6. Implementation Instructions

1. Create `lib/media/codec.ts` exporting the ordered negotiation chain and a `pickRecordingType()` function. Put the chain in one place so voice capture reuses the same logic.
2. Build the capture component with `getUserMedia`, requesting constraints with `ideal` rather than `exact` so an unsatisfiable value degrades instead of throwing.
3. Implement flip by re-acquiring the stream with the other `facingMode`; release the previous stream explicitly or the camera light stays on.
4. Implement the duration ring from the plan entitlement, stopping automatically at the limit with a clear message rather than a silent truncation.
5. **On stop: write the blob and its mime type to the on-device store, await the write, and only then release the stream.**
6. Implement photo multi-select with drag reorder, writing each selected file to the local store immediately.
7. Implement the fallback: if `pickRecordingType()` returns unsupported, or `getUserMedia` throws, render the file input path with no apology — it should look like a deliberate option.
8. Acquire and release the Wake Lock around recording, tolerating its absence.
9. Verify on a real iPhone and a real mid-range Android. Record the negotiated mime type on each in §20.

---

## 7. Architecture

```text
pickRecordingType()
  video/mp4;codecs=avc1     ← Safari
  video/webm;codecs=vp9,opus ← Chromium
  video/webm
  unsupported ──▶ <input type="file" capture>  (universal fallback)

record ──▶ stop ──▶ WRITE FILE TO THE APP SANDBOX (awaited) ──▶ release stream
                          │
                          └─ the memory now exists, independent of the tab
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/api/src/lib/media/codec.ts
apps/api/src/lib/media/local-store.ts
apps/api/src/features/media/components/VideoCapture.tsx
apps/api/src/features/media/components/PhotoPicker.tsx
apps/api/src/features/media/components/CaptureFallback.tsx
apps/site/src/hooks/useWakeLock.ts
apps/api/src/lib/media/__tests__/codec.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Per §29.14. Full-bleed preview, controls at the bottom third for thumb reach.

Ring progress around the record button fills toward the plan limit. At the limit, recording stops with a message naming the limit and the upgrade path — never a silent cut.

Photo mode: a grid with selection order badges and drag reorder. Cap at 20 with the count shown, not a silent stop.

Fallback path presented as a normal option, not an error state.

---

## 12. Business Rules

- **The blob is written to the on-device store before the stream is released.** No exceptions.
- Duration limits stop recording with an explanation; they never truncate silently.
- The fallback path is always available and never framed as a failure.
- The camera stream is explicitly released; a lingering camera indicator is a trust problem on this product.

---

## 13. Edge Cases

- iOS Safari returning a supported type that then produces a zero-byte blob — validate the blob size after stop and fall back with a clear message if it is empty.
- A user backgrounding the app mid-recording — the recorder may be suspended; detect and finalise what exists rather than discarding it.
- Camera permission granted then revoked at OS level mid-session — handle the stream ending unexpectedly.
- A device with no rear camera, or no camera at all.
- Torch unsupported — hide the control rather than showing a dead one.
- A very long recording nearing device storage limits — surface a warning; do not fail at the end.
- Photo selection of 60 files when the cap is 20 — take the first 20 and say so (§33 no silent caps).
- A HEIC photo from an iPhone — accept it; the worker converts. Do not reject it in the client.
- Wake Lock unavailable — proceed without it.

---

## 14. Error Handling

- A failed recording must never leave the user with nothing: if a blob exists at all, keep it and offer it.
- Permission denial routes immediately to the upload path with a one-line explanation.

---

## 15. Security Considerations

- Permission primer before the browser prompt (§29.28).
- The stream is released on unmount and on route change; a camera left running is both a privacy problem and a battery problem.
- Blobs in the on-device store are unencrypted at rest on the device; note this and rely on the PHASE-08 app lock plus OS-level device encryption. Record the reasoning in §20 rather than implying protection that does not exist.

---

## 16. Testing Requirements

### Unit Tests

- Negotiation chain returns the expected type for mocked Chromium and Safari support matrices, and `unsupported` when nothing matches.

### Component Tests

- Recording writes to the local store before releasing the stream (assert call order).
- Duration limit stops recording with a message.
- Photo cap of 20 reports the excess rather than silently dropping it.
- Permission denial renders the fallback path.
- Unmount releases the stream.

### E2E Tests

- Record a short video, reload the page mid-flow, and confirm the take is still present in the local store.

### Accessibility Tests

- axe on the capture screen; the record button has an accessible name and state; the timer is announced coarsely.

---

## 17. Acceptance Criteria

- [ ] Video and photo capture work on iOS Safari and Android Chrome, with the negotiated type recorded in §20 for each.
- [ ] Blob written to the on-device store before stream release, proven by call-order assertion.
- [ ] A forced reload after a completed take does not lose it.
- [ ] Duration and count caps explained, never silent.
- [ ] Fallback path functional and not framed as an error.
- [ ] Stream released on unmount, verified.
- [ ] Zero-byte-blob defence in place.
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
TASK-041
    ↓
TASK-046
```


---

## 20. Implementation Notes

- Record the negotiated mime type per device in §20 — the worker's transcode matrix in MOD-04-03 depends on knowing what actually arrives.
- The zero-byte-blob check exists because `isTypeSupported` returning true is not a guarantee on every engine. Do not remove it as redundant.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-01-01-01](../EPIC-04-01-01-01.md).
3. Read the parent Sprint — [SPR-04-01-01](../../SPR-04-01-01.md).
4. Read the parent Module — [MOD-04-01](../../../MOD-04-01.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§29.14`, `§29.0`, `§12.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
