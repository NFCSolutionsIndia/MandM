import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { Env } from '../config/env.schema.js';

/**
 * Sending email.
 *
 * Resend when a key is configured, the console when it is not, and a hard
 * refusal in production with neither — because a deploy that silently logged
 * sign-in codes instead of mailing them would be a breach rather than a bug.
 *
 * Amazon SES is the standing fallback in the design: two independent senders,
 * because a capsule that arrives is the product and one vendor's bad afternoon
 * must not be the reason it does not. The seam for it is `send()`; there is no
 * point writing the fallback before the primary has ever been exercised.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService<Env, true>) {
    const apiKey = config.get('RESEND_API_KEY', { infer: true });

    this.from = config.get('MAIL_FROM', { infer: true });
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
    this.resend = apiKey ? new Resend(apiKey) : null;

    if (this.resend) {
      this.logger.log(`Email will be sent through Resend as ${this.from}`);
    }
  }

  get configured(): boolean {
    return this.resend !== null;
  }

  async sendSignInCode(
    email: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = Math.round(ttlSeconds / 60);

    if (!this.resend) {
      if (this.isProduction) {
        // Failing loudly is the point.
        throw new Error(
          'RESEND_API_KEY is not set. Refusing to log a sign-in code in production.',
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

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: `${code} is your Moments & Memories code`,

      /**
       * The code is in the SUBJECT as well as the body, deliberately.
       *
       * It means the notification on a locked phone already shows it, which
       * removes a whole app-switch from a flow somebody does while holding a
       * child. iOS and Android both offer it for autofill from there.
       */
      text: [
        `Your sign-in code is ${code}.`,
        ``,
        `It expires in ${minutes} minutes and can be used once.`,
        ``,
        `If you did not ask to sign in, you can ignore this email — somebody`,
        `typed your address by mistake, and without this code it does nothing.`,
      ].join('\n'),

      html: this.codeHtml(code, minutes),
    });

    if (error) {
      // Surfaced, never swallowed: a sign-in that silently fails to send is a
      // user staring at a screen that will never change.
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
