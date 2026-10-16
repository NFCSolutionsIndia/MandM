import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';
import { CapsuleDeliveryHandler } from './capsule-delivery.handler.js';
import { JobQueueService } from './job-queue.service.js';

/**
 * The loop.
 *
 * Deliberately a plain `while` with a sleep rather than a cron library or a
 * setInterval: a timer can overlap with itself when a batch runs long, and two
 * overlapping ticks on the delivery engine is the one thing the claim query is
 * protecting against. Sequential by construction is simpler than sequential by
 * configuration.
 */
@Injectable()
export class WorkerService implements OnApplicationShutdown {
  private readonly logger = new Logger(WorkerService.name);
  private readonly idleMs: number;

  private running = false;
  private stopping = false;

  constructor(
    private readonly queue: JobQueueService,
    private readonly capsules: CapsuleDeliveryHandler,
    config: ConfigService<Env, true>,
  ) {
    this.idleMs = config.get('WORKER_IDLE_SECONDS', { infer: true }) * 1000;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.logger.log(`Delivery engine started as ${this.queue.workerId}`);

    while (!this.stopping) {
      try {
        const worked = await this.tick();
        if (!worked) await this.sleep(this.idleMs);
      } catch (error) {
        // The loop itself must not die. A database blip should cost one tick,
        // not the delivery engine.
        this.logger.error(
          `Tick failed: ${(error as Error).message}`,
          (error as Error).stack,
        );
        await this.sleep(this.idleMs);
      }
    }

    this.logger.log('Delivery engine stopped.');
  }

  /**
   * One pass. Returns whether there was anything to do, so an empty queue
   * sleeps and a busy one keeps going without waiting.
   *
   * Exposed so the test suite can drive exactly one tick rather than racing a
   * background loop.
   */
  async tick(): Promise<boolean> {
    await this.queue.reap();

    const jobs = await this.queue.claim();
    if (jobs.length === 0) return false;

    for (const job of jobs) {
      if (this.stopping) break;

      try {
        switch (job.kind) {
          case 'capsule_delivery':
            await this.capsules.handle(job);
            break;
          default:
            // Not a failure to retry: nothing will ever handle it. Let it die
            // rather than cycling through five pointless attempts.
            throw new Error(`No handler for job kind "${job.kind}"`);
        }

        await this.queue.complete(job.id);
      } catch (error) {
        await this.queue.fail(job.id, job.attempts, (error as Error).message);
      }
    }

    return true;
  }

  /**
   * Stop after the current job, not during it.
   *
   * ECS sends SIGTERM and waits. Finishing the job in hand means the lease is
   * released cleanly; killing mid-send would leave a reserved attempt that the
   * reaper has to wait out before anybody retries.
   */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
