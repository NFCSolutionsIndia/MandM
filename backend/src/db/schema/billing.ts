import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  AI_FEATURE,
  DELIVERY_CHANNEL,
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  PAYMENT_SUBJECT,
  PLAN,
  SUBSCRIPTION_STATUS,
} from '../../shared/enums.js';
import {
  createdAt,
  enumCheck,
  enumColumn,
  updatedAt,
  utcTimestamp,
  uuidPk,
  uuidRef,
} from './columns.js';
import { users } from './identity.js';

/**
 * Billing and entitlements.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Commitment 05: a promise is never cancelled for non-payment.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * If a subscription lapses while capsules are scheduled beyond the free
 * horizon, those capsules are still delivered. The mechanism is in the shape of
 * this domain rather than in a rule somebody has to remember:
 *
 *   1. Entitlements are COLUMNS on the subscription row, not a lookup against a
 *      price book. A lapsed row still says what was promised.
 *   2. They are evaluated once, at seal time, and never re-applied.
 *   3. Nothing in the delivery path reads this domain at all. A worker
 *      delivering a capsule in 2046 has no reason to ask whether anybody is
 *      still paying, and no code path by which to do so.
 *
 * Billing status gates what a user may create NEXT. It never reaches backwards
 * into obligations they already made to other people.
 */

/**
 * `subscriptions` — one row per user, entitlements denormalised onto it.
 *
 * Denormalising does two jobs. Every entitlement check becomes a single read of
 * a row the request already has — and, more importantly, **a lapsed
 * subscription's existing obligations stay legible**: the row still records
 * what was granted when the promises were made.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuidPk(),

    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * Two processors, because India-first means UPI, and UPI means Razorpay.
     *
     * Both ids are nullable and a user may legitimately have both over time —
     * somebody who starts on a card abroad and later pays by UPI at home.
     */
    stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
    razorpayCustomerId: varchar('razorpay_customer_id', { length: 64 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }),

    plan: enumColumn('plan', PLAN).notNull().default('free'),
    status: enumColumn('status', SUBSCRIPTION_STATUS).notNull().default('active'),

    /** ISO 4217. Fixed at 3 characters because every code is. */
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    region: varchar('region', { length: 8 }).notNull().default('IN'),

    currentPeriodEnd: utcTimestamp('current_period_end'),
    cancelAt: utcTimestamp('cancel_at'),

    // ─── Entitlements ───────────────────────────────────────────────────────
    //
    // Denormalised on purpose. See the note at the top of this file.

    storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'bigint' })
      .notNull()
      .default(sql`10737418240`), // 10 GiB, the free tier

    /**
     * NULL means unlimited, and that is a deliberate encoding rather than a
     * sentinel like `-1` or `999999`.
     *
     * "Pending" means `state = 'sealed' AND delivered_at IS NULL`. The cap is
     * on **concurrent obligations**, never on lifetime usage — a delivered
     * capsule is never counted again, which is what keeps the growth loop
     * uncapped for free users.
     */
    maxPendingCapsules: integer('max_pending_capsules'),

    /**
     * The primary paid gate: how far into the future a free user may schedule.
     *
     * Chosen as the gate because it is the one limit that does not interfere
     * with the loop. Capping *how many* memories someone keeps would make the
     * product worse at its job; capping *how far ahead* they may promise costs
     * nothing until they want the thing the product is actually for.
     */
    maxCapsuleHorizonDays: integer('max_capsule_horizon_days'),

    maxVideoSeconds: integer('max_video_seconds').notNull().default(60),

    seats: integer('seats').notNull().default(1),

    /** Release 2. */
    broadcastRecipientsPerMonth: integer('broadcast_recipients_per_month')
      .notNull()
      .default(0),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  Note what is absent: there is no `memories_per_month`.
     * ═════════════════════════════════════════════════════════════════════
     *
     * That limit does not exist, and a column for it would eventually invite
     * somebody to enforce one. A family archive that stops accepting memories
     * is not an archive.
     */

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One subscription per user. The relationship is 1:1, so say so. */
    uniqueIndex('ux_subs_user').on(t.userId),

    /** Inbound Stripe webhooks arrive with only this id. */
    index('ix_subs_stripe').on(t.stripeSubscriptionId),

    /** The renewal and dunning sweeps. */
    index('ix_subs_period_end').on(t.status, t.currentPeriodEnd),

    check('ck_subs_plan', sql.raw(enumCheck('plan', PLAN))),
    check('ck_subs_status', sql.raw(enumCheck('status', SUBSCRIPTION_STATUS))),

    check(
      'ck_subs_entitlements_sane',
      sql`${t.storageQuotaBytes} >= 0
          AND ${t.maxVideoSeconds} > 0
          AND ${t.seats} >= 1
          AND ${t.broadcastRecipientsPerMonth} >= 0
          AND (${t.maxPendingCapsules} IS NULL OR ${t.maxPendingCapsules} >= 0)
          AND (${t.maxCapsuleHorizonDays} IS NULL OR ${t.maxCapsuleHorizonDays} > 0)`,
    ),

    /** A three-letter code, upper case, so joins and comparisons are stable. */
    check('ck_subs_currency', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
).enableRLS();

