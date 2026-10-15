import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  MEMORY_VISIBILITY,
  VAULT_ROLE,
  VAULT_TYPE,
} from '../../shared/enums.js';
import { mediaAssets } from './archive.js';
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
 * Tenancy — the smallest domain in the schema, and the most load-bearing.
 *
 * Two tables. Every other domain hangs off them: a memory belongs to a vault, a
 * capsule belongs to a vault, an album belongs to a vault. "May this user see
 * this row?" is answered here, on every single read in the product, which is why
 * the shape of `vault_members` matters more than its size suggests.
 */

/**
 * `vaults` — the tenant boundary.
 *
 * A vault is a shared space, not a folder. The distinction matters because
 * permission lives on the vault and is inherited by everything inside it; a
 * folder would make permission a per-row question and the authorization check
 * would stop being a single lookup.
 */
export const vaults = pgTable(
  'vaults',
  {
    id: uuidPk(),

    /**
     * The owner, and the account that pays for and is accountable for the
     * contents.
     *
     * `restrict`, not `cascade`. A vault can hold another family member's only
     * copy of something, so purging an account must not silently take the vault
     * with it — the purge job has to transfer or explicitly delete the vault
     * first, and this constraint is what forces that conversation to happen in
     * code review rather than in a support ticket.
     */
    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    name: varchar('name', { length: 200 }).notNull(),

    type: enumColumn('type', VAULT_TYPE).notNull().default('personal'),

    /**
     * Deferred until `media_assets` existed; added in migration 0004.
     *
     * `set null` rather than `cascade`: removing the photograph that happened
     * to be the cover must never be a way to delete a family's vault.
     */
    coverMediaId: uuidRef('cover_media_id').references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: 'set null' },
    ),

    /**
     * The visibility a new memory gets when the uploader does not choose one.
     *
     * A default rather than a rule: it is the value the app pre-fills, and a
     * memory's own `visibility` column always wins. Storing it means a family
     * vault can default to `vault` while a private one defaults to `private`,
     * without the apps hard-coding either.
     */
    defaultVisibility: enumColumn('default_visibility', MEMORY_VISIBILITY)
      .notNull()
      .default('vault'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),

    /**
     * Archived, not deleted. An archived vault disappears from the app and
     * keeps every byte — because the thing being archived is usually a
     * grandparent's photographs, and "undo" has to remain possible for years.
     */
    archivedAt: utcTimestamp('archived_at'),
  },
  (t) => [
    index('ix_vaults_owner').on(t.ownerId),
    check('ck_vaults_type', sql.raw(enumCheck('type', VAULT_TYPE))),
    check(
      'ck_vaults_default_visibility',
      sql.raw(enumCheck('default_visibility', MEMORY_VISIBILITY)),
    ),
  ],
).enableRLS();

/**
 * `vault_members` — who is in a vault, and what they may do there.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The composite primary key (vault_id, user_id) is the whole design.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The hottest query in the system is "resolve this user's role in this vault",
 * and it runs on every authenticated read. With `(vault_id, user_id)` as the
 * primary key, both halves of that question are the leading columns of the same
 * unique index, so the answer is one index descent and one heap fetch.
 *
 * A surrogate `id` primary key with a separate unique index on the pair would
 * work and would cost a second index on the busiest table in the product, for a
 * column nothing ever queries by.
 *
 * Note that neither table uses `vaultScope()`. A vault's scope is its own `id`,
 * and a member row's scope is already the leading column of its primary key —
 * the helper exists for the tables that come later.
 */
export const vaultMembers = pgTable(
  'vault_members',
  {
    vaultId: uuidRef('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),

    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    role: enumColumn('role', VAULT_ROLE).notNull().default('viewer'),

    /** Who invited them. `set null` — the invitation outlives the inviter. */
    invitedBy: uuidRef('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    joinedAt: createdAt('joined_at'),

    /**
     * Set, never deleted.
     *
     * Removing somebody from a family vault is a thing that happened, and the
     * rows they contributed still reference them. Deleting the membership row
     * would leave those contributions attributed to a stranger, and would erase
     * the only record of who had access when.
     */
    revokedAt: utcTimestamp('revoked_at'),
  },
  (t) => [
    primaryKey({
      name: 'pk_vault_members',
      columns: [t.vaultId, t.userId],
    }),

    /**
     * The reverse direction: "which vaults does this user belong to", which is
     * the home screen. The primary key leads with `vault_id` and cannot serve
     * this, so it gets its own index — partial, because a revoked membership is
     * never listed.
     */
    index('ix_vault_members_user')
      .on(t.userId, t.vaultId)
      .where(sql`${t.revokedAt} IS NULL`),

    /**
     * Exactly one live owner per vault.
     *
     * `vaults.owner_id` is the authority on who that is; this index is what
     * stops the membership table from quietly disagreeing with it. Two owner
     * rows means two accounts believe they control the billing and the deletion
     * of the same vault.
     */
    uniqueIndex('ux_vault_members_owner')
      .on(t.vaultId)
      .where(sql`${t.role} = 'owner' AND ${t.revokedAt} IS NULL`),

    check('ck_vault_members_role', sql.raw(enumCheck('role', VAULT_ROLE))),
  ],
).enableRLS();
