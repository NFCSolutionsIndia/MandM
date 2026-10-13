import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { DEVICE_PLATFORM, PLAN, PUSH_PROVIDER } from '../../shared/enums.js';
import {
  citext,
  createdAt,
  enumCheck,
  enumColumn,
  opaqueToken,
  utcTimestamp,
  uuidPk,
  uuidRef,
} from './columns.js';

/**
 * Identity — who a person is, and how they prove it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  There is no password column anywhere in this file, deliberately.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Authentication is passkeys, with an email one-time code as the fallback. A
 * password is something to phish, leak, reuse or forget, and this is a vault
 * meant to be opened decades from now — the account outlives any password
 * policy anyone writes today.
 */

/**
 * `users` — the authenticated identity, and the root of all ownership.
 *
 * Self-owned: only the user and a scoped admin role may read a row. Every field
 * here appears in a data export, which is why nothing is an opaque blob.
 */
export const users = pgTable(
  'users',
  {
    id: uuidPk(),

    /**
     * `citext`, so `Aarav@x.com` and `aarav@x.com` are one account. Without it
     * a user signs up twice, ends up with two archives, and can find neither.
     * 320 is the RFC 5321 maximum: 64-character local part, `@`, 255 domain.
     */
    email: citext('email').notNull(),
    emailVerifiedAt: utcTimestamp('email_verified_at'),

    phone: varchar('phone', { length: 32 }),
    phoneVerifiedAt: utcTimestamp('phone_verified_at'),

    name: varchar('name', { length: 200 }).notNull(),

    /**
     * No foreign key to `media_assets`, even though it is one logically.
     * That table does not exist yet and belongs to a later domain; adding the
     * constraint there keeps this migration applicable on its own.
     */
    avatarMediaId: uuidRef('avatar_media_id'),

    locale: varchar('locale', { length: 16 }).notNull().default('en-IN'),

    /**
     * An IANA zone name — `Asia/Kolkata`, never `IST`. An abbreviation is
     * ambiguous across countries, and this column decides which morning a
     * capsule arrives in twenty years from now.
     */
    timezone: varchar('timezone', { length: 64 })
      .notNull()
      .default('Asia/Kolkata'),

    plan: enumColumn('plan', PLAN).notNull().default('free'),

    /**
     * `bigint`, and read back as a string by the driver.
     *
     * A JavaScript number loses precision above 2^53, and these drive billing
     * and the quota wall. Maintained transactionally with the row that caused
     * the change, never recomputed by a nightly job — a quota that is right
     * only once a day is a quota a user can walk straight through.
     */
    storageUsedBytes: bigint('storage_used_bytes', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'bigint' })
      .notNull()
      .default(sql`10737418240`), // 10 GiB — the free tier, section 36

    createdAt: createdAt(),
    lastSeenAt: utcTimestamp('last_seen_at'),

    /**
     * Soft delete first. `hard_delete_after` is the end of the grace window,
     * and the purge job reads it — so it is indexed.
     *
     * The grace period exists because deleting an account cancels promises the
     * user made to *other people*, and that must never be a surprise that
     * cannot be undone.
     */
    deletedAt: utcTimestamp('deleted_at'),
    hardDeleteAfter: utcTimestamp('hard_delete_after'),
  },
  (t) => [
    uniqueIndex('ux_users_email').on(t.email),
    // Partial: the purge job only ever asks for rows awaiting deletion, which
    // is a handful against a table of millions.
    index('ix_users_hard_delete')
      .on(t.hardDeleteAfter)
      .where(sql`${t.hardDeleteAfter} IS NOT NULL`),
    check('ck_users_plan', sql.raw(enumCheck('plan', PLAN))),
  ],
).enableRLS();

