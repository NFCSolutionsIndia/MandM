/**
 * The single schema source.
 *
 * Every table is re-exported here, and `drizzle.config.ts` points at this file.
 * A table that is not exported from this file does not exist as far as
 * migrations are concerned — which is the intended failure mode: forgetting the
 * export means the migration is empty, not that the table is silently dropped.
 *
 * Domains are added in dependency order, because foreign keys demand it.
 */

// Shared column helpers — the rules every table is held to.
export * from './columns';

// ─── Domains ─────────────────────────────────────────────────────────────────
export * from './identity'; // 07 users · sessions · passkey_credentials · devices
export * from './tenancy'; // 08 vaults · vault_members
// 09 people      members · events · event_members · event_reminders · memory_members
// 10 archive     memories · media_assets · albums · album_memories · upload_sessions
// 11 promises    capsules · capsule_recipients · capsule_memories · capsule_replies
//                delivery_attempts · scheduled_jobs
// 12 sharing     shares · notifications · notification_preferences
// 13 billing     subscriptions · payments · subscription_channels · subscription_ai_features
// 14 governance  admin_users · roles · permissions · audit_logs · break_glass_access
//                reports · moderation_flags · blocks · feature_flags
