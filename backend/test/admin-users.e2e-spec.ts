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
 * BE-08: the console's Users pages — search, sessions, revoke-all.
 *
 * Users sign in for real (planted code, real /auth/verify), so the sessions
 * the console sees and revokes are the ones the mobile app holds. The admin
 * session is inserted directly; admin-auth.e2e-spec.ts proves email + TOTP.
 */
describe('admin users and sessions', () => {
  let app: INestApplication;
  let harness: Harness;

  let adminId: string;
  let adminToken: string;

  const CODE = '424242';
  const PHONE_UA = 'MandM/1.4.0 (iPhone; iOS 18.1)';

  type Verified = {
    accessToken: string;
    refreshToken: string;
    user: { id: string; username: string };
  };

  async function signIn(email: string, userAgent = PHONE_UA): Promise<Verified> {
    await harness.ownerPool.query(
      `UPDATE email_otps SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL`,
      [email],
    );
    await harness.ownerPool.query(
      `INSERT INTO email_otps (id, email, code_hash, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now() + interval '10 minutes')`,
      [email, hashToken(CODE)],
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .set('User-Agent', userAgent)
      .send({ email, code: CODE });
    if (res.status !== 200) {
      throw new Error(`verify ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body as Verified;
  }

  const admin = (method: 'get' | 'post', path: string, token = adminToken) =>
    request(app.getHttpServer())[method](`/api/v1/admin/v1${path}`).set(
      'Authorization',
      `Bearer ${token}`,
    );

  const me = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

  async function auditRows(action: string) {
    const { rows } = await harness.ownerPool.query<{
      actor_type: string;
      actor_id: string;
      resource_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT actor_type, actor_id, resource_id, metadata
         FROM audit_logs WHERE action = $1 ORDER BY created_at`,
      [action],
    );
    return rows;
  }

  let aarav: Verified;

  beforeAll(async () => {
    harness = await connect();
    await resetDatabase(harness.ownerPool);

    const role = await harness.ownerPool.query<{ id: string }>(
      `INSERT INTO roles (id, name) VALUES (uuid_generate_v7(), 'support') RETURNING id`,
    );
    const row = await harness.ownerPool.query<{ id: string }>(
      `INSERT INTO admin_users (id, email, role_id)
       VALUES (uuid_generate_v7(), 'support@mm.internal', $1) RETURNING id`,
      [role.rows[0].id],
    );
    adminId = row.rows[0].id;
    adminToken = generateSessionToken();
    await harness.ownerPool.query(
      `INSERT INTO admin_sessions (id, admin_id, token_hash, mfa_completed_at, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now(), now() + interval '8 hours')`,
      [adminId, hashToken(adminToken)],
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    aarav = await signIn('aarav.kumar@example.com');
    await signIn('priya@example.com');
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  // ── who may call ───────────────────────────────────────────────────────────

  it('refuses a mobile user token with 401 on every endpoint', async () => {
    await admin('get', '/users', aarav.accessToken).expect(401);
    await admin('get', `/users/${aarav.user.id}/sessions`, aarav.accessToken).expect(401);
    await admin('post', `/users/${aarav.user.id}/sessions/revoke-all`, aarav.accessToken).expect(401);
    await request(app.getHttpServer()).get('/api/v1/admin/v1/users').expect(401);
  });

  it('refuses an admin who stopped before TOTP', async () => {
    const half = generateSessionToken();
    await harness.ownerPool.query(
      `INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now() + interval '8 hours')`,
      [adminId, hashToken(half)],
    );
    await admin('get', '/users', half).expect(401);
  });

  // ── the ticket's steps ─────────────────────────────────────────────────────

  it('2. finds aarav by "aarav", with a username and the fields the page shows', async () => {
    const res = await admin('get', '/users?q=aarav').expect(200);

    expect(res.body.items).toHaveLength(1);
    const u = res.body.items[0];
    expect(u).toEqual({
      id: aarav.user.id,
      username: aarav.user.username,
      email: 'aarav.kumar@example.com',
      phone: null,
      channels: ['email'],
      plan: 'free',
      createdAt: expect.any(String),
      lastActiveAt: expect.any(String),
      deletedAt: null,
    });
    expect(u.username).toMatch(/^aarav/);
    expect(res.body.nextCursor).toBeNull();
  });

  it('matches username, email domain and phone (with or without formatting)', async () => {
    await harness.ownerPool.query(
      `UPDATE users SET phone = '+91 98480 12345', phone_verified_at = now() WHERE id = $1`,
      [aarav.user.id],
    );

    const byUsername = await admin('get', `/users?q=${aarav.user.username}`).expect(200);
    expect(byUsername.body.items.map((u: { id: string }) => u.id)).toEqual([aarav.user.id]);

    const byDomain = await admin('get', '/users?q=example.com').expect(200);
    expect(byDomain.body.items).toHaveLength(2);

    const byDigits = await admin('get', '/users?q=9848012345').expect(200);
    expect(byDigits.body.items.map((u: { id: string }) => u.id)).toEqual([aarav.user.id]);
    expect(byDigits.body.items[0].channels).toEqual(['email', 'phone']);

    const nobody = await admin('get', '/users?q=zzz').expect(200);
    expect(nobody.body.items).toEqual([]);
  });

  it('treats % and _ in the query as text, not wildcards', async () => {
    const res = await admin('get', '/users?q=%25').expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('pages newest first with a cursor, and rejects a forged cursor', async () => {
    const first = await admin('get', '/users?limit=1').expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0].email).toBe('priya@example.com');
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await admin('get', `/users?limit=1&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.items[0].id).toBe(aarav.user.id);
    expect(second.body.nextCursor).toBeNull();

    await admin('get', '/users?cursor=nope').expect(400);
    await admin('get', '/users?limit=500').expect(400);
  });

  it('3. shows the session opened from the phone, and no token material', async () => {
    const res = await admin('get', `/users/${aarav.user.id}/sessions`).expect(200);

    expect(res.body.items).toHaveLength(1);
    const s = res.body.items[0];
    expect(s).toEqual({
      id: expect.any(String),
      userAgent: PHONE_UA,
      createdAt: expect.any(String),
      lastActiveAt: expect.any(String),
      expiresAt: expect.any(String),
      revoked: false,
      revokedAt: null,
      active: true,
    });
    // The idle limit (7 days) ends it before the 30-day refresh token does.
    const days = (Date.parse(s.expiresAt) - Date.parse(s.lastActiveAt)) / 86_400_000;
    expect(days).toBeCloseTo(7, 1);
    expect(JSON.stringify(res.body)).not.toContain(hashToken(aarav.accessToken));
  });

  it('404s an unknown or malformed user id', async () => {
    const ghost = '01900000-0000-7000-8000-000000000000';
    await admin('get', `/users/${ghost}/sessions`).expect(404);
    await admin('post', `/users/${ghost}/sessions/revoke-all`).expect(404);
    await admin('get', '/users/not-a-uuid/sessions').expect(404);
  });

  it('4. revoke-all: the phone token gets 401 on /auth/me and cannot refresh', async () => {
    const second = await signIn('aarav.kumar@example.com', 'MandM/1.4.0 (Android 15)');
    await me(aarav.accessToken).expect(200);
    await me(second.accessToken).expect(200);

    const res = await admin('post', `/users/${aarav.user.id}/sessions/revoke-all`).expect(200);
    expect(res.body).toEqual({ userId: aarav.user.id, revoked: 2 });

    await me(aarav.accessToken).expect(401);
    await me(second.accessToken).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: aarav.refreshToken })
      .expect(401);

    const list = await admin('get', `/users/${aarav.user.id}/sessions`).expect(200);
    expect(list.body.items).toHaveLength(2);
    for (const s of list.body.items) {
      expect(s.revoked).toBe(true);
      expect(s.active).toBe(false);
      expect(s.revokedAt).toEqual(expect.any(String));
    }
  });

  it('leaves other users signed in', async () => {
    const priya = await signIn('priya@example.com');
    await admin('post', `/users/${aarav.user.id}/sessions/revoke-all`).expect(200);
    await me(priya.accessToken).expect(200);
  });

  it('revoking again ends nothing new, and is still recorded', async () => {
    const res = await admin('post', `/users/${aarav.user.id}/sessions/revoke-all`).expect(200);
    expect(res.body.revoked).toBe(0);
  });

  it('a fresh sign-in after revoke works', async () => {
    const again = await signIn('aarav.kumar@example.com');
    await me(again.accessToken).expect(200);
  });

  // ── audit ──────────────────────────────────────────────────────────────────

  it('records every call: who, when, which user', async () => {
    const searched = await auditRows('admin.users.searched');
    expect(searched.length).toBeGreaterThanOrEqual(8);
    expect(searched.every((r) => r.actor_type === 'admin' && r.actor_id === adminId)).toBe(true);
    expect(searched.some((r) => r.metadata.q === 'aarav' && r.metadata.results === 1)).toBe(true);

    const viewed = await auditRows('admin.user.sessions_viewed');
    expect(viewed.length).toBeGreaterThanOrEqual(2);
    expect(viewed.every((r) => r.resource_id === aarav.user.id && r.actor_id === adminId)).toBe(true);

    const revoked = await auditRows('admin.user.sessions_revoked');
    expect(revoked.map((r) => r.metadata.revoked)).toEqual([2, 0, 0]);
    expect(revoked.every((r) => r.resource_id === aarav.user.id && r.actor_id === adminId)).toBe(true);
  });

  it('refused calls write nothing', async () => {
    const before = (await auditRows('admin.user.sessions_revoked')).length;
    await admin('post', `/users/${aarav.user.id}/sessions/revoke-all`, aarav.accessToken).expect(401);
    expect((await auditRows('admin.user.sessions_revoked')).length).toBe(before);
  });

  // ── what the database itself allows mm_admin ──────────────────────────────

  it('mm_admin cannot read token hashes, update sessions, or forge an audit row', async () => {
    const client = await harness.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE mm_admin');
      await client.query(`SELECT set_config('app.admin_id', $1, true)`, [adminId]);

      const ok = await client.query('SELECT id, user_agent FROM sessions');
      expect(ok.rowCount).toBeGreaterThan(0);

      for (const stmt of [
        'SELECT access_token_hash FROM sessions',
        'SELECT refresh_token_hash FROM sessions',
        'SELECT ip_hash FROM sessions',
        'SELECT public_key FROM passkey_credentials',
        `UPDATE sessions SET revoked_at = NULL`,
        `SELECT app_admin_audit_read('user.signed_in', NULL, '{}'::jsonb)`,
      ]) {
        await client.query('SAVEPOINT s');
        await expect(client.query(stmt)).rejects.toThrow();
        await client.query('ROLLBACK TO SAVEPOINT s');
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('with no admin set, mm_admin sees no sessions and cannot revoke', async () => {
    const client = await harness.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE mm_admin');
      const rows = await client.query('SELECT id FROM sessions');
      expect(rows.rowCount).toBe(0);
      await expect(
        client.query('SELECT app_admin_revoke_user_sessions($1)', [aarav.user.id]),
      ).rejects.toThrow(/requires an admin/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