/**
 * `sessions` — opaque server-side rows, not JWTs.
 *
 * A JWT cannot be revoked before it expires; the server has no record of it.
 * In a product holding family video, "sign me out of that device now" has to
 * take effect immediately, so a session is a row and revocation is an UPDATE.
 *
 * The cost is a database read per request. That is the right trade here, and it
 * is the reason the authorization chokepoint is a single well-indexed lookup.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuidPk(),
    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * SHA-256 of the token, hex — never the token itself. A leaked backup must
     * not hand over working sessions for every account.
     */
    tokenHash: opaqueToken('token_hash', 64),

    userAgent: varchar('user_agent', { length: 512 }),

    /**
     * The IP is hashed, not stored. It is wanted for "where was this session
     * opened" in the security log, and that question is answerable from a hash
     * compared against another hash — storing the address itself would make
     * the table a location history nobody asked us to keep.
     */
    ipHash: varchar('ip_hash', { length: 64 }),

    createdAt: createdAt(),

    /** 30-day rolling window, extended on use. */
    expiresAt: utcTimestamp('expires_at').notNull(),

    /** Set, never deleted: the security log must be able to explain itself. */
    revokedAt: utcTimestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('ux_sessions_token').on(t.tokenHash),
    // Every authenticated request resolves a live session for a user, so this
    // index is on the hottest read path in the product.
    index('ix_sessions_user_live')
      .on(t.userId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
).enableRLS();

/**
 * `passkey_credentials` — WebAuthn public keys.
 *
 * The private key never leaves the user's device, so there is nothing here
 * worth stealing: a full dump of this table lets an attacker verify signatures
 * and produce none.
 */
export const passkeyCredentials = pgTable(
  'passkey_credentials',
  {
    id: uuidPk(),
    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The authenticator's own id for this credential, base64url. */
    credentialId: varchar('credential_id', { length: 255 }).notNull(),

    /** COSE-encoded public key. `text` because length varies by algorithm. */
    publicKey: text('public_key').notNull(),

    /** How the authenticator is reachable — `usb,nfc,internal`. */
    transports: varchar('transports', { length: 32 }),

    /**
     * The authenticator's signature counter.
     *
     * It must only ever increase. A value lower than the stored one means the
     * credential has been cloned, which is the single signal WebAuthn gives us
     * that something is wrong — so it is stored rather than ignored.
     */
    signCount: bigint('sign_count', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    createdAt: createdAt(),
    lastUsedAt: utcTimestamp('last_used_at'),
  },
  (t) => [
    uniqueIndex('ux_passkey_credential_id').on(t.credentialId),
    index('ix_passkey_user').on(t.userId),
  ],
).enableRLS();

/**
 * `devices` — APNs and FCM registration tokens.
 *
 * This is how a capsule announces itself years from now, so the table's job is
 * to always hold a *live* token. Tokens rotate silently, and a dead one that is
 * retried forever is a delivery that never arrives and never reports failure.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuidPk(),
    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The APNs or FCM registration token. Long, and rotates. */
    deviceToken: varchar('device_token', { length: 512 }).notNull(),

    pushProvider: enumColumn('push_provider', PUSH_PROVIDER).notNull(),
    platform: enumColumn('platform', DEVICE_PLATFORM).notNull(),

    /** Which build this is — APNs keys are scoped per bundle id. */
    bundleId: varchar('bundle_id', { length: 255 }),
    deviceModel: varchar('device_model', { length: 512 }),

    /**
     * Gates the minimum supported client.
     *
     * A capsule sealed today may be opened by an app five years older than the
     * server, so "which versions are still out there" is an operational
     * question with a real answer, not a guess.
     */
    appVersion: varchar('app_version', { length: 32 }),

    lastSuccessAt: utcTimestamp('last_success_at'),

    /**
     * Consecutive failures. Reset to zero on success; at a threshold the row
     * is retired. Without this a dead token is retried forever and the
     * delivery monitor fills with noise that hides a real outage.
     */
    failureCount: integer('failure_count').notNull().default(0),

    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('ux_devices_token').on(t.deviceToken),
    index('ix_devices_user').on(t.userId),
    // The dispatcher asks for a user's live tokens; the reaper asks for dead
    // ones. Both read this index.
    index('ix_devices_health').on(t.userId, t.failureCount),
    check(
      'ck_devices_push_provider',
      sql.raw(enumCheck('push_provider', PUSH_PROVIDER)),
    ),
    check(
      'ck_devices_platform',
      sql.raw(enumCheck('platform', DEVICE_PLATFORM)),
    ),
  ],
).enableRLS();
