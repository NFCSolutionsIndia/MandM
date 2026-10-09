# 03 — System Design

← [Documentation index](README.md)

This document works from the outside in: system context, then containers, then internal
modules, then the four flows that matter, then what happens when things break.

---

## 1. The design constraints that shape everything

| Constraint | Architectural consequence |
|---|---|
| A delivery may be **twenty years** in the future | The schedule is a database row, not a vendor's timer. Every temporal column is `timestamptz`. |
| The recipient may have **no account and no app** | The unlock page is server-rendered HTML that works with JavaScript disabled. |
| The worst realistic failure is **a privacy incident** | Authorization is a chokepoint with a type-level guarantee, not middleware that can be forgotten. |
| The client is **often offline** | Writes go to a local outbox first; the local copy exists before the upload starts. |
| Media is **the product and the entire cost base** | Direct-to-storage presigned uploads, zero-egress storage, derivative ladders, no server ever proxying media bytes. |
| **FFmpeg on untrusted input is hostile** | Media workers get no database credentials and no internet route. |
| Delivery must survive **a bad web deploy** | Workers are separate ECS services with separate pipelines. |

---

## 2. Level 1 — System context

```
                    ┌─────────────────────────────────────────────┐
                    │            PEOPLE                           │
                    │                                             │
   ┌────────────────┤  Vault owner    Family member   Recipient   │
   │                │  (account)      (account)       (NO account)│
   │                │                      Operator / admin       │
   │                └──────────────────┬──────────────────────────┘
   │                                   │
   │                                   ▼
   │        ┌──────────────────────────────────────────────────┐
   │        │        MOMENTS & MEMORIES  (this system)          │
   │        │                                                   │
   │        │   Native mobile apps · Web app · Admin console       │
   │        │   Delivery engine · Media pipeline                │
   │        │   PostgreSQL (the system of record)               │
   │        └───┬────────┬────────┬────────┬────────┬───────────┘
   │            │        │        │        │        │
   ▼            ▼        ▼        ▼        ▼        ▼
 Cloudflare  Resend    Stripe   Twilio   Sentry   Checkly
     R2       + SES  + Razorpay  (R2)   PostHog  (outside AWS)
  (media)    (email) (payments) (SMS/WA) (obs)   (synthetics)
```

**Design note on the third actor.** The **recipient without an account** is a first-class actor
in this system, and that is unusual. It is why the capsule route is server-rendered, why access
tokens are separate high-entropy values rather than ids, and why email is the guaranteed
delivery channel rather than a fallback nobody tested.

---

## 3. Level 2 — Containers

