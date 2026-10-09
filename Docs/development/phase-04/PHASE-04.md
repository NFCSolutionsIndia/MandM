# PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-04 |
| Phase name | Media Pipeline — Capture, Upload, Processing & Secure Delivery |
| Release | Release 1 |
| Phase objective | Get media from a phone into private storage without ever losing it, process it into fast variants, and serve it only to people entitled to see it. |
| Business objective | Media is the product and the entire cost base. A lost upload on a memory product is not a bug — it is a betrayal. |
| Technical objective | In-app capture, resumable presigned multipart upload with a local-first durability guarantee, FFmpeg/sharp derivative workers, and signed-URL delivery from private buckets. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-03 |
| Estimated effort | ~4 weeks |
| Modules | 3 |
| Sprints | 4 |
| Epics | 5 |
| Tasks | 11 |
| Expected outcome | A user can record a video on a phone with poor signal, kill the app mid-upload, reopen it, and the memory finishes uploading by itself. |

---

## 1. Phase Purpose

Blueprint §12 opens by saying media "is the product, and it is also the entire cost base and the main source of failure". This phase is where that risk is engineered away.

Three commitments drive every task here, and each is stated as a non-negotiable in blueprint §12.1 and the project plan:

**The local copy is written before the upload starts.** The recorded blob goes into the on-device store before any network call. From that instant the memory exists, and a crash, a dead battery, or a tunnel cannot take it away. Everything else in the pipeline is recovery, not rescue.

**The client never uploads through the application server.** Presigned direct-to-storage multipart only. An API server proxying 4K video is both a bottleneck and a cost error.

**No object in the bucket is ever publicly readable.** Every byte is served through a five-minute signed URL minted after an authorization check.

The fourth commitment is commercial as well as technical: **the original is never modified.** "High resolution, no compression, originals preserved" is an inherited promise and a real differentiator (§17.2 item 2), and blueprint Appendix C-6 overrode the designer's 720p free-tier cap specifically to keep it.

---

## 2. Phase Goals

- Record photo, video, and voice inside the installed app, with a working fallback on every browser.
- A recorded blob is durable locally before any network activity.
- An upload interrupted at 80% resumes from part rather than restarting.
- Originals are stored byte-for-byte and never altered.
- Derivatives (thumbnails, HLS ladder, waveform, blurhash) generate automatically and surface a processing state.
- GPS is stripped from EXIF by default.
- No bucket object is reachable without a freshly minted signed URL.

---

## 3. Features Delivered

- In-app capture for video, voice, and photo with codec negotiation.
- the on-device store-first durability and an upload outbox.
- Presigned multipart upload with three-way parallelism and resume.
- Upload queue UI with pause, resume, cancel, and retry.
- Worker-side derivative generation with an isolated container.
- EXIF extraction with GPS stripping.
- Signed-URL minting with rate limits, plus progressive image and HLS video components.

---

## 4. Architecture Impact

- Introduces Cloudflare R2 with the per-vault key layout that makes deletion, accounting, and export prefix operations (§12.5).
- Introduces the `UploadSession` entity that makes resumability possible at all.
- Introduces the media-processing worker with **no database credentials and no egress beyond storage** — FFmpeg parsing untrusted media is treated as hostile (§20.4).
- Introduces the the on-device store outbox that PHASE-06 generalises into full offline write support.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-04-01](module-01/MOD-04-01.md) | In-App Capture | Remove the gap between intention and artifact — and make the recorded blob durable before anything else happens. | critical | pending |
| [MOD-04-02](module-02/MOD-04-02.md) | Resumable Upload & Outbox | Make an interrupted upload an inconvenience rather than a loss, and make the queue visible and controllable. | critical | pending |
| [MOD-04-03](module-03/MOD-04-03.md) | Derivative Processing & Secure Delivery | Make media load quickly on a poor connection while keeping originals untouched and every byte behind an authorization check. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-03

- **PHASE-03** must have frozen the `MediaAsset` contract; `memories.cover_media_id` gains its foreign key here.
- **External:** R2 buckets provisioned with lifecycle rules, and a AWS ECS Fargate machine class sized for FFmpeg.
- **PHASE-01** worker registry and job table are the substrate for the processing handlers.

---

## 7. Phase Deliverables

- `MediaAsset` and `UploadSession` schema scoped through `lib/authz`.
- Capture components with codec fallback.
- Resumable uploader and outbox.
- Derivative workers.
- Signed-URL endpoint and media components.

---

## 8. Phase Acceptance Criteria

- [ ] Kill the app at 80% of a 200 MB video upload; reopening resumes from the last confirmed part and completes.
- [ ] Airplane mode: record a video, create the memory, restore connectivity, and the upload completes unattended.
- [ ] A stored original is byte-identical to the source file, verified by checksum.
- [ ] A direct request to a bucket object URL returns 403.
- [ ] An expired signed URL returns 403 and the UI falls back to the blurhash rather than a broken image.
- [ ] GPS data is absent from stored EXIF unless the user opted in.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A lost upload destroying user trust | critical | the on-device store-first durability, resumable multipart, idempotency by `client_id`, a visible queue, and `StorageManager.persist()` with a warning when denied. |
| FFmpeg RCE via a malicious upload | high | Isolated ephemeral containers, non-root, no DB credentials, no egress beyond storage, magic-byte validation, SVG rejected outright. |
| Storage and egress cost outrunning revenue | high | R2 for zero egress, per-user storage accounting from day one, and lifecycle tiering for cold originals. |
| iOS Safari codec differences producing unplayable recordings | high | Explicit codec negotiation with a tested fallback chain, plus the universal `<input capture>` path; verified on real devices. |
| Signed URLs leaking and being used as a public CDN | medium | Five-minute TTL, per-user minting rate limits, hotlink protection, and no enumerable key structure. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder records a 60-second video on their own phone in a lift, and it arrives intact
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§12`
- `§29.14`
- `§29.28`
- `§20.4`
- `ADR-007`
- `ADR-012`
- `ADR-013`
