/**
 * The single schema source.
 *
 * Every table is re-exported here, and `drizzle.config.ts` points at this file.
 * A table that is not exported from this file does not exist as far as
 * migrations are concerned — which is the intended failure mode: forgetting the
 * export means the migration is empty, not that the table is silently dropped.
 *
 * Domains are added in dependency order, because foreign keys demand it.
 *
 * ─── Row-level security ──────────────────────────────────────────────────────
 *
 * Every table here is declared `.enableRLS()`. Drizzle emits the ENABLE
 * statement and nothing else: the POLICIES are hand-written in migration 0002,
 * because they depend on a SECURITY DEFINER helper that Drizzle cannot model.
 *
 * Keeping `.enableRLS()` in the schema rather than only in SQL matters for one
 * reason — the drizzle-kit snapshot is what future migrations diff against. If
 * the snapshot believed RLS was off while the database had it on, a later
 * generate could emit DISABLE ROW LEVEL SECURITY and silently open every table.
 *
 * A table with RLS enabled and no policy denies ALL rows to a non-owner role.
 * That is the safe failure direction, and it is why enabling comes first.
 */

// Shared column helpers — the rules every table is held to.
export * from './columns.js';

// ─── Domains ─────────────────────────────────────────────────────────────────
export * from './identity.js'; // 07 users · sessions · passkey_credentials · devices
export * from './tenancy.js'; // 08 vaults · vault_members
export * from './people.js'; // 11 members · events · event_members · event_reminders
export * from './archive.js'; // 12 memories · media_assets · upload_sessions
//                              albums · album_memories · memory_members
export * from './promises.js'; // 13 capsules · capsule_memories · capsule_recipients
//                              delivery_attempts · capsule_replies · scheduled_jobs
export * from './sharing.js'; // 14 shares · notifications · notification_preferences
// 15 billing     subscriptions · payments · subscription_channels · subscription_ai_features
// 16 governance  admin_users · roles · permissions · audit_logs · break_glass_access
//                reports · moderation_flags · blocks · feature_flags
