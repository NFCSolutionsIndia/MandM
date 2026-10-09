# Development Index — Moments & Memories

> Primary navigation for the engineering execution plan. Product source of truth: [MM_PWA_BLUEPRINT.md](../../MM_PWA_BLUEPRINT.md).

| Document | Purpose |
|---|---|
| [00_PROJECT_PLAN.md](00_PROJECT_PLAN.md) | Top-level plan, phase map, sequencing |
| [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) | Every architectural decision + reasoning |
| [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md) | Live dashboard, current position, next task |
| [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md) | Blueprint requirement → task mapping |
| [REQUIREMENT_GAP_ANALYSIS.md](REQUIREMENT_GAP_ANALYSIS.md) | Ambiguities, conflicts, assumptions, open questions |
| [CONVENTIONS.md](CONVENTIONS.md) | Coding, naming, testing, and status conventions |

**Totals:** 12 phases · 36 modules · 36 sprints · 45 epics · **104 tasks**

---

## PHASE-01 — Foundation & Architecture  `Release 1`

- [PHASE-01](phase-01/PHASE-01.md)

### MOD-01-01 — Repository, Toolchain & Data Layer

- [MOD-01-01](phase-01/module-01/MOD-01-01.md)

#### SPR-01-01-01 — Monorepo & Application Scaffold

- [SPR-01-01-01](phase-01/module-01/sprint-01/SPR-01-01-01.md)

##### EPIC-01-01-01-01 — Workspace & Package Scaffold

- [EPIC-01-01-01-01](phase-01/module-01/sprint-01/epic-01/EPIC-01-01-01-01.md)

  - [TASK-001](phase-01/module-01/sprint-01/epic-01/task-001/TASK-001.md) — Initialise pnpm + Turborepo Workspace `devops`
  - [TASK-002](phase-01/module-01/sprint-01/epic-01/task-002/TASK-002.md) — Scaffold Next.js 16 Web Application with Route Groups `frontend`
  - [TASK-003](phase-01/module-01/sprint-01/epic-01/task-003/TASK-003.md) — Scaffold Independently Deployable Workers Service `backend`
  - [TASK-004](phase-01/module-01/sprint-01/epic-01/task-004/TASK-004.md) — Create Shared Package: Result Envelope, Zod Base, Domain Constants `backend`

##### EPIC-01-01-01-02 — CI/CD, Environments & Observability

- [EPIC-01-01-01-02](phase-01/module-01/sprint-01/epic-02/EPIC-01-01-01-02.md)

  - [TASK-005](phase-01/module-01/sprint-01/epic-02/task-005/TASK-005.md) — Configure CI Pipeline with Blocking Quality Gates `devops`
  - [TASK-006](phase-01/module-01/sprint-01/epic-02/task-006/TASK-006.md) — Provision AWS Infrastructure, Environments, and Per-PR Database Schemas `devops`
  - [TASK-007](phase-01/module-01/sprint-01/epic-02/task-007/TASK-007.md) — Integrate Sentry Error Tracking Across Web and Workers `devops`

#### SPR-01-01-02 — Database Foundation & Migration Pipeline

- [SPR-01-01-02](phase-01/module-01/sprint-02/SPR-01-01-02.md)

##### EPIC-01-01-02-01 — Schema Pipeline & Seed Data

- [EPIC-01-01-02-01](phase-01/module-01/sprint-02/epic-01/EPIC-01-01-02-01.md)

  - [TASK-008](phase-01/module-01/sprint-02/epic-01/task-008/TASK-008.md) — Create Database Package with Drizzle Client and Migration Pipeline `database`
  - [TASK-009](phase-01/module-01/sprint-02/epic-01/task-009/TASK-009.md) — Author Initial Migration: Database Conventions, Shared Enums, and the Scope Guard `database`
  - [TASK-010](phase-01/module-01/sprint-02/epic-01/task-010/TASK-010.md) — Build Development Seed Script with Realistic Content `database`

### MOD-01-02 — Design System Foundation

- [MOD-01-02](phase-01/module-02/MOD-01-02.md)

#### SPR-01-02-01 — Design Tokens, Primitives & App Shell

- [SPR-01-02-01](phase-01/module-02/sprint-01/SPR-01-02-01.md)

##### EPIC-01-02-01-01 — Design Tokens & Theming

- [EPIC-01-02-01-01](phase-01/module-02/sprint-01/epic-01/EPIC-01-02-01-01.md)

  - [TASK-011](phase-01/module-02/sprint-01/epic-01/task-011/TASK-011.md) — Implement Design Token System for Light, Dark, and System Themes `frontend`

##### EPIC-01-02-01-02 — Core UI Primitives

- [EPIC-01-02-01-02](phase-01/module-02/sprint-01/epic-02/EPIC-01-02-01-02.md)

  - [TASK-012](phase-01/module-02/sprint-01/epic-02/task-012/TASK-012.md) — Build Form Primitives: Button, Field, Input, Textarea, Select, OTP `frontend`
  - [TASK-013](phase-01/module-02/sprint-01/epic-02/task-013/TASK-013.md) — Build Overlay & Feedback Primitives: Sheet, Dialog, Toast, Snackbar `frontend`
  - [TASK-014](phase-01/module-02/sprint-01/epic-02/task-014/TASK-014.md) — Build Display Primitives: Chip, Avatar, StatusChip, Progress, Countdown `frontend`
  - [TASK-015](phase-01/module-02/sprint-01/epic-02/task-015/TASK-015.md) — Build Skeleton, Empty, and Error State Templates `frontend`

