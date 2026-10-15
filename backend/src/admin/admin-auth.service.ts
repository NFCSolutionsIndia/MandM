import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { Secret, TOTP } from 'otpauth';

import { generateSessionToken, hashToken } from '../auth/tokens.js';
import type { Env } from '../config/env.schema.js';
import { DbService } from '../db/db.service.js';
import { MailService } from '../mail/mail.service.js';
import { generateEmailCode } from '../auth/tokens.js';
import { SecretBox, constantTimeEquals } from './secret-box.js';

export interface FirstFactorResult {
  /** Carries the half-authenticated session. Useless without the second factor. */
  mfaToken: string;
  /** True the first time, when the admin still has to enrol a device. */
  enrolmentRequired: boolean;
  /** Only present during enrolment, and only once. */
  enrolment?: { secret: string; uri: string; backupCodes: string[] };
}

/**
 * Admin sign-in: two factors, neither of them a password.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. an emailed code — proves control of the corporate mailbox
 *  2. a TOTP code     — proves possession of the enrolled device
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * No passwords, consistent with the rest of the product. And genuinely two
 * factors rather than two spellings of one: a mailbox compromise alone does
 * not reach the console, and a stolen phone alone does not either.
 *
 * MFA is mandatory with no bypass. The console can read other people's family
 * archives under break-glass; one factor is not a credential worth that.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  /** A working day, and deliberately not extended on use. */
  private static readonly SESSION_HOURS = 8;
  private static readonly CODE_TTL_SECONDS = 600;

  private readonly box: SecretBox | null;

  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    const key = config.get('ADMIN_ENCRYPTION_KEY', { infer: true });
    this.box = key ? new SecretBox(key) : null;
  }

  private box_(): SecretBox {
    if (!this.box) {
      throw new Error(
        'ADMIN_ENCRYPTION_KEY is not configured; the console cannot sign anybody in.',
      );
    }
    return this.box;
  }

  /**
   * Send a sign-in code.
   *
   * Says nothing about whether the address belongs to an admin. The reply is
   * identical either way, so this endpoint cannot be used to enumerate staff —
   * which is a list worth having if you intend to phish somebody.
   */
  async requestCode(email: string, ipHash: string | null): Promise<void> {
    const code = generateEmailCode();

    await this.db.raw.execute(
      sql`SELECT app_issue_email_code(
            ${email}, ${hashToken(code)}, ${ipHash},
            ${AdminAuthService.CODE_TTL_SECONDS})`,
    );

    await this.mail.sendSignInCode(
      email,
      code,
      AdminAuthService.CODE_TTL_SECONDS,
    );
  }

  /**
   * Factor one. Returns a token that can do exactly one thing: present a TOTP
   * code.
   *
   * `null` for every failure — wrong code, expired, not an admin, deactivated.
   * The database function spends the code either way, so a valid code cannot
   * be replayed while somebody works out which addresses are staff.
   */
  async verifyEmailCode(
    email: string,
    code: string,
    userAgent: string | null,
    ipHash: string | null,
  ): Promise<FirstFactorResult | null> {
    const mfaToken = generateSessionToken();

    const result = await this.db.raw.execute<{ app_admin_redeem_code: string | null }>(
      sql`SELECT app_admin_redeem_code(
            ${email}, ${hashToken(code)}, ${hashToken(mfaToken)},
            ${userAgent}, ${ipHash}, ${AdminAuthService.SESSION_HOURS})`,
    );

    const adminId = result.rows[0]?.app_admin_redeem_code ?? null;
    if (!adminId) return null;

    const pending = await this.pendingSecret(mfaToken);

    // No secret yet: this admin has never enrolled a device. The enrolment
    // material is returned exactly once, here, and is not recoverable later.
    if (!pending?.totp_secret_enc) {
      const secret = new Secret({ size: 20 });
      const backupCodes = Array.from({ length: 8 }, () => generateEmailCode());

      const totp = new TOTP({
        issuer: 'Moments & Memories',
        label: email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });

      await this.db.raw.execute(
        sql`SELECT app_admin_enrol_totp(
              ${adminId}::uuid,
              ${this.box_().seal(secret.base32)},
              ${this.box_().seal(JSON.stringify(backupCodes))})`,
      );

      return {
        mfaToken,
        enrolmentRequired: true,
        enrolment: { secret: secret.base32, uri: totp.toString(), backupCodes },
      };
    }

    return { mfaToken, enrolmentRequired: false };
  }

  /**
   * Factor two. On success the session becomes usable and this returns the
   * same token, now fully authenticated.
   *
   * A six-digit TOTP accepts one step either side of now — the standard
   * allowance for clock drift, and no more. A wider window multiplies the
   * number of codes valid at any moment for no real gain.
   */
  async verifyTotp(
    mfaToken: string,
    code: string,
  ): Promise<{ token: string; adminId: string } | null> {
    const pending = await this.pendingSecret(mfaToken);
    if (!pending?.totp_secret_enc) return null;

    const secret = this.box_().open(pending.totp_secret_enc);
    if (!secret) {
      // The ciphertext did not authenticate: either the key rotated without
      // re-enrolment, or the row was tampered with. Both need a human.
      this.logger.error('An admin TOTP secret failed to decrypt.');
      return null;
    }

    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });

    let accepted = totp.validate({ token: code, window: 1 }) !== null;

    if (!accepted && pending.backup_codes_enc) {
      accepted = await this.consumeBackupCode(
        pending.admin_id,
        pending.backup_codes_enc,
        code,
      );
    }

    if (!accepted) return null;

    const completed = await this.db.raw.execute<{
      app_admin_complete_mfa: string | null;
    }>(sql`SELECT app_admin_complete_mfa(${hashToken(mfaToken)})`);

    const adminId = completed.rows[0]?.app_admin_complete_mfa ?? null;
    if (!adminId) return null;

    return { token: mfaToken, adminId };
  }

  async signOut(rawToken: string): Promise<void> {
    await this.db.raw.execute(
      sql`SELECT app_admin_sign_out(${hashToken(rawToken)})`,
    );
  }

  private async pendingSecret(mfaToken: string) {
    const result = await this.db.raw.execute<{
      admin_id: string;
      totp_secret_enc: string | null;
      backup_codes_enc: string | null;
    }>(sql`SELECT * FROM app_admin_pending_mfa(${hashToken(mfaToken)})`);

    return result.rows[0] ?? null;
  }

  /**
   * A backup code works once, and using one is audited.
   *
   * Compared in constant time, because unlike the TOTP there is no rotating
   * window making a timing signal useless.
   */
  private async consumeBackupCode(
    adminId: string,
    sealed: string,
    candidate: string,
  ): Promise<boolean> {
    const plain = this.box_().open(sealed);
    if (!plain) return false;

    const codes = JSON.parse(plain) as string[];
    const index = codes.findIndex((c) => constantTimeEquals(c, candidate));
    if (index === -1) return false;

    codes.splice(index, 1);

    await this.db.raw.execute(
      sql`SELECT app_admin_use_backup_code(
            ${adminId}::uuid, ${this.box_().seal(JSON.stringify(codes))})`,
    );

    this.logger.warn(`An admin signed in with a backup code (${codes.length} left).`);
    return true;
  }
}
