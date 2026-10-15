import { sql } from 'drizzle-orm';
import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import {
  createdAt,
  opaqueToken,
  utcTimestamp,
  uuidPk,
  uuidRef,
} from './columns.js';
import { adminUsers } from './governance.js';

/**
 * `admin_sessions` — the console's own sessions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  A separate table from `sessions`, and that is the point.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reusing `sessions` would mean a foreign key to `users`, which would make an
 * admin a kind of user — and then one compromised customer account is one step
 * from a console that reads every family's archive. The realms stay apart all
 * the way down: different table, different role, different actor setting,
 * different token.
 *
 * It is also where the two factors are reconciled. A session exists after the
 * email code is redeemed and is **useless** until `mfa_completed_at` is set:
 * the only thing it can do in between is present a TOTP code.
 */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuidPk(),

    adminId: uuidRef('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),

    /** SHA-256 of the token. The raw value exists only in the client. */
    tokenHash: opaqueToken('token_hash', 64).notNull(),

    /**
     * NULL until the second factor is presented.
     *
     * Every admin policy keys on a session that has this set, so a stolen
     * first-factor token buys an attacker the ability to be asked for a TOTP
     * code and nothing else.
     */
    mfaCompletedAt: utcTimestamp('mfa_completed_at'),

    userAgent: varchar('user_agent', { length: 512 }),
    ipHash: varchar('ip_hash', { length: 64 }),

    createdAt: createdAt(),

    /**
     * Eight hours, and not extended on use.
     *
     * A customer session rolls forward for thirty days because signing a
     * grandmother out every month is a real cost. An admin session is a
     * working day: the console reads other people's private archives, and a
     * forgotten browser tab should stop being dangerous by the next morning.
     */
    expiresAt: utcTimestamp('expires_at').notNull(),

    revokedAt: utcTimestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('ux_admin_sessions_token').on(t.tokenHash),

    index('ix_admin_sessions_live')
      .on(t.adminId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
).enableRLS();
