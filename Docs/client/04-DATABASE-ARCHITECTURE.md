# 04 — Database Architecture

← [Documentation index](README.md)

Seven levels, from what the data *is* down to the DDL, the indexes, and the operational
procedures around them.

> **Status.** Levels 0–3 are decided and binding. Levels 4–5 present the **specified target
> schema** — the physical model TASK-008 and TASK-009 implement in PHASE-01. `packages/db` is
> currently a stub, and the three `db:*` commands deliberately exit with an explanatory message
> rather than reporting success without touching a database. The domain enums and the error
> registry in `packages/shared` **do** exist today, and the database will generate its `CHECK`
> constraints from them so the two cannot diverge.

| Level | Question it answers |
|---|---|
| [**0**](#level-0--what-this-database-holds) | What is in here, and what must never break? |
| [**1**](#level-1--data-domains) | How is it divided into domains? |
| [**2**](#level-2--logical-model-erd) | What are the entities and how do they relate? |
| [**3**](#level-3--physical-model--the-engine-rules) | How does that become PostgreSQL, specifically? |
| [**4**](#level-4--table-level-ddl) | What does each table actually look like? |
| [**5**](#level-5--access-patterns-and-index-justification) | Why does each index exist? |
| [**6**](#level-6--the-scheduler-internals) | How does the clock work? |
| [**7**](#level-7--operations-scale-and-capacity) | How is it operated, backed up, and scaled? |

---

## Level 0 — What this database holds

### 0.1 The data, in plain terms

| Category | Examples | Sensitivity |
|---|---|---|
| **Identity** | Email, phone, passkey credentials, sessions, devices | High |
| **The archive** | Memories, the note attached to each, the date it happened, media metadata | **Highest — undirected family photographs and video of children** |
| **Relationships** | Members (family and friends), relationships, birthdays, interests | High — and these people are **not users** and never consented directly |
| **Promises** | Capsules, recipients, unlock dates, access tokens, delivery attempts | **Highest — obligations that outlive the subscription, and possibly the user** |
| **Structure** | Vaults, memberships, albums, events, occasions | Medium |
| **Commerce** | Subscriptions, entitlements, payments | Medium — PCI scope stays near zero via hosted checkout |
| **Governance** | Audit log, moderation flags, break-glass records, feature flags | High |

The database does **not** hold media bytes. Every byte of every photo, video and audio file
lives in Cloudflare R2, referenced by object key. The database holds the meaning; the object
store holds the mass.

### 0.2 The three invariants

Everything at Levels 3–6 exists to protect one of these three.

> **Invariant 1 — Time survives 2038.**
> Every temporal column is `timestamptz` storing UTC. **`TIMESTAMP` is banned outright.**

> **Invariant 2 — Tenancy is enforced in two places: the application chokepoint, and row-level security beneath it.**
> There is no row-level security. Every table carries `vault_id`, every query is scoped from
> the session, and four independent controls stand in for what the database will not do.

> **Invariant 3 — Identifiers are `uuid` inside, canonical UUID strings at every
> boundary.**
> The binary form never escapes `packages/db`. Tokens are never identifiers.

---

## Level 1 — Data domains

Eleven domains. These are the same boundaries the original brief proposed as eleven
microservices; here they are **schema slices with no cross-domain database access**. A module
that needs another domain's data calls that domain's read functions.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  IDENTITY                    users · sessions · devices · passkey credentials  │
│  ← root of all ownership                                                      │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  TENANCY                     vaults · vault_members                           │
│  ← EVERY authorization check resolves here. The security chokepoint.           │
└───┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────────────┘
    │          │          │          │          │          │
┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼──────────────────┐
│ PEOPLE │ │OCCASION│ │ARCHIVE │ │ MEDIA  │ │ SHARING│ │ PROMISES             │
│        │ │        │ │        │ │        │ │        │ │                      │
│members │ │events  │ │memories│ │media_  │ │shares  │ │capsules              │
│member_ │ │event_  │ │albums  │ │ assets │ │        │ │capsule_recipients    │
│ links  │ │ members│ │album_  │ │upload_ │ │        │ │capsule_memories      │
│        │ │event_  │ │ memorie│ │ sessions│ │        │ │delivery_attempts     │
│        │ │ reminde│ │memory_ │ │        │ │        │ │capsule_replies       │
│        │ │        │ │ members│ │        │ │        │ │  ▲                   │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └──┼───────────────────┘
                                                           │
┌──────────────────────────────────────────────────────────┼───────────────────┐
│  SCHEDULING                  scheduled_jobs  ◄───────────┘                   │
│  ← THE DURABLE CLOCK. The entity the entire product promise rests on.        │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│ NOTIFICATION    │ │ BILLING         │ │ TRUST & SAFETY  │ │ GOVERNANCE       │
│ notifications   │ │ subscriptions   │ │ reports         │ │ audit_logs       │
│ notification_   │ │ payments        │ │ moderation_flags│ │ admin_users      │
│  preferences    │ │ (entitlements   │ │ blocks          │ │ roles/permissions│
│                 │ │  denormalised)  │ │                 │ │ break_glass      │
│                 │ │                 │ │                 │ │ feature_flags    │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └──────────────────┘
```

### 1.1 Entity count by release

| Release | New entities | Running total |
|---|---:|---:|
| MVP core | 18 | 18 |
| **R1** — Member revision, Event, EventMember, EventReminder, Reaction, Report, ModerationFlag, Block, AdminUser, Role, BreakGlassAccess, FeatureFlag | +11 | **~29** |
| **R2** — Festival, Template, Broadcast, BroadcastRecipient, BroadcastOptOut, CollabProject, Contribution, Streak, Badge, UserBadge, Referral, Wishlist, WishlistItem | +13 | ~42 |
| **R3** — commerce ×16, legacy ×3 | +19 | **~61** |

> The jump from 42 to 61 entities at Release 3 is the clearest quantitative argument for
> staging commerce separately: it is roughly **a third of the entire data model**, serving a
> business the product has not yet validated. This is the number behind the recommendation to
> launch gifting as affiliate links first.

---

## Level 2 — Logical model (ERD)

### 2.1 Release 1 core

```
                                 ┌──────────┐
                                 │  users   │
                                 └────┬─────┘
        ┌─────────────────┬───────────┼───────────┬──────────────┬─────────────┐
        │ 1:N             │ 1:1       │ 1:N       │ 1:N          │ 1:N         │
        ▼                 ▼           ▼           ▼              ▼             ▼
   ┌─────────┐    ┌──────────────┐ ┌────────┐ ┌─────────┐  ┌──────────┐ ┌──────────┐
   │ vaults  │    │subscriptions │ │devices │ │ members │  │ events   │ │ sessions │
   └────┬────┘    │(entitlements │ └────────┘ └────┬────┘  └────┬─────┘ └──────────┘
        │         │ denormalised)│                 │            │
        │         └──────────────┘            ┌────┴────────────┴────┐
        │                                     │  event_members  M:N   │
        │                                     └───────────────────────┘
        │                                          │
        │  1:N                                     │  event_reminders 1:N
        ├──────────────► vault_members ──────► users
        │                (role: owner|admin|contributor|viewer)
        │
        │  1:N
        ├──────────────► albums ──────── album_memories (M:N) ────┐
        │                                                          │
        │  1:N                                                     ▼
        └──────────────► memories ◄────────────────────────────────┘
                             │
             ┌───────────────┼────────────────┬──────────────────┐
             │ 1:N           │ M:N            │ 1:N              │ M:N
             ▼               ▼                ▼                  ▼
      ┌─────────────┐  ┌──────────────┐  ┌──────────┐   ┌────────────────┐
      │media_assets │  │memory_members│  │  shares  │   │capsule_memories│
      │             │  │ (who is in   │  │(revocable│   │                │
      │ ─► R2 object│  │  this memory)│  │  link)   │   └───────┬────────┘
      └──────┬──────┘  └──────────────┘  └──────────┘           │
             │                                                   ▼
      ┌──────▼────────┐                                   ┌──────────────┐
      │upload_sessions│                                   │   capsules   │
      │ (resumability)│                                   │  THE PROMISE │
      └───────────────┘                                   └──────┬───────┘
                                                                  │
                                        ┌─────────────────────────┼──────────────┐
                                        │ 1:N                     │ 1:N          │ 1:N
                                        ▼                         ▼              ▼
                            ┌────────────────────┐   ┌───────────────────┐ ┌──────────────┐
                            │capsule_recipients  │   │ delivery_attempts │ │capsule_      │
                            │ · token_hash       │   │ · channel         │ │ replies      │
                            │ · token_version    │   │ · attempt_no      │ │ (recipient   │
                            │ · member_id (null) │   │ · provider_msg_id │ │  answers —   │
                            │ · delivered_at     │   │ · status          │ │  no account) │
                            │ · opened_at        │   │ THE AUDIT TRAIL   │ └──────────────┘
                            └────────┬───────────┘   │ BEHIND THE SLA    │
                                     │               └───────────────────┘
                                     │ 1:N
                                     └──────────► delivery_attempts

   ┌────────────────────────────────────────────────────────────────────────────┐
   │  scheduled_jobs   ──drives──►  capsule delivery · On This Day · recaps ·   │
   │  (THE DURABLE CLOCK)           reassurance · contact refresh · purges ·    │
   │                                integrity sweeps · search indexing [R2]      │
   ├────────────────────────────────────────────────────────────────────────────┤
   │  audit_logs       ──records──► every access to every resource,             │
   │                                every permission change, every capsule       │
   │                                state transition, every admin action         │
   └────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 The relationships that carry the most design weight

| Relationship | Why it is shaped this way |
|---|---|
| `users` **1:N** `vaults` | Every user gets one personal vault at signup. Shared vaults arrive at R2. The vault — not the user — is the unit of authorization, so shared vaults need no schema change later. |
| `vaults` **1:N** `vault_members` **N:1** `users` | **Every authorization check in the system resolves to a row here.** This join is the security model. |
| `memories` **M:N** `capsules` (via `capsule_memories`) | A capsule may carry several memories, and a memory may appear in several capsules. Modelled as a join from the start; collapsing it to a single FK later would be a migration. |
| `capsule_recipients` **N:1** `members`, **nullable** | A recipient may be a saved family member *or* a one-off email address. The nullable FK is deliberate — forcing every recipient to be a Member first would put a form between the user and the promise. |
| `capsule_recipients` **1:N** `delivery_attempts` | Every attempt on every channel is a row. This is what turns a delivery SLA from a claim into a queryable fact. |
| `memories` **1:N** `media_assets` **1:1** `upload_sessions` | The upload session is a first-class entity because without server-side upload state, a mobile upload interrupted at 80% must restart. Unacceptable for 4K video on cellular. |
| `events` **M:N** `members` | An anniversary has two people. A one-to-many model would have needed rework the first time someone added a wedding anniversary. |
| **No** `moments` entity | The product copy uses "memory" and "moment" interchangeably. The model keeps **`memories`** as the single canonical entity. A second near-identical entity would add confusion for no product benefit. Event grouping is `albums` with `type = 'event'`. |

### 2.3 Two modelling decisions worth calling out

**Recurring events are computed, not stored.** A yearly birthday does not create fifty rows.
`events` holds a date and a recurrence rule; occurrences are derived. `event_reminders`
carries `last_fired_for_year` to prevent duplicate reminders — a single small column that
replaces a table of materialised occurrences.

**Entitlements are denormalised onto the subscription row.** `storage_quota_bytes`,
`max_pending_capsules`, `max_capsule_horizon_days`, `max_video_seconds`, `channels_enabled`,
`seats`. Two reasons: every entitlement check becomes a single read, and — more importantly —
**a lapsed subscription's existing obligations remain legible.** The row still says what was
promised. There is deliberately **no `memories_per_month` field**, because that limit does not
exist and a column for it would invite someone to enforce it.

---

## Level 3 — Physical model — the engine rules

Eight rules this schema is held to. Each is a decision taken once and enforced, rather than left to the
PostgreSQL the blueprint assumed, and **each has bitten projects that discovered it late.**

| # | Rule | Why |
|---|---|---|
| 1 | **`timestamptz`, never `TIMESTAMP`** | `TIMESTAMP` ends 2038-01-19. This product sells 2046. Enforced by CI. |
| 2 | **Primary keys are a native `uuid`**, generated as UUIDv7 by the application | UUIDv7 is time-ordered, so new keys land at the right-hand edge of the index instead of scattering through it and fragmenting B-trees on every insert. |
| 3 | **`UTF-8` / `ICU collation`** | Anything less mangles emoji and Indic scripts. This product stores family names and messages in both. |
| 4 | **No native enum types** — `VARCHAR` + a `CHECK` constraint | A PostgreSQL enum value can never be removed; a `CHECK` can be dropped and re-added inside a transaction. The Zod enum in `packages/shared` stays the source of truth; the `CHECK` is the database-side mirror, generated from it. |
| 5 | **No arrays** — join tables | PostgreSQL has arrays, but these rows carry foreign keys and per-row state an array cannot express. Affects tags, recipient lists and channel ladders. |
| 6 | **Partial indexes** — `WHERE state = 'pending'` | The job index covers only live rows rather than every job ever scheduled, on the hottest loop in the product. |
| 7 | **`jsonb` with a GIN index** | A queried path inside a document is indexed directly — no generated shadow columns to keep in step. |
| 8 | **`READ COMMITTED` isolation on the claim loop** | PostgreSQL's default, so no override is needed. A stricter level takes range locks that make `SKIP LOCKED` claim patterns contend badly. |

### 3.1 Invariant 1 in practice — the 2038 rule

`timestamp without time zone` silently drops the offset, and this product delivers into a recipient's local morning decades from now. This product's entire premise is
delivering a message on a date that may be after that.

**`TIMESTAMP` is banned outright** — not discouraged, banned, **including on columns like
`created_at` where the horizon looks irrelevant today.** The failure is silent, and the ban is
only enforceable if it has no exceptions to argue about.

`DATETIME` has no timezone semantics at all, which is *why* the domain's existing
"UTC plus a separate intended-timezone column" pattern fits: the application was always the
thing interpreting the zone. Nothing in the domain design changes; only the column type does.

**Enforcement is mechanical, in three independent places:**

1. **A migration lint in CI** that greps every generated SQL migration for `TIMESTAMP` and
   fails the build.
2. **A schema test** that queries `information_schema.columns` for `data_type = 'timestamp without time zone'` in
   the application schema and asserts zero rows. This catches a column created outside the
   migration pipeline.
3. **A `packages/db` helper — `utcTimestamp()` — that is the only sanctioned way to declare a
   temporal column**, so the correct thing is also the easy thing.

Additionally: connections set `time_zone = '+00:00'` explicitly, and **`NOW()` is never used
for business timestamps.** The application supplies the value, so behaviour is testable and
does not depend on a session variable.

**Two temporal columns carry semantics beyond "when":**

- `unlock_at` **+** `unlock_timezone` — delivery is shifted into a humane 09:00–20:00 local
  window. Receiving "for your 18th birthday" at 03:00 is a bug.
- `occurred_at` **+** `occurred_precision` (`exact` | `day` | `month` | `year`) — **a scanned
  1974 wedding photo has a year, not a timestamp.** Without this column, imported archives
  either lie about their dates or collapse into the upload date. This single field is the
  difference between a real family archive and a broken one.

### 3.2 Invariant 3 in practice — the identifier strategy, and the swap flag

**In the database:** a native `uuid` column — no conversion in either direction. UUIDv7 rather
than v4, because randomly-ordered ids
cause page splits and index fragmentation on **every** insert — and this schema inserts
constantly: memories, jobs, delivery attempts, audit rows.

**The swap flag is `0`, not `1` — and this is the opposite of the common advice.**

**The property to preserve: ids must sort by creation time.** That holds for
UUIDv7.** The flag rearranges the canonical layout from `time_low · time_mid · time_hi` to
`time_hi · time_mid · time_low`. UUIDv1 needs that, because its `time_low` field varies fastest
yet sorts first. **UUIDv7 already puts a 48-bit big-endian timestamp in its first six bytes** —
and its third group is the version nibble plus 12 *random* bits. Swapping promotes those random
bits to the front, so the index orders by randomness, which is precisely the fragmentation the
flag was meant to prevent.

Measured on PostgreSQL 17.46 with two UUIDv7 values one timestamp tick apart:

```
swap 0   A = 018F2C4A1111 7ABC …    B = 018F2C4A2222 7012 …    A < B   ordered by TIME
swap 1   A = 7ABC 1111 018F2C4A …   B = 7012 2222 018F2C4A …   A > B   ordered by RANDOM
```

Reproducible via `scripts/verify-db-assumptions.sh` in this repository. If the project ever
switches to UUIDv1, this decision inverts — which is why it is written down rather than
absorbed into a helper.

**At every boundary** — server actions, route handlers, URLs, Zod schemas, shared types, log
lines — an id is the canonical 36-character string. **The binary form never escapes
`packages/db`.** One Drizzle custom type handles the conversion in both directions, so no
feature module needs a conversion helper at all — the column is a native `uuid`.

Generation is **application-side** (UUIDv7), which keeps id creation testable and lets the
offline outbox mint `client_id` values without a round trip.

> **Tokens are not identifiers.** Capsule unlock tokens and share tokens are separate
> high-entropy random values with their own column and unique index — never a primary key,
> never derivable from one. An id being time-ordered must not make a token guessable.

### 3.3 Invariant 2 in practice — what tenancy costs at the schema level

Because there is no row-level security, **every** content table carries `vault_id` with an
index on it, and a new table cannot merge without four things in the same pull request: the
`vault_id` column, its index, a repository module, and its cell in the permission-matrix test.

On PostgreSQL this was one line — "a new RLS policy in the same migration". **The replacement
is more work, not less, and that is the price of the engine choice.**

**Considered and rejected: driving RLS from a session-scoped setting.** The actor is set with `SET LOCAL` inside the transaction instead. One could
approximate row-level security by setting a session variable at connection checkout
(`SET @app_vault_id = ?`) and defining views that filter on it. Rejected because **with a
connection pool, session state outlives the request that set it.** A connection returned to the
pool carrying a stale `@app_vault_id`, then reused by another tenant's request, produces a
cross-tenant leak **that looks exactly like correct behaviour**. A security control that fails
silently and leaks the wrong way is worse than no control, because it invites the team to relax
the real controls on the strength of it.

### 3.4 Database users — least privilege

| User | Grants | Used by |
|---|---|---|
| `app_rw` | `SELECT, INSERT, UPDATE, DELETE` — **no DDL** | The web application |
| `migrator` | DDL | **CI only.** Never available to a running service |
| `delivery_rw` | Scoped to the tables the delivery engine touches | The delivery worker |
| *(none)* | **No credential at all** | **The media pipeline.** There is nothing to steal |
| `operator_ro` | A distinct connection whose every statement is audit-logged | Admin / break-glass paths |

---

## Level 4 — Table-level DDL

The specified physical schema for the Release 1 core. Conventions: tables are `snake_case`
plural, columns `snake_case`. `CHECK` constraint values are generated from the Zod enums in
`packages/shared`, and a parity test asserts the two match exactly.

### 4.1 `users`

```sql
CREATE TABLE users (
  id                   uuid    NOT NULL,
  email                citext        NOT NULL,   -- case-insensitive
  email_verified_at    timestamptz   NULL,
  phone                VARCHAR(32)   NULL,
  phone_verified_at    timestamptz   NULL,
  name                 VARCHAR(200)  NOT NULL,
  avatar_media_id      uuid    NULL,
  locale               VARCHAR(16)   NOT NULL DEFAULT 'en-IN',
  timezone             VARCHAR(64)   NOT NULL DEFAULT 'Asia/Kolkata',
  plan                 VARCHAR(24)   NOT NULL DEFAULT 'free',
  storage_used_bytes   BIGINT NOT NULL DEFAULT 0,
  storage_quota_bytes  BIGINT NOT NULL,
  created_at           timestamptz   NOT NULL,
  last_seen_at         timestamptz   NULL,
  deleted_at           timestamptz   NULL,
  hard_delete_after    timestamptz   NULL,

  PRIMARY KEY (id),
  CONSTRAINT ck_users_plan CHECK (plan IN ('free','premium','family')),
  CONSTRAINT ck_users_storage CHECK (storage_used_bytes  >= 0
                                 AND storage_quota_bytes >= 0)
);

CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE INDEX ix_users_hard_delete ON users (hard_delete_after);
```

`email` is `citext` — PostgreSQL’s case-insensitive text type, installed as an
extension by migration 0000 — so `Aarav@x.com` and `aarav@x.com` are one
account. Without it a user signs up twice, ends up with two archives, and can
find neither. 320 is the RFC 5321 maximum length. `hard_delete_after` is indexed
because the retention purge job scans it.

**PostgreSQL has no unsigned integer types.** Where an earlier draft of this
document wrote `BIGINT UNSIGNED`, the column is a signed `BIGINT` — the same
range for every value this product stores — and the non-negativity is stated
explicitly as a `CHECK`. The guarantee is identical, and the intent is visible
in the schema rather than implied by a type name.

### 4.2 `vaults` and `vault_members` — the security boundary

```sql
CREATE TABLE vaults (
  id                  uuid   NOT NULL,
  owner_id            uuid   NOT NULL,
  name                VARCHAR(200) NOT NULL,
  type                VARCHAR(16)  NOT NULL DEFAULT 'personal',
  cover_media_id      uuid   NULL,
  default_visibility  VARCHAR(16)  NOT NULL DEFAULT 'private',
  created_at          timestamptz  NOT NULL,
  archived_at         timestamptz  NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_vaults_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT ck_vaults_type CHECK (type IN ('personal','shared','legacy')),
  CONSTRAINT ck_vaults_visibility
    CHECK (default_visibility IN ('private','vault','link','recipients'))
);

CREATE INDEX ix_vaults_owner ON vaults (owner_id);

CREATE TABLE vault_members (
  vault_id    uuid  NOT NULL,
  user_id     uuid  NOT NULL,
  role        VARCHAR(16) NOT NULL,
  invited_by  uuid  NULL,
  joined_at   timestamptz NOT NULL,
  revoked_at  timestamptz NULL,

  PRIMARY KEY (vault_id, user_id),
  CONSTRAINT fk_vm_vault FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
  CONSTRAINT fk_vm_user  FOREIGN KEY (user_id)  REFERENCES users(id),
  CONSTRAINT ck_vm_role  CHECK (role IN ('owner','admin','contributor','viewer'))
);

CREATE INDEX ix_vault_members_user ON vault_members (user_id, revoked_at);
```

**The composite primary key `(vault_id, user_id)` is deliberate.** PostgreSQL clusters on the
primary key, so all members of one vault are physically adjacent — and "resolve this user's
role in this vault" is the single hottest query in the system, executed on **every** read.
`ix_vault_members_user (user_id, revoked_at)` serves the reverse direction: "which vaults may
this user see?", with `revoked_at` in the index so the filter is covered.

### 4.3 `memories` — the atomic unit

```sql
CREATE TABLE memories (
  id                  uuid    NOT NULL,
  vault_id            uuid    NOT NULL,
  author_id           uuid    NOT NULL,
  title               VARCHAR(300)  NULL,
  note                TEXT          NULL,
  occurred_at         timestamptz   NOT NULL,
  occurred_precision  VARCHAR(8)    NOT NULL DEFAULT 'exact',
  occasion            VARCHAR(32)   NULL,
  visibility          VARCHAR(16)   NOT NULL DEFAULT 'private',
  is_favourite        BOOLEAN       NOT NULL DEFAULT false,
  cover_media_id      uuid    NULL,
  client_id           uuid          NOT NULL,
  sync_state          VARCHAR(16)   NOT NULL DEFAULT 'synced',
  search_text         TEXT          NULL,
  created_at          timestamptz   NOT NULL,
  updated_at          timestamptz   NOT NULL,
  deleted_at          timestamptz   NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_memories_vault  FOREIGN KEY (vault_id)  REFERENCES vaults(id),
  CONSTRAINT fk_memories_author FOREIGN KEY (author_id) REFERENCES users(id),
  CONSTRAINT ck_memories_precision
    CHECK (occurred_precision IN ('exact','day','month','year')),
  CONSTRAINT ck_memories_visibility
    CHECK (visibility IN ('private','vault','link','recipients'))
);

CREATE UNIQUE INDEX uq_memories_client ON memories (author_id, client_id);
CREATE INDEX ix_memories_timeline ON memories (vault_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_memories_on_this_day ON memories (vault_id, occurred_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_memories_author ON memories (author_id);
CREATE INDEX ix_memories_trash ON memories (vault_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX ft_memories_search ON memories USING GIN (to_tsvector('simple', search_text));
```

Four things to note:

- **`uq_memories_client (author_id, client_id)`** is what makes offline creation idempotent. The
  outbox retries a create after an ambiguous failure; this unique key turns a would-be duplicate
  into a detectable conflict.
- **`occurred_at`, not `created_at`, drives the timeline.** That is the whole point of the
  product: a scanned 1974 photo belongs in 1974.
- **`search_text`** is maintained by the application — title, note, people, place and tags
  concatenated — and carries a `tsvector` GIN index, with `pg_trgm` alongside it for typo tolerance. Standing in for a dedicated search engine at
  Release 1, replaced by OpenSearch at Release 2.
- **`ix_memories_timeline` is a partial index** — `WHERE deleted_at IS NULL`. PostgreSQL
  supports these, so `deleted_at` stays out of the index key entirely and the index holds
  only live rows. On a table that accumulates for decades, that is the difference between an
  index over every memory ever written and one over the memories a user can actually see.

### 4.4 `media_assets`

```sql
CREATE TABLE media_assets (
  id                  uuid    NOT NULL,
  memory_id           uuid    NOT NULL,
  vault_id            uuid    NOT NULL,   -- denormalised for the scope guard
  owner_id            uuid    NOT NULL,
  kind                VARCHAR(8)    NOT NULL,
  mime                VARCHAR(128)  NOT NULL,
  bytes               BIGINT NOT NULL,
  width               INT  NULL,
  height              INT  NULL,
  duration_ms         INT  NULL,
  storage_key         VARCHAR(512)  NOT NULL,
  thumb_key           VARCHAR(512)  NULL,
  preview_key         VARCHAR(512)  NULL,
  poster_key          VARCHAR(512)  NULL,
  blurhash            VARCHAR(64)   NULL,
  checksum_sha256     CHAR(64)      NOT NULL,
  perceptual_hash     CHAR(32)      NULL,
  captured_at         timestamptz   NULL,
  exif                JSONB          NULL,       -- GPS stripped unless opted in
  transcode_status    VARCHAR(16)   NOT NULL DEFAULT 'pending',
  transcode_variants  JSONB          NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL,
  deleted_at          timestamptz   NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_media_memory FOREIGN KEY (memory_id) REFERENCES memories(id),
  CONSTRAINT ck_media_kind CHECK (kind IN ('image','video','audio')),
  CONSTRAINT ck_media_transcode
    CHECK (transcode_status IN ('pending','processing','ready','failed','skipped')),
  CONSTRAINT ck_media_bytes CHECK (bytes >= 0)
);

CREATE INDEX ix_media_memory ON media_assets (memory_id, sort_order);
CREATE INDEX ix_media_vault ON media_assets (vault_id);
CREATE INDEX ix_media_transcode ON media_assets (transcode_status, created_at);
CREATE INDEX ix_media_checksum ON media_assets (checksum_sha256);
CREATE UNIQUE INDEX uq_media_storage_key ON media_assets (storage_key);
```

**`vault_id` is denormalised onto this table on purpose.** It could be reached through
`memory_id`, but the post-query scope guard (Control 3 in
[05 §3](05-SECURITY-AND-COMPLIANCE.md)) has to check `vault_id` on **every returned row** of
**every** result set. Making that a join would put a join in the hot path of a security
control. The redundancy is the cheaper choice.

`checksum_sha256` is indexed because the monthly integrity sweep verifies stored checksums
against the objects, and Release 2 deduplication uses `perceptual_hash`.

### 4.5 `capsules` — the differentiating entity

```sql
CREATE TABLE capsules (
  id                  uuid    NOT NULL,
  vault_id            uuid    NOT NULL,
  owner_id            uuid    NOT NULL,
  title               VARCHAR(300)  NULL,
  sender_note         TEXT          NULL,
  state               VARCHAR(16)   NOT NULL DEFAULT 'draft',
  unlock_kind         VARCHAR(16)   NOT NULL DEFAULT 'datetime',
  unlock_at           timestamptz   NULL,
  unlock_timezone     VARCHAR(64)   NULL,
  milestone_member_id uuid    NULL,
  milestone_spec      JSONB          NULL,
  sealed_at           timestamptz   NULL,
  editable_until      timestamptz   NULL,
  delivered_at        timestamptz   NULL,
  first_opened_at     timestamptz   NULL,
  cancelled_at        timestamptz   NULL,
  created_at          timestamptz   NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_capsules_vault FOREIGN KEY (vault_id) REFERENCES vaults(id),
  CONSTRAINT fk_capsules_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT ck_capsules_state CHECK (state IN
    ('draft','sealed','delivering','delivered','opened','cancelled','failed')),
  CONSTRAINT ck_capsules_unlock_kind
    CHECK (unlock_kind IN ('datetime','milestone','manual'))
);

CREATE INDEX ix_capsules_scheduler ON capsules (state, unlock_at);
CREATE INDEX ix_capsules_vault ON capsules (vault_id, state);
CREATE INDEX ix_capsules_owner_pending ON capsules (owner_id, state, delivered_at);
```

**`ix_capsules_scheduler (state, unlock_at)` is the scheduler's hot path and must stay tight.**

**`ix_capsules_owner_pending (owner_id, state, delivered_at)`** exists for one specific business
rule: *"pending" means `state = 'sealed'` AND `delivered_at IS NULL`.* Delivered capsules are
**never** counted against the free-tier cap, because the cap is on concurrent obligations, not
on lifetime usage — which is what keeps the growth loop uncapped for free users. That rule is
enforced by a query, so the query gets an index.

**`unlock_kind = 'posthumous'` is deliberately absent** from the `CHECK` constraint even though
the blueprint lists it, because Release 1 does not ship it and the death-verification model it
depends on needs legal counsel per jurisdiction. Adding the value means adding the protocol
behind it.

**The immutability rule** is enforced in the application, not by a constraint: once
`state = 'sealed'`, media and note are frozen. The owner may still cancel, and may update a
recipient's **contact details** but never swap the recipient **identity**.

### 4.6 `capsule_recipients` and `delivery_attempts`

```sql
CREATE TABLE capsule_recipients (
  id                 uuid   NOT NULL,
  capsule_id         uuid   NOT NULL,
  vault_id           uuid   NOT NULL,
  member_id          uuid   NULL,
  name               VARCHAR(200) NOT NULL,
  email              citext       NULL,   -- case-insensitive
  phone              VARCHAR(32)  NULL,
  preferred_channel  VARCHAR(16)  NOT NULL DEFAULT 'email',
  access_token_hash  CHAR(64)     NOT NULL,
  token_version      INT NOT NULL DEFAULT 1,
  delivered_at       timestamptz  NULL,
  opened_at          timestamptz  NULL,
  last_verified_at   timestamptz  NULL,
  guardian_contact   JSONB         NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_cr_capsule FOREIGN KEY (capsule_id) REFERENCES capsules(id)
    ON DELETE CASCADE,
  CONSTRAINT ck_cr_channel
    CHECK (preferred_channel IN ('push','email','sms','whatsapp'))
);

CREATE UNIQUE INDEX uq_recipient_token ON capsule_recipients (access_token_hash);
CREATE INDEX ix_recipient_capsule ON capsule_recipients (capsule_id);
CREATE INDEX ix_recipient_member ON capsule_recipients (member_id);

CREATE TABLE delivery_attempts (
  id                  uuid   NOT NULL,
  capsule_id          uuid   NOT NULL,
  recipient_id        uuid   NOT NULL,
  channel             VARCHAR(16)  NOT NULL,
  attempt_no          INT NOT NULL,
  provider            VARCHAR(32)  NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  status              VARCHAR(16)  NOT NULL,
  error_code          VARCHAR(64)  NULL,
  attempted_at        timestamptz  NOT NULL,
  next_retry_at       timestamptz  NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_da_capsule   FOREIGN KEY (capsule_id)   REFERENCES capsules(id),
  CONSTRAINT fk_da_recipient FOREIGN KEY (recipient_id)
    REFERENCES capsule_recipients(id) ON DELETE CASCADE,
  CONSTRAINT ck_da_channel CHECK (channel IN ('push','email','sms','whatsapp')),
  CONSTRAINT ck_da_status   CHECK (status IN
    ('queued','sent','delivered','bounced','failed','acknowledged'))
);

CREATE UNIQUE INDEX uq_attempt_idempotent ON delivery_attempts (capsule_id, recipient_id, channel, attempt_no);
CREATE INDEX ix_attempt_recipient ON delivery_attempts (recipient_id, attempted_at);
CREATE INDEX ix_attempt_retry ON delivery_attempts (status, next_retry_at);
CREATE INDEX ix_attempt_provider_msg ON delivery_attempts (provider_message_id);
```

**`uq_attempt_idempotent (capsule_id, recipient_id, channel, attempt_no)` is the delivery
engine's correctness guarantee.** A worker that crashes after sending but before recording
cannot double-send: the retry hits the unique key. Without this constraint, a delivery engine
that retries is a delivery engine that sometimes sends the same message twice — which, for a
message from a deceased parent, is its own kind of harm.

**`access_token_hash` is `CHAR(64)`** — a SHA-256 hex digest. **The raw token is never stored.**
`token_version` allows a leaked link to be rotated without destroying the capsule.
`ix_attempt_provider_msg` serves inbound provider webhooks reporting a bounce or a delivery
receipt.

### 4.7 `scheduled_jobs` — the durable clock

**The single highest-consequence table in the schema.**

```sql
CREATE TABLE scheduled_jobs (
  id            uuid    NOT NULL,
  kind          VARCHAR(32)   NOT NULL,
  run_at        timestamptz   NOT NULL,   -- ◄── IF THIS IS EVER `TIMESTAMP`,
  payload       JSONB          NOT NULL,   --      EVERY CAPSULE PAST 2038
  state         VARCHAR(16)   NOT NULL DEFAULT 'pending',  --  SILENTLY BREAKS
  attempts      INT  NOT NULL DEFAULT 0,
  locked_by     VARCHAR(64)   NULL,
  locked_until  timestamptz   NULL,
  last_error    TEXT          NULL,
  created_at    timestamptz   NOT NULL,
  completed_at  timestamptz   NULL,

  PRIMARY KEY (id),
  CONSTRAINT ck_jobs_state CHECK (state IN
    ('pending','claimed','running','completed','failed','dead')),
  CONSTRAINT ck_jobs_kind CHECK (kind IN (
    'capsule_delivery','on_this_day','recap','reassurance',
    'contact_refresh','retention_purge','integrity_sweep',
    'export_assembly','search_index'))
);

CREATE INDEX ix_jobs_claim ON scheduled_jobs (run_at) WHERE state = 'pending';
CREATE INDEX ix_jobs_reaper ON scheduled_jobs (state, locked_until);
CREATE INDEX ix_jobs_kind ON scheduled_jobs (kind, state, run_at);
```

Three engine-specific requirements, all mandatory:

1. **`run_at` is `timestamptz`.** If it is ever `TIMESTAMP`, every capsule past 2038 silently
   breaks. This is the single highest-consequence column in the schema.
2. **The claim transaction runs at `READ COMMITTED`** — see Level 6.
3. **`ix_jobs_claim` is a partial index — `WHERE state = 'pending'`.** It covers only the
   jobs actually awaiting dispatch rather than every job ever scheduled, which on a table that
   accumulates for twenty years is the difference between a small hot index and an enormous
   cold one.

`ix_jobs_reaper (state, locked_until)` serves the reaper that returns rows abandoned by a dead
worker to `pending`.

### 4.8 `shares`

```sql
CREATE TABLE shares (
  id             uuid   NOT NULL,
  vault_id       uuid   NOT NULL,
  owner_id       uuid   NOT NULL,
  resource_type  VARCHAR(16)  NOT NULL,
  resource_id    uuid   NOT NULL,
  token_hash     CHAR(64)     NOT NULL,
  permission     VARCHAR(16)  NOT NULL DEFAULT 'view',
  allow_download BOOLEAN      NOT NULL DEFAULT false,
  password_hash  VARCHAR(255) NULL,
  expires_at     timestamptz  NULL,
  revoked_at     timestamptz  NULL,
  view_count     INT NOT NULL DEFAULT 0,
  last_viewed_at timestamptz  NULL,
  created_at     timestamptz  NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT ck_shares_resource CHECK (resource_type IN ('memory','album')),
  CONSTRAINT ck_shares_permission
    CHECK (permission IN ('view','comment','contribute'))
);

CREATE UNIQUE INDEX uq_shares_token ON shares (token_hash);
CREATE INDEX ix_shares_resource ON shares (resource_type, resource_id);
CREATE INDEX ix_shares_owner_active ON shares (owner_id, revoked_at, expires_at);
```

**Revocation is immediate**: the row is marked revoked and the next request fails. Because
signed media URLs live only 5 minutes, **real-world exposure after revocation is bounded to
minutes rather than forever.** `ix_shares_owner_active` powers the "every active link, its view
count, and when it was last opened" panel the owner sees — one tap to kill any of them.

### 4.9 `audit_logs` — append-only

```sql
CREATE TABLE audit_logs (
  id             uuid   NOT NULL,
  actor_type     VARCHAR(16)  NOT NULL,
  actor_id       uuid   NULL,
  vault_id       uuid   NULL,
  action         VARCHAR(64)  NOT NULL,
  resource_type  VARCHAR(32)  NOT NULL,
  resource_id    uuid   NULL,
  ip_hash        CHAR(64)     NULL,
  user_agent     VARCHAR(512) NULL,
  metadata       JSONB         NULL,
  created_at     timestamptz  NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT ck_audit_actor CHECK (actor_type IN ('user','recipient','system','admin'))
);

CREATE INDEX ix_audit_vault_time ON audit_logs (vault_id, created_at);
CREATE INDEX ix_audit_actor_time ON audit_logs (actor_id, created_at);
CREATE INDEX ix_audit_resource ON audit_logs (resource_type, resource_id, created_at);
CREATE INDEX ix_audit_retention ON audit_logs (created_at);
```

**Append-only, 24-month retention.** `ip_hash` rather than the IP itself — the audit trail
needs to correlate accesses, not identify locations. **`ix_audit_vault_time` exists because the
user's own access log is a product feature**, visible in privacy settings, not just an internal
log. `ix_audit_retention` serves the purge job.

Every admin access to user content **must** write a row here. That is enforced by routing
admin paths through a distinct database connection whose every statement is logged.

### 4.10 `subscriptions` — entitlements denormalised

```sql
CREATE TABLE subscriptions (
  id                            uuid   NOT NULL,
  user_id                       uuid   NOT NULL,
  stripe_customer_id            VARCHAR(64)  NULL,
  razorpay_customer_id          VARCHAR(64)  NULL,
  stripe_subscription_id        VARCHAR(64)  NULL,
  plan                          VARCHAR(24)  NOT NULL,
  status                        VARCHAR(24)  NOT NULL,
  currency                      CHAR(3)      NOT NULL,
  region                        VARCHAR(8)   NOT NULL,
  current_period_end            timestamptz  NULL,
  cancel_at                     timestamptz  NULL,
  -- entitlements, denormalised so every check is a single read
  storage_quota_bytes           BIGINT NOT NULL,
  max_pending_capsules          INT NULL,   -- NULL = unlimited
  max_capsule_horizon_days      INT NULL,   -- NULL = unlimited
  max_video_seconds             INT NOT NULL,
  seats                         INT NOT NULL DEFAULT 1,
  broadcast_recipients_per_month INT NOT NULL DEFAULT 0,
  created_at                    timestamptz  NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_subs_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_subs_plan CHECK (plan IN ('free','premium','family'))
);

CREATE UNIQUE INDEX uq_subs_user ON subscriptions (user_id);
CREATE INDEX ix_subs_stripe ON subscriptions (stripe_subscription_id);
CREATE INDEX ix_subs_period_end ON subscriptions (status, current_period_end);
```

`channels_enabled` and `ai_features_enabled` are **join tables**, not arrays — a deliberate choice, because each row carries state no
array type (Rule 5).

There is deliberately **no `memories_per_month` column.** That limit does not exist, and a
column for it would be an invitation to enforce one.

### 4.11 The remaining Release 1 tables

Specified to the same standard; summarised here for brevity.

| Table | Purpose | Key indexes |
|---|---|---|
| `sessions` | Opaque server-side session rows — **not stateless JWTs**, so revocation is instant | `(token_hash) UNIQUE`, `(user_id, expires_at)` |
| `passkey_credentials` | WebAuthn credentials | `(credential_id) UNIQUE`, `(user_id)` |
| `devices` | APNs / FCM subscription endpoints | `(endpoint) UNIQUE`, `(user_id, failure_count)` |
| `members` | Family and friends — **not users.** Private to the owner, never discoverable | `(owner_id, name)`, `(owner_id, birthday)` |
| `events` | Birthdays, anniversaries, festivals, custom. **Recurrence is a rule; occurrences are computed** | `(owner_id, date)`, `(owner_id, type)` |
| `event_members` | M:N — an anniversary has two people | PK `(event_id, member_id)` |
| `event_reminders` | Offset days, channels, `last_fired_for_year` | `(event_id)`, `(last_fired_for_year)` |
| `memory_members` | Who appears in a memory | PK `(memory_id, member_id)` |
| `albums` / `album_memories` | Curated sets, auto-detected events, shared spaces | `(vault_id, type)`, PK `(album_id, memory_id)` |
| `capsule_memories` | M:N join — a capsule may carry several memories | PK `(capsule_id, memory_id)` |
| `capsule_replies` | The recipient answers. **No account required** | `(capsule_id, created_at)` |
| `upload_sessions` | Resumability — parts, ETags, bytes received | `(user_id, status)`, `(expires_at)`, `(client_id) UNIQUE` |
| `notifications` | In-app notification centre | `(user_id, read_at, created_at)` |
| `notification_preferences` | Per-type, per-channel, quiet hours | PK `(user_id, type)` |
| `reports` / `moderation_flags` / `blocks` | Trust & safety, with an SLA due date on the flag | `(state, sla_due_at)` |
| `admin_users` / `roles` / `permissions` | Admin auth realm, module × action matrix | `(email) UNIQUE` |
| `break_glass_access` | Every admin access to user content: reason, approver, expiry, **and the user notified** | `(target_user_id, created_at)` |
| `feature_flags` | Rollout percentage, segment spec, kill switches | `(key) UNIQUE` |

---

## Level 5 — Access patterns and index justification

**No index exists without a query behind it, and no hot query is without an index.** This is
the mapping.

| # | Access pattern | Frequency | Query shape | Index serving it |
|---|---|---|---|---|
| 1 | **Resolve the actor's role in a vault** | **Every read in the system** | `WHERE vault_id=? AND user_id=?` | `vault_members` PK `(vault_id, user_id)` — clustered, so one page read |
| 2 | Which vaults may this user see? | Every session | `WHERE user_id=? AND revoked_at IS NULL` | `ix_vault_members_user (user_id, revoked_at)` — covered |
| 3 | **Timeline page** | Very high | `WHERE vault_id=? AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT ?` | `ix_memories_timeline (vault_id, deleted_at, occurred_at DESC)` |
| 4 | On This Day | Daily per user | `WHERE vault_id=? AND deleted_at IS NULL AND MONTH/DAY(occurred_at) matches` | `ix_memories_on_this_day` — a **generated column** `occurred_md` is added if profiling shows the function is not sargable (Rule 7 territory) |
| 5 | Memory detail with its media | High | `WHERE memory_id=? ORDER BY sort_order` | `ix_media_memory (memory_id, sort_order)` |
| 6 | **The scheduler claim** | **Every minute, forever** | `WHERE state='pending' AND run_at<=? ORDER BY run_at LIMIT 100 FOR UPDATE SKIP LOCKED` | `ix_jobs_claim (run_at) WHERE state = 'pending'` — a partial index over live jobs only |
| 7 | **Watchdog: any capsule past unlock, undelivered** | Hourly | `WHERE state='sealed' AND unlock_at < ? AND delivered_at IS NULL` | `ix_capsules_scheduler (state, unlock_at)` |
| 8 | **Free-tier pending-capsule count** | Every seal | `WHERE owner_id=? AND state='sealed' AND delivered_at IS NULL` | `ix_capsules_owner_pending` — covered, no table access |
| 9 | **Resolve a capsule token** | Every capsule-link open | `WHERE access_token_hash=?` | `uq_recipient_token` — unique, one lookup, no enumeration surface |
| 10 | Resolve a share token | Every share-link open | `WHERE token_hash=?` | `uq_shares_token` |
| 11 | Provider webhook → attempt | Per delivery receipt | `WHERE provider_message_id=?` | `ix_attempt_provider_msg` |
| 12 | Retry sweep | Per tick | `WHERE status IN (...) AND next_retry_at<=?` | `ix_attempt_retry (status, next_retry_at)` |
| 13 | Transcode queue | Per upload completion | `WHERE transcode_status='pending' ORDER BY created_at` | `ix_media_transcode` |
| 14 | **User's own access log** (a product feature) | On demand | `WHERE vault_id=? ORDER BY created_at DESC` | `ix_audit_vault_time` |
| 15 | Keyword search (R1) | Moderate | `MATCH(search_text) AGAINST (? IN NATURAL LANGUAGE MODE)` | `ft_memories_search` |
| 16 | Storage accounting | Every upload session | `users.storage_used_bytes`, maintained transactionally | PK |
| 17 | Retention purge | Nightly | `WHERE hard_delete_after <= ?` | `ix_users_hard_delete`, `ix_audit_retention` |
| 18 | Upcoming occasions | Daily per user | `WHERE owner_id=? AND date BETWEEN ? AND ?` | `(owner_id, date)` on `events` |

### 5.1 Two things this table is designed to prevent

**Over-indexing.** Every index is a write cost on a schema that inserts constantly. The list
above is short on purpose, and each entry names the query it serves. An index without a named
query gets removed.

**The `N+1` on the security path.** Access pattern 1 runs on **every single read**. If it were
a join through three tables, the tenancy check would be the slowest thing in the product. The
composite clustered primary key on `vault_members` makes it a single page read.

---

## Level 6 — The scheduler internals

### 6.1 Sealing — one transaction

```sql
START TRANSACTION;

  UPDATE capsules
     SET state = 'sealed', sealed_at = ?, editable_until = ?
   WHERE id = $1 AND state = 'draft';
  -- affected rows must be 1; otherwise ROLLBACK.
  -- The state predicate makes this safe against a concurrent double-seal.

  INSERT INTO scheduled_jobs (id, kind, run_at, payload, state, created_at)
  VALUES ($1, 'capsule_delivery', $2, $3, 'pending', $4);

COMMIT;
```

**There is no window in which a capsule is sealed but unscheduled.** PostgreSQL gives us that
transaction, and it is the reason the job table lives in the same database as the capsule rather
than in a queue service.

### 6.2 The claim loop

```sql
-- Once per worker connection, at checkout. NOT per transaction.
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET SESSION time_zone = '+00:00';

START TRANSACTION;

  SELECT id
    FROM scheduled_jobs
   WHERE state = 'pending'
     AND run_at <= ?              -- supplied by the application, never NOW()
   ORDER BY run_at
   LIMIT 100
     FOR UPDATE SKIP LOCKED;

  UPDATE scheduled_jobs
     SET state = 'claimed',
         locked_by = ?,
         locked_until = ?,
         attempts = attempts + 1
   WHERE id IN (...);

COMMIT;
```

**Three details that are easy to get wrong and expensive to get wrong:**

1. **`SET SESSION`, not bare `SET TRANSACTION`.** The bare form is a trap: it applies to the
   *next single transaction only* and leaves `@@transaction_isolation` at `REPEATABLE-READ`.
   Verified against PostgreSQL 17.46 — see `scripts/verify-db-assumptions.sh`.

2. **Why `READ COMMITTED` matters here.** It is PostgreSQL's default, so no override is needed. A stricter isolation level takes **range locks**
   on range scans. Two concurrent claim loops running
   `WHERE state='pending' AND run_at <= now()` would **block each other instead of skipping**,
   turning a horizontally-scalable worker pool into a serialised one.

3. **`run_at <= ?` with an application-supplied value, not `NOW()`.** Business timestamps come
   from the application so behaviour is testable and does not depend on a database session
   variable.

### 6.3 The three safety nets

| Net | Cadence | What it catches | Escalation |
|---|---|---|---|
| **Reaper** | Every tick | Rows `claimed` by a worker that died — `locked_until` has passed. Returned to `pending` | Automatic |
| **Watchdog** | **Hourly** | **Any capsule past `unlock_at` with no successful delivery attempt.** Catches what retries cannot: the job row that was never created, the worker that never ran, the state machine that stuck | CloudWatch custom metric → alarm → SNS → **PagerDuty. Sev-0** |
| **Integrity sweep** | **Monthly** | Every sealed capsule still has a valid future job row · its media objects still exist and checksum correctly · recipient contact details are not stale | Re-enqueue, or nudge the owner |

> The failure mode of a twenty-year promise is not a crash — a crash is loud. It is **silent
> rot**: bit rot in a stored object, an email address that stopped working in 2032, a job row
> lost to a bad migration in 2029. The integrity sweep is the only thing in the system that
> looks for those, and it is the reason the guarantee can be stated as an operational fact
> rather than an intention.

---

## Level 7 — Operations, scale and capacity

### 7.1 Migrations

| Aspect | Approach |
|---|---|
| Tool | Drizzle Kit — `pnpm db:generate` → reviewable SQL → `pnpm db:migrate` |
| Source of truth | `packages/db` — **one schema shared by web and workers.** No drift is structurally possible |
| Who runs DDL | The `migrator` user, **in CI only.** The application user has no DDL grant |
| CI gates on every migration | ① grep migrations for `timestamp` not followed by `with time zone` → fail ② `information_schema` assertion: zero naive-timestamp columns ⑤ every tenant-scoped table has an RLS policy ③ enum-parity test: every `CHECK` matches its Zod enum exactly ④ every new table has `vault_id`, an index on it, a repository module, and its permission-matrix cell |
| Enum changes | An `ALTER TABLE ... DROP CHECK` / `ADD CHECK` pair that revalidates every row. **Cheap now, slow later** — which is the argument for getting the enum values right at design time |
| Preview environments | One schema per pull request on a shared Aurora preview cluster, created and dropped by CI. Aurora fast cloning is opt-in per PR by label for the rare case needing production-shaped volume |

### 7.2 Backup and recovery

| Layer | Mechanism | Target |
|---|---|---|
| Database PITR | Aurora point-in-time recovery, 30-day window | RPO minutes |
| Database logical | Daily encrypted logical dumps to a separate location | RPO 24 h |
| Cross-region | Automated cross-region snapshot replication **from day one** | Region loss survivable |
| Media primary | Cloudflare R2, multi-region | — |
| Media secondary | **A different provider** (Backblaze B2 / Glacier Deep Archive), synced nightly | Vendor loss survivable |
| **Verification** | **Quarterly restore drills, documented, with measured RTO/RPO** | A backup nobody has restored is a rumour |
| Integrity | Annual sweep verifying stored `checksum_sha256` against objects | Catches bit rot before a user does |

**The loss of a sealed capsule is a Sev-0 incident, on the same footing as a data breach** —
because it is the same failure of the same promise.

### 7.3 Capacity model

Modelled estimates with stated assumptions, for sizing rather than forecasting.

**Assumptions:** 100,000 users · 20% paying · a free user averages 300 memories / 2 GB · a
paying user averages 2,000 memories / 60 GB · 2.2 media assets per memory · 3 pending capsules
per active user.

| Table | Est. rows | Est. row size | Est. size | Note |
|---|---:|---:|---:|---|
| `users` | 100 K | ~400 B | ~40 MB | |
| `vaults` | 105 K | ~250 B | ~26 MB | |
| `vault_members` | 130 K | ~80 B | ~10 MB | Clustered on `(vault_id, user_id)` |
| `memories` | ~64 M | ~600 B + TEXT | **~45 GB** | Largest content table |
| `media_assets` | ~140 M | ~500 B | **~70 GB** | Largest table overall |
| `capsules` | ~1.5 M | ~350 B | ~500 MB | |
| `capsule_recipients` | ~3 M | ~450 B | ~1.3 GB | |
| `delivery_attempts` | ~12 M | ~250 B | ~3 GB | Grows with retries, not users |
| `scheduled_jobs` | ~2 M live | ~600 B | ~1.2 GB | Completed rows archived out after 90 days |
| `audit_logs` | ~500 M | ~350 B | **~175 GB** | **24-month retention makes this the fastest-growing table.** Partitioned by month, oldest partition dropped |
| `events`, `members`, misc | ~5 M | — | ~2 GB | |
| **Total** | | | **~300 GB** | Comfortably inside Aurora Serverless v2 |

**Media in object storage** on the same assumptions: ~1.4 PB. **This — not the database — is
the cost base**, and it is exactly why zero-egress storage and originals-older-than-24-months
tiering into infrequent-access are not optimisations but structural requirements.

### 7.4 Scaling path, in the order it would actually be needed

1. **Aurora Serverless v2 auto-scales capacity** — no action.
2. **Read replicas** for timeline and gallery queries — the obvious first move, since reads
   dominate.
3. **Partition `audit_logs` by month** and drop the oldest partition on the retention schedule.
   Planned from the start, because retrofitting partitioning on a 500 M-row table is a
   maintenance window nobody wants.
4. **Archive completed `scheduled_jobs`** to a cold table after 90 days, keeping the claim
   index tight. *The claim index's performance is the delivery guarantee's performance.*
5. **Semantic search via `pgvector`** at Release 2 — already planned, and it stays inside PostgreSQL rather than taking load off
   PostgreSQL.
6. **Introduce ElastiCache** when measured load requires it. Not before.
7. **Extract commerce** to its own service and schema at Release 3, if it ships. Different
   scaling profile, different compliance surface.
8. **Sharding — not required at any foreseeable Release 1–3 scale.** But `vault_id` on every
   content table is a natural shard key, and **that is not an accident.** The tenancy column
   that exists for security also happens to be the correct partition key, which is the one
   genuine consolation for having no row-level security.

### 7.5 Data lifecycle

| Event | Behaviour |
|---|---|
| Delete a memory | Soft delete → **30-day Trash, recoverable** → hard delete of every variant across primary *and* backup storage → an `audit_logs` row. A deletion certificate is available on request |
| Delete an account | Step-up authentication → **pending capsules surfaced explicitly**, because deleting an account cancels promises the user made to *other people*, and that must never be a surprise → immediate loss of access → 30-day grace period → irreversible purge of rows, all storage variants, backups on their next cycle, and search indexes, with a completion record retained |
| Export | Every original file plus a JSONB manifest of all metadata, memories, capsules and people, assembled as a background job, delivered as a signed link valid 7 days. **No paywall, no watermark, no degradation** — this is a trust feature, not a compliance chore |
| Non-payment | **Memories are never deleted, and a sealed capsule is never cancelled.** New long-horizon capsules require an active subscription; existing ones are honoured |
| Cost tiering | Originals older than 24 months with no access move to infrequent-access storage; derivatives stay hot |

---

← [03 — System Design](03-SYSTEM-DESIGN.md) · Next: [05 — Security, Privacy & Compliance](05-SECURITY-AND-COMPLIANCE.md)