```
┌───────────────────────────── CLIENTS (iOS · Android · web surfaces) ─────────────────────────────┐
│  React 19 UI  ·  WorkManager / URLSession background sync layer  ·  Room / GRDB/the on-device store outbox + memory cache          │
│  TanStack Query cache  ·  in-app capture (getUserMedia / MediaRecorder)                     │
└───┬──────────────────────────────┬────────────────────────────┬───────────────────────────┬─┘
    │ server actions               │ presigned multipart PUT    │ APNs and FCM          │
    │ + route handlers (HTTPS)     │ (direct — never via app)   │                           │
    ▼                              ▼                            │                           ▼
┌─────────────────────────┐   ┌──────────────────────┐          │                    ┌─────────────┐
│ CloudFront + AWS WAF    │   │  Cloudflare R2       │          │                    │  Push       │
│ rate-based rules, TLS   │   │  PRIVATE buckets     │          │                    │  services   │
└───────────┬─────────────┘   │  signed URLs only    │          │                    └─────────────┘
            ▼                 └──────────┬───────────┘          │
┌─────────────────────────┐              │                      │
│ ALB → ECS Fargate       │              │                      │
│   apps/api              │              │                      │
│  ┌───────────────────┐  │              │                      │
│  │ lib/authz  ← THE  │  │              │                      │
│  │ ONLY tenant       │  │              │                      │
│  │ boundary          │  │              │                      │
│  ├───────────────────┤  │              │                      │
│  │ lib/db            │  │              │                      │
│  │ (repositories)    │  │              │                      │
│  ├───────────────────┤  │              │                      │
│  │ features/*        │  │              │                      │
│  │ (no db access)    │  │              │                      │
│  └───────────────────┘  │              │                      │
└───────────┬─────────────┘              │                      │
            │                            │                      │
            ▼                            │                      │
┌──────────────────────────────┐         │                      │
│  Aurora PostgreSQL Serverless v2  │         │                      │
│  multi-AZ · private subnets  │         │                      │
│                              │         │                      │
│  THE SYSTEM OF RECORD:       │         │                      │
│   · scheduled_jobs  ← clock  │         │                      │
│   · audit_logs               │         │                      │
│   · everything else          │         │                      │
└────┬───────────────────┬─────┘         │                      │
     │                   │               │                      │
     │ DB + email creds  │ NO DB creds   │                      │
     ▼                   ▼               ▼                      │
┌──────────────────┐  ┌────────────────────────────┐            │
│ ECS: DELIVERY    │  │ ECS: MEDIA PIPELINE        │            │
│ ENGINE           │  │                            │            │
│ · tick worker    │  │ · FFmpeg transcode         │            │
│ · channel ladder │  │ · sharp thumbnails         │            │
│ · watchdog       │  │ · EXIF, waveform, checksum │            │
│ · integrity sweep│  │                            │            │
│                  │  │ private subnet, NO NAT     │            │
│ own IAM role     │  │ own IAM role, storage only │            │
│ own pipeline     │  │ knows only object keys     │            │
└────────┬─────────┘  └────────────────────────────┘            │
         │                                                       │
         └──────────────► email / SMS / WhatsApp / push ─────────┘
```

### 3.1 Why these are the container boundaries

| Boundary | Reason it exists |
|---|---|
| **Web ↔ workers** | A web deploy or rollback must not be able to stop capsule delivery. |
| **Delivery engine ↔ media pipeline** | Delivery needs database and email credentials; media must never have them. Two ECS services with two IAM roles is what makes that a fact rather than a policy. |
| **Client ↔ R2, direct** | An application server proxying 4K video is both a bottleneck and a cost error. |
| **`features/*` ↔ `lib/db`** | Feature code physically cannot reach the database. Enforced by an ESLint rule that fails CI, not by review. |
| **Everything ↔ `lib/authz`** | The single tenant boundary. See [05 §3](05-SECURITY-AND-COMPLIANCE.md). |

---

## 4. Level 3 — Internal module structure

The eleven domains from the original service proposal survive as **module boundaries**, not
deployables.

```
apps/site/src/
├── app/                          route groups — separate shells, shared design system
│   ├── (marketing)/              public, indexable      · app bundle never ships here
│   ├── (auth)/                   sign in / sign up
│   ├── (admin)/                  the admin console
│   ├── admin/                    operator console      · separate subdomain, own auth realm
│   ├── c/[token]/                CAPSULE UNLOCK  · server-rendered · works without JS
│   └── s/[token]/                SHARE LINK      · server-rendered
│
├── features/                     ← NO DATABASE ACCESS FROM HERE. EVER.
│   ├── auth/        member/       event/       memory/
│   ├── media/       capsule/      delivery/    share/
│   ├── notification/ billing/     moderation/  admin/
│   │
│   └── each module: components/ · actions.ts · queries.ts · schema.ts · hooks/ · __tests__/
│
└── lib/
    ├── authz/                    THE CHOKEPOINT — the only module that mints a VaultScope
    ├── db/                       repositories — every function takes a VaultScope first
    ├── storage/                  R2 signed-URL minting (post-authorization only)
    ├── jobs/                     enqueue into scheduled_jobs
    └── observability/

packages/
├── shared/     zod schemas, domain enums, error registry, result envelope   (web ↔ workers)
├── db/         drizzle schema + migrations — THE SINGLE SOURCE OF TRUTH
├── emails/     react-email templates
└── config/     eslint, tsconfig, tailwind preset — consumed, never duplicated

infra/          AWS CDK stacks in TypeScript — reviewed like application code
```

