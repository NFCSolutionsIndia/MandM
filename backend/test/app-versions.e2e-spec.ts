import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { generateSessionToken, hashToken } from '../src/auth/tokens.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * App versions (BE-05), over HTTP: the public check the mobile apps call on
 * launch, and the console endpoints that set it.
 *
 * The admin session is inserted directly rather than earned through email and
 * TOTP — admin-auth.e2e-spec.ts proves that flow; this suite is about what an
 * admin can do once signed in.
 */
describe('app versions', () => {
  let app: INestApplication;
  let harness: Harness;

  let adminId: string;
  let adminToken: string;

  const ADMIN_EMAIL = 'release@mm.internal';
  const STORE = 'https://apps.apple.com/app/id0000000000';

  function check(platform: string, current?: string) {
    const req = request(app.getHttpServer()).get(`/api/v1/app-version/${platform}`);
    return current === undefined ? req : req.query({ current });
  }

  function put(platform: string, body: object, token = adminToken) {
    return request(app.getHttpServer())
      .put(`/api/v1/admin/v1/app-versions/${platform}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    harness = await connect();
    await resetDatabase(harness.ownerPool);

    // resetDatabase empties every table, including the rows migration 0020
    // seeds. Put them back the way a fresh database has them.
    await harness.ownerPool.query(
      `INSERT INTO app_versions (platform, latest_version, min_supported_version)
       VALUES ('ios', '0.0.0', '0.0.0'), ('android', '0.0.0', '0.0.0')`,
    );

    const role = await harness.ownerPool.query<{ id: string }>(
      `INSERT INTO roles (id, name) VALUES (uuid_generate_v7(), 'release') RETURNING id`,
    );
    const admin = await harness.ownerPool.query<{ id: string }>(
      `INSERT INTO admin_users (id, email, role_id)
       VALUES (uuid_generate_v7(), $1, $2) RETURNING id`,
      [ADMIN_EMAIL, role.rows[0].id],
    );
    adminId = admin.rows[0].id;

    adminToken = generateSessionToken();
    await harness.ownerPool.query(
      `INSERT INTO admin_sessions (id, admin_id, token_hash, mfa_completed_at, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now(), now() + interval '8 hours')`,
      [adminId, hashToken(adminToken)],
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  // ── before anything is configured ─────────────────────────────────────────

  it('answers before anything is configured, and forces nobody', async () => {
    const res = await check('ios', '1.0.0').expect(200);

    expect(res.body).toEqual({
      platform: 'ios',
      latestVersion: '0.0.0',
      minSupportedVersion: '0.0.0',
      updateAvailable: false,
      forceUpdate: false,
      storeUrl: null,
      releaseNotes: null,
    });
  });

  // ── the ticket's steps, in order ──────────────────────────────────────────

  it('1. lets an admin set iOS', async () => {
    const res = await put('ios', {
      latestVersion: '1.4.0',
      minSupportedVersion: '1.3.0',
      storeUrl: STORE,
      releaseNotes: 'Faster uploads.',
    }).expect(200);

    expect(res.body).toMatchObject({
      platform: 'ios',
      latestVersion: '1.4.0',
      minSupportedVersion: '1.3.0',
      storeUrl: STORE,
      releaseNotes: 'Faster uploads.',
      updatedBy: { id: adminId, email: ADMIN_EMAIL },
    });
  });

  it('2. forces an update below the minimum', async () => {
    const res = await check('ios', '1.2.0').expect(200);

    expect(res.body).toMatchObject({
      platform: 'ios',
      latestVersion: '1.4.0',
      minSupportedVersion: '1.3.0',
      updateAvailable: true,
      forceUpdate: true,
      storeUrl: STORE,
      releaseNotes: 'Faster uploads.',
    });
  });

  it('3. offers, but does not force, an update between the two', async () => {
    const res = await check('ios', '1.3.5').expect(200);

    expect(res.body.updateAvailable).toBe(true);
    expect(res.body.forceUpdate).toBe(false);
  });

  it('4. says nothing to an app on the latest version', async () => {
    const res = await check('ios', '1.4.0').expect(200);

    expect(res.body.updateAvailable).toBe(false);
    expect(res.body.forceUpdate).toBe(false);
  });

  it('5. returns 404 for an unknown platform', async () => {
    await check('windows').expect(404);
    await check('windows', '1.0.0').expect(404);
    await put('windows', { latestVersion: '1.0.0', minSupportedVersion: '1.0.0' }).expect(404);
  });

  it('6. refuses a minimum newer than the latest with 422', async () => {
    const res = await put('ios', {
      latestVersion: '1.4.0',
      minSupportedVersion: '2.0.0',
    }).expect(422);

    expect(res.body.errors[0].field).toBe('minSupportedVersion');
    // Nothing changed.
    expect((await check('ios').expect(200)).body.minSupportedVersion).toBe('1.3.0');
  });

  // ── the acceptance criteria ───────────────────────────────────────────────

  it('counts 1.10.0 as newer than 1.9.0', async () => {
    await put('android', {
      latestVersion: '1.10.0',
      minSupportedVersion: '1.9.0',
    }).expect(200);

    const behind = await check('android', '1.9.0').expect(200);
    expect(behind.body.updateAvailable).toBe(true);
    expect(behind.body.forceUpdate).toBe(false);

    // As text, '1.10.0' < '1.9.0' and this app would be forced to "update".
    const ahead = await check('android', '1.10.0').expect(200);
    expect(ahead.body.updateAvailable).toBe(false);
    expect(ahead.body.forceUpdate).toBe(false);

    await check('android', '1.8.9').expect(200).expect((r) => {
      expect(r.body.forceUpdate).toBe(true);
    });
  });

  it('accepts a minimum of 1.9.0 under a latest of 1.10.0 (no text comparison on write)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/v1/app-versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const android = res.body.find((v: { platform: string }) => v.platform === 'android');
    expect(android.minSupportedVersion).toBe('1.9.0');
  });

  it('keeps iOS and Android apart', async () => {
    const ios = await check('ios', '1.5.0').expect(200);
    const android = await check('android', '1.5.0').expect(200);

    expect(ios.body.latestVersion).toBe('1.4.0');
    expect(android.body.latestVersion).toBe('1.10.0');
    expect(ios.body.updateAvailable).toBe(false);
    expect(android.body.updateAvailable).toBe(true);
  });

  it('returns the data with both flags false when "current" is missing', async () => {
    const res = await check('ios').expect(200);

    expect(res.body.latestVersion).toBe('1.4.0');
    expect(res.body.updateAvailable).toBe(false);
    expect(res.body.forceUpdate).toBe(false);
  });

  it('rejects a "current" that is not x.y.z', async () => {
    await check('ios', '1.2').expect(400);
    await check('ios', 'abc').expect(400);
  });

  it('allows caching for five minutes', async () => {
    const res = await check('ios', '1.2.0').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('needs no login', async () => {
    // No Authorization header anywhere above; and a garbage one changes nothing.
    await check('ios', '1.2.0').set('Authorization', 'Bearer nonsense').expect(200);
  });

  // ── validation on write ───────────────────────────────────────────────────

  it.each([
    ['latestVersion', { latestVersion: '1.4', minSupportedVersion: '1.0.0' }],
    ['latestVersion', { latestVersion: 'v1.4.0', minSupportedVersion: '1.0.0' }],
    ['minSupportedVersion', { latestVersion: '1.4.0', minSupportedVersion: '1.04.0' }],
    ['storeUrl', { latestVersion: '1.4.0', minSupportedVersion: '1.0.0', storeUrl: 'http://x.example' }],
  ])('refuses a bad %s with 422', async (field, body) => {
    const res = await put('ios', body).expect(422);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  // ── the audit trail ───────────────────────────────────────────────────────

  it('writes an audit row for every change: who, what, old and new', async () => {
    const { rows } = await harness.ownerPool.query<{
      actor_type: string;
      actor_id: string;
      action: string;
      resource_type: string;
      metadata: {
        platform: string;
        old: Record<string, unknown>;
        new: Record<string, unknown>;
      };
    }>(
      `SELECT actor_type, actor_id, action, resource_type, metadata
         FROM audit_logs WHERE action = 'app_version.updated'
        ORDER BY created_at, id`,
    );

    // iOS once, Android once. The refused writes left no trace.
    expect(rows).toHaveLength(2);

    const ios = rows[0];
    expect(ios.actor_type).toBe('admin');
    expect(ios.actor_id).toBe(adminId);
    expect(ios.resource_type).toBe('app_version');
    expect(ios.metadata.platform).toBe('ios');
    expect(ios.metadata.old).toEqual({
      latestVersion: '0.0.0',
      minSupportedVersion: '0.0.0',
      storeUrl: null,
      releaseNotes: null,
    });
    expect(ios.metadata.new).toEqual({
      latestVersion: '1.4.0',
      minSupportedVersion: '1.3.0',
      storeUrl: STORE,
      releaseNotes: 'Faster uploads.',
    });

    expect(rows[1].metadata.platform).toBe('android');
  });

  // ── who may change it ─────────────────────────────────────────────────────

  it('refuses the console endpoints without an admin session', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/v1/app-versions').expect(401);
    await put('ios', { latestVersion: '9.0.0', minSupportedVersion: '9.0.0' }, 'nonsense').expect(401);
  });

  it('refuses a customer session on the console endpoints', async () => {
    const userToken = generateSessionToken();
    const user = await harness.ownerPool.query<{ id: string }>(
      `INSERT INTO users (id, email, name) VALUES (uuid_generate_v7(), 'cust@example.com', 'C')
       RETURNING id`,
    );
    await harness.ownerPool.query(
      `INSERT INTO sessions (id, user_id, access_token_hash, access_expires_at,
                             refresh_token_hash, refresh_expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now() + interval '1 day', $3, now() + interval '30 days')`,
      [user.rows[0].id, hashToken(userToken), hashToken(generateSessionToken())],
    );

    await put('ios', { latestVersion: '9.0.0', minSupportedVersion: '9.0.0' }, userToken).expect(401);
  });

  it('cannot be written by the API role directly, even by a signed-in user', async () => {
    // RLS: mm_app may read app_versions and nothing more. The only write path
    // is the console's function, which mm_app may not execute.
    const update = await harness.appPool.query(
      `UPDATE app_versions SET min_supported_version = '9.9.9'`,
    );
    expect(update.rowCount).toBe(0);

    await expect(
      harness.appPool.query(
        `SELECT app_admin_set_app_version('ios', '9.9.9', '9.9.9', NULL, NULL)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot be written through the function without an admin behind it', async () => {
    // The console role, but with no admin set on the transaction.
    const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
    if (!adminUrl) return;
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: adminUrl });
    try {
      await expect(
        pool.query(`SELECT app_admin_set_app_version('ios', '9.9.9', '9.9.9', NULL, NULL)`),
      ).rejects.toThrow(/requires an admin/);
    } finally {
      await pool.end();
    }
  });
});
