import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  CAPSULE_STATE,
  DELIVERY_CHANNEL,
  DELIVERY_STATUS,
  JOB_KIND,
  JOB_STATE,
  UNLOCK_KIND,
} from '../../shared/enums.js';
import { mediaAssets, memories } from './archive.js';
import {
  citext,
  createdAt,
  enumCheck,
  enumColumn,
  opaqueToken,
  updatedAt,
  utcTimestamp,
  uuidPk,
  uuidRef,
  vaultScope,
} from './columns.js';
import { users } from './identity.js';
import { members } from './people.js';
import { vaults } from './tenancy.js';

/**
 * Promises — the domain the product exists for.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything else here is storage. This is the part that has to still work
 *  in 2046.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A capsule is a message sealed today and opened on a date that may be twenty
 * years away, by a recipient who may have no account, no app, and an email
 * address that has changed twice in the meantime.
 *
 * Three constraints in this file each prevent a specific harm, and they are
 * worth naming up front:
 *
 *   uq_attempt_idempotent   a crashed-then-retried worker cannot send the same
 *                           message twice
 *   unlock_timezone         a message from a dead parent does not arrive at
 *                           03:00
 *   token_version           a leaked link can be rotated without destroying
 *                           the capsule
 */

/**
 * `capsules` — the differentiating entity.
 *
 * The state machine is the product. `draft` is editable; `sealed` is a promise;
 * everything after is the machinery of keeping it.
 */
