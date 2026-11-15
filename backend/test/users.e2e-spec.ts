import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * BE-03 — the auto-generated username, end to end.
 *
 * Sign-ups go through the real `/auth/verify`. The one shortcut: the sign-in
 * code is planted in `email_otps` with a known hash instead of being
 * requested and brute-forced back, which is what makes 1,000 of them cheap.
 */
describe('usernames, end to end', () => {
  let app: INestApplication;
  let harness: Harness;

  const CODE = '424242';

  /** A planted code, then the real verify. Returns the verify body. */
  async function signUp(email: string) {
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
      .send({ email, code: CODE });
    if (res.status !== 200) {
      throw new Error(`verify ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body as {
      accessToken: string;
      isNewAccount: boolean;
      user: { id: string; username: string; name: string };
    };
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const patch = (token: string, username: unknown) =>
    request(app.getHttpServer())
      .patch('/api/v1/users/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ username });

  const available = (token: string, u: string) =>
    get(`/api/v1/users/username-available?u=${encodeURIComponent(u)}`, token);

  async function generate(email: string | null, name: string | null): Promise<string> {
    const { rows } = await harness.ownerPool.query<{ u: string }>(
      `SELECT app_generate_username($1, $2) AS u`,
      [email, name],
    );
    return rows[0]!.u;
  }

  let aarav: { token: string; id: string };
  let bina: { token: string; id: string };

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    harness = await connect();
    await resetDatabase(harness.ownerPool);

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

  // ── Steps to reproduce 1–2: generation at sign-up ─────────────────────────

  it('step 1: aarav@x.com signs up as "aarav"', async () => {
    const body = await signUp('aarav@x.com');
    expect(body.isNewAccount).toBe(true);
    expect(body.user.username).toBe('aarav');
    aarav = { token: body.accessToken, id: body.user.id };
  });

  it('step 2: aarav@y.com gets "aarav" plus digits', async () => {
    const body = await signUp('aarav@y.com');
    expect(body.user.username).toMatch(/^aarav\d{4}$/);
    bina = { token: body.accessToken, id: body.user.id };
  });

  it('signing in again does not change the handle', async () => {
    const body = await signUp('aarav@x.com');
    expect(body.isNewAccount).toBe(false);
    expect(body.user.username).toBe('aarav');
    aarav.token = body.accessToken;
  });

  it('a different case of an address is the same account and handle', async () => {
    const body = await signUp('AARAV@X.COM');
    expect(body.user.username).toBe('aarav');
    aarav.token = body.accessToken;
  });

  it('GET /users/me includes the username', async () => {
    const res = await get('/api/v1/users/me', aarav.token).expect(200);
    expect(res.body).toMatchObject({
      id: aarav.id,
      email: 'aarav@x.com',
      username: 'aarav',
      usernameChangedAt: null,
      usernameChangeableAt: null,
    });
  });

  it('GET /auth/me still includes it too', async () => {
    const res = await get('/api/v1/auth/me', aarav.token).expect(200);
    expect(res.body.username).toBe('aarav');
  });

  it('/users routes need a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users/username-available?u=abc')
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/username')
      .send({ username: 'abc' })
      .expect(401);
  });

  // ── the generator ──────────────────────────────────────────────────────────

  it.each([
    ['A.Rav..Kumar+tag@x.com', null, 'a.rav.kumartag'],
    // Separators trimmed to `aarav`, which is taken, so digits.
    ['__aarav__@x.com', null, /^aarav\d{4}$/],
    ['.x.@x.com', null, /^userx(\d{4})?$/],
    ['ab@x.com', null, /^userab(\d{4})?$/],
    ['admin@x.com', null, /^admin\d{4}$/],
    ['sup.port@x.com', null, /^sup\.port\d{4}$/],
    [`${'k'.repeat(40)}@x.com`, null, 'k'.repeat(24)],
  ])('email %s → %s', async (email, name, expected) => {
    const u = await generate(email, name);
    if (typeof expected === 'string') expect(u).toBe(expected);
    else expect(u).toMatch(expected);
  });

  it('falls back to the name when there is no email (phone accounts)', async () => {
    expect(await generate(null, 'Priya Sharma')).toBe('priya.sharma');
    expect(await generate(null, 'प्रिया')).toMatch(/^user\d{4}$/);
    expect(await generate(null, null)).toMatch(/^user\d{4}$/);
  });

  it('a row inserted without a username gets one from the trigger', async () => {
    const { rows } = await harness.ownerPool.query<{ username: string }>(
      `INSERT INTO users (id, email, name) VALUES (uuid_generate_v7(), 'direct@x.com', 'Direct')
       RETURNING username::text`,
    );
    expect(rows[0]!.username).toBe('direct');
  });

  it('the database refuses malformed handles whatever the path', async () => {
    for (const bad of ['AARAV.UP', 'a..b', '.abc', 'abc.', 'ab']) {
      await expect(
        harness.ownerPool.query(`UPDATE users SET username = $1 WHERE id = $2`, [bad, bina.id]),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('the column is citext: lookups ignore case', async () => {
    const { rows } = await harness.ownerPool.query<{ n: string; t: string }>(
      `SELECT count(*) AS n, pg_typeof(min(username))::text AS t FROM users WHERE username = 'AARAV'`,
    );
    expect(rows[0]).toEqual({ n: '1', t: 'citext' });
  });

  it('step 5: no user is without a username', async () => {
    const { rows } = await harness.ownerPool.query<{ n: string }>(
      `SELECT count(*) AS n FROM users WHERE username IS NULL`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  // ── Step 3: availability ───────────────────────────────────────────────────

  it('step 3: ADMIN is not available, and comparison ignores case', async () => {
    const res = await available(aarav.token, 'ADMIN').expect(200);
    expect(res.body).toMatchObject({ username: 'admin', available: false, reason: 'reserved' });
    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it.each(['support', 'Help', 'ad.min', 'support_', 'm.m'])(
    'reserved: %s',
    async (u) => {
      const res = await available(aarav.token, u).expect(200);
      expect(res.body.available).toBe(false);
      expect(res.body.reason).toBe('reserved');
    },
  );

  it('a handle somebody else holds is taken, in any case', async () => {
    const res = await available(bina.token, 'AaRaV').expect(200);
    expect(res.body).toMatchObject({ available: false, reason: 'taken' });
    expect(res.body.suggestions).toHaveLength(3);
    expect(res.body.suggestions.slice(0, 2)).toEqual(['aarav1', 'aarav_']);
  });

  it('your own handle counts as available', async () => {
    const res = await available(aarav.token, 'aarav').expect(200);
    expect(res.body).toMatchObject({ available: true, suggestions: [] });
  });

  it('a free handle is available', async () => {
    const res = await available(aarav.token, 'aarav.k_').expect(200);
    expect(res.body).toEqual({ username: 'aarav.k_', available: true, suggestions: [] });
  });

  it.each(['a..b', '.abc', 'abc.', 'ab', 'aarav-k'])(
    'malformed %s is an answer, not an error',
    async (u) => {
      const res = await available(aarav.token, u).expect(200);
      expect(res.body.available).toBe(false);
      expect(res.body.reason).toBe('invalid');
      expect(typeof res.body.message).toBe('string');
    },
  );

  it('no ?u is a 400', async () => {
    await get('/api/v1/users/username-available', aarav.token).expect(400);
  });

  it('suggestions are never reserved, taken, or malformed', async () => {
    const res = await available(aarav.token, 'admin').expect(200);
    for (const s of res.body.suggestions as string[]) {
      const check = await available(bina.token, s).expect(200);
      expect(check.body.available).toBe(true);
    }
  });

  // ── Step 4: changing it (D-5 = yes, once every 14 days) ───────────────────

  it('step 4: a valid new name is 200, again immediately is 429', async () => {
    const first = await patch(aarav.token, 'Aarav.K').expect(200);
    expect(first.body).toMatchObject({ username: 'aarav.k', changed: true });
    expect(first.body.usernameChangeableAt).toBeTruthy();

    const second = await patch(aarav.token, 'aarav.k2').expect(429);
    expect(second.body.retryAfter).toBe(
      new Date(new Date(first.body.usernameChangedAt).getTime() + 14 * 86_400_000).toISOString(),
    );

    const me = await get('/api/v1/users/me', aarav.token).expect(200);
    expect(me.body.username).toBe('aarav.k');
  });

  it('the same name again is a 200 that spends nothing, even in the cooldown', async () => {
    const res = await patch(aarav.token, 'AARAV.K').expect(200);
    expect(res.body).toMatchObject({ username: 'aarav.k', changed: false });
  });

  it('the old handle is free again straight away', async () => {
    const res = await available(bina.token, 'aarav').expect(200);
    expect(res.body.available).toBe(true);
  });

  it('taken is 409, with suggestions', async () => {
    const res = await patch(bina.token, 'AARAV.K').expect(409);
    expect(res.body.message).toBe('That username is taken.');
    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it.each(['admin', 'Support', 'he.lp'])('reserved %s is 422', async (u) => {
    const res = await patch(bina.token, u).expect(422);
    expect(res.body.errors[0]).toEqual({ field: 'username', message: 'is reserved' });
  });

  it.each(['a..b', '.abc', 'abc.', 'ab', 'x'.repeat(31), 'aarav k', '', 42, null])(
    'invalid %s is 422',
    async (u) => {
      await patch(bina.token, u).expect(422);
    },
  );

  it('failed attempts did not spend Bina’s change', async () => {
    const res = await patch(bina.token, 'bina').expect(200);
    expect(res.body.changed).toBe(true);
  });

  it('after the cooldown it can change again', async () => {
    await harness.ownerPool.query(
      `UPDATE users SET username_changed_at = now() - interval '14 days 1 minute' WHERE id = $1`,
      [aarav.id],
    );
    const res = await patch(aarav.token, 'aarav').expect(200);
    expect(res.body.changed).toBe(true);
  });

  it('every change is audit-logged with the old and new handle', async () => {
    const { rows } = await harness.ownerPool.query<{ actor_id: string; metadata: unknown }>(
      `SELECT actor_id, metadata FROM audit_logs
        WHERE action = 'user.username_changed' AND resource_id = $1
        ORDER BY created_at`,
      [aarav.id],
    );
    expect(rows.map((r) => r.metadata)).toEqual([
      { old: 'aarav', new: 'aarav.k' },
      { old: 'aarav.k', new: 'aarav' },
    ]);
    expect(rows.every((r) => r.actor_id === aarav.id)).toBe(true);
  });

  // ── Acceptance: 1,000 sign-ups with one local part ────────────────────────

  it('1,000 sign-ups with the same local part all succeed, with distinct handles', async () => {
    const emails = Array.from({ length: 1000 }, (_, i) => `same.name@d${i}.example.com`);
    const usernames: string[] = [];

    // Twenty-five at a time: concurrent enough that two transactions really
    // do race for the same candidate, which the advisory lock must settle.
    for (let i = 0; i < emails.length; i += 25) {
      const batch = await Promise.all(emails.slice(i, i + 25).map((e) => signUp(e)));
      usernames.push(...batch.map((b) => b.user.username));
    }

    expect(new Set(usernames).size).toBe(1000);
    expect(usernames.filter((u) => u === 'same.name')).toHaveLength(1);
    for (const u of usernames) expect(u).toMatch(/^same\.name(\d{4}|\d{6})?$/);
  }, 300_000);
});
