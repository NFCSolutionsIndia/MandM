import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';

import type { Env } from '../config/env.schema.js';
import { DbService } from '../db/db.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  generateEmailCode,
  generateSessionToken,
  hashToken,
} from './tokens.js';

/**
 * What `/auth/verify` and `/auth/refresh` hand back.
 *
 * The two raw tokens exist only here and in the client. The database holds
 * their SHA-256 and nothing else.
 */
export interface SessionPair {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; username: string; name: string };
}

export interface SignInResult extends SessionPair {
  isNewAccount: boolean;
}

/** The row shape both session-opening functions return. */
type SessionRow = {
  user_id: string | null;
  username: string;
  name: string;
  access_expires_at: Date;
  refresh_expires_at: Date;
};

/**
 * Sign-in, with no passwords anywhere.
 *
 * Every step that needs privileges a request does not have is a
 * `SECURITY DEFINER` function in migration 0009, so this service holds the
 * policy decisions — how long a code lives, how many may be sent — and the
 * database holds the ones that must not be bypassable.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Long enough to find the email, short enough that a leak goes stale. */
  private static readonly CODE_TTL_SECONDS = 600;

  /** Six codes an hour to one address. Beyond that it is a mail cannon. */
  private static readonly MAX_CODES_PER_HOUR = 5;

  /** Session lifetimes — see the Sessions block in env.schema.ts. */
  private readonly accessHours: number;
  private readonly refreshDays: number;
  private readonly idleDays: number;

  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.accessHours = config.get('ACCESS_TOKEN_HOURS', { infer: true });
    this.refreshDays = config.get('REFRESH_TOKEN_DAYS', { infer: true });
    this.idleDays = config.get('SESSION_IDLE_DAYS', { infer: true });
  }

  /**
   * Send a sign-in code.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  Always reports success, whether or not the address has an account.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * "No account with that email" is an enumeration oracle: it lets anyone test
   * addresses against the user table a thousand at a time. Since sign-up and
   * sign-in are the same flow here, there is nothing to disclose anyway — an
   * unknown address simply gets an account when the code is redeemed.
   */
  async requestCode(email: string, ipHash: string | null): Promise<void> {
    const recent = await this.db.raw.execute<{ count: string }>(
      sql`SELECT app_recent_email_code_count(${email}, 60) AS count`,
    );

    if (Number(recent.rows[0]?.count ?? 0) >= AuthService.MAX_CODES_PER_HOUR) {
      // Still reports success to the caller. Rate limiting must not become
      // the oracle that the uniform response was protecting against.
      this.logger.warn('Email code rate limit reached for one address');
      return;
    }

    const code = generateEmailCode();

    await this.db.raw.execute(
      sql`SELECT app_issue_email_code(
            ${email}, ${hashToken(code)}, ${ipHash},
            ${AuthService.CODE_TTL_SECONDS})`,
    );

    await this.mail.sendSignInCode(email, code, AuthService.CODE_TTL_SECONDS);
  }

  /**
   * Redeem a code and open a session.
   *
   * Returns `null` for every failure — wrong code, expired, too many attempts,
   * no code at all. The caller cannot tell which, because the difference
   * between "wrong code" and "no such account" is precisely what an attacker
   * is probing for.
   */
  async verifyCode(
    email: string,
    code: string,
    userAgent: string | null,
    ipHash: string | null,
  ): Promise<SignInResult | null> {
    const accessToken = generateSessionToken();
    const refreshToken = generateSessionToken();

    const result = await this.db.raw.execute<
      SessionRow & { is_new_account: boolean }
    >(
      sql`SELECT * FROM app_redeem_email_code(
            ${email}, ${hashToken(code)},
            ${hashToken(accessToken)}, ${hashToken(refreshToken)},
            ${userAgent}, ${ipHash},
            ${this.accessHours}, ${this.refreshDays})`,
    );

    const row = result.rows[0];
    if (!row?.user_id) return null;

    return {
      ...this.pair(row, accessToken, refreshToken),
      isNewAccount: row.is_new_account,
    };
  }

  /**
   * Exchange a refresh token for a new access token AND a new refresh token.
   *
   * The token presented stops working the moment this succeeds. Presenting
   * it again revokes the whole session (inside `app_refresh_session`),
   * because a refresh token seen twice is a refresh token somebody copied.
   *
   * Returns `null` for every failure — expired, idle, revoked, unknown,
   * reused — so the endpoint answers with one flat 401 and the client's only
   * move is to sign in again.
   */
  async refresh(rawRefreshToken: string): Promise<SessionPair | null> {
    const accessToken = generateSessionToken();
    const refreshToken = generateSessionToken();

    const result = await this.db.raw.execute<SessionRow>(
      sql`SELECT * FROM app_refresh_session(
            ${hashToken(rawRefreshToken)},
            ${hashToken(accessToken)}, ${hashToken(refreshToken)},
            ${this.accessHours}, ${this.refreshDays}, ${this.idleDays})`,
    );

    const row = result.rows[0];
    if (!row?.user_id) return null;

    return this.pair(row, accessToken, refreshToken);
  }

  private pair(
    row: SessionRow,
    accessToken: string,
    refreshToken: string,
  ): SessionPair {
    return {
      accessToken,
      accessExpiresAt: new Date(row.access_expires_at),
      refreshToken,
      refreshExpiresAt: new Date(row.refresh_expires_at),
      user: { id: row.user_id!, username: row.username, name: row.name },
    };
  }

  /**
   * Revoke the session this request is using.
   *
   * An UPDATE through the normal policy path, because by now there *is* an
   * actor — `sessions_own` restricts it to their own rows. This is why
   * sessions are rows and not JWTs: "sign me out of that device now" takes
   * effect on the next request rather than whenever a token happens to expire.
   */
  async signOut(rawAccessToken: string): Promise<void> {
    await this.db.tx((tx) =>
      tx.execute(
        sql`UPDATE sessions SET revoked_at = now()
             WHERE access_token_hash = ${hashToken(rawAccessToken)}
               AND revoked_at IS NULL`,
      ),
    );
  }

  /** Revoke every session but the current one. "Sign out everywhere else." */
  async signOutOthers(rawAccessToken: string): Promise<number> {
    const result = await this.db.tx((tx) =>
      tx.execute(
        sql`UPDATE sessions SET revoked_at = now()
             WHERE revoked_at IS NULL
               AND access_token_hash <> ${hashToken(rawAccessToken)}`,
      ),
    );
    return result.rowCount ?? 0;
  }
}
