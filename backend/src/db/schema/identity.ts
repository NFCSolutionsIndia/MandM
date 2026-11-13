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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { DEVICE_PLATFORM, PLAN, PUSH_PROVIDER } from '../../shared/enums.js';
import { mediaAssets } from './archive.js';
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
     * The public handle — `aarav.k`. Lower-case, 3–30 characters of `a-z`,
     * `0-9`, `.` and `_`, never starting or ending with a separator.
     *
     * The check constraint forces lower case, so the unique index is
     * case-insensitive in effect without needing `citext`.
     *
     * Never empty: a `BEFORE INSERT` trigger (migration 0018) derives one
     * from the email's local part when the insert does not name one, so
     * every path that creates a user — sign-in, seeds, tests — gets one.
     */
    username: varchar('username', { length: 30 }).notNull(),

    /**
     * The foreign key was deferred until `media_assets` existed, and added in
     * migration 0004. `set null`, so deleting the photo a user chose as their
     * avatar does not delete the user.
     */
    avatarMediaId: uuidRef('avatar_media_id').references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: 'set null' },
    ),

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
    uniqueIndex('ux_users_username').on(t.username),
    check(
      'ck_users_username',
      sql`${t.username} ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'`,
    ),
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
     * SHA-256 of the ACCESS token — the one sent as `Authorization: Bearer`
     * on every request. Short-lived (`ACCESS_TOKEN_HOURS`), and replaced on
     * every refresh.
     *
     * Hex, and never the token itself — for both tokens. A leaked backup must
     * not hand over working sessions for every account.
     */
    accessTokenHash: opaqueToken('access_token_hash', 64).notNull(),
    accessExpiresAt: utcTimestamp('access_expires_at').notNull(),

    /**
     * SHA-256 of the REFRESH token — sent only to `POST /auth/refresh`.
     * Replaced on every use; the one it replaces moves to
     * `retired_refresh_tokens`, so presenting it again is recognisable as
     * theft rather than mistaken for a guess.
     */
    refreshTokenHash: opaqueToken('refresh_token_hash', 64).notNull(),

    /** Rolling: every refresh pushes it out by `REFRESH_TOKEN_DAYS` again. */
    refreshExpiresAt: utcTimestamp('refresh_expires_at').notNull(),

    /**
     * The last request or refresh, to the hour. A session idle for longer
     * than `SESSION_IDLE_DAYS` is refused for both tokens.
     *
     * Written at most once an hour by `app_touch_session`, so it is not a
     * write on every request.
     */
    lastActiveAt: utcTimestamp('last_active_at').notNull().default(sql`now()`),

    /** When the refresh token was last exchanged. Null until the first refresh. */
    rotatedAt: utcTimestamp('rotated_at'),

    userAgent: varchar('user_agent', { length: 512 }),

    /**
     * The IP is hashed, not stored. It is wanted for "where was this session
     * opened" in the security log, and that question is answerable from a hash
     * compared against another hash — storing the address itself would make
     * the table a location history nobody asked us to keep.
     */
    ipHash: varchar('ip_hash', { length: 64 }),

    createdAt: createdAt(),

    /** Set, never deleted: the security log must be able to explain itself. */
    revokedAt: utcTimestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('ux_sessions_access_token').on(t.accessTokenHash),
    uniqueIndex('ux_sessions_refresh_token').on(t.refreshTokenHash),
    // Every authenticated request resolves a live session for a user, so this
    // index is on the hottest read path in the product.
    index('ix_sessions_user_live')
      .on(t.userId, t.refreshExpiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
).enableRLS();

/**
 * `retired_refresh_tokens` — every refresh token that has been exchanged.
 *
 * A refresh token works exactly once. If one turns up a second time, then
 * two parties hold it — the user and whoever copied it — and there is no
 * way to tell which is which. So the whole session is revoked, and both of
 * them have to sign in again; only one of them can.
 *
 * Detecting that needs the old hashes, which `sessions` overwrites. They are
 * kept here, keyed by hash, and go when the session row does.
 *
 * RLS on and NO policy: only `app_refresh_session` (SECURITY DEFINER) ever
 * reads or writes it.
 */
export const retiredRefreshTokens = pgTable(
  'retired_refresh_tokens',
  {
    tokenHash: opaqueToken('token_hash', 64).primaryKey(),
    sessionId: uuidRef('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    retiredAt: utcTimestamp('retired_at').notNull().default(sql`now()`),
  },
  (t) => [index('ix_retired_refresh_tokens_session').on(t.sessionId)],
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