##### EPIC-01-02-01-03 — Application Shell & Navigation

- [EPIC-01-02-01-03](phase-01/module-02/sprint-01/epic-03/EPIC-01-02-01-03.md)

  - [TASK-016](phase-01/module-02/sprint-01/epic-03/task-016/TASK-016.md) — Build Configuration-Driven Responsive Navigation Shell `frontend`

---

## PHASE-02 — Identity, Authorization & Onboarding  `Release 1`

- [PHASE-02](phase-02/PHASE-02.md)

### MOD-02-01 — Authentication & Sessions

- [MOD-02-01](phase-02/module-01/MOD-02-01.md)

#### SPR-02-01-01 — Auth Schema, Sessions & Rate Limiting

- [SPR-02-01-01](phase-02/module-01/sprint-01/SPR-02-01-01.md)

##### EPIC-02-01-01-01 — Authentication Schema & Session Service

- [EPIC-02-01-01-01](phase-02/module-01/sprint-01/epic-01/EPIC-02-01-01-01.md)

  - [TASK-017](phase-02/module-01/sprint-01/epic-01/task-017/TASK-017.md) — Create Authentication Schema Migration with Scope Enforcement `database`
  - [TASK-018](phase-02/module-01/sprint-01/epic-01/task-018/TASK-018.md) — Implement Session Service with Instant Revocation `backend`
  - [TASK-019](phase-02/module-01/sprint-01/epic-01/task-019/TASK-019.md) — Implement OTP Issue and Verify Service with Abuse Controls `backend`

#### SPR-02-01-02 — Auth Screens, Passkeys, OAuth & Recovery

- [SPR-02-01-02](phase-02/module-01/sprint-02/SPR-02-01-02.md)

##### EPIC-02-01-02-01 — Signup, Verification & Login Screens

- [EPIC-02-01-02-01](phase-02/module-01/sprint-02/epic-01/EPIC-02-01-02-01.md)

  - [TASK-020](phase-02/module-01/sprint-02/epic-01/task-020/TASK-020.md) — Build Signup Screen with Async Validation `frontend`
  - [TASK-021](phase-02/module-01/sprint-02/epic-01/task-021/TASK-021.md) — Build Dual Verification Screens (Phone OTP + Email Link) `frontend`
  - [TASK-022](phase-02/module-01/sprint-02/epic-01/task-022/TASK-022.md) — Build Login and Password Reset Screens with Non-Enumerating Responses `frontend`

##### EPIC-02-01-02-02 — Passkeys, OAuth & Account Recovery

- [EPIC-02-01-02-02](phase-02/module-01/sprint-02/epic-02/EPIC-02-01-02-02.md)

  - [TASK-023](phase-02/module-01/sprint-02/epic-02/task-023/TASK-023.md) — Implement WebAuthn Passkey Registration and Authentication `backend`
  - [TASK-024](phase-02/module-01/sprint-02/epic-02/task-024/TASK-024.md) — Implement Google and Apple OAuth with Safe Account Linking `backend`
  - [TASK-025](phase-02/module-01/sprint-02/epic-02/task-025/TASK-025.md) — Design and Implement Account Recovery Policy and Flow `backend`

### MOD-02-02 — Authorization Chokepoint & Vault Ownership

- [MOD-02-02](phase-02/module-02/MOD-02-02.md)

#### SPR-02-02-01 — Vault Model & Authorization Chokepoint

- [SPR-02-02-01](phase-02/module-02/sprint-01/SPR-02-02-01.md)

##### EPIC-02-02-01-01 — Vault Ownership Model

- [EPIC-02-02-01-01](phase-02/module-02/sprint-01/epic-01/EPIC-02-02-01-01.md)

  - [TASK-026](phase-02/module-02/sprint-01/epic-01/task-026/TASK-026.md) — Create Vault and Membership Schema with Transactional Provisioning `database`

##### EPIC-02-02-01-02 — lib/authz — The Authorization Chokepoint

- [EPIC-02-02-01-02](phase-02/module-02/sprint-01/epic-02/EPIC-02-02-01-02.md)

  - [TASK-027](phase-02/module-02/sprint-01/epic-02/task-027/TASK-027.md) — Implement lib/authz with Executable Permission Matrix `backend`
  - [TASK-028](phase-02/module-02/sprint-01/epic-02/task-028/TASK-028.md) — Add Route Guards, Middleware, and Step-Up Re-Authentication `backend`

### MOD-02-03 — Onboarding & Personalization

- [MOD-02-03](phase-02/module-03/MOD-02-03.md)

#### SPR-02-03-01 — Onboarding Flow & Personalization Quiz

- [SPR-02-03-01](phase-02/module-03/sprint-01/SPR-02-03-01.md)

##### EPIC-02-03-01-01 — Onboarding Carousel & Personalization Quiz

