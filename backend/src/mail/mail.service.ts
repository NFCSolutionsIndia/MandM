import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

/**
 * Sending email.
 *
 * A seam, not an implementation. Release 1 sends through Resend with Amazon
 * SES as a standing fallback — two independent senders, because a capsule that
 * arrives is the product and one vendor's bad afternoon must not be the reason
 * it does not.
 *
 * Neither is wired yet. In development the code is written to the log, which
 * is enough to sign in locally and deliberately refuses to do so in production.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async sendSignInCode(
    email: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      // Failing loudly is the point. A production deploy that silently logged
      // sign-in codes instead of sending them would be a breach, not a bug.
      throw new Error(
        'No mail provider is configured. Refusing to log a sign-in code in production.',
      );
    }

    const minutes = Math.round(ttlSeconds / 60);

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

    return Promise.resolve();
  }
}
