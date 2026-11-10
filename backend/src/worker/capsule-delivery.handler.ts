import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';

import { generateSessionToken, hashToken } from '../auth/tokens.js';
import type { Env } from '../config/env.schema.js';
import { DbService } from '../db/db.service.js';
import { DeliveryGateway } from './delivery.gateway.js';
import type { ClaimedJob } from './job-queue.service.js';

/**
 * Delivering a capsule — the thing the whole product is for.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The ordering here is the entire correctness argument.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. RESERVE the attempt row, before sending anything
 *   2. send
 *   3. record the outcome
 *
 * Reserving first is what makes a crash survivable. If the worker dies between
 * (1) and (2) the row exists as `queued`, and the retry sees it and does not
 * send again — the capsule is delayed rather than duplicated. If it died
 * between (2) and (3) without the reservation, the retry would send a second
 * copy of a message from somebody's dead father.
 *
 * Of the two failures, a delayed capsule is recoverable and a duplicate is
 * not. The ordering chooses accordingly, and `ux_attempt_idempotent` is what
 * enforces it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The link is minted here, at delivery, and nowhere else.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nobody holds a working token before the capsule arrives — not the sender,
 * not a backup. Each attempt mints a fresh one in the SAME transaction that
 * reserves the attempt: the new hash replaces the old and `token_version`
 * moves on. The raw token exists only in memory and then in the message.
 *
 * So every attempt's link revokes the one before it. If a provider said
 * "failed" but the message got through anyway, that earlier link dies when the
 * retry goes out. The retry carries a working link of its own, which costs
 * far less than a credential that outlives the message it was sent in.
 */
@Injectable()
export class CapsuleDeliveryHandler {
  private readonly logger = new Logger(CapsuleDeliveryHandler.name);
  private readonly linkBase: string | null;

  constructor(
    private readonly db: DbService,
    private readonly gateway: DeliveryGateway,
    config: ConfigService<Env, true>,
  ) {
    const configured = config.get('OPEN_LINK_BASE_URL', { infer: true });
    const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
    const port = config.get('PORT', { infer: true });

    this.linkBase =
      configured ??
      (isProduction ? null : `http://localhost:${port}/api/v1/open`);
  }

  async handle(job: ClaimedJob): Promise<void> {
    const capsuleId = job.payload.capsuleId;

    if (typeof capsuleId !== 'string') {
      // Not retryable. A malformed payload will be malformed again in a day.
      throw new Error(`Job ${job.id} has no capsuleId in its payload`);
    }

    if (!this.linkBase) {
      // Checked before anything is reserved or rotated, so a misconfigured
      // deploy leaves no half-made attempt behind. It fails the job, which
      // retries in a day — enough time to set the variable.
      throw new Error(
        'OPEN_LINK_BASE_URL is not set. Refusing to deliver a capsule ' +
          'whose link would point nowhere.',
      );
    }

    const recipients = await this.db.workerTx((tx) =>
      tx.execute<{
        recipient_id: string;
        channel: string;
        delivered_at: Date | null;
        state: string;
        unlock_at: Date | null;
        is_future: boolean;
      }>(sql`
        SELECT r.id AS recipient_id, r.preferred_channel AS channel,
               r.delivered_at, c.state, c.unlock_at,
               -- Asked of the DATABASE, not compared in JS: the driver's type for a
               -- timestamptz is not something this decision should depend on, and
               -- the server's clock is the one the scheduler runs on anyway.
               (c.unlock_at IS NOT NULL AND c.unlock_at > now()) AS is_future
          FROM capsule_recipients r
          JOIN capsules c ON c.id = r.capsule_id
         WHERE r.capsule_id = ${capsuleId}
      `),
    );

    if (recipients.rows.length === 0) {
      throw new Error(`Capsule ${capsuleId} has no recipients`);
    }

    const [first] = recipients.rows;

    // A cancelled capsule is not a failure; it is a promise withdrawn. The job
    // completes without sending.
    if (first.state === 'cancelled') {
      this.logger.log(`Capsule ${capsuleId} was cancelled; nothing to send.`);
      return;
    }

    if (first.is_future) {
      // The scheduler claimed it early. Not an error — just not yet.
      throw new Error(
        `Capsule ${capsuleId} unlocks at ${String(first.unlock_at)}, which is in the future`,
      );
    }

    await this.db.workerTx((tx) =>
      tx.execute(
        sql`UPDATE capsules SET state = 'delivering' WHERE id = ${capsuleId} AND state = 'sealed'`,
      ),
    );

    let delivered = 0;
    let failed = 0;

    for (const r of recipients.rows) {
      if (r.delivered_at) {
        delivered++;
        continue;
      }

      const outcome = await this.deliverTo(
        capsuleId,
        r.recipient_id,
        r.channel,
        this.linkBase,
      );
      if (outcome === 'delivered' || outcome === 'already') delivered++;
      else failed++;
    }

    if (failed > 0) {
      throw new Error(
        `${failed} of ${recipients.rows.length} recipients failed for capsule ${capsuleId}`,
      );
    }

    await this.db.workerTx((tx) =>
      tx.execute(sql`
        UPDATE capsules
           SET state = 'delivered', delivered_at = COALESCE(delivered_at, now())
         WHERE id = ${capsuleId}
      `),
    );

    this.logger.log(
      `Capsule ${capsuleId} delivered to ${delivered} recipient(s).`,
    );
  }

