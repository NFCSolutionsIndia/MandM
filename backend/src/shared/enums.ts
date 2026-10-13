import { z } from 'zod';

/**
 * Domain enumerations — the single source of truth.
 *
 * Declared once, here, and consumed in three places:
 *
 *   1. the database, as `CHECK` constraints generated from these arrays
 *   2. the API, as Zod validation on request bodies
 *   3. the generated Swift and Kotlin clients, via the OpenAPI document
 *
 * A `CHECK` constraint and a TypeScript union that disagree produce the worst
 * kind of bug: the row inserts fine and then fails a `switch` that has no branch
 * for it, at runtime, on real user data. Retyping these values anywhere else is
 * how that happens, so nothing else may declare them.
 */

/**
 * What a vault is for.
 *
 * `legacy` is not a synonym for `shared`: it marks a vault built to be handed
 * over, which changes what the product is allowed to do with it — it cannot be
 * silently purged with the owner's account, and it is the only type that expects
 * to outlive the person who created it.
 */
export const VAULT_TYPE = ['personal', 'shared', 'legacy'] as const;

/** What a member may do inside a vault. Ordered least to most privileged. */
export const VAULT_ROLE = ['viewer', 'contributor', 'admin', 'owner'] as const;

/**
 * The lifecycle of a capsule.
 *
 * Note what is absent: there is no `posthumous` state. Delivery triggered by a
 * death is a product and legal question the system deliberately does not model.
 */
export const CAPSULE_STATE = [
  'draft',
  'sealed',
  'delivering',
  'delivered',
  'opened',
  'cancelled',
  'failed',
] as const;

/** What causes a capsule to open. */
export const UNLOCK_KIND = ['datetime', 'milestone', 'manual'] as const;

/**
 * How precisely a memory's date is known.
 *
 * A scanned 1974 wedding photograph has a *year*, not a timestamp. Without this
 * column an imported archive either lies about its dates or collapses them all
 * into the upload date — and that single distinction is the difference between
 * a real family archive and a broken one.
 */
export const OCCURRED_PRECISION = ['exact', 'day', 'month', 'year'] as const;

/** What kind of media a memory holds. */
export const MEDIA_KIND = ['photo', 'video', 'voice', 'text'] as const;

/** Who can see a memory. */
export const MEMORY_VISIBILITY = [
  'private',
  'vault',
  'link',
  'recipients',
] as const;

/** Subscription tiers. */
export const PLAN = ['free', 'premium', 'family'] as const;

/** Which push service holds the device token. */
export const PUSH_PROVIDER = ['apns', 'fcm'] as const;

/** Which platform a device runs. There is no `web` — see section 42. */
export const DEVICE_PLATFORM = ['ios', 'android'] as const;

// ─── Zod schemas, derived ────────────────────────────────────────────────────

export const vaultTypeSchema = z.enum(VAULT_TYPE);
export const vaultRoleSchema = z.enum(VAULT_ROLE);
export const capsuleStateSchema = z.enum(CAPSULE_STATE);
export const unlockKindSchema = z.enum(UNLOCK_KIND);
export const occurredPrecisionSchema = z.enum(OCCURRED_PRECISION);
export const mediaKindSchema = z.enum(MEDIA_KIND);
export const memoryVisibilitySchema = z.enum(MEMORY_VISIBILITY);
export const planSchema = z.enum(PLAN);
export const pushProviderSchema = z.enum(PUSH_PROVIDER);
export const devicePlatformSchema = z.enum(DEVICE_PLATFORM);

// ─── TypeScript types, derived ───────────────────────────────────────────────

export type VaultType = (typeof VAULT_TYPE)[number];
export type VaultRole = (typeof VAULT_ROLE)[number];
export type CapsuleState = (typeof CAPSULE_STATE)[number];
export type UnlockKind = (typeof UNLOCK_KIND)[number];
export type OccurredPrecision = (typeof OCCURRED_PRECISION)[number];
export type MediaKind = (typeof MEDIA_KIND)[number];
export type MemoryVisibility = (typeof MEMORY_VISIBILITY)[number];
export type Plan = (typeof PLAN)[number];
export type PushProvider = (typeof PUSH_PROVIDER)[number];
export type DevicePlatform = (typeof DEVICE_PLATFORM)[number];

/**
 * Every enum, by the column that holds it.
 *
 * The migration generator emits a `CHECK` from each entry, and a parity test
 * reads the constraints back out of `information_schema` and compares them to
 * these arrays — so drift fails CI rather than reaching a user.
 */
export const ENUMS = Object.freeze({
  vault_type: VAULT_TYPE,
  vault_role: VAULT_ROLE,
  capsule_state: CAPSULE_STATE,
  unlock_kind: UNLOCK_KIND,
  occurred_precision: OCCURRED_PRECISION,
  media_kind: MEDIA_KIND,
  memory_visibility: MEMORY_VISIBILITY,
  plan: PLAN,
  push_provider: PUSH_PROVIDER,
  device_platform: DEVICE_PLATFORM,
});
