import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';
import type { DbService } from '../db/db.service.js';
import { VaultsController } from './vaults.controller.js';

/**
 * The row-count demonstration exists for development. The integration suite
 * proves what it counts; this proves production never answers it.
 */
function controllerIn(nodeEnv: Env['NODE_ENV']) {
  const db = {
    tx: async () => ({ rows: [{ vaults: '1', memories: '0', users: '1' }] }),
  } as unknown as DbService;
  const config = { get: () => nodeEnv } as unknown as ConfigService<Env, true>;
  return new VaultsController(db, config);
}

describe('VaultsController.rowCounts', () => {
  it('is a 404 in production, as though the route did not exist', async () => {
    await expect(controllerIn('production').rowCounts()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers in development', async () => {
    await expect(controllerIn('development').rowCounts()).resolves.toEqual({
      vaults: '1',
      memories: '0',
      users: '1',
    });
  });
});
