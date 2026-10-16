import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
}

/**
 * Where a capsule actually goes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  A seam, and currently a stub that says so.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Release 1 sends through Resend with Amazon SES as a standing fallback, and
 * APNs/FCM for push — two independent senders, because a capsule that arrives
 * is the product and one vendor's bad afternoon must not be the reason it does
 * not.
 *
 * None of that is wired. In development this logs and reports success, which
 * is enough to prove the engine's ordering, its idempotency and its retry
 * behaviour — the parts that are hard to get right and impossible to test
 * against a real provider.
 *
 * It REFUSES to run in production, for the same reason MailService does: a
 * deploy that marked capsules delivered without sending anything would be the
 * single worst bug this product could have. Better to fail every job loudly
 * than to quietly tell a family their message arrived.
 */
@Injectable()
export class DeliveryGateway {
  private readonly logger = new Logger(DeliveryGateway.name);
  private readonly isProduction: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.isProduction =
      config.get('NODE_ENV', { infer: true }) === 'production';
  }

  providerFor(channel: string): string {
    switch (channel) {
      case 'email':
        return 'resend';
      case 'push':
        return 'apns';
      case 'sms':
      case 'whatsapp':
        return 'pending';
      default:
        return 'unknown';
    }
  }

  async send(
    channel: string,
    recipientId: string,
    capsuleId: string,
  ): Promise<SendResult> {
    if (this.isProduction) {
      throw new Error(
        'No delivery provider is configured. Refusing to mark a capsule ' +
          'delivered without sending it.',
      );
    }

    // Channels the product has not built yet fail honestly rather than
    // reporting success, so a capsule addressed by SMS stays visibly undelivered.
    if (channel === 'sms' || channel === 'whatsapp') {
      return { ok: false, errorCode: 'channel_not_implemented' };
    }

    this.logger.log(
      `[dev] would send capsule ${capsuleId.slice(0, 13)} to recipient ` +
        `${recipientId.slice(0, 13)} over ${channel}`,
    );

    return {
      ok: true,
      providerMessageId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}