- [EPIC-02-03-01-01](phase-02/module-03/sprint-01/epic-01/EPIC-02-03-01-01.md)

  - [TASK-029](phase-02/module-03/sprint-01/epic-01/task-029/TASK-029.md) — Build Onboarding Carousel and Three-Step Personalization Quiz `frontend`

---

## PHASE-03 — Core Domain — Members, Occasions, Memories & Timeline  `Release 1`

- [PHASE-03](phase-03/PHASE-03.md)

### MOD-03-01 — Members & Relationships

- [MOD-03-01](phase-03/module-01/MOD-03-01.md)

#### SPR-03-01-01 — Member Model & CRUD

- [SPR-03-01-01](phase-03/module-01/sprint-01/SPR-03-01-01.md)

##### EPIC-03-01-01-01 — Member Entity & Management Screens

- [EPIC-03-01-01-01](phase-03/module-01/sprint-01/epic-01/EPIC-03-01-01-01.md)

  - [TASK-030](phase-03/module-01/sprint-01/epic-01/task-030/TASK-030.md) — Create Member Schema and CRUD Actions `database`
  - [TASK-031](phase-03/module-01/sprint-01/epic-01/task-031/TASK-031.md) — Build Member List and Detail Screens `frontend`

#### SPR-03-01-02 — Member Import Paths & Deduplication

- [SPR-03-01-02](phase-03/module-01/sprint-02/SPR-03-01-02.md)

##### EPIC-03-01-02-01 — Import Paths

- [EPIC-03-01-02-01](phase-03/module-01/sprint-02/epic-01/EPIC-03-01-02-01.md)

  - [TASK-032](phase-03/module-01/sprint-02/epic-01/task-032/TASK-032.md) — Implement vCard and CSV Member Import with Validation Report `frontend`
  - [TASK-033](phase-03/module-01/sprint-02/epic-01/task-033/TASK-033.md) — Implement Contact Picker Import with Feature Detection `frontend`
  - [TASK-034](phase-03/module-01/sprint-02/epic-01/task-034/TASK-034.md) — Build Self-Service Member Invite Link and Public Fill Page `fullstack`
  - [TASK-035](phase-03/module-01/sprint-02/epic-01/task-035/TASK-035.md) — Implement Duplicate Detection and Member Merge `backend`

### MOD-03-02 — Occasions & Events Engine

- [MOD-03-02](phase-03/module-02/MOD-03-02.md)

#### SPR-03-02-01 — Event Model, Recurrence & Reminders

- [SPR-03-02-01](phase-03/module-02/sprint-01/SPR-03-02-01.md)

##### EPIC-03-02-01-01 — Event Model & Recurrence

- [EPIC-03-02-01-01](phase-03/module-02/sprint-01/epic-01/EPIC-03-02-01-01.md)

  - [TASK-036](phase-03/module-02/sprint-01/epic-01/task-036/TASK-036.md) — Create Event Schema with Recurrence and Reminder Offsets `database`
  - [TASK-037](phase-03/module-02/sprint-01/epic-01/task-037/TASK-037.md) — Implement Occurrence Computation and Reminder Scheduling `backend`

##### EPIC-03-02-01-02 — Calendar Views & Event Management

- [EPIC-03-02-01-02](phase-03/module-02/sprint-01/epic-02/EPIC-03-02-01-02.md)

  - [TASK-038](phase-03/module-02/sprint-01/epic-02/task-038/TASK-038.md) — Build Calendar Views (Month, Year, Agenda) with Event CRUD `frontend`

### MOD-03-03 — Memories

- [MOD-03-03](phase-03/module-03/MOD-03-03.md)

#### SPR-03-03-01 — Memory Model, CRUD & Screens

- [SPR-03-03-01](phase-03/module-03/sprint-01/SPR-03-03-01.md)

##### EPIC-03-03-01-01 — Memory Model & Date Precision

- [EPIC-03-03-01-01](phase-03/module-03/sprint-01/epic-01/EPIC-03-03-01-01.md)

  - [TASK-039](phase-03/module-03/sprint-01/epic-01/task-039/TASK-039.md) — Create Memory Schema with occurred_precision and Full-Text Search `database`
  - [TASK-040](phase-03/module-03/sprint-01/epic-01/task-040/TASK-040.md) — Implement Memory CRUD Actions with Soft Delete and Purge `backend`

##### EPIC-03-03-01-02 — Memory Screens

- [EPIC-03-03-01-02](phase-03/module-03/sprint-01/epic-02/EPIC-03-03-01-02.md)

  - [TASK-041](phase-03/module-03/sprint-01/epic-02/task-041/TASK-041.md) — Build Memory Create Sheet with Precision Date Picker `frontend`
  - [TASK-042](phase-03/module-03/sprint-01/epic-02/task-042/TASK-042.md) — Build Memory Detail Viewer and Gallery Grid `frontend`

### MOD-03-04 — Timeline & Discovery

- [MOD-03-04](phase-03/module-04/MOD-03-04.md)

#### SPR-03-04-01 — Timeline, Search & On This Day

- [SPR-03-04-01](phase-03/module-04/sprint-01/SPR-03-04-01.md)

##### EPIC-03-04-01-01 — Past → Present → Future Timeline