export const capsules = pgTable(
  'capsules',
  {
    id: uuidPk(),

    vaultId: vaultScope().references(() => vaults.id, { onDelete: 'restrict' }),

    /**
     * Only this user may seal or cancel.
     *
     * `restrict`, like `vaults.owner_id`: an account purge must not quietly
     * cancel promises the user made to other people. That has to be an explicit
     * decision taken in daylight.
     */
    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    title: varchar('title', { length: 300 }),

    /**
     * The message. **Frozen once sealed**, enforced by a trigger rather than by
     * convention — see migration 0005.
     */
    senderNote: text('sender_note'),

    state: enumColumn('state', CAPSULE_STATE).notNull().default('draft'),

    unlockKind: enumColumn('unlock_kind', UNLOCK_KIND)
      .notNull()
      .default('datetime'),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  If this column is ever a naive `timestamp`, every capsule past 2038
     *  silently breaks.
     * ═════════════════════════════════════════════════════════════════════
     *
     * `utcTimestamp()` makes that impossible by construction, which is the
     * entire reason that helper exists.
     */
    unlockAt: utcTimestamp('unlock_at'),

    /**
     * The zone the sender *intended*, stored separately from the instant.
     *
     * An instant alone cannot answer "deliver this on her birthday morning".
     * Without this column a message written for a daughter in Pune and
     * scheduled from a laptop in London arrives at 03:00 her time — which, for
     * a message from someone who has died, is a cruelty the schema can prevent.
     */
    unlockTimezone: varchar('unlock_timezone', { length: 64 }),

    /** "Open when Aarav turns 18." The member whose milestone it is. */
    milestoneMemberId: uuidRef('milestone_member_id').references(
      () => members.id,
      { onDelete: 'restrict' },
    ),

    /** The rule — which milestone, and what offset. Shape varies by kind. */
    milestoneSpec: jsonb('milestone_spec'),

    sealedAt: utcTimestamp('sealed_at'),

    /**
     * A grace window after sealing in which the sender may still change their
     * mind. After it passes, the trigger refuses edits.
     */
    editableUntil: utcTimestamp('editable_until'),

    /**
     * NULL while `state = 'sealed'` is the exact definition of **pending**,
     * which is what the free tier caps.
     *
     * The cap is on concurrent obligations, never on lifetime usage: a
     * delivered capsule is never counted again. That is what keeps the growth
     * loop uncapped for free users, and it is a business rule enforced by a
     * query — so the query gets an index.
     */
    deliveredAt: utcTimestamp('delivered_at'),

    firstOpenedAt: utcTimestamp('first_opened_at'),
    cancelledAt: utcTimestamp('cancelled_at'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** The scheduler's hot path. It runs every minute, forever. */
    index('ix_capsules_scheduler').on(t.state, t.unlockAt),

    index('ix_capsules_vault').on(t.vaultId, t.state),

    /** Serves the free-tier rule above, and nothing else. */
    index('ix_capsules_owner_pending').on(t.ownerId, t.state, t.deliveredAt),

    check('ck_capsules_state', sql.raw(enumCheck('state', CAPSULE_STATE))),
    check(
      'ck_capsules_unlock_kind',
      sql.raw(enumCheck('unlock_kind', UNLOCK_KIND)),
    ),

    /**
     * A datetime capsule with no unlock time is a promise with no date — it
     * would sit in the table forever and never fire.
     */
    check(
      'ck_capsules_datetime_has_time',
      sql`${t.unlockKind} <> 'datetime' OR ${t.unlockAt} IS NOT NULL`,
    ),

    /** A milestone capsule with nobody to reach the milestone cannot resolve. */
    check(
      'ck_capsules_milestone_has_member',
      sql`${t.unlockKind} <> 'milestone' OR ${t.milestoneMemberId} IS NOT NULL`,
    ),
  ],
).enableRLS();

/**
 * `capsule_memories` — what the capsule carries.
 *
 * Many-to-many from the start rather than a single `memory_id`, because the
 * first person who wants to send three photographs would otherwise need a
 * migration.
 */
export const capsuleMemories = pgTable(
  'capsule_memories',
  {
    capsuleId: uuidRef('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),

    memoryId: uuidRef('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({
      name: 'pk_capsule_memories',
      columns: [t.capsuleId, t.memoryId],
    }),

    /**
     * `restrict` on the memory, not `cascade`, and this is the important one:
     * **deleting a memory must not quietly empty a sealed capsule.** The
     * application has to resolve that conflict in front of the user.
     */
    index('ix_capsule_memories_memory').on(t.memoryId),
  ],
).enableRLS();

/**
 * `capsule_recipients` — who it is for.
 *
 * `member_id` is nullable on purpose. A recipient may be somebody already in
 * the sender's address book, or a one-off email address. Forcing every
 * recipient to be a saved member first would put a form between a person and
 * the promise they are trying to make.
 */
export const capsuleRecipients = pgTable(
  'capsule_recipients',
  {
    id: uuidPk(),

    capsuleId: uuidRef('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),

    /** Denormalised, for the same reason as on `media_assets`. */
    vaultId: vaultScope().references(() => vaults.id, { onDelete: 'restrict' }),

    memberId: uuidRef('member_id').references(() => members.id, {
      onDelete: 'set null',
    }),

    name: varchar('name', { length: 200 }).notNull(),

    /** `citext`, so a re-entered address with different capitalisation matches. */
    email: citext('email'),
    phone: varchar('phone', { length: 32 }),

    preferredChannel: enumColumn('preferred_channel', DELIVERY_CHANNEL)
      .notNull()
      .default('email'),

    /**
     * SHA-256 of the unlock token. **The raw token is never stored.**
     *
     * This is the credential that opens a capsule for somebody with no account,
     * so a leaked database backup must not hand over every sealed message in
     * the system.
     */
    accessTokenHash: opaqueToken('access_token_hash', 64).notNull(),

    /**
     * Rotating a leaked link without destroying the capsule.
     *
     * Increment, issue a new token, and every previously-sent link stops
     * working. Deleting the recipient row instead would lose the delivery
     * history and the promise along with it.
     */
    tokenVersion: integer('token_version').notNull().default(1),

    deliveredAt: utcTimestamp('delivered_at'),
    openedAt: utcTimestamp('opened_at'),

    /**
     * When the contact details were last confirmed to be real.
     *
     * Drives the `contact_refresh` job. An email address twenty years stale is
     * the most likely way a kept promise still fails to arrive, and the only
     * defence is asking the sender periodically while they are still here.
     */
    lastVerifiedAt: utcTimestamp('last_verified_at'),

    /** A backup person to reach if the primary contact has gone cold. R2. */
    guardianContact: jsonb('guardian_contact'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ux_recipient_token').on(t.accessTokenHash),
    index('ix_recipient_capsule').on(t.capsuleId),
    index('ix_recipient_member').on(t.memberId),

    /** The contact-refresh sweep: who has not been confirmed in a long time. */
    index('ix_recipient_verified').on(t.lastVerifiedAt),

    check(
      'ck_recipient_channel',
      sql.raw(enumCheck('preferred_channel', DELIVERY_CHANNEL)),
    ),

    /** Somewhere to send it. A recipient with no address cannot be reached. */
    check(
      'ck_recipient_contactable',
      sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL OR ${t.memberId} IS NOT NULL`,
    ),
  ],
).enableRLS();

/**
 * `delivery_attempts` — every try, recorded.
 *
 * Append-only. A failed attempt is as much a part of the record as a successful
 * one, because "why did this not arrive" is a question somebody will ask years
 * later and the answer has to exist.
 */
export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    id: uuidPk(),

    capsuleId: uuidRef('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'restrict' }),

    recipientId: uuidRef('recipient_id')
      .notNull()
      .references(() => capsuleRecipients.id, { onDelete: 'cascade' }),

    channel: enumColumn('channel', DELIVERY_CHANNEL).notNull(),

    /** 1, 2, 3 — part of the idempotency key, not a counter to read. */
    attemptNo: integer('attempt_no').notNull(),

    /** `resend`, `ses`, `apns`, `fcm` — which vendor actually carried it. */
    provider: varchar('provider', { length: 32 }).notNull(),

    /**
     * The provider's own id, so an inbound bounce webhook can be matched back
     * to the attempt that caused it.
     */
    providerMessageId: varchar('provider_message_id', { length: 255 }),

    status: enumColumn('status', DELIVERY_STATUS).notNull().default('queued'),
    errorCode: varchar('error_code', { length: 64 }),

    attemptedAt: utcTimestamp('attempted_at')
      .notNull()
      .default(sql`now()`),

    /**
     * Backoff measured in **days**, not minutes.
     *
     * A capsule has waited twenty years; it can wait another day for a mail
     * server to come back. Retrying aggressively would burn the retry budget in
     * an afternoon on an outage that resolves itself overnight.
     */
    nextRetryAt: utcTimestamp('next_retry_at'),
  },
  (t) => [
    /**
     * ═════════════════════════════════════════════════════════════════════
     *  The delivery engine's correctness guarantee.
     * ═════════════════════════════════════════════════════════════════════
     *
     * A worker that crashes after sending but before recording retries — and
     * the retry hits this unique key instead of sending again. Without it, a
     * delivery engine that retries is a delivery engine that sometimes sends
     * the same message twice, and for a message from a deceased parent that is
     * its own kind of harm.
     */
    uniqueIndex('ux_attempt_idempotent').on(
      t.capsuleId,
      t.recipientId,
      t.channel,
      t.attemptNo,
    ),

    index('ix_attempt_recipient').on(t.recipientId, t.attemptedAt),

    /** The retry sweep. */
    index('ix_attempt_retry').on(t.status, t.nextRetryAt),

    /** Inbound provider webhooks arrive with only this id. */
    index('ix_attempt_provider_msg').on(t.providerMessageId),

    check('ck_attempt_channel', sql.raw(enumCheck('channel', DELIVERY_CHANNEL))),
    check('ck_attempt_status', sql.raw(enumCheck('status', DELIVERY_STATUS))),
    check('ck_attempt_no', sql`${t.attemptNo} >= 1`),
  ],
).enableRLS();

/**
 * `capsule_replies` — the recipient answers.
 *
 * **Written by somebody with no account.** That is the whole point: a
 * grandmother who receives a capsule should be able to reply without being
 * made to sign up first, and the reply closes the loop that makes this product
 * grow.
 *
 * Because the writer has no actor id, inserts do not go through a policy —
 * they go through a `SECURITY DEFINER` function that takes the unlock token.
 * See migration 0005.
 */
export const capsuleReplies = pgTable(
  'capsule_replies',
  {
    id: uuidPk(),

    capsuleId: uuidRef('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),

    recipientId: uuidRef('recipient_id')
      .notNull()
      .references(() => capsuleRecipients.id, { onDelete: 'cascade' }),

    body: text('body'),

    /** Replies can be voice too — often the most valuable kind. */
    mediaAssetId: uuidRef('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    createdAt: createdAt(),
  },
  (t) => [
    index('ix_replies_capsule').on(t.capsuleId, t.createdAt),
    index('ix_replies_recipient').on(t.recipientId),

    /** An empty reply is not a reply. */
    check(
      'ck_replies_not_empty',
      sql`${t.body} IS NOT NULL OR ${t.mediaAssetId} IS NOT NULL`,
    ),
  ],
).enableRLS();

/**
 * `scheduled_jobs` — the durable clock.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The single highest-consequence table in the schema.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The schedule lives here rather than in a vendor's scheduler, because a
 * capsule due in 2046 must outlive every vendor in the stack. Sealing writes
 * the capsule state and its job row in **one transaction**, so a promise and
 * its alarm clock cannot disagree.
 *
 * Not vault-scoped and not user-scoped: this is infrastructure. The API may
 * only insert a delivery job; it cannot read this table, and the worker that
 * claims from it runs under its own role.
 */
export const scheduledJobs = pgTable(
  'scheduled_jobs',
  {
    id: uuidPk(),

    kind: enumColumn('kind', JOB_KIND).notNull(),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  If this is ever a naive `timestamp`, every capsule past 2038 breaks,
     *  silently, and nobody finds out until the day one fails to arrive.
     * ═════════════════════════════════════════════════════════════════════
     */
    runAt: utcTimestamp('run_at').notNull(),

    /** Carries the capsule id. `jsonb` because nine job kinds carry nine shapes. */
    payload: jsonb('payload').notNull(),

    state: enumColumn('state', JOB_STATE).notNull().default('pending'),

    attempts: integer('attempts').notNull().default(0),

    /** Which worker holds it — a container id, for forensics after an incident. */
    lockedBy: varchar('locked_by', { length: 64 }),

    /**
     * The lease. A worker that dies mid-job leaves this in the past, and the
     * reaper returns the job to `pending`.
     *
     * Without a lease, a crashed worker's job is held forever by a process that
     * no longer exists — which for `capsule_delivery` means a promise that
     * simply never fires, with no error anywhere.
     */
    lockedUntil: utcTimestamp('locked_until'),

    lastError: text('last_error'),

    createdAt: createdAt(),
    completedAt: utcTimestamp('completed_at'),
  },
  (t) => [
    /**
     * The claim query, run every minute forever:
     *
     *   WHERE state = 'pending' AND run_at <= now()
     *   ORDER BY run_at LIMIT 100 FOR UPDATE SKIP LOCKED
     *
     * Partial, so the index covers only jobs awaiting dispatch rather than
     * every job ever scheduled. On a table that accumulates for twenty years
     * that is the difference between a small hot index and an enormous cold
     * one — and this is the hottest loop in the product.
     */
    index('ix_jobs_claim')
      .on(t.runAt)
      .where(sql`${t.state} = 'pending'`),

    /** The reaper: jobs whose lease has expired. */
    index('ix_jobs_reaper').on(t.state, t.lockedUntil),

    index('ix_jobs_kind').on(t.kind, t.state, t.runAt),

    check('ck_jobs_state', sql.raw(enumCheck('state', JOB_STATE))),
    check('ck_jobs_kind', sql.raw(enumCheck('kind', JOB_KIND))),
  ],
).enableRLS();
