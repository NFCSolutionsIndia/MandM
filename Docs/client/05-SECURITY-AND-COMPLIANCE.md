# 05 — Security, Privacy & Compliance

← [Documentation index](README.md)

---

## 1. The threat model, in one line

> **The worst realistic outcome is one user's private family video becoming visible to another
> user, or to the internet.**

Everything in this document is prioritised against that sentence. Not downtime, not data loss —
those are recoverable and are handled in [03 §9](03-SYSTEM-DESIGN.md). A cross-tenant leak is
not recoverable, because you cannot un-see a photograph of someone's child.

This product holds the most sensitive category of consumer data there is: undirected family
photographs, video of children, voice recordings, and messages intended to be read after the
sender has died. **Privacy is not a feature here — it is the product's licence to operate.**

### 1.1 Ranked threats and the primary control for each

| Rank | Threat | Primary control | Section |
|---|---|---|---|
| 1 | **Cross-tenant read** — one family's memories reach another | A single authorization chokepoint with four compensating controls | [§3](#3-authorization--the-single-chokepoint) |
| 2 | **A capsule token leaks or is guessed** | 32-byte CSPRNG tokens, stored hashed, versioned for rotation, never derived from an id | [§5](#5-tokens-and-link-security) |
| 3 | **A media object becomes publicly readable** | No public objects, ever. 5-minute signed URLs minted only after authorization | [§4](#4-media-security) |
| 4 | **Remote code execution via FFmpeg on untrusted media** | Isolated workers with no database credentials and no internet route | [§4.3](#43-the-transcode-container-is-treated-as-hostile) |
| 5 | **Account takeover** | No passwords. Passkeys primary; hashed, rate-limited OTP fallback; step-up auth on sensitive actions | [§2](#2-authentication) |
| 6 | **Insider / operator access to user content** | Break-glass records with an approver, an expiry, mandatory audit, **and the user notified** | [§7](#7-audit-logging-and-operator-access) |
| 7 | **A capsule silently fails to deliver** | Watchdog + integrity sweep. Treated as **Sev-0**, on the same footing as a breach | [03 §5](03-SYSTEM-DESIGN.md) |
| 8 | **Illegal content hosted** | CSAM hash-matching on upload from day one; report/block; a moderation queue with an SLA | [§9](#9-trust--safety) |

---

## 2. Authentication

**No passwords.** Nothing to phish, leak, reuse, or forget on a vault meant to last a lifetime.

| Mechanism | Role | Detail |
|---|---|---|
| **Passkeys (WebAuthn)** | Primary | Also supplies the promised biometric app lock, at no extra cost |
| **Email OTP** | Fallback | 6 digits, single-use, 10-minute expiry, 5 attempts, **hashed at rest**, rate-limited per email *and* per IP |
| **Google / Apple OAuth** | Optional | For users who prefer it |

**Sessions are opaque server-side rows, not stateless JWTs**, so revocation is instant. A JWT
that cannot be revoked until it expires is the wrong trade for a product where "sign me out of
that device now" is a genuine safety need. HTTP-only, `Secure`, `SameSite=Lax` cookies; a
30-day rolling window with a sliding refresh; a device list with individual revoke and "sign out
everywhere".

**Step-up re-authentication is required for:** changing email · adding a passkey · deleting the
account · exporting all data · assigning an heir (R3) · sealing a posthumous capsule (R3).

**One deliberate design choice in the error copy.** There is exactly one code for "sign-in did
not work", whatever the reason — `AUTH_CREDENTIALS_REJECTED`, worded to be true whether or not
the account exists. There is deliberately **no `AUTH_NO_SUCH_ACCOUNT`**, and adding one would be
a security regression: it turns the sign-in form into an **account-enumeration oracle** for
anyone holding a list of email addresses.

---

## 3. Authorization — the single chokepoint

### 3.1 The one rule

Every read and every write resolves the actor to exactly one of three things:

1. a **vault role** — `owner` | `admin` | `contributor` | `viewer`
2. an **active share** — not expired, not revoked, PIN satisfied
3. a **delivered capsule recipient**

**There is no fourth path. Nothing is readable by virtue of knowing an id.**

- **Deny by default.**
- Every query is scoped by `vault_id` **derived from the session**, never from client input.
- **Client-supplied ids are untrusted filters, never authorization.** An unguessable id is not
  a permission.

### 3.2 Why this needs four controls instead of one

The original design had **two independent layers**: application authorization, and PostgreSQL
row-level security beneath it — so that a single application bug could not leak one family's
memories to another.

**PostgreSQL row-level security sits beneath the application chokepoint as an independent second layer.** The application authorization layer is not the *only* thing
between tenants.

That is a material reduction in safety for a product where a permission bug is a privacy
incident rather than a defect. It was accepted deliberately at the product-owner level, and it
is paid for with **four compensating controls. All four are mandatory. None is individually as
good as row-level security; the argument is that together they fail independently.**

### 3.3 Control 1 — Feature code physically cannot reach the database

No `db.select()`, `db.insert()`, `db.update()` or `db.delete()` anywhere outside `lib/db` and
`lib/authz`. Feature modules call repository functions that require a scope token.

**Enforced mechanically, not by review:** an ESLint `no-restricted-imports` rule bans importing
the Drizzle client from `src/features/**`, and CI fails on violation. **A reviewer who misses it
does not matter; the build stops.**

### 3.4 Control 2 — The scope token is unforgeable at the type level

`lib/authz` is the only module that can construct a `VaultScope`. Its constructor is private to
the module and it carries a branded type, so a repository signature reads:

```ts
function listMemories(scope: VaultScope, filters: MemoryFilters): Promise<Memory[]>
```

There is no way to call it without having passed through authorization first. **A forgotten
`WHERE vault_id = ?` becomes a *type* error rather than a data leak**, because the scope is what
supplies the predicate.

### 3.5 Control 3 — Every result set is re-checked after the query

A cheap post-query guard asserts that **every returned row's `vault_id` matches the scope.**

It is redundant by design — it only ever fires if Control 2 was subverted or a raw query slipped
through. On mismatch:

- **fail closed** — throw, return nothing
- emit a Sentry event at **fatal** severity
- write an `audit_logs` row

This is the closest available substitute for "the database refused", and unlike row-level
security **it produces an alert rather than silence.** Cost is one comparison per row.

> **It is not negotiable on read paths, and it must never be disabled in a hot path.** If it
> fires, that is a privacy incident in progress, not a performance problem.

This is also why `vault_id` is denormalised onto `media_assets` — the guard runs on every row of
every result set, and making it a join would put a join in the hot path of a security control.

### 3.6 Control 4 — Least-privilege database users

| User | Grants |
|---|---|
| Application | `SELECT/INSERT/UPDATE/DELETE`, **no DDL** |
| Migrator | DDL, **in CI only** |
| **Media workers** | **No database credentials at all — there is nothing to steal** |
| Admin / operator | A distinct connection whose **every statement is audit-logged** |

### 3.7 Considered and rejected: emulating row-level security with session variables

Rejected alternative: driving RLS from a *session*-scoped setting applied at connection checkout
(`SET @app_vault_id = ?`) and defining views that filter on it.

**Rejected.** With a connection pool, **session state outlives the request that set it.** A
connection returned to the pool carrying a stale `@app_vault_id`, then reused by another
tenant's request, produces a cross-tenant leak **that looks exactly like correct behaviour.**

> A security control that fails silently and leaks the wrong way is worse than no control,
> because it invites the team to relax Controls 1–3 on the strength of it.

### 3.8 The permission matrix

Encoded as an executable table with **one positive and one negative test per cell.** A failing
cell fails CI.

| Action | Owner | Vault admin | Contributor | Viewer | Share-link holder | Capsule recipient |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| View memory | ✓ | ✓ | ✓ | ✓ | ✓ if granted | ✓ **after delivery** |
| Download original | ✓ | ✓ | own only | if allowed | if allowed | if allowed |
| Create memory | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit memory | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Delete memory | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Comment (R2) | ✓ | ✓ | ✓ | if granted | if granted | ✓ as a reply |
| Create a share link | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Revoke a share link | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| **Seal a capsule** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Cancel a capsule** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Invite members | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete the vault | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Transfer to an heir (R3) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

**This suite is load-bearing.** With row-level security gone, it is the only automated proof the
system isolates tenants. It runs on every pull request against a real PostgreSQL instance
(Testcontainers), and it is **not permitted to be skipped, quarantined, or marked flaky.**

Two things partially close the gap left by losing SQL-level assertions:

- **A negative test per cell**, executed against seeded cross-tenant data, so the *absence* of a
  leak is asserted explicitly rather than assumed.
- **A raw-SQL escape-hatch test** that deliberately issues an unscoped query, proving Control 3
  actually fires — so the guard itself is covered, not taken on faith.

**This is built in PHASE-02, before any content exists.** Retrofitting authorization is
precisely how privacy incidents happen.

---

## 4. Media security

### 4.1 No public objects, ever

Every byte is served via a **5-minute signed URL** (60 minutes for a download), minted only
after an authorization check. Signed URLs are bound to the resource, are not enumerable, and
minting is rate-limited per user so a leaked link cannot be turned into a public CDN.

Key layout `vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}` makes per-vault deletion,
accounting and export a prefix operation.

### 4.2 Upload validation

- **Magic-byte validation**, never file extension or client-declared MIME type.
- **SVG upload is rejected outright** — it is an XSS vector disguised as an image.
- A size cap per tier, a file-count cap per memory, a recipient-count cap per capsule.
- **GPS/EXIF location is stripped by default** and retained only on explicit opt-in.
- **CSAM hash-matching (PhotoDNA-class) on upload**, as legally required. This is a specific,
  documented exception to the no-scanning commitment and **must be disclosed in the privacy
  policy** rather than left implicit.

### 4.3 The transcode container is treated as hostile

FFmpeg parsing untrusted media is a known remote-code-execution surface. The design assumes
compromise and limits the blast radius to nothing:

| Control | Effect |
|---|---|
| **IAM task role grants object storage access and nothing else** | There is no Secrets Manager entry for the database — **no credential exists to steal** |
| **Private subnet with no NAT gateway** | No route to the open internet. Exfiltration has nowhere to go |
| **Security-group egress default-deny** with explicit allows | Controlled egress path to storage only |
| **Media arrives and leaves by object key on the job row** | The worker never learns a `vault_id`, a user, or a session |
| **A separate ECS service from the delivery engine** | Delivery needs database and email credentials; media must never have them. Two services, two roles, is what makes this enforceable |

A fully compromised media worker gains: one object key, and no way to reach anything else.

---

## 5. Tokens and link security

**Tokens are not identifiers, and identifiers are not tokens.**

| Property | Value |
|---|---|
| Generation | 32 bytes from a CSPRNG, base62url-encoded |
| Storage | **Hashed (SHA-256).** The raw token is never stored |
| Derivation | **Never derived from an id.** An id being time-ordered must not make a token guessable |
| Rotation | A `token_version` column, so a leaked link can be rotated **without destroying the capsule** |
| Indexing | Its own column with a unique index — never a primary key |
| Search-engine exposure | `X-Robots-Tag: noindex, nofollow, noarchive`, and excluded in `robots.txt`. **A shared memory must never appear in a search engine** |

### 5.1 Share links

Every link carries a permission level, an optional expiry, an optional password, a download
flag, and a view counter. The owner sees a live list of every active link, its view count, and
when it was last opened — and can kill any of them in one tap.

**Revocation is immediate.** The row is marked revoked and the next request fails. Because
signed media URLs live only 5 minutes, **real-world exposure after revocation is bounded to
minutes rather than forever.** That is a meaningful, honest number, and it is the reason the
5-minute TTL is not tuned upward for convenience.

### 5.2 Capsule access — the special case

A capsule grants access *in the future*, which creates rules nothing else in the product has:

- **Before delivery:** only the owner sees the contents. The recipient's token resolves to a
  countdown page revealing the sender's name and the unlock date — **never the media, never the
  note.**
- **At delivery:** the token becomes valid for content. **The access is logged.**
- **The recipient never needs an account.** Requiring one at that moment would be the cruellest
  possible product decision.
- **The owner can cancel any time before delivery. After delivery, the recipient's copy
  persists** — retracting a delivered gift is not a coherent promise, and the UI states this
  plainly rather than implying otherwise.

---

## 6. API, transport and encryption

### 6.1 API security

Zod validation at every boundary — server actions, route handlers, webhooks. **The client copy
is convenience; the server copy is truth.**

- Strict CSRF protection on mutations, using server actions' built-in origin checking.
- CORS locked to known origins.
- No user-supplied HTML rendered anywhere without sanitisation.
- A strict CSP with nonces, `frame-ancestors 'none'`, `object-src 'none'`.
- HSTS with preload · `Referrer-Policy: strict-origin-when-cross-origin` ·
  `Permissions-Policy` limiting camera and microphone to same-origin only.
- **Webhook signature verification with replay protection** — a timestamp window plus event-id
  deduplication — on Stripe, Razorpay, Resend and Twilio.

### 6.2 Rate limiting

At the edge (CloudFront + AWS WAF rate-based rules) **and** at the application layer, per user
and per IP:

| Endpoint | Limit |
|---|---|
| Auth endpoints | 5 / min |
| OTP requests | 3 per 15 min **per email** |
| Upload-session creation | 60 / min |
| Signed-URL minting | 300 / min |
| Share-link creation | 20 / hour |
| Capsule sealing | 50 / day |
| Share-link **access** | Limited per token, to blunt enumeration |
| AI job submission (R2) | Capped per tier per day |

Exceeding a limit returns `429` with `Retry-After` **and a clear UI message — never a silent
failure.**

### 6.3 Encryption, stated honestly

| Layer | Reality |
|---|---|
| **In transit** | TLS 1.3 everywhere, HSTS preload, no mixed content |
| **At rest — database** | Aurora encryption, AES-256, KMS-managed |
| **At rest — objects** | R2 server-side encryption, AES-256 |
| **Application-level** | OTP hashes, session tokens, share tokens and capsule tokens all stored hashed (SHA-256). Payment provider ids treated as secrets. Column-level encryption available for PII fields where warranted |

> **The honesty requirement.** The inherited marketing copy says *"Military-grade security
> ensures your private vaults remain strictly yours."* With server-side thumbnailing,
> transcoding and search, **the service *can* technically read content.** The privacy page must
> state exactly that, plainly.
>
> Overstating encryption is both a legal risk and a betrayal of the specific trust this product
> sells. End-to-end encryption is offered later as an explicit opt-in tier, with its trade-offs
> stated: it is **mutually exclusive** with server-side thumbnails, transcoding, search and every
> AI feature.

### 6.4 Secrets management

No secrets in the repository, enforced by a pre-commit scanner **and** CI secret scanning.
`.gitignore` covers `.env` and every `.env.*` variant plus `*.pem`, `*.key`, `*.p8`, `*.p12`
and `secrets/`; only `.example` files are trackable and those must never contain a real value.

AWS Secrets Manager with rotation — **no secret in an environment variable in a task
definition.** Separate credentials per environment. A documented quarterly rotation schedule.
Least-privilege storage credentials: **workers can write derivatives but cannot delete
originals.** No production credentials on developer machines — preview environments use seeded
synthetic data. CI reaches AWS by **OIDC role assumption; no long-lived access keys in GitHub,
ever.**

---

## 7. Audit logging and operator access

**Append-only, 24-month retention.** Logged: every content access (by user, recipient *or*
admin) · every permission change · every share creation and revocation · every capsule state
transition · every delivery attempt · every admin action · every auth event.

**The user's own access log is visible to the user** in privacy settings. That is the point —
this is a trust feature surfaced to the person whose data it is, not merely an internal log.
Control is only meaningful if it is *verifiable*.

**Alerting on anomalies:** bulk downloads · unusual share-link creation · repeated failed
authorization · **any admin content access.**

### 7.1 Break-glass — operator access to user content

Sometimes support genuinely needs to see a user's content. That is designed for rather than
improvised:

- A `break_glass_access` row recording the **admin, the target user, the reason, the approver,
  and an expiry.**
- A distinct database connection whose every statement is audit-logged.
- **The user is notified.**
- The admin auth realm sits on a separate subdomain with **mandatory hardware MFA** and full
  auditing.

---

## 8. Privacy commitments, made enforceable

The inherited site pledges *"No ads. No data mining. Just your life, beautifully preserved."*
The commitment is kept, and made specific:

| Commitment | Mechanism |
|---|---|
| **No advertising, ever. No sale or brokering of personal data.** | Structural — there is no ad system and no data pipeline to a third party |
| **No third-party trackers inside the authenticated app** | Analytics is first-party (PostHog), event-based, no PII, and **never media content** in a payload |
| **AI processing is opt-in and per-purpose** | A clear statement of what leaves the device, to which provider, and for how long; a contractual commitment that user content is not used to train third-party models; and **one global "process nothing with AI" switch that genuinely disables** captioning, transcription and embeddings |
| **GPS/EXIF location stripped by default** | Retained only on explicit opt-in |
| **No behavioural profiling of minors** | The product is *about* children by design. No profiling, no facial recognition of minors, and an age gate at account creation (13+/16+ by jurisdiction) |
| **Biometrics deferred** | Face grouping is not built in any release covered here — see §10 |
| **Data export is free and complete** | No paywall, no watermark, no degradation. Charging an export tax on a memory vault is indefensible |

---

## 9. Trust & safety

Present from **Release 1**, not deferred — a media service without a report path and a takedown
workflow is a legal exposure from its first public user.

| Capability | Release 1 scope |
|---|---|
| **CSAM hash-matching on upload** | Day one. A non-negotiable legal duty |
| **Report / block** | User-initiated, on content and on people |
| **Moderation queue** | With an **SLA due date on every flag**, so the queue has a deadline rather than a backlog |
| **Classifier signals** | Nudity / violence / spam scores feeding flag severity |
| **Appeal path** | A state on the flag, so a wrong takedown is correctable |
| **DMCA and CSAM reporting paths** | **Staffed from day one** |

---

## 10. Compliance posture

| Regime | Position |
|---|---|
| **GDPR** | Lawful basis documented, DPA available, full data-subject rights implemented (access, export, erasure, rectification), EU data-residency option |
| **CCPA / CPRA** | Covered by the same export and deletion machinery |
| **COPPA** | Considered specifically, because content is largely *about* children even though account holders are adults. Age gate at signup; no behavioural profiling of minors |
| **Biometric statutes (BIPA, CUBI, Washington)** | **The gating factor for face grouping.** When built, it requires separate explicit written consent, a retention schedule, a deletion path, and geo-disabling in Illinois, Texas and Washington absent a specific compliance review. **This is the single largest legal risk in the inherited feature list and must not slip into an early release by accident** |
| **DMCA / CSAM** | Reporting paths staffed from day one |
| **SOC 2** | A later goal — logging and access controls are built to suit it from the start rather than retrofitted |
| **Deceased persons** | Memorial content and posthumous delivery need a documented policy on who may act for a deceased user. **Open — requires a product decision and legal review before Release 3** |

---

## 11. Assurance activities

Scheduled in PHASE-09, before launch. **This phase is not compressible: this product's failure
modes are privacy incidents.**

| Activity | Scope |
|---|---|
| **Permission-matrix suite** | Every cell, positive and negative, against real PostgreSQL, plus RLS assertions. A CI gate |
| **Tenant-isolation testing** | Seeded cross-tenant data, with the absence of leaks asserted explicitly |
| **External penetration test** | **Focused specifically on IDOR and token handling** — the two highest-ranked threats |
| **Dependency and secret scanning** | Full pass |
| **CSP and security-header verification** | Automated |
| **Load testing** | Upload and signed-URL minting — the two paths where a limit failure is a cost event |
| **WCAG 2.2 AA audit** | With a screen reader, on real devices |
| **Device-lab testing** | iOS Safari, Android Chrome, a mid-range Android, a slow tablet, desktop |
| **The first restore drill** | Executed and documented, with measured RTO/RPO |
| **Runbooks** | Delivery failure, storage outage, data-breach response |
| **Delivery-SLA monitor live** | With staffed alerting and an on-call rota |

---

## 12. The five statements that summarise this document

1. **There is exactly one path to content, and it is `lib/authz`.** Feature code physically
   cannot reach the database; the scope token cannot be forged; every result set is re-checked;
   and the database user has no DDL. Four controls, chosen because they fail independently.
2. **No media object is ever publicly readable**, and exposure after a revocation is bounded to
   five minutes — a real number, not a reassurance.
3. **A capsule token is a 32-byte random value stored hashed, versioned for rotation, and never
   derived from an id.** Knowing an id grants nothing.
4. **The transcode container is assumed compromised** and holds nothing worth stealing: no
   database credential, no internet route, no tenant identity.
5. **Encryption is described accurately.** The service can technically read content, the privacy
   page says so, and the end-to-end tier is offered later with its trade-offs stated rather than
   implied today.

---

← [04 — Database Architecture](04-DATABASE-ARCHITECTURE.md) · Next: [06 — Delivery Roadmap & Business Plan](06-DELIVERY-ROADMAP-AND-BUSINESS-PLAN.md)
