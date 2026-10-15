import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import {
  citext,
  createdAt,
  opaqueToken,
  utcTimestamp,
  uuidPk,
} from './columns.js';

/**
 * `email_otps` — one-time sign-in codes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The 39th table, and the one the 38-table design did not have.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The original stack named Better Auth, which would have brought its own
 * `verification` table. Hand-rolling the session layer — chosen so that
 * `sessions.token_hash` and `app_resolve_session()` survive — means owning this
 * too. It is the honest cost of that decision.
 *
 * Keyed by email rather than by user, because a code is issued before anybody
 * knows whether an account exists. Sign-up and sign-in are the same flow in a
 * product with no passwords.
 */
export const emailOtps = pgTable(
  'email_otps',
  {
    id: uuidPk(),

    /** `citext`, so a code issued to `Aarav@x.com` is redeemed by `aarav@x.com`. */
    email: citext('email').notNull(),

    /**
     * SHA-256 of the six digits. **Never the code itself.**
     *
     * A six-digit code is weak by construction — its security comes from being
     * short-lived and attempt-limited, not from being unguessable. Storing it
     * in the clear would mean a leaked backup hands over every account whose
     * owner happened to be signing in.
     */
    codeHash: opaqueToken('code_hash', 64).notNull(),

    /**
     * Wrong guesses so far. A six-digit code is one in a million, which falls
     * to one in two hundred thousand after five tries — so five is where it
     * stops. Without this, the code is brute-forceable in an afternoon.
     */
    attempts: integer('attempts').notNull().default(0),

    /** Hashed, like everywhere else. For abuse analysis, not for location. */
    ipHash: varchar('ip_hash', { length: 64 }),

    expiresAt: utcTimestamp('expires_at').notNull(),

    /** Set on use. A redeemed code is spent, not deleted — see the sweep. */
    consumedAt: utcTimestamp('consumed_at'),

    createdAt: createdAt(),
  },
  (t) => [
    /**
     * One live code per address.
     *
     * Requesting a new code invalidates the old one, so a stolen code cannot be
     * held in reserve while the real owner requests another. Partial, because
     * spent and expired codes are allowed to pile up until the sweep.
     */
    uniqueIndex('ux_email_otps_live')
      .on(t.email)
      .where(sql`${t.consumedAt} IS NULL`),

    /** The expiry sweep. */
    index('ix_email_otps_expiry').on(t.expiresAt),

    check('ck_email_otps_attempts', sql`${t.attempts} >= 0 AND ${t.attempts} <= 5`),
  ],
).enableRLS();