- [EPIC-03-04-01-01](phase-03/module-04/sprint-01/epic-01/EPIC-03-04-01-01.md)

  - [TASK-043](phase-03/module-04/sprint-01/epic-01/task-043/TASK-043.md) — Build Virtualised Timeline with Now Divider and Future Band `frontend`

##### EPIC-03-04-01-02 — Search, Filters & On This Day

- [EPIC-03-04-01-02](phase-03/module-04/sprint-01/epic-02/EPIC-03-04-01-02.md)

  - [TASK-044](phase-03/module-04/sprint-01/epic-02/task-044/TASK-044.md) — Build Search Screen with Full-Text Search and Shared Filters `fullstack`
  - [TASK-045](phase-03/module-04/sprint-01/epic-02/task-045/TASK-045.md) — Implement On This Day with Precision-Aware Matching and Home Cards `fullstack`

---

## PHASE-04 — Media Pipeline — Capture, Upload, Processing & Secure Delivery  `Release 1`

- [PHASE-04](phase-04/PHASE-04.md)

### MOD-04-01 — In-App Capture

- [MOD-04-01](phase-04/module-01/MOD-04-01.md)

#### SPR-04-01-01 — Capture Components & Local Durability

- [SPR-04-01-01](phase-04/module-01/sprint-01/SPR-04-01-01.md)

##### EPIC-04-01-01-01 — Capture Modes & Codec Negotiation

- [EPIC-04-01-01-01](phase-04/module-01/sprint-01/epic-01/EPIC-04-01-01-01.md)

  - [TASK-046](phase-04/module-01/sprint-01/epic-01/task-046/TASK-046.md) — Implement Video and Photo Capture with Codec Negotiation `frontend`
  - [TASK-047](phase-04/module-01/sprint-01/epic-01/task-047/TASK-047.md) — Implement Voice Capture with Waveform and Trim `frontend`

### MOD-04-02 — Resumable Upload & Outbox

- [MOD-04-02](phase-04/module-02/MOD-04-02.md)

#### SPR-04-02-01 — Upload Session Server & Presigned Multipart

- [SPR-04-02-01](phase-04/module-02/sprint-01/SPR-04-02-01.md)

##### EPIC-04-02-01-01 — Media Asset Model & Upload Sessions

- [EPIC-04-02-01-01](phase-04/module-02/sprint-01/epic-01/EPIC-04-02-01-01.md)

  - [TASK-048](phase-04/module-02/sprint-01/epic-01/task-048/TASK-048.md) — Create MediaAsset and UploadSession Schema with Storage Accounting `database`
  - [TASK-049](phase-04/module-02/sprint-01/epic-01/task-049/TASK-049.md) — Implement Presigned Multipart Upload Endpoints with Quota Enforcement `backend`

#### SPR-04-02-02 — Client Uploader, Outbox & Queue UI

- [SPR-04-02-02](phase-04/module-02/sprint-02/SPR-04-02-02.md)

##### EPIC-04-02-02-01 — Resumable Client Uploader & Outbox

- [EPIC-04-02-02-01](phase-04/module-02/sprint-02/epic-01/EPIC-04-02-02-01.md)

  - [TASK-050](phase-04/module-02/sprint-02/epic-01/task-050/TASK-050.md) — Build Resumable Chunked Uploader with Parallel Parts `frontend`
  - [TASK-051](phase-04/module-02/sprint-02/epic-01/task-051/TASK-051.md) — Build the on-device store Upload Outbox with Backoff and Idempotency `frontend`
  - [TASK-052](phase-04/module-02/sprint-02/epic-01/task-052/TASK-052.md) — Build Upload Queue UI with Pause, Resume, Cancel and Retry `frontend`

### MOD-04-03 — Derivative Processing & Secure Delivery

- [MOD-04-03](phase-04/module-03/MOD-04-03.md)

#### SPR-04-03-01 — Derivatives, Metadata & Signed Delivery

- [SPR-04-03-01](phase-04/module-03/sprint-01/SPR-04-03-01.md)

##### EPIC-04-03-01-01 — Derivative Generation & Metadata Extraction

- [EPIC-04-03-01-01](phase-04/module-03/sprint-01/epic-01/EPIC-04-03-01-01.md)

  - [TASK-053](phase-04/module-03/sprint-01/epic-01/task-053/TASK-053.md) — Implement Image Derivative and Blurhash Generation `backend`
  - [TASK-054](phase-04/module-03/sprint-01/epic-01/task-054/TASK-054.md) — Implement Video HLS Transcoding and Audio Normalisation `backend`

##### EPIC-04-03-01-02 — Signed-URL Delivery & Media Components

- [EPIC-04-03-01-02](phase-04/module-03/sprint-01/epic-02/EPIC-04-03-01-02.md)

  - [TASK-055](phase-04/module-03/sprint-01/epic-02/task-055/TASK-055.md) — Build Signed-URL Minting Endpoint with Authorization and Rate Limits `backend`
  - [TASK-056](phase-04/module-03/sprint-01/epic-02/task-056/TASK-056.md) — Build Progressive Image and Adaptive Video Components `frontend`

---

## PHASE-05 — Time Capsules & The Delivery Guarantee  `Release 1`