### 4.1 Three rules that keep this structure honest

1. **No feature module queries another feature's tables directly.** Cross-domain reads go
   through the owning module's `queries.ts`. This is what preserves cheap extraction to a real
   service later.
2. **Every repository function takes a `VaultScope` as its first parameter**, and only
   `lib/authz` can construct one. A forgotten tenant filter becomes a **type error** rather
   than a data leak, because the scope is what supplies the predicate.
3. **A new table requires, in the same pull request:** a `vault_id` column, an index on it, a
   repository module, and its cell in the permission-matrix test. On PostgreSQL this was one
   line — "a new RLS policy in the same migration". The replacement is more work, not less, and
   that is the price of the engine choice.

---

## 5. Critical flow 1 — The delivery engine

**This subsystem is the product.** It is designed explicitly rather than assembled.

```
 SEAL (t = now)                                      DELIVER (t = unlock_at, maybe 2046)
 ─────────────                                       ─────────────────────────────────────

 owner taps "Seal"                                   tick worker, every minute
        │                                                     │
        ▼                                                     ▼
 ┌──────────────────────────────┐              ┌────────────────────────────────────────┐
 │  ONE DATABASE TRANSACTION    │              │ BEGIN (READ COMMITTED)                 │
 │                              │              │ SELECT id FROM scheduled_jobs          │
 │  1. capsules.state='sealed'  │              │  WHERE state='pending'                 │
 │  2. INSERT scheduled_jobs    │              │    AND run_at <= ?                     │
 │     (kind='capsule_delivery',│              │  ORDER BY run_at                       │
 │      run_at = unlock_at)     │              │  LIMIT 100                             │
 │                              │              │  FOR UPDATE SKIP LOCKED                │
 │  COMMIT                      │              │ UPDATE ... state='claimed',            │
 │                              │              │        locked_by=?, locked_until=?     │
 │  There is NO window in which │              │ COMMIT                                 │
 │  a capsule is sealed but     │              └───────────────────┬────────────────────┘
 │  unscheduled.                │                                  │
 └──────────────────────────────┘                                  ▼
                                                  fan out: per recipient × per channel
                                                  each attempt idempotent by
                                                  (capsule, recipient, channel, attempt_no)
                                                                   │
                                        ┌──────────────────────────┴──────────────────┐
                                        ▼                                             │
                              CHANNEL LADDER                                          │
                              push (instant, free)                                    │
                                → email (guaranteed)                                  │
                                  → SMS [R2]                                          │
                                    → WhatsApp [R2]                                   │
                                      → notify the SENDER to intervene                │
                              escalation continues until acknowledged or exhausted     │
                                        │                                             │
                                        ▼                                             │
                              every attempt written to delivery_attempts ─────────────┘
                              (this table is what makes a delivery SLA
                               an operational fact rather than a claim)
                                        │
                    ┌───────────────────┼────────────────────┐
                    ▼                   ▼                    ▼
              retries with       WATCHDOG, hourly     INTEGRITY SWEEP, monthly
              exponential        alerts a human if    verifies every sealed capsule
              backoff over       ANY capsule is past  still has a valid future job row,
              DAYS, not          unlock_at with no    that its media objects exist and
              minutes            successful attempt   checksum correctly, and that
                                                      recipient contacts are not stale
```

### 5.1 Why each piece is shaped the way it is

