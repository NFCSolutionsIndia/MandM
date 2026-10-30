import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Public } from '../auth/auth.guard.js';
import { DbService } from '../db/db.service.js';

/**
 * Liveness and readiness.
 *
 * Read by the ECS/ALB health check, so its contract matters: a 200 means this
 * container should receive traffic. A health check that only proves the HTTP
 * server is listening is worse than none — it keeps a container in the load
 * balancer while every request it serves fails on the database.
 */
/**
 * `@Public()` on the class, and it is load-bearing.
 *
 * The global `AuthGuard` would otherwise return 401 here — the load
 * balancer would mark every container unhealthy, and the service would
 * never come up. A health check that requires a credential is not a health
 * check.
 */
@Public()
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
    const [{ role, latencyMs }, pools] = await Promise.all([
      this.db.ping(),
      this.db.pingConfigured(),
    ]);

    /**
     * Every configured pool must connect, and as the role it was built for.
     *
     * The role matters as much as the connection: a console pool that logs in
     * as `postgres` connects perfectly and bypasses every admin policy. Both
     * are 503, so a deploy that gates on this endpoint rolls back instead of
     * going live half-broken.
     */
    const failing = (
      [
        ['admin', pools.admin, 'mm_admin'],
        ['worker', pools.worker, 'mm_worker'],
      ] as const
    )
      .filter(([, check, expected]) => check && (!check.connected || check.role !== expected))
      .map(([name]) => name);

    const body = {
      status: failing.length ? 'unavailable' : 'ok',
      database: {
        connected: true,
        role,
        latencyMs,
        rlsEnforced: role !== 'postgres',
      },
      connections: pools,
      ...(failing.length ? { failing } : {}),
    };

    if (failing.length) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }
}
