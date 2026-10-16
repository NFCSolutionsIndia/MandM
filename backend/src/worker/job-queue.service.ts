import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { hostname } from 'node:os';

import type { Env } from '../config/env.schema.js';
import { DbService } from '../db/db.service.js';

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  runAt: Date;
}

/**
 * The durable clock, driven.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Claiming is the one query in this product that must never be wrong twice.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two workers must never claim the same job, and a worker that dies holding
 * one must not keep it forever. Both are solved in the same statement:
 *
 *   FOR UPDATE SKIP LOCKED   two workers never see the same row
 *   locked_until             a dead worker's job returns to the queue
 *
 * `SKIP LOCKED` rather than `NOWAIT` or a plain `FOR UPDATE`: the first would
 * error, the second would make a second worker *wait* for the first, which
 * turns a pool of workers into a queue of one.
 */
@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  /**
   * Who holds a lease, written into `locked_by`.
   *
   * Hostname plus pid, because after an incident "which container was holding
   * this" is a question somebody will ask, and `true` is not an answer.
   */
  readonly workerId = `${hostname()}:${process.pid}`;

  private readonly leaseSeconds: number;
  private readonly batchSize: number;

  constructor(
    private readonly db: DbService,
    config: ConfigService<Env, true>,
  ) {
    this.leaseSeconds = config.get('WORKER_LEASE_SECONDS', { infer: true });
    this.batchSize = config.get('WORKER_BATCH_SIZE', { infer: true });
  }

  /**
   * Claim up to a batch of due jobs.
   *
   * One statement, so the claim is atomic: a row is selected, locked, and
   * stamped with this worker's lease before any other transaction can see it.
   * Doing it as SELECT-then-UPDATE would leave a window in which two workers
   * both believe they own the job.
   */
  async claim(kind?: string): Promise<ClaimedJob[]> {
    const result = await this.db.worker.execute<{
      id: string;
      kind: string;
      payload: Record<string, unknown>;
      attempts: number;
      run_at: Date;
    }>(sql`
      UPDATE scheduled_jobs
         SET state        = 'running',
             attempts     = attempts + 1,
             locked_by    = ${this.workerId},
             locked_until = now() + make_interval(secs => ${this.leaseSeconds})
       WHERE id IN (
         SELECT id FROM scheduled_jobs
          WHERE state = 'pending'
            AND run_at <= now()
            ${kind ? sql`AND kind = ${kind}` : sql``}
          ORDER BY run_at
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, kind, payload, attempts, run_at
    `);

    return result.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload ?? {},
      attempts: r.attempts,
      runAt: r.run_at,
    }));
  }

  /** Mark a job done. The lease is released by the same write. */
  async complete(jobId: string): Promise<void> {
    await this.db.worker.execute(sql`
      UPDATE scheduled_jobs
         SET state = 'completed', completed_at = now(),
             locked_by = NULL, locked_until = NULL, last_error = NULL
       WHERE id = ${jobId}
    `);
  }

  /**
   * Record a failure and schedule the retry — in **days**, not minutes.
   *
   * A capsule has waited twenty years; it can wait another day for a mail
   * server to come back. Retrying aggressively would burn the whole retry
   * budget in an afternoon on an outage that resolves itself overnight.
   *
   * After the last attempt the job goes `dead`, which is terminal and needs a
   * person. For `capsule_delivery` that is a Sev-0, and the dashboard counts
   * it as one.
   */
  async fail(
    jobId: string,
    attempts: number,
    error: string,
    maxAttempts = 5,
  ): Promise<'retrying' | 'dead'> {
    const dead = attempts >= maxAttempts;

    // 1 day, 2, 4, 8 — doubling, in days.
    const backoffDays = Math.min(2 ** (attempts - 1), 8);

    await this.db.worker.execute(sql`
      UPDATE scheduled_jobs
         SET state        = ${dead ? 'dead' : 'pending'},
             run_at       = ${dead ? sql`run_at` : sql`now() + make_interval(days => ${backoffDays})`},
             locked_by    = NULL,
             locked_until = NULL,
             last_error   = ${error.slice(0, 2000)}
       WHERE id = ${jobId}
    `);

    if (dead) {
      this.logger.error(
        `Job ${jobId} is DEAD after ${attempts} attempts: ${error}`,
      );
    } else {
      this.logger.warn(
        `Job ${jobId} failed (attempt ${attempts}), retrying in ${backoffDays}d: ${error}`,
      );
    }

    return dead ? 'dead' : 'retrying';
  }

  /**
   * Return abandoned jobs to the queue.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  Without this, a worker that dies mid-job holds it forever.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The job stays `running` with a lease held by a process that no longer
   * exists, and for `capsule_delivery` that means a promise which simply never
   * fires — with no error anywhere, because nothing failed. It was just
   * dropped.
   *
   * `attempts` is deliberately **not** incremented: the job was never tried,
   * it was abandoned, and charging it an attempt would spend the retry budget
   * on a crash rather than on a real failure.
   */
  async reap(): Promise<number> {
    const result = await this.db.worker.execute(sql`
      UPDATE scheduled_jobs
         SET state = 'pending', locked_by = NULL, locked_until = NULL,
             last_error = coalesce(last_error, 'lease expired; worker presumed dead')
       WHERE state IN ('claimed', 'running')
         AND locked_until IS NOT NULL
         AND locked_until < now()
    `);

    const count = result.rowCount ?? 0;
    if (count > 0) {
      this.logger.warn(`Reaped ${count} abandoned job(s) back to pending.`);
    }
    return count;
  }
}