/**
 * `subscription_channels` — which delivery channels a plan enables.
 *
 * A join table rather than booleans on the subscription, because the set of
 * channels grows: adding WhatsApp becomes a row, not a migration that rewrites
 * every subscription in the table.
 */
export const subscriptionChannels = pgTable(
  'subscription_channels',
  {
    subscriptionId: uuidRef('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    channel: enumColumn('channel', DELIVERY_CHANNEL).notNull(),
  },
  (t) => [
    primaryKey({
      name: 'pk_subscription_channels',
      columns: [t.subscriptionId, t.channel],
    }),
    check(
      'ck_sub_channel',
      sql.raw(enumCheck('channel', DELIVERY_CHANNEL)),
    ),
  ],
).enableRLS();

/** `subscription_ai_features` — the same pattern, for Release 2 AI features. */
export const subscriptionAiFeatures = pgTable(
  'subscription_ai_features',
  {
    subscriptionId: uuidRef('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    feature: enumColumn('feature', AI_FEATURE).notNull(),
  },
  (t) => [
    primaryKey({
      name: 'pk_subscription_ai_features',
      columns: [t.subscriptionId, t.feature],
    }),
    check('ck_sub_ai_feature', sql.raw(enumCheck('feature', AI_FEATURE))),
  ],
).enableRLS();

/**
 * `payments` — the money ledger.
 *
 * Append-only, and deliberately not the source of truth for entitlement. The
 * gateway is the authority on what was paid; this table is the record of what
 * it told us, so that a dispute years later has something to read.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuidPk(),

    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Polymorphic, like `shares` — but nothing resolves it, so no trigger. */
    subjectType: enumColumn('subject_type', PAYMENT_SUBJECT).notNull(),
    subjectId: uuidRef('subject_id'),

    gateway: enumColumn('gateway', PAYMENT_GATEWAY).notNull(),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  The gateway's event id, UNIQUE — which is what makes webhook replay
     *  harmless.
     * ═════════════════════════════════════════════════════════════════════
     *
     * Payment providers deliver webhooks at least once and will resend after
     * any ambiguous response. Without this key, one retried notification is a
     * second row, a double-counted payment and a support ticket about a charge
     * that never happened.
     */
    gatewayRef: varchar('gateway_ref', { length: 128 }).notNull(),

    /**
     * Minor units — paise, cents — as `bigint`, never a float.
     *
     * Money in a floating-point type is how totals end up a paisa out and
     * nobody can say which row is wrong. `bigint` because a JavaScript number
     * loses precision above 2^53 and these are summed for reporting.
     */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),

    /** What the gateway kept. Stored because the margin model depends on it. */
    fee: bigint('fee', { mode: 'bigint' }).notNull().default(sql`0`),

    currency: varchar('currency', { length: 3 }).notNull(),

    status: enumColumn('status', PAYMENT_STATUS).notNull().default('created'),

    /**
     * The webhook body as it arrived.
     *
     * Kept verbatim because a reconciliation dispute two years from now is
     * argued from what the provider actually sent, not from our reading of it.
     */
    rawPayload: jsonb('raw_payload'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ux_payments_gateway_ref').on(t.gateway, t.gatewayRef),

    index('ix_payments_user').on(t.userId, t.createdAt.desc()),
    index('ix_payments_subject').on(t.subjectType, t.subjectId),
    index('ix_payments_status').on(t.status, t.createdAt),

    check('ck_payments_gateway', sql.raw(enumCheck('gateway', PAYMENT_GATEWAY))),
    check('ck_payments_subject', sql.raw(enumCheck('subject_type', PAYMENT_SUBJECT))),
    check('ck_payments_status', sql.raw(enumCheck('status', PAYMENT_STATUS))),
    check('ck_payments_currency', sql`${t.currency} ~ '^[A-Z]{3}$'`),

    /**
     * A refund is recorded as its own row with a negative amount, so the fee
     * may be negative too. What is never valid is a fee larger in magnitude
     * than the amount it was taken from.
     */
    check('ck_payments_fee', sql`abs(${t.fee}) <= abs(${t.amount})`),
  ],
).enableRLS();
