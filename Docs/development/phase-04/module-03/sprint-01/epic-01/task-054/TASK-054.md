# TASK-054 — Implement Video HLS Transcoding and Audio Normalisation

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-054 |
| Phase | [PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery](../../../../PHASE-04.md) |
| Module | [MOD-04-03 — Derivative Processing & Secure Delivery](../../../MOD-04-03.md) |
| Sprint | [SPR-04-03-01 — Derivatives, Metadata & Signed Delivery](../../SPR-04-03-01.md) |
| Epic | [EPIC-04-03-01-01 — Derivative Generation & Metadata Extraction](../EPIC-04-03-01-01.md) |
| Type | backend |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-049` |
| Blueprint refs | `§12.2`, `§20.4`, `ADR-012` |

---

## 1. Objective

Build the video and audio handlers: HLS ladder with poster frame, audio normalised to AAC with a waveform, in an isolated container.

---

## 2. Context

Blueprint §12.2 specifies "HLS with an adaptive ladder; a poster frame; a ~2s silent muted preview loop for grid hover" for video, and "128kbps AAC plus a pre-computed waveform for instant scrub UI" for audio. ADR-012 requires containerised workers because "video transcoding is long-running and CPU-heavy — the wrong shape for serverless".

---

## 3. Problem Statement

The security posture matters as much as the output here. FFmpeg parsing untrusted media is a known remote-code-execution surface, and this product invites strangers to upload video through collaborative capsules in Release 2. Blueprint §20.4 requires the container to run with no database credentials and no network egress beyond storage, and that is a design constraint on how work reaches the handler.

---

## 4. Expected Outcome

Handlers producing an adaptive HLS ladder, poster frame, hover-preview loop, normalised audio, and a waveform — in a container that could not exfiltrate data even if FFmpeg were compromised.

---

## 5. Requirements

### Functional Requirements

- HLS ladder at 480p, 720p, 1080p, and 2160p where the source supports it.
- Poster frame extracted at a sensible offset (not frame zero, which is often black).
- A short silent muted loop for grid hover.
- Audio normalised to 128 kbps AAC with loudness normalisation.
- Waveform JSON pre-computed for instant scrubbing.
- Trim range from voice capture applied to the derivative only.
- `transcode_status` and progress surfaced.

### Technical Requirements

- Never upscale: a 720p source produces 480p and 720p only.
- Two-pass or CRF encoding chosen for consistent quality; document which and why.
- Hardware acceleration only if it is available and deterministic; otherwise CPU, since correctness beats speed here.
- Container: non-root, read-only root filesystem where possible, no database credentials, egress restricted to storage.
- A per-job timeout and a memory ceiling so one pathological file cannot occupy a machine indefinitely.

---

## 6. Implementation Instructions

1. Create `process-video.ts` and `process-audio.ts` handlers taking the asset id and key from the job payload.
2. Build the HLS ladder with FFmpeg, skipping rungs above the source resolution. Write the playlist and segments under the asset's key prefix.
3. Extract the poster frame at a small offset rather than 0s, and pick a frame that is not near-black where cheaply detectable.
4. Generate the short muted loop for grid hover.
5. For audio: normalise loudness, encode to AAC, apply the stored trim range **to the derivative only**, and compute the waveform.
6. Report progress on long jobs so the UI can show something better than an indefinite spinner.
7. Enforce a per-job timeout and memory ceiling; a job that exceeds them fails with a clear reason.
8. Harden the container: non-root user, dropped capabilities, no DB credentials, and egress limited to the storage endpoint. **Verify the egress restriction by attempting an outbound request from inside the container and confirming it fails.**
9. Write the failure-surfacing test: a corrupt video marks the asset failed with a reason the UI displays.

---

## 7. Architecture

```text
job payload { assetId, storageKey }   ← no DB credentials in this container
        ▼
FFmpeg (non-root, no egress except storage, timeout + memory ceiling)
        ├─ HLS ladder 480/720/1080/2160 (never upscaled)
        ├─ poster frame (offset, not frame 0)
        ├─ hover loop (short, silent)
        └─ audio: loudness-normalised AAC + waveform JSON
        ▼
narrow authenticated callback ──▶ update media_assets (variants, status)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/workers/src/handlers/process-video.ts
apps/workers/src/handlers/process-audio.ts
apps/workers/src/lib/ffmpeg.ts
apps/workers/src/lib/waveform.ts
apps/workers/Dockerfile  (harden)
apps/workers/src/handlers/__tests__/process-video.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **The original is read-only.** Trim is applied to derivatives only.
- Never upscale.
- The container has no database credentials and no egress beyond storage (§20.4).
- Every job has a timeout and a memory ceiling.

---

## 13. Edge Cases

- A near-black opening frame — poster extraction must pick something usable.
- A source with no audio track — audio steps must be skipped, not failed.
- A variable-frame-rate phone recording — normalise or the HLS segments drift; this is a common iPhone case.
- A rotated video (rotation metadata rather than rotated pixels) — apply it, or playback is sideways.
- HDR video — tone-map for SDR rungs or it looks washed out; document the decision.
- A 4-hour video — the timeout fails it with a clear message; consider a duration cap at upload rather than discovering it here.
- A file whose container says MP4 but whose codec is unsupported — fail with a reason naming the codec.
- A zero-length or truncated file — fail cleanly.
- Two jobs for the same asset (duplicate enqueue) — idempotent: writing the same variants twice is acceptable, but status transitions must not thrash.

---

## 14. Error Handling

- A failure sets `failed` with a reason the UI shows per asset. A timeout is a distinct reason from a codec failure, because the user's remedy differs.

---

## 15. Security Considerations

- **Egress restriction verified by test from inside the container.**
- Non-root, dropped capabilities, temp files cleaned on failure.
- No database credentials — results are written through a narrow authenticated callback, so a compromised FFmpeg cannot read or write arbitrary data.

---

## 16. Testing Requirements

### Integration Tests

- HLS ladder produced with correct rungs; no upscaling.
- Poster frame is not near-black.
- Rotated video produces upright output.
- Source with no audio track processes successfully.
- Variable-frame-rate input produces playable segments.
- Corrupt file marks failed with a reason.
- Timeout fails with a distinct reason.
- Duplicate job does not thrash status.
- Audio trim applied to derivative only; original checksum unchanged.

### Security Tests

- **An outbound request from inside the container fails**, proving the egress restriction.

---

## 17. Acceptance Criteria

- [ ] HLS ladder, poster, hover loop, normalised audio, and waveform all produced.
- [ ] Originals byte-identical.
- [ ] Rotation and VFR handled; poster frame usable.
- [ ] Timeout and memory ceiling enforced with distinct failure reasons.
- [ ] **Container egress restriction verified by test.**
- [ ] Non-root with no database credentials, verified.
- [ ] Failures surface per asset in the UI.
- [ ] HDR decision documented.

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
TASK-054
```


---

## 20. Implementation Notes

- Variable frame rate from iPhones is the most common real-world cause of broken HLS. Test with an actual iPhone recording.
- The egress test is worth the effort: it is the difference between a documented security posture and an assumed one.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-04-03-01-01](../EPIC-04-03-01-01.md).
3. Read the parent Sprint — [SPR-04-03-01](../../SPR-04-03-01.md).
4. Read the parent Module — [MOD-04-03](../../../MOD-04-03.md).
5. Read the parent Phase — [PHASE-04](../../../../PHASE-04.md).
6. Read the relevant blueprint sections: `§12.2`, `§20.4`, `ADR-012` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
