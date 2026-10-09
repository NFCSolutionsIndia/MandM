# TASK-047 — Implement Voice Capture with Waveform and Trim

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-047 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-01 — In-App Capture](../../../MOD-04-01.md) |
| Sprint | [SPR-04-01-01 — Capture Components & Local Durability](../../SPR-04-01-01.md) |
| Epic | [EPIC-04-01-01-01 — Capture Modes & Codec Negotiation](../EPIC-04-01-01-01.md) |
| Type | frontend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-046` |
| Blueprint refs | `§29.14`, `§2.1` |

---

## 1. Objective

Build voice capture with a live waveform, pause and resume, a ten-minute cap, and playback trim handles.

---

## 2. Context

Blueprint §29.14 specifies: "large record button with a live waveform, pause/resume, max 10 min, playback with trim handles". Section §2.1 identifies voice as central to the product's emotional value.

---

## 3. Problem Statement

Voice is the highest-value, lowest-effort content this product can capture, and blueprint §7.2 (V1.10) calls attaching voice to old photos "the single highest-value archival act — capturing the story before it is lost". Making recording feel effortless and reliable is disproportionately valuable relative to the code involved.

---

## 4. Expected Outcome

A voice recorder with a live waveform that reflects real input, pause and resume that produces one continuous file, a ten-minute cap, and trim handles that adjust the stored range without re-encoding on the client.

---

## 5. Requirements

### Functional Requirements

- Large record button; live waveform driven by real audio levels.
- Pause and resume producing a single continuous recording.
- Ten-minute maximum with a visible remaining indicator.
- Playback with trim handles; the trim is stored as a range, not applied destructively on the client.
- Re-record replaces the take after confirmation.

### Technical Requirements

- Audio codec negotiated using the shared chain: `audio/mp4;codecs=mp4a` for Safari, `audio/webm;codecs=opus` for Chromium.
- Waveform from an `AnalyserNode`, sampled at a rate that looks alive without pinning the main thread.
- Pause/resume via `MediaRecorder.pause()`/`resume()` where supported; where not, concatenate segments and record that in §20.
- Trim persisted as start and end offsets; the worker applies it when producing the normalised derivative, so the original stays intact (§12.1 originals rule).
- Blob written to the on-device store before teardown, as in TASK-047.

---

## 6. Implementation Instructions

1. Reuse `lib/media/codec.ts` for audio negotiation rather than duplicating the chain.
2. Build the recorder with an `AnalyserNode` feeding the waveform. Sample on an animation frame but decimate the data — drawing every sample is what makes a waveform janky.
3. Implement pause/resume. Test it specifically: support is uneven, and a naive implementation produces two files or a silent gap.
4. Show remaining time rather than only elapsed, so the cap is never a surprise.
5. Implement trim as a stored range. **Do not re-encode on the client** — it is slow, lossy, and violates the originals rule. The worker applies the trim to the derivative and leaves the original whole.
6. Write the blob and the trim range to the local store before teardown.
7. Add a clear re-record confirmation, since discarding a two-minute story by accident is a bad experience.

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
apps/api/src/features/media/components/VoiceCapture.tsx
apps/api/src/features/media/components/Waveform.tsx
apps/api/src/features/media/components/TrimHandles.tsx
apps/api/src/lib/media/audio-analyser.ts
apps/api/src/features/media/__tests__/voice-capture.test.tsx
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

Large centred record button. Live waveform above it, drawn from real levels so the user can see they are being heard — a static or fake waveform undermines confidence immediately.

Remaining time shown, not just elapsed. Pause produces a visibly paused state, not an ambiguous one.

After recording: playback with trim handles at both ends, and a duration readout that reflects the trim.

Re-record requires confirmation.

---

## 12. Business Rules

- Trim is a stored range; the original audio is never modified on the client (§12.1).
- The waveform reflects real input levels.
- The blob is written locally before teardown.
- Re-record is confirmed.

---

## 13. Edge Cases

- Pause/resume unsupported — fall back to segment concatenation, and document the approach in §20.
- A silent recording (muted microphone at OS level) — detect near-zero levels and warn before the user records for two minutes into nothing. This is worth the effort; it is a common and demoralising failure.
- Microphone permission granted but the device has no working input.
- Reaching the ten-minute cap — stop cleanly and keep everything recorded.
- Trim handles dragged to a zero-length range — enforce a minimum and prevent it.
- Backgrounding mid-recording — finalise what exists.
- A Bluetooth headset disconnecting mid-recording — the stream ends; keep the audio captured so far.
- Waveform on a low-end device — decimate rather than dropping frames.

---

## 14. Error Handling

- If recording fails partway, keep what exists and offer it rather than discarding. Partial audio is far better than none.

---

## 15. Security Considerations

- Permission primer before the prompt.
- Microphone stream released explicitly on unmount.

---

## 16. Testing Requirements

### Component Tests

- Waveform responds to mocked analyser data.
- Pause and resume produce one continuous recording of the expected duration.
- Cap stops recording and preserves the audio.
- Trim range is stored, not applied to the blob (assert the blob is unchanged).
- Near-silent input triggers a warning.
- Unmount releases the stream.

### E2E Tests

- Record 20 seconds with a pause in the middle, trim both ends, and confirm the stored range and the intact original.

### Accessibility Tests

- axe; record button state announced; the waveform is decorative and hidden from assistive technology, with duration exposed as text.

---

## 17. Acceptance Criteria

- [ ] Voice capture works on both engines with the negotiated type recorded in §20.
- [ ] Pause and resume produce one continuous file, verified.
- [ ] Trim stored as a range with the original untouched, proven by test.
- [ ] Silent-input warning implemented.
- [ ] Cap stops cleanly and preserves audio.
- [ ] Blob written locally before teardown.
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
TASK-046
    ↓
TASK-047
```


---

## 20. Implementation Notes

- The silent-microphone warning is not in the blueprint but is worth adding: recording ten minutes of nothing is a uniquely disheartening failure on a product about preserving a voice.
- Record the pause/resume approach taken in §20.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-01-01-01](../EPIC-04-01-01-01.md).
3. Read the parent Sprint — [SPR-04-01-01](../../SPR-04-01-01.md).
4. Read the parent Module — [MOD-04-01](../../../MOD-04-01.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§29.14`, `§2.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