| Element | Reasoning |
|---|---|
| **One transaction at seal** | The alternative — write the capsule, then enqueue — has a window in which a crash leaves a sealed capsule with no schedule. That window is a broken promise with no alert. |
| **`FOR UPDATE SKIP LOCKED`** | Simple, boring, and correct under concurrency. Multiple workers claim disjoint batches without coordination. Supported since PostgreSQL 17.1. |
| **`READ COMMITTED` on the worker connection** | PostgreSQL's default, so no override is needed. A stricter level takes range locks that make concurrent claim loops **block each other instead of skipping**, turning a horizontally-scalable worker pool into a serialised one. |
| **Retries over days, not minutes** | A bounced mailbox may come back. Once the date has arrived, there is no hurry — there is only correctness. |
| **The channel ladder ends at the sender** | After twenty years, contact details go stale. The honest last resort is to tell the person who made the promise that we cannot reach the person they made it to. |
| **`delivery_attempts` as a first-class table** | Without it, "99.9% delivery" is a marketing claim. With it, it is a queryable fact and an operational dashboard. |
| **The watchdog** | Retries handle expected failure. The watchdog handles *unexpected* failure — the job row that was never created, the worker that never ran, the state machine that got stuck. **This alert must never become routine.** |
| **The monthly integrity sweep** | The failure mode of a twenty-year promise is not a crash; it is silent rot. Bit rot in a stored object, a stale email address, a job row lost to a bad migration. The sweep is the only thing that catches those before a user does. |
| **Humane delivery windows** | `unlock_at` is stored as UTC plus the *intended* timezone, and delivery is shifted into a 09:00–20:00 local window. **Receiving "for your 18th birthday" at 03:00 is a bug**, not an edge case. |

---

## 6. Critical flow 2 — Media upload and processing

```
CLIENT                                    APPLICATION                      STORAGE / WORKERS
──────                                    ───────────                      ─────────────────

1. select or capture
2. read metadata, generate blurhash
   + a 320px local thumbnail
3. ══ WRITE TO THE APP SANDBOX ══
   ► THE MEMORY IS NOW SAFE
     EVEN IF THE APP DIES
4. optional client-side downscale
   (offered, never forced; off by
    default on Wi-Fi — we promised
    originals)
5. request upload session ──────────────► create upload_sessions row
                                          check quota
                                          mint presigned multipart URLs
                                                    │
6. PUT chunks (5–10 MB), 3 in parallel ─────────────┼──────────────────────► R2
   ETags recorded per part                          │
7. on interruption: RESUME from the                 │
   last confirmed part — never restart              │
8. complete ────────────────────────────► verify checksum_sha256
                                          finalise the session
                                          enqueue derivative jobs
                                                    │
                                                    ▼
                                       ┌───────────────────────────────────┐
                                       │ MEDIA WORKER (no DB credentials,  │
                                       │ no internet route, knows only an  │
                                       │ object key)                       │
                                       │                                   │
                                       │  image  → thumb 320 · preview 1280│
                                       │  video  → HLS ladder 480/720/     │
                                       │           1080(/2160) · poster    │
                                       │  audio  → normalised AAC + wave   │
                                       │  EXIF extracted, GPS STRIPPED     │
                                       │  blurhash + checksum stored       │
                                       │                                   │
                                       │  THE ORIGINAL IS NEVER MODIFIED.  │
                                       │  Every derivative is additional.  │
                                       └────────────────┬──────────────────┘
9. push / SSE: "ready" ◀────────────────────────────────┘
```

### 6.1 Non-negotiables in this flow

- **The client never uploads *through* the application server.** Presigned direct-to-storage
  only.
- **Multipart and resumable from day one.** Retrofitting resumability after launch means
  rewriting the client, the API and the queue simultaneously.
- **Idempotent by `client_id`**, so a retry after an ambiguous failure cannot create a duplicate
  memory.
- **The original is never modified.** "No compression, originals preserved" is a genuine
  differentiator against every free consumer cloud, and it is honoured literally.
- **Magic-byte validation, not extension or client-declared MIME.** **SVG upload is rejected
  outright** — it is an XSS vector disguised as an image.

### 6.2 Perceived performance — four tiers

**blurhash** (~30 bytes, inline in the API payload, renders instantly) → **320px thumb** (grid)
→ **1280px preview** (detail) → **original** (download or zoom).

