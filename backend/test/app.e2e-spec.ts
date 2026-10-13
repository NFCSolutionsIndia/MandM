import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

/**
 * The application boots and serves.
 *
 * Note the explicit `FastifyAdapter`. `createNestApplication()` with no
 * argument reaches for `@nestjs/platform-express`, which this project removed
 * in step 3 — and the failure is a `process.exit(1)` from deep inside Nest's
 * package loader, which reads as a crashed test runner rather than a missing
 * adapter. Worth knowing the next time a test dies with no useful message.
 */
describe('application', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();

    // Fastify registers routes asynchronously. Without this, a request can
    // arrive before the router is built and come back 404 for a route that
    // exists — an intermittent failure that looks like a flaky test.
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the liveness probe without touching the database', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
  });

  it('connects to the database as mm_app, so RLS applies', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    // The assertion that matters. `postgres` here would mean every policy in
    // migration 0002 is bypassed and the service is open, while reporting
    // itself perfectly healthy.
    expect(res.body.database.role).toBe('mm_app');
    expect(res.body.database.rlsEnforced).toBe(true);
  });
});