- [PHASE-05](phase-05/PHASE-05.md)

### MOD-05-01 — Capsule Creation & Sealing

- [MOD-05-01](phase-05/module-01/MOD-05-01.md)

#### SPR-05-01-01 — Capsule Model, Seal Transaction & Authorization

- [SPR-05-01-01](phase-05/module-01/sprint-01/SPR-05-01-01.md)

##### EPIC-05-01-01-01 — Capsule Model & Transactional Seal

- [EPIC-05-01-01-01](phase-05/module-01/sprint-01/epic-01/EPIC-05-01-01-01.md)

  - [TASK-057](phase-05/module-01/sprint-01/epic-01/task-057/TASK-057.md) — Create Capsule Schema with Recipients, Attempts and Replies `database`
  - [TASK-058](phase-05/module-01/sprint-01/epic-01/task-058/TASK-058.md) — Implement Transactional Seal with Immutability and Entitlement Gates `backend`
  - [TASK-059](phase-05/module-01/sprint-01/epic-01/task-059/TASK-059.md) — Extend lib/authz with Share-Link and Capsule-Recipient Grants `backend`

#### SPR-05-01-02 — Seal Flow & Capsule Detail Screens

- [SPR-05-01-02](phase-05/module-01/sprint-02/SPR-05-01-02.md)

##### EPIC-05-01-02-01 — Seal Flow & Capsule Detail

- [EPIC-05-01-02-01](phase-05/module-01/sprint-02/epic-01/EPIC-05-01-02-01.md)

  - [TASK-060](phase-05/module-01/sprint-02/epic-01/task-060/TASK-060.md) — Build Seal Flow Screen with Plain-Language Summary Block `frontend`
  - [TASK-061](phase-05/module-01/sprint-02/epic-01/task-061/TASK-061.md) — Build Capsule Detail Screen with Countdown and Delivery History `frontend`

### MOD-05-02 — Delivery Engine

- [MOD-05-02](phase-05/module-02/MOD-05-02.md)

#### SPR-05-02-01 — Scheduler, Channel Ladder, Watchdog & Integrity Sweep

- [SPR-05-02-01](phase-05/module-02/sprint-01/SPR-05-02-01.md)

##### EPIC-05-02-01-01 — Scheduler & Channel Delivery

- [EPIC-05-02-01-01](phase-05/module-02/sprint-01/epic-01/EPIC-05-02-01-01.md)

  - [TASK-062](phase-05/module-02/sprint-01/epic-01/task-062/TASK-062.md) — Implement Delivery Worker with Claim-and-Lock and Recipient Fan-Out `backend`
  - [TASK-063](phase-05/module-02/sprint-01/epic-01/task-063/TASK-063.md) — Build Email Channel with Decade-Durable Delivery Template `backend`
  - [TASK-064](phase-05/module-02/sprint-01/epic-01/task-064/TASK-064.md) — Implement Retry Ladder, Delivery Watchdog and Integrity Sweep `backend`

### MOD-05-03 — Recipient Experience

- [MOD-05-03](phase-05/module-03/MOD-05-03.md)

#### SPR-05-03-01 — Recipient Unlock Page & Reply Loop

- [SPR-05-03-01](phase-05/module-03/sprint-01/SPR-05-03-01.md)

##### EPIC-05-03-01-01 — Recipient Unlock & Reply

- [EPIC-05-03-01-01](phase-05/module-03/sprint-01/epic-01/EPIC-05-03-01-01.md)

  - [TASK-065](phase-05/module-03/sprint-01/epic-01/task-065/TASK-065.md) — Build Server-Rendered Recipient Unlock Page `fullstack`
  - [TASK-066](phase-05/module-03/sprint-01/epic-01/task-066/TASK-066.md) — Implement Reply Capture and Sender Notification Loop `fullstack`

### MOD-05-04 — Private Sharing

- [MOD-05-04](phase-05/module-04/MOD-05-04.md)

#### SPR-05-04-01 — Share Links & Access Visibility

- [SPR-05-04-01](phase-05/module-04/sprint-01/SPR-05-04-01.md)

##### EPIC-05-04-01-01 — Share Links & Who-Can-See Panel

- [EPIC-05-04-01-01](phase-05/module-04/sprint-01/epic-01/EPIC-05-04-01-01.md)

  - [TASK-067](phase-05/module-04/sprint-01/epic-01/task-067/TASK-067.md) — Implement Share Link Creation, Public View and Revocation `fullstack`
  - [TASK-068](phase-05/module-04/sprint-01/epic-01/task-068/TASK-068.md) — Build Who-Can-See Panel with Active Links and Access Log `frontend`

---

## PHASE-06 — The apps — offline store, sync & background upload  `Release 1`

- [PHASE-06](phase-06/PHASE-06.md)

### MOD-06-01 — Store release & platform integration

- [MOD-06-01](phase-06/module-01/MOD-06-01.md)

#### SPR-06-01-01 — Store listings, first launch & share extension

- [SPR-06-01-01](phase-06/module-01/sprint-01/SPR-06-01-01.md)

##### EPIC-06-01-01-01 — Store listings, icons & first-launch experience

