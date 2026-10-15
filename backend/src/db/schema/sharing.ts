import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  time,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  NON_SUPPRESSIBLE_NOTIFICATIONS,
  NOTIFICATION_TYPE,
  SHARE_PERMISSION,
  SHARE_RESOURCE,
} from '../../shared/enums.js';
import {
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
import { vaults } from './tenancy.js';

/**
 * Sharing and notifications — how things leave the vault, and how people are
 * told about it.
 */

/**
 * `shares` — a link that lets somebody without an account see one thing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Revocation is immediate, and the exposure window after it is a real
 *  number rather than a hope.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Revoking sets `revoked_at` and the next request fails. Because signed media
 * URLs live only five minutes, real-world exposure after revocation is bounded
 * to minutes — which is exactly why that TTL is never tuned upward for
 * convenience. Lengthening it would silently lengthen this window too.
 */
export const shares = pgTable(
  'shares',
  {
    id: uuidPk(),

    vaultId: vaultScope().references(() => vaults.id, { onDelete: 'cascade' }),

    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * A polymorphic reference: `('memory', <id>)` or `('album', <id>)`.
     *
     * PostgreSQL cannot express a foreign key that points at one of two tables,
     * so there is none — and that absence is a hole, not a shrug. Without a
     * check, a share could name this user's own `vault_id` and another family's
     * `resource_id`, and the row-level security policy would pass: it compares
     * `vault_id`, and `vault_id` is whatever the client sent.
     *
     * A trigger in migration 0006 closes it by verifying the resource exists
     * **and belongs to the stated vault**.
     */
    resourceType: enumColumn('resource_type', SHARE_RESOURCE).notNull(),
    resourceId: uuidRef('resource_id').notNull(),

    /**
     * SHA-256 of 32 bytes from a CSPRNG. The raw token is never stored.
     *
     * Not derived from the id, which is time-ordered and would make one link
     * guessable from a neighbouring one.
     */
    tokenHash: opaqueToken('token_hash', 64).notNull(),

    permission: enumColumn('permission', SHARE_PERMISSION)
      .notNull()
      .default('view'),

    /**
     * Viewing and downloading are different grants.
     *
     * A photograph someone can see on a page is still bounded by the page; one
     * they can save is theirs forever. Defaulting to `false` means the stronger
     * grant is always a deliberate act.
     */
    allowDownload: boolean('allow_download').notNull().default(false),

    /** An optional PIN on top of the link. Hashed, obviously. */
    passwordHash: varchar('password_hash', { length: 255 }),

    expiresAt: utcTimestamp('expires_at'),

    /** Set, never deleted — the owner's list of links must stay honest. */
    revokedAt: utcTimestamp('revoked_at'),

    /**
     * Shown to the owner, which is the entire reason it is counted.
     *
     * Control over a shared link is only meaningful if it is *verifiable*: a
     * live list of every active link, how often it was opened and when it was
     * last used, with one tap to kill any of them.
     */
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: utcTimestamp('last_viewed_at'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ux_shares_token').on(t.tokenHash),

    /** "Is this thing shared, and how?" — shown on the memory itself. */
    index('ix_shares_resource').on(t.resourceType, t.resourceId),

    /** The owner's list of live links. Partial: revoked ones are not listed. */
    index('ix_shares_owner_active')
      .on(t.ownerId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),

    index('ix_shares_vault').on(t.vaultId),

    check(
      'ck_shares_resource',
      sql.raw(enumCheck('resource_type', SHARE_RESOURCE)),
    ),
    check(
      'ck_shares_permission',
      sql.raw(enumCheck('permission', SHARE_PERMISSION)),
    ),
    check('ck_shares_view_count', sql`${t.viewCount} >= 0`),
  ],
).enableRLS();

/**
 * `notifications` — the in-app notification centre.
 *
 * A row here is the record that something was *said*, which is separate from
 * whether a push arrived. `channels_sent` holds which rungs of the delivery
 * ladder actually fired, so "why did I not hear about this" has an answer.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuidPk(),

    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: enumColumn('type', NOTIFICATION_TYPE).notNull(),

    /** Enough to render the row without a second query. Shape varies by type. */
    payload: jsonb('payload'),

    /** Where tapping it goes. Stored rather than derived, so an old
     * notification keeps working after the route that produced it changes. */
    deepLink: varchar('deep_link', { length: 512 }),

    readAt: utcTimestamp('read_at'),

    /** `{"push": "...", "email": "..."}` — which rungs fired, and when. */
    channelsSent: jsonb('channels_sent'),

    createdAt: createdAt(),
  },
  (t) => [
    /**
     * The notification centre, newest first, unread badge included. One index
     * serves the list and the count because the badge is just this query with
     * `read_at IS NULL`.
     */
    index('ix_notifications_user').on(t.userId, t.createdAt.desc()),

    /** The unread badge alone. Partial — most notifications end up read. */
    index('ix_notifications_unread')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),

    check('ck_notifications_type', sql.raw(enumCheck('type', NOTIFICATION_TYPE))),
  ],
).enableRLS();

/**
 * `notification_preferences` — per type, per channel, plus quiet hours.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  `suppressible` is GENERATED. It cannot be set, and so cannot be wrong.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Whether a notification may be switched off is a property of its *type*, not
 * of a user's preference. Storing it as an ordinary column would let a row
 * claim that a security alert is suppressible — and the code that wrote that
 * row would be the only thing standing between a user and a silent breach
 * notification.
 *
 * As a generated column the rule lives in one place, is not writable by the
 * application at all, and applies retroactively to every row the moment a type
 * changes category.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: enumColumn('type', NOTIFICATION_TYPE).notNull(),

    pushEnabled: boolean('push_enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),

    /** Release 2. Declared now so enabling it is a config change, not a migration. */
    smsEnabled: boolean('sms_enabled').notNull().default(false),

    /**
     * Interpreted in the user's own `timezone`, never the server's.
     *
     * `time` rather than `timestamptz`: "do not wake me between 22:00 and
     * 07:00" is a wall-clock rule, and the same wall-clock rule travels with
     * them. An instant would mean something different every time they flew.
     */
    quietHoursStart: time('quiet_hours_start'),
    quietHoursEnd: time('quiet_hours_end'),

    suppressible: boolean('suppressible')
      .notNull()
      .generatedAlwaysAs(
        sql.raw(
          `"type" NOT IN (${NON_SUPPRESSIBLE_NOTIFICATIONS.map((v) => `'${v}'`).join(', ')})`,
        ),
      ),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'pk_notification_preferences',
      columns: [t.userId, t.type],
    }),

    check('ck_prefs_type', sql.raw(enumCheck('type', NOTIFICATION_TYPE))),

    /**
     * A non-suppressible type cannot have its channels turned off.
     *
     * Without this, `suppressible = false` would be a label the UI is trusted
     * to respect rather than a rule the database enforces — and a security
     * alert nobody receives is worse than none at all, because the product
     * believes it warned them.
     */
    check(
      'ck_prefs_non_suppressible_stay_on',
      sql`${t.suppressible} OR (${t.pushEnabled} AND ${t.emailEnabled})`,
    ),

    /**
     * Quiet hours are either both set or both absent. One without the other
     * describes no window at all, and the job would have to guess.
     */
    check(
      'ck_prefs_quiet_hours_paired',
      sql`(${t.quietHoursStart} IS NULL) = (${t.quietHoursEnd} IS NULL)`,
    ),
  ],
).enableRLS();
