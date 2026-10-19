import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

import type { Env } from '../config/env.schema.js';

/**
 * Sending email.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Three transports, chosen in this order: SMTP, Resend, the console.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SMTP first because it is the lowest common denominator — ZeptoMail, SES,
 * Postmark and every other provider speak it, so changing vendor is an edit
 * to `.env` rather than to this file. Resend stays as the HTTP alternative.
 *
 * Two independent senders because a capsule that arrives IS the product, and
 * one vendor's bad afternoon must not be the reason it does not.
 *
 * With neither configured: the console in development, and a hard refusal in
 * production, because a deploy that silently logged sign-in codes instead of
 * mailing them would be a breach rather than a bug.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly smtp: Transporter | null = null;
  private readonly resend: Resend | null = null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USERNAME', { infer: true });
    const pass = config.get('SMTP_PASSWORD', { infer: true });
    const apiKey = config.get('RESEND_API_KEY', { infer: true });

    if (host) {
      const port = config.get('SMTP_PORT', { infer: true });

      // 465 is implicit TLS; everything else negotiates STARTTLS. Either way
      // the session is encrypted — `requireTLS` means nodemailer aborts
      // rather than continuing in plaintext if the server will not upgrade.
      const secure = config.get('SMTP_SECURE', { infer: true }) ?? port === 465;

      this.smtp = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !secure,
        auth: user && pass ? { user, pass } : undefined,
      });

      this.logger.log(`Email will be sent by SMTP via ${host}:${port} as ${this.from}`);
    } else if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log(`Email will be sent through Resend as ${this.from}`);
    }
  }

  get configured(): boolean {
    return this.smtp !== null || this.resend !== null;
  }

  /**
   * Prove the credentials before a user depends on them.
   *
   * SMTP authentication fails at SEND time, which without this means the
   * first thing to discover a wrong password is somebody trying to sign in.
   * Called at startup; it logs and returns rather than throwing, because a
   * mail outage must not take the whole API down with it.
   */
  async verify(): Promise<boolean> {
    if (!this.smtp) return this.resend !== null;

    try {
      await this.smtp.verify();
      this.logger.log('SMTP credentials accepted');
      return true;
    } catch (error) {
      this.logger.error(
        `SMTP refused the connection: ${(error as Error).message}. ` +
          'Sign-in emails will fail until this is fixed.',
      );
      return false;
    }
  }

  async sendSignInCode(
    email: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = Math.round(ttlSeconds / 60);

    if (!this.configured) {
      if (this.isProduction) {
        // Failing loudly is the point.
        throw new Error(
          'No mail transport is configured (set SMTP_HOST or RESEND_API_KEY). ' +
            'Refusing to log a sign-in code in production.',
        );
      }

      this.logger.log(
        `\n` +
          `  ┌─────────────────────────────────────────────┐\n` +
          `  │  SIGN-IN CODE (development only)            │\n` +
          `  ├─────────────────────────────────────────────┤\n` +
          `  │  to:    ${email.padEnd(36)}│\n` +
          `  │  code:  ${code.padEnd(36)}│\n` +
          `  │  valid: ${`${minutes} minutes`.padEnd(36)}│\n` +
          `  └─────────────────────────────────────────────┘`,
      );
      return;
    }

    /**
     * The code is in the SUBJECT as well as the body, deliberately.
     *
     * It means the notification on a locked phone already shows it, which
     * removes a whole app-switch from a flow somebody does while holding a
     * child. iOS and Android both offer it for autofill from there.
     */
    const subject = `${code} is your Moments & Memories code`;

    const text = [
      `Your sign-in code is ${code}.`,
      ``,
      `It expires in ${minutes} minutes and can be used once.`,
      ``,
      `If you did not ask to sign in, you can ignore this email — somebody`,
      `typed your address by mistake, and without this code it does nothing.`,
    ].join('\n');

    const html = this.codeHtml(code, minutes);

    if (this.smtp) {
      try {
        await this.smtp.sendMail({ from: this.from, to: email, subject, text, html });
      } catch (error) {
        // Surfaced, never swallowed: a sign-in that silently fails to send is
        // a user staring at a screen that will never change.
        const message = (error as Error).message;
        this.logger.error(`SMTP refused the message: ${message}`);
        throw new Error(`Email delivery failed: ${message}`);
      }
      return;
    }

    const { error } = await this.resend!.emails.send({
      from: this.from,
      to: email,
      subject,
      text,
      html,
    });

    if (error) {
      this.logger.error(`Resend refused the message: ${error.message}`);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }

  /**
   * Deliberately plain HTML: tables, inline styles, no external CSS and no
   * images. Mail clients are a twenty-year-old rendering target, and a code
   * somebody cannot read is a sign-in they cannot complete.
   */
  private codeHtml(code: string, minutes: number): string {
    return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a8a84">Moments &amp; Memories</p>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;color:#121212">Your sign-in code</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#55554f">Enter this in the app. It expires in ${minutes} minutes and works once.</p>
      <p style="margin:0 0 24px;padding:18px;background:#f2f1ed;border-radius:12px;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:30px;letter-spacing:.3em;color:#121212">${code}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#8a8a84">If you did not ask to sign in, ignore this email. Somebody typed your address by mistake, and without this code it does nothing.</p>
    </td></tr>
  </table>
</body></html>`;
  }
}
