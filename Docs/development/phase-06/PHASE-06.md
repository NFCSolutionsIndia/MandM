# PHASE-06 — The apps — offline store, sync & background upload

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-06 |
| Phase name | The apps — offline store, sync & background upload |
| Release | Release 1 |
| Phase objective | Make the product a real installed app: launches without network, captures offline, syncs by itself. |
| Business objective | The marketing has already promised "iOS, Android and Web". This phase is where that promise becomes true with one codebase. |
| Technical objective | Manifest and install flow, WorkManager / URLSession background sync layer, offline reads from the on-device store, relocation of the upload drain into Background Sync, conflict resolution, and the deliberate offline seal block. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-05 |
| Estimated effort | ~2.5 weeks |
| Modules | 2 |
| Sprints | 3 |
| Epics | 3 |
| Tasks | 7 |
| Expected outcome | An installed app that opens instantly with no network, lets a user capture and create offline, and syncs cleanly on reconnection. |

---

## 1. Phase Purpose

PHASE-04 already built the durability half of offline: blobs land in the on-device store before any network call, and the outbox survives a reload. This phase completes the picture.

Two things make it more than configuration.

**Install becomes a functional requirement, not a nicety.** Blueprint §29.0 records that iOS 16.4+ delivers APNs / FCM **only to installed PWAs**. Since a scheduled-delivery product cannot function without notifications, and email is the guaranteed fallback, install promotion moves from marketing to engineering. §9.2 is equally clear about *when*: never on first load, only after the first successful save — "the moment the user has something worth keeping".

**Sealing stays blocked offline, on purpose.** Blueprint §9.4 lists it as the single deliberate exception in the offline matrix: "a promise that cannot be confirmed server-side must not be shown as sealed". Everything else — capture, create, edit, browse recent — works without a network.

---

## 2. Phase Goals

- The app installs on Android and, via the tailored walkthrough, on iOS.
- A cold launch with no network reaches a usable Home screen.
- Photos shared from the OS share sheet land in the create flow.
- Capture, memory creation, and edits all work offline and sync unattended.
- Sealing a capsule offline is blocked with an honest explanation and a preserved draft.
- A background-sync update never interrupts a recording or an upload.

---

## 3. Features Delivered

- Web App Manifest with maskable icons, shortcuts, and share target.
- Custom install card gated on first successful save, plus an iOS store install walkthrough.
- WorkManager / URLSession background sync layer with per-route-class caching and a thumbnail LRU.
- Offline reads of recent timeline, memories, and capsules from the on-device store.
- Background Sync drain of the PHASE-04 outbox.
- Conflict resolution with a user prompt.
- Update prompt that defers while work is in flight.
- Badging, Wake Lock, and Web Share integration.

---

## 4. Architecture Impact

- Relocates the outbox drain from the page into the background sync layer — the reason PHASE-04 kept `outbox.ts` free of page-only APIs.
- Introduces the caching contract every later screen inherits.
- Introduces `lib/capabilities` usage for install, share target, and badging (created in PHASE-03).

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-06-01](module-01/MOD-06-01.md) | Store release & platform integration | Make the first launch feel like a reward rather than a nag, and use the platform integrations a native app genuinely has. | critical | pending |
| [MOD-06-02](module-02/MOD-06-02.md) | background sync layer, Offline Reads & Sync | Deliver the §9.4 offline matrix exactly: full offline capture and creation, cached reads, and one deliberate block. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-05

- **PHASE-05** must be complete so the offline matrix can be honoured, including the seal block.
- **PHASE-04** outbox must exist and be free of page-only APIs.
- **External:** app icon and launch-screen assets from the design file (§36 store frames).

---

## 7. Phase Deliverables

- Manifest and icons
- Install flow with iOS variant
- Background sync layer
- Offline read layer
- Background Sync drain
- Update prompt

---

## 8. Phase Acceptance Criteria

- [ ] Airplane-mode cold launch reaches Home with cached content and an offline banner.
- [ ] Record a video offline, close the app, reconnect, and the memory appears uploaded without user action.
- [ ] Sealing offline is blocked with the documented copy and the draft survives.
- [ ] A background-sync update does not reload during an active upload.
- [ ] Cold-launch and scroll performance verified on a mid-range Android device.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| On-device cache serving stale authenticated data | high | Per-route-class strategies: API GETs network-first with cache fallback, never cache-first; no authenticated response cached beyond its route class; explicit tests for staleness. |
| An update reloading mid-upload and losing work | high | Update prompt defers while the outbox has in-flight items (§33.15); tested with an active upload. |
| Browser evicting the store despite persistence | medium | Persistence requested in PHASE-04 with an honest warning; missing-blob detection reports loss rather than retrying forever. |
| iOS install friction suppressing push adoption | high | Tailored walkthrough, install framed as a reward after first save, and email as the guaranteed channel for every critical notification. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder installs the app on their phone, turns on airplane mode, opens it, and records a memory
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§9.1`
- `§9.2`
- `§9.3`
- `§9.4`
- `§9.6`
- `§29.28`
- `ADR-013`
