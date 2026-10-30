import { ServiceUnavailableException } from '@nestjs/common';

import type { DbService, PoolCheck } from '../db/db.service.js';
import { HealthController } from './health.controller.js';

/**
 * The failure half of readiness, which a healthy test database cannot show.
 *
 * The deploy gates on this endpoint, so a pool that is down — or up as the
 * wrong role — has to be a 503, or a broken release goes live.
 */
function controllerWith(pools: { admin: PoolCheck | null; worker: PoolCheck | null }) {
  const db = {
    ping: async () => ({ role: 'mm_app', latencyMs: 1 }),
    pingConfigured: async () => pools,
  } as unknown as DbService;
  return new HealthController(db);
}

const up = (role: string): PoolCheck => ({ connected: true, role });
const down: PoolCheck = { connected: false, role: null };

describe('HealthController.ready', () => {
  it('is ready when every configured pool connects as its own role', async () => {
    const body = await controllerWith({ admin: up('mm_admin'), worker: up('mm_worker') }).ready();
    expect(body.status).toBe('ok');
  });

  it('is ready when a pool was simply not configured', async () => {
    const body = await controllerWith({ admin: null, worker: null }).ready();
    expect(body.status).toBe('ok');
  });

  it('is unavailable when the console pool cannot connect', async () => {
    await expect(
      controllerWith({ admin: down, worker: up('mm_worker') }).ready(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is unavailable when a pool connects as the wrong role', async () => {
    // Connected, and worse than down: `postgres` bypasses every admin policy.
    const error = await controllerWith({ admin: up('postgres'), worker: up('mm_worker') })
      .ready()
      .catch((e: ServiceUnavailableException) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      status: 'unavailable',
      failing: ['admin'],
    });
  });
});