This is precisely why the timeline can feel instant offline: blurhashes and thumbs are tiny and
aggressively cached. Images are delivered as AVIF → WebP → JPEG by `Accept` header, with
`srcset`/`sizes` at widths 320/640/1280/2048. Video starts at 480p and climbs. `Save-Data` and
`navigator.connection.effectiveType` are respected — originals deferred, autoplay deferred,
downscaling offered once.

---

## 7. Critical flow 3 — Authorization on every read

```
     request (session cookie + client-supplied ids)
                        │
                        ▼
     ┌──────────────────────────────────────────────────┐
     │  lib/authz                                        │
     │                                                   │
     │  resolve the actor to exactly ONE of:             │
     │    (a) a vault role     (owner/admin/             │
     │                          contributor/viewer)       │
     │    (b) an ACTIVE share  (not expired, not         │
     │                          revoked, PIN satisfied)   │
     │    (c) a DELIVERED capsule recipient              │
     │                                                   │
     │  THERE IS NO FOURTH PATH.                         │
     │  Nothing is readable by knowing an id.            │
     │                                                   │
     │  DENY BY DEFAULT.                                 │
     └───────────────┬───────────────────┬───────────────┘
                     │ allowed           │ denied
                     ▼                   ▼
       mints a VaultScope         AUTHZ_DENIED
       (branded type, private     (identical response whether the
        constructor — feature      resource does not exist or the
        code CANNOT forge one)     actor may not see it, so the
                     │             API is not an enumeration oracle)
                     ▼
       repository function
       listMemories(scope, filters)
         → the scope SUPPLIES the vault_id predicate
                     │
                     ▼
       POST-QUERY GUARD: assert every returned row's
       vault_id matches the scope
         → on mismatch: FAIL CLOSED, Sentry at fatal,
           write an audit_logs row
                     │
                     ▼
                  response
```

The `vault_id` is always derived from **the session**, never from client input. Client-supplied
ids are untrusted **filters**, never authorization. Full detail and the four compensating
controls: [05 §3](05-SECURITY-AND-COMPLIANCE.md).

---

## 8. Critical flow 4 — The recipient unlock

This is the flow with the longest time horizon and the fewest assumptions available to it.

```
        BEFORE unlock_at                          AT / AFTER unlock_at
        ────────────────                          ────────────────────

 recipient opens the durable link          the same link, unchanged
        │                                          │
        ▼                                          ▼
 GET /c/[token]                            GET /c/[token]
 server-rendered, no client JS required    server-rendered, no client JS required
        │                                          │
        ▼                                          ▼
 hash the token, look up the recipient     token resolves → content access granted
        │                                          │
        ▼                                          ▼
 COUNTDOWN PAGE                            CEREMONIAL REVEAL
   · sender's name                           · slow, deliberate open
   · unlock date                             · media via 5-minute signed URLs
   · NEVER the media, never the note         · the sender's note
        │                                    · a reply box (no account needed)
        ▼                                    · "save a copy"
 X-Robots-Tag: noindex, noarchive                  │
 excluded in robots.txt                            ▼
                                            access written to audit_logs
                                            reply → notifies the sender,
                                            and is copied into the sender's
                                            vault as a memory
```

**Design decisions specific to this flow:**

- **Tokens are not ids.** They are separate 32-byte CSPRNG values, base62url-encoded, **stored
  hashed** (SHA-256), with a version column so a leaked link can be rotated without destroying
  the capsule. An id being time-ordered must never make a token guessable.
- **No account is ever required.** Requiring one at the moment a message from a dead parent
  arrives would be the cruellest possible product decision.
- **Server-rendered, functional with JavaScript disabled.** Verified by an automated test
  (`apps/site/e2e/capsule-no-js.spec.ts` exists today) so the guarantee cannot silently
  regress.
- **The owner can cancel any time before delivery. After delivery, the recipient's copy
  persists** — retracting a delivered gift is not a coherent promise, and the UI says so
  plainly rather than implying otherwise.