- [EPIC-06-01-01-01](phase-06/module-01/sprint-01/epic-01/EPIC-06-01-01-01.md)

  - [TASK-069](phase-06/module-01/sprint-01/epic-01/task-069/TASK-069.md) — Create Web App Manifest with Icons, Shortcuts and Share Target `frontend`
  - [TASK-070](phase-06/module-01/sprint-01/epic-01/task-070/TASK-070.md) — Build Install Prompt Flow with iOS Walkthrough `frontend`
  - [TASK-071](phase-06/module-01/sprint-01/epic-01/task-071/TASK-071.md) — Implement Web Share Target, Badging and Native Share `frontend`

### MOD-06-02 — On-device store, offline reads & sync

- [MOD-06-02](phase-06/module-02/MOD-06-02.md)

#### SPR-06-02-01 — On-device store & offline reads

- [SPR-06-02-01](phase-06/module-02/sprint-01/SPR-06-02-01.md)

##### EPIC-06-02-01-01 — On-device SQLite, caching strategy & offline reads

- [EPIC-06-02-01-01](phase-06/module-02/sprint-01/epic-01/EPIC-06-02-01-01.md)

  - [TASK-072](phase-06/module-02/sprint-01/epic-01/task-072/TASK-072.md) — Configure WorkManager / URLSession background sync layer with Per-Route-Class Caching `frontend`
  - [TASK-073](phase-06/module-02/sprint-01/epic-01/task-073/TASK-073.md) — Build the Offline Read Layer and the App-Update Prompt `frontend`

#### SPR-06-02-02 — Offline writes, background upload & conflict resolution

- [SPR-06-02-02](phase-06/module-02/sprint-02/SPR-06-02-02.md)

##### EPIC-06-02-02-01 — Background upload & conflict resolution

- [EPIC-06-02-02-01](phase-06/module-02/sprint-02/epic-01/EPIC-06-02-02-01.md)

  - [TASK-074](phase-06/module-02/sprint-02/epic-01/task-074/TASK-074.md) — Relocate Outbox Drain into background sync layer with Background Sync `frontend`
  - [TASK-075](phase-06/module-02/sprint-02/epic-01/task-075/TASK-075.md) — Implement Offline Create, Conflict Resolution and Seal Block `frontend`

---

## PHASE-07 — Notifications — Push, Email & The Trigger Matrix  `Release 1`

- [PHASE-07](phase-07/PHASE-07.md)

### MOD-07-01 — Push infrastructure (APNs/FCM) & notification centre

- [MOD-07-01](phase-07/module-01/MOD-07-01.md)

#### SPR-07-01-01 — Push Transport, Notification Centre & Preferences

- [SPR-07-01-01](phase-07/module-01/sprint-01/SPR-07-01-01.md)

##### EPIC-07-01-01-01 — APNs & FCM infrastructure and dispatch layer

- [EPIC-07-01-01-01](phase-07/module-01/sprint-01/epic-01/EPIC-07-01-01-01.md)

  - [TASK-076](phase-07/module-01/sprint-01/epic-01/task-076/TASK-076.md) — Implement APNs / FCM Subscription, Device Lifecycle and SW Handler `backend`
  - [TASK-077](phase-07/module-01/sprint-01/epic-01/task-077/TASK-077.md) — Build Notification Dispatch Layer with Preferences and Quiet Hours `backend`
  - [TASK-078](phase-07/module-01/sprint-01/epic-01/task-078/TASK-078.md) — Build Notification Centre and Preference Screens `frontend`

### MOD-07-02 — Trigger Matrix & Email Templates

- [MOD-07-02](phase-07/module-02/MOD-07-02.md)

#### SPR-07-02-01 — Trigger Implementation & Volume Guardrail

- [SPR-07-02-01](phase-07/module-02/sprint-01/SPR-07-02-01.md)

##### EPIC-07-02-01-01 — Release-1 Trigger Matrix & Email Templates

- [EPIC-07-02-01-01](phase-07/module-02/sprint-01/epic-01/EPIC-07-02-01-01.md)

  - [TASK-079](phase-07/module-02/sprint-01/epic-01/task-079/TASK-079.md) — Implement Release-1 Notification Triggers with Once-Only Guarantees `backend`
  - [TASK-080](phase-07/module-02/sprint-01/epic-01/task-080/TASK-080.md) — Build Email Templates for All Triggers with Bounce Handling and Volume Guardrail `backend`

---

## PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin  `Release 1`

- [PHASE-08](phase-08/PHASE-08.md)

### MOD-08-01 — Privacy Centre, Audit Log & App Lock

- [MOD-08-01](phase-08/module-01/MOD-08-01.md)

#### SPR-08-01-01 — Audit Log, Access Visibility & App Lock

- [SPR-08-01-01](phase-08/module-01/sprint-01/SPR-08-01-01.md)

##### EPIC-08-01-01-01 — Audit Log & User-Visible Access Log

- [EPIC-08-01-01-01](phase-08/module-01/sprint-01/epic-01/EPIC-08-01-01-01.md)

  - [TASK-081](phase-08/module-01/sprint-01/epic-01/task-081/TASK-081.md) — Create Audit Log with Coverage Across All Sensitive Paths `backend`
  - [TASK-082](phase-08/module-01/sprint-01/epic-01/task-082/TASK-082.md) — Build Privacy Centre with Access Log, App Lock and Vault PIN `fullstack`

