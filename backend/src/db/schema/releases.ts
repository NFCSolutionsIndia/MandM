import { sql } from 'drizzle-orm';
import { check, pgTable, text, varchar } from 'drizzle-orm/pg-core';

import { DEVICE_PLATFORM } from '../../shared/enums.js';
import { enumCheck, enumColumn, utcTimestamp, uuidRef } from './columns.js';
import { adminUsers } from './governance.js';

/**
 * `app_versions` — what the store has, and what the server still accepts.
 *
 * One row per platform, keyed by the platform itself: iOS and Android ship on
 * different days through different review queues, so "the" app version is
 * two numbers, never one.
 *
 * Readable by anyone, signed in or not — an app too old to sign in still has
 * to be told to update. Written only by the console, and only through
 * `app_admin_set_app_version` (migration 0020), which writes the audit row in
 * the same transaction so a change can never go unrecorded.
 */
export const appVersions = pgTable(
  'app_versions',
  {
    platform: enumColumn('platform', DEVICE_PLATFORM).primaryKey(),

    /** What the store currently ships. Below this: `updateAvailable`. */
    latestVersion: varchar('latest_version', { length: 32 }).notNull(),

    /** The oldest build the server still accepts. Below this: `forceUpdate`. */
    minSupportedVersion: varchar('min_supported_version', { length: 32 }).notNull(),

    storeUrl: varchar('store_url', { length: 2048 }),
    releaseNotes: text('release_notes'),

    /** Null for the rows the migration seeded. */
    updatedBy: uuidRef('updated_by').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    updatedAt: utcTimestamp('updated_at').notNull().default(sql`now()`),
  },
  (t) => [
    check('ck_app_versions_platform', sql.raw(enumCheck('platform', DEVICE_PLATFORM))),
    // x.y.z, no leading zeros. Compared numerically, never as text — as text,
    // 1.10.0 sorts before 1.9.0.
    check(
      'ck_app_versions_semver',
      sql`${t.latestVersion} ~ '^(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})$'
          AND ${t.minSupportedVersion} ~ '^(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})$'`,
    ),
    check(
      'ck_app_versions_order',
      sql`string_to_array(${t.minSupportedVersion}, '.')::int[] <= string_to_array(${t.latestVersion}, '.')::int[]`,
    ),
  ],
).enableRLS();
