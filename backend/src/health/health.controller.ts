import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { DbService } from '../db/db.service.js';

/**
 * Liveness and readiness.
 *
 * Read by the ECS/ALB health check, so its contract matters: a 200 means this
 * container should receive traffic. A health check that only proves the HTTP
 * server is listening is worse than none — it keeps a container in the load
 * balancer while every request it serves fails on the database.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  /** Cheap: the process is up. No dependencies touched. */
  @Get()
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /**
   * Readiness: can this container actually serve a request?
   *
   * Reports the database role, which is a genuine safety signal rather than
   * decoration. If `role` ever reads `postgres`, every row-level security
   * policy is being bypassed — the service is wide open while looking
   * completely healthy.
   */
  @Get('ready')
  async ready() {
    const { role, latencyMs } = await this.db.ping();

    return {
      status: 'ok',
      database: {
        connected: true,
        role,
        latencyMs,
        rlsEnforced: role !== 'postgres',
      },
    };
  }
}