### MOD-08-02 — Data Rights — Export & Deletion

- [MOD-08-02](phase-08/module-02/MOD-08-02.md)

#### SPR-08-02-01 — Export & Account Deletion

- [SPR-08-02-01](phase-08/module-02/sprint-01/SPR-08-02-01.md)

##### EPIC-08-02-01-01 — Data Export & Account Deletion

- [EPIC-08-02-01-01](phase-08/module-02/sprint-01/epic-01/EPIC-08-02-01-01.md)

  - [TASK-083](phase-08/module-02/sprint-01/epic-01/task-083/TASK-083.md) — Implement Full Data Export with Streaming Archive `backend`
  - [TASK-084](phase-08/module-02/sprint-01/epic-01/task-084/TASK-084.md) — Implement Account Deletion with Capsule Warning, Grace Period and Purge `backend`

### MOD-08-03 — Subscriptions, Entitlements & Quota

- [MOD-08-03](phase-08/module-03/MOD-08-03.md)

#### SPR-08-03-01 — Billing, Entitlements & Paywalls

- [SPR-08-03-01](phase-08/module-03/sprint-01/SPR-08-03-01.md)

##### EPIC-08-03-01-01 — Subscription, Checkout & Entitlement Enforcement

- [EPIC-08-03-01-01](phase-08/module-03/sprint-01/epic-01/EPIC-08-03-01-01.md)

  - [TASK-085](phase-08/module-03/sprint-01/epic-01/task-085/TASK-085.md) — Create Subscription Schema with Denormalised Entitlements `database`
  - [TASK-086](phase-08/module-03/sprint-01/epic-01/task-086/TASK-086.md) — Implement Stripe and Razorpay Checkout with Idempotent Webhooks `backend`
  - [TASK-087](phase-08/module-03/sprint-01/epic-01/task-087/TASK-087.md) — Implement Quota Enforcement, Contextual Paywalls and Accounting Reconciliation `fullstack`

### MOD-08-04 — Trust & Safety and the Operator Console

- [MOD-08-04](phase-08/module-04/MOD-08-04.md)

#### SPR-08-04-01 — Report, Block & Moderation Queue

- [SPR-08-04-01](phase-08/module-04/sprint-01/SPR-08-04-01.md)

##### EPIC-08-04-01-01 — Report, Block, CSAM Matching & Moderation Queue

- [EPIC-08-04-01-01](phase-08/module-04/sprint-01/epic-01/EPIC-08-04-01-01.md)

  - [TASK-088](phase-08/module-04/sprint-01/epic-01/task-088/TASK-088.md) — Implement Report, Block and CSAM Hash-Matching on Upload `fullstack`
  - [TASK-089](phase-08/module-04/sprint-01/epic-01/task-089/TASK-089.md) — Build Moderation Queue with SLA Timers and Appeals `fullstack`

#### SPR-08-04-02 — Operator Console — Delivery Health, Jobs & Break-Glass

- [SPR-08-04-02](phase-08/module-04/sprint-02/SPR-08-04-02.md)

##### EPIC-08-04-02-01 — Admin Realm, Delivery Health & Break-Glass Access

- [EPIC-08-04-02-01](phase-08/module-04/sprint-02/epic-01/EPIC-08-04-02-01.md)

  - [TASK-090](phase-08/module-04/sprint-02/epic-01/task-090/TASK-090.md) — Build Admin Authentication Realm with Mandatory Hardware MFA `fullstack`
  - [TASK-091](phase-08/module-04/sprint-02/epic-01/task-091/TASK-091.md) — Build Delivery Health Dashboard, Job Queue and System Health `fullstack`
  - [TASK-092](phase-08/module-04/sprint-02/epic-01/task-092/TASK-092.md) — Build User Lookup with Break-Glass Content Access `fullstack`

---

## PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience  `Release 1`

- [PHASE-09](phase-09/PHASE-09.md)

### MOD-09-01 — Security Assurance

- [MOD-09-01](phase-09/module-01/MOD-09-01.md)

#### SPR-09-01-01 — Authorization Assurance & Platform Security

- [SPR-09-01-01](phase-09/module-01/sprint-01/SPR-09-01-01.md)

##### EPIC-09-01-01-01 — Authorization & Tenant-Isolation Assurance

- [EPIC-09-01-01-01](phase-09/module-01/sprint-01/epic-01/EPIC-09-01-01-01.md)

  - [TASK-093](phase-09/module-01/sprint-01/epic-01/task-093/TASK-093.md) — Build Permission Matrix and Tenant-Isolation Assurance Suite `testing`
  - [TASK-094](phase-09/module-01/sprint-01/epic-01/task-094/TASK-094.md) — Build Cross-Tenant IDOR Suite and Commission External Penetration Test `testing`
  - [TASK-095](phase-09/module-01/sprint-01/epic-01/task-095/TASK-095.md) — Implement CSP with Nonces, Security Headers and Edge Rate Limits `devops`

### MOD-09-02 — Quality, Accessibility & Performance

- [MOD-09-02](phase-09/module-02/MOD-09-02.md)