  /**
   * One recipient, one channel, exactly once.
   *
   * The reservation and the send are deliberately **not** in one transaction.
   * A transaction that wrapped the provider call would hold a row lock for the
   * length of a network round trip, and — worse — would roll the reservation
   * back when the send failed, which is precisely when the record of having
   * tried is most valuable.
   */
  private async deliverTo(
    capsuleId: string,
    recipientId: string,
    channel: string,
    linkBase: string,
  ): Promise<'delivered' | 'failed' | 'already'> {
    // The credential this attempt will carry. Only its hash is written.
    const token = generateSessionToken();

    // 1 · Reserve, and rotate the recipient's token, in one transaction. If
    //     the reservation is refused the token is never stored, so a losing
    //     racer cannot revoke the link the winner is about to send.
    const attempt = await this.db.workerTx(async (tx) => {
      const reserved = await tx.execute<{ id: string; attempt_no: number }>(sql`
        INSERT INTO delivery_attempts
          (id, capsule_id, recipient_id, channel, attempt_no, provider, status, attempted_at)
        SELECT uuid_generate_v7(), ${capsuleId}, ${recipientId}, ${channel},
               COALESCE(max(attempt_no), 0) + 1,
               ${this.gateway.providerFor(channel)}, 'queued', now()
          FROM delivery_attempts
         WHERE capsule_id = ${capsuleId}
           AND recipient_id = ${recipientId}
           AND channel = ${channel}
        ON CONFLICT DO NOTHING
        RETURNING id, attempt_no
      `);

      const row = reserved.rows[0];
      if (!row) return undefined;

      await tx.execute(sql`
        UPDATE capsule_recipients
           SET access_token_hash = ${hashToken(token)},
               token_version     = token_version + 1
         WHERE id = ${recipientId}
      `);

      return row;
    });

    if (!attempt) {
      // The unique key refused it: this exact attempt already exists, so the
      // previous worker got at least as far as reserving it.
      this.logger.warn(
        `Attempt already recorded for ${recipientId} on ${channel}; not re-sending.`,
      );
      return 'already';
    }

    // 2 · Send.
    const result = await this.gateway.send({
      channel,
      recipientId,
      capsuleId,
      link: `${linkBase}/${token}`,
    });

    // 3 · Record the outcome against the row reserved in step 1.
    await this.db.workerTx(async (tx) => {
      await tx.execute(sql`
        UPDATE delivery_attempts
           SET status             = ${result.ok ? 'delivered' : 'failed'},
               provider_message_id = ${result.providerMessageId ?? null},
               error_code          = ${result.errorCode ?? null},
               next_retry_at       = ${result.ok ? null : sql`now() + interval '1 day'`}
         WHERE id = ${attempt.id}
      `);

      if (result.ok) {
        await tx.execute(sql`
          UPDATE capsule_recipients
             SET delivered_at = COALESCE(delivered_at, now())
           WHERE id = ${recipientId}
        `);
      }

      await tx.execute(sql`
        INSERT INTO audit_logs (id, actor_type, action, resource_type, resource_id, metadata)
        VALUES (uuid_generate_v7(), 'system',
                ${result.ok ? 'capsule.delivered' : 'capsule.delivery_failed'},
                'capsule', ${capsuleId},
                ${JSON.stringify({ channel, recipientId, attemptNo: attempt.attempt_no })}::jsonb)
      `);
    });

    return result.ok ? 'delivered' : 'failed';
  }
}
