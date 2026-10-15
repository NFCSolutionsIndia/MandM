import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DbService } from '../db/db.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  generateEmailCode,
  generateSessionToken,
  hashToken,
} from './tokens.js';

export interface SignInResult {
  token: string;
  userId: string;
  isNewAccount: boolean;
  expiresInDays: number;
}

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

  /** 30 days, extended on use by `app_touch_session`. */
  private static readonly SESSION_DAYS = 30;

  /** Six codes an hour to one address. Beyond that it is a mail cannon. */
  private static readonly MAX_CODES_PER_HOUR = 5;

  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
  ) {}

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
    const token = generateSessionToken();

    const result = await this.db.raw.execute<{
      user_id: string;
      is_new_account: boolean;
    }>(
      sql`SELECT * FROM app_redeem_email_code(
            ${email}, ${hashToken(code)}, ${hashToken(token)},
            ${userAgent}, ${ipHash}, ${AuthService.SESSION_DAYS})`,
    );

    const row = result.rows[0];
    if (!row?.user_id) return null;

    return {
      token,
      userId: row.user_id,
      isNewAccount: row.is_new_account,
      expiresInDays: AuthService.SESSION_DAYS,
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
  async signOut(rawToken: string): Promise<void> {
    await this.db.tx((tx) =>
      tx.execute(
        sql`UPDATE sessions SET revoked_at = now()
             WHERE token_hash = ${hashToken(rawToken)}
               AND revoked_at IS NULL`,
      ),
    );
  }

  /** Revoke every session but the current one. "Sign out everywhere else." */
  async signOutOthers(rawToken: string): Promise<number> {
    const result = await this.db.tx((tx) =>
      tx.execute(
        sql`UPDATE sessions SET revoked_at = now()
             WHERE revoked_at IS NULL
               AND token_hash <> ${hashToken(rawToken)}`,
      ),
    );
    return result.rowCount ?? 0;
  }
}