#### SPR-09-02-01 — E2E Coverage, Accessibility Audit & Device Lab

- [SPR-09-02-01](phase-09/module-02/sprint-01/SPR-09-02-01.md)

##### EPIC-09-02-01-01 — End-to-End, Accessibility & Device Verification

- [EPIC-09-02-01-01](phase-09/module-02/sprint-01/epic-01/EPIC-09-02-01-01.md)

  - [TASK-096](phase-09/module-02/sprint-01/epic-01/task-096/TASK-096.md) — Build Critical-Path, Offline and Install E2E Suites `testing`
  - [TASK-097](phase-09/module-02/sprint-01/epic-01/task-097/TASK-097.md) — Conduct WCAG 2.2 AA Audit with Screen Reader and Device Lab Verification `testing`

### MOD-09-03 — Resilience & Operational Readiness

- [MOD-09-03](phase-09/module-03/MOD-09-03.md)

#### SPR-09-03-01 — Load Testing, Restore Drill & Delivery Failure Injection

- [SPR-09-03-01](phase-09/module-03/sprint-01/SPR-09-03-01.md)

##### EPIC-09-03-01-01 — Restore Drill, Load Testing & Delivery Failure Injection

- [EPIC-09-03-01-01](phase-09/module-03/sprint-01/epic-01/EPIC-09-03-01-01.md)

  - [TASK-098](phase-09/module-03/sprint-01/epic-01/task-098/TASK-098.md) — Execute Backup Restore Drill and Load Test the Media Path `devops`
  - [TASK-099](phase-09/module-03/sprint-01/epic-01/task-099/TASK-099.md) — Inject Delivery Failure Modes and Verify Detection `testing`

---

## PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout  `Release 1`

- [PHASE-10](phase-10/PHASE-10.md)

### MOD-10-01 — Marketing Site & Honest Claims

- [MOD-10-01](phase-10/module-01/MOD-10-01.md)

#### SPR-10-01-01 — Marketing Site, Pricing, Legal & Claim Correction

- [SPR-10-01-01](phase-10/module-01/sprint-01/SPR-10-01-01.md)

##### EPIC-10-01-01-01 — Marketing Site & Claim Correction

- [EPIC-10-01-01-01](phase-10/module-01/sprint-01/epic-01/EPIC-10-01-01-01.md)

  - [TASK-100](phase-10/module-01/sprint-01/epic-01/task-100/TASK-100.md) — Build Marketing Landing Page and Content Pages `frontend`
  - [TASK-101](phase-10/module-01/sprint-01/epic-01/task-101/TASK-101.md) — Publish Pricing Page, Legal Pages and Complete the Appendix B Claim Audit `fullstack`
  - [TASK-102](phase-10/module-01/sprint-01/epic-01/task-102/TASK-102.md) — Implement Working Contact Form, Waitlist and FAQ Backend `fullstack`

### MOD-10-02 — Production Readiness & Staged Rollout

- [MOD-10-02](phase-10/module-02/MOD-10-02.md)

#### SPR-10-02-01 — Feature Flags, Rollout, Monitoring & Analytics

- [SPR-10-02-01](phase-10/module-02/sprint-01/SPR-10-02-01.md)

##### EPIC-10-02-01-01 — Feature Flags, Staged Rollout, Monitoring & Analytics

- [EPIC-10-02-01-01](phase-10/module-02/sprint-01/epic-01/EPIC-10-02-01-01.md)

  - [TASK-103](phase-10/module-02/sprint-01/epic-01/task-103/TASK-103.md) — Implement Feature Flags and Execute Staged Rollout `devops`
  - [TASK-104](phase-10/module-02/sprint-01/epic-01/task-104/TASK-104.md) — Set Up Status Page, On-Call Rota and Launch Analytics Funnels `devops`

---

## PHASE-11 — Release 2 — "Together" (Shared Vaults, Collaboration, Broadcasts & AI)  `Release 2`

- [PHASE-11](phase-11/PHASE-11.md)

### MOD-11-01 — Shared Vaults, Albums & Collaboration

- [MOD-11-01](phase-11/module-01/MOD-11-01.md)


### MOD-11-02 — Broadcasts, Festivals & Multi-Channel Delivery

- [MOD-11-02](phase-11/module-02/MOD-11-02.md)


### MOD-11-03 — AI Layer — Search, Transcription, Grouping & Recaps

- [MOD-11-03](phase-11/module-03/MOD-11-03.md)


### MOD-11-04 — Growth, Retention & Household Plan

- [MOD-11-04](phase-11/module-04/MOD-11-04.md)


---

## PHASE-12 — Release 3 — "Gifting & Legacy" (Commerce, Group Gifting & Legacy Vault)  `Release 3`

- [PHASE-12](phase-12/PHASE-12.md)

### MOD-12-01 — Gift Commerce — Validation, Catalog & Checkout

- [MOD-12-01](phase-12/module-01/MOD-12-01.md)


### MOD-12-02 — Legacy Vault, Nominees & The Unlock Protocol

- [MOD-12-02](phase-12/module-02/MOD-12-02.md)


### MOD-12-03 — Marketplace, Generative Creations & Memorial Pages

- [MOD-12-03](phase-12/module-03/MOD-12-03.md)