---

## 9. Failure modes and how each is handled

| Failure | Detection | Response | Severity |
|---|---|---|---|
| **A sealed capsule passes `unlock_at` undelivered** | Hourly watchdog → CloudWatch alarm → SNS → PagerDuty | Human intervention. Treated on the same footing as a data breach | **Sev-0** |
| Worker process dies mid-job | `locked_until` expires; the row returns to `pending` | Automatic re-claim by another worker | Low |
| Email provider outage | Resend failure | Automatic failover to Amazon SES, a fully independent sender | Low |
| Recipient contact is stale after 15 years | Monthly integrity sweep; annual reassurance report to the owner | Owner is nudged to refresh contacts *before* the date, not after | Medium |
| Bit rot / missing object in storage | Monthly checksum verification against stored `checksum_sha256` | Restore from the cross-provider secondary copy | High |
| Web deploy is bad | Health checks on the ALB target group | Roll back the web service. **Delivery is a separate service and keeps running** | Medium |
| Cross-tenant row appears in a result set | The post-query scope guard | **Fail closed** — throw, return nothing, Sentry at fatal, write an audit row | **Sev-0** |
| Media worker compromised via FFmpeg | Assumed hostile by design | No database credentials to steal, no internet route, no vault id in scope. Blast radius is one object key | Contained |
| Aurora regional event | CloudWatch + Checkly (which runs outside AWS) | Restore from cross-region snapshots. Multi-region active is a post-launch decision | High |
| A whole AWS region is unavailable | **Checkly, deliberately hosted outside AWS** | Documented incident runbook | High |

### 9.1 Backup posture — the real twenty-year problem

A capsule promised for 2046 needs more than one bucket:

1. **Primary:** Cloudflare R2, multi-region.
2. **Secondary:** a **different provider** (Backblaze B2 or S3 Glacier Deep Archive), synced
   nightly. **Cross-provider is the point** — one vendor's account closure or regional failure
   must not be existential.
3. **Database:** Aurora point-in-time recovery with a 30-day window, plus daily encrypted
   logical dumps to a third location, with snapshots replicated cross-region.
4. **Quarterly restore drills.** A backup nobody has restored is a rumour.
5. **An annual integrity sweep** verifying stored checksums against the objects, catching bit
   rot before a user does.

---

## 10. Performance and scale targets

| Path | Target | Why this number |
|---|---|---|
| `/c/[token]` first byte | **< 300 ms** | The capsule-unlock path. The single worst place in the product to be slow, and the reason Fargate was chosen over Lambda |
| Installed app cold open, offline | **Instant** from the cached shell | It is an installed app; anything else breaks the platform promise |
| Timeline scroll | 60 fps on a **mid-range Android** | Virtualised list, blurhash placeholders, no layout shift |
| Upload resume after interruption | Resume from the last confirmed part, **never restart** | A 4K video on cellular cannot be restarted and retain the user |
| Scheduler tick | Every **minute**, claiming up to 100 jobs per batch | Minute granularity is well inside a humane delivery window |
| Delivery attempt logging | **Every attempt, always** | The audit trail behind the guarantee |

**Scaling path, in the order it would actually be needed:**

1. **Web:** horizontal Fargate tasks behind the ALB. Stateless.
2. **Workers:** more tasks. `SKIP LOCKED` means claim contention does not grow with worker
   count.
3. **Database reads:** Aurora read replicas for timeline and gallery queries.
4. **Rate limiting / caching:** introduce ElastiCache **when measured load requires it**, not
   before.
5. **Search:** OpenSearch Serverless at Release 2 (already planned).
6. **Sharding:** not required at any foreseeable Release 1–3 scale. The `vault_id` on every
   table is a natural future shard key, and that is not an accident.

---

← [02 — Technology Decisions](02-TECHNOLOGY-DECISIONS.md) · Next: [04 — Database Architecture](04-DATABASE-ARCHITECTURE.md)
