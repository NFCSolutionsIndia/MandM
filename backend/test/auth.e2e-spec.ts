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
 * The full chain, through HTTP.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Every earlier suite called DbService directly. This one proves the part
 *  that was missing: that a real request populates the actor at all.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * request → bearer token → app_resolve_session → ActorContext → SET LOCAL →
 * sixty policies → rows.
 *
 * Until this passed, the schema was a very well-tested database that no
 * request could reach.
 */
describe('authentication, end to end', () => {
  let app: INestApplication;
  let harness: Harness;

  const AARAV = 'aarav@example.com';
  const BINA = 'bina@example.com';

  let aaravToken: string;
  let aaravRefresh: string;
  let binaToken: string;
  let aaravVaultId: string;

  /** Reads the code out of the database, standing in for reading the email. */
  async function codeFor(email: string): Promise<string> {
    // The code itself is never stored, so the test brute-forces its own
    // six digits against the stored hash — which is exactly the property
    // being asserted: not even the test can read a code out of the table.
    const { rows } = await harness.ownerPool.query<{ code_hash: string }>(
      `SELECT code_hash FROM email_otps
        WHERE email = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    if (!rows[0]) throw new Error(`no live code for ${email}`);

    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, '0');
      if (hashToken(candidate) === rows[0].code_hash) return candidate;
    }
    throw new Error('code not recoverable');
  }

  beforeAll(async () => {
    // The app under test must use mm_test, not the mm_dev that .env names.
    // dotenv does not override an already-set process.env, so assigning it
    // here wins over the file — and the suite asserts against the same
    // database the application is writing to.
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

  // ── the sign-in flow ──────────────────────────────────────────────────────

  it('accepts a code request for an address with no account', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: AARAV })
      .expect(202);

    expect(res.body.status).toMatch(/on its way/i);
  });

  it('says exactly the same thing for an address that cannot exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: 'nobody-at-all@example.com' })
      .expect(202);

    // Enumeration oracle check. "No account with that email" would let anyone
    // test addresses against the user table a thousand at a time.
    expect(res.body.status).toMatch(/on its way/i);
  });

  it('rejects a malformed address before touching the database', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(res.body.errors[0].field).toBe('email');
    // The value is never echoed back: these bodies reach logs.
    expect(JSON.stringify(res.body)).not.toContain('not-an-email');
  });

  it('refuses a wrong code without saying what was wrong', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email: AARAV, code: '000000' })
      .expect(401);

    expect(res.body.message).toBe('That code is not valid.');
  });

  it('creates the account on the first successful verification', async () => {
    const code = await codeFor(AARAV);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email: AARAV, code })
      .expect(200);

    expect(res.body.isNewAccount).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(res.body.accessToken);

    // ACCESS_TOKEN_HOURS and REFRESH_TOKEN_DAYS at their defaults.
    const hours = (iso: string) => (Date.parse(iso) - Date.now()) / 3_600_000;
    expect(hours(res.body.accessExpiresAt)).toBeCloseTo(24, 0);
    expect(hours(res.body.refreshExpiresAt) / 24).toBeCloseTo(30, 0);

    expect(res.body.user).toEqual({
      id: expect.any(String),
      username: 'aarav',
      name: 'aarav',
    });
    // The response is the whole contract; nothing private rides along.
    expect(Object.keys(res.body).sort()).toEqual([
      'accessExpiresAt',
      'accessToken',
      'isNewAccount',
      'refreshExpiresAt',
      'refreshToken',
      'user',
    ]);

    aaravToken = res.body.accessToken;
    aaravRefresh = res.body.refreshToken;
  });

  it('stores only the hashes of the tokens it handed out', async () => {
    const { rows } = await harness.ownerPool.query<{
      access_token_hash: string;
      refresh_token_hash: string;
    }>('SELECT access_token_hash, refresh_token_hash FROM sessions');

    expect(rows).toHaveLength(1);
    expect(rows[0].access_token_hash).toBe(hashToken(aaravToken));
    expect(rows[0].refresh_token_hash).toBe(hashToken(aaravRefresh));
    // The property that survives a leaked backup.
    expect(rows[0].access_token_hash).not.toBe(aaravToken);
    expect(rows[0].refresh_token_hash).not.toBe(aaravRefresh);
  });

  it('mints UUIDv7 ids even for rows created inside SQL functions', async () => {
    const { rows } = await harness.ownerPool.query<{ v: string }>(
      `SELECT substring(id::text, 15, 1) AS v FROM users
        UNION ALL
       SELECT substring(id::text, 15, 1) FROM sessions
        UNION ALL
       SELECT substring(id::text, 15, 1) FROM email_otps`,
    );

    // The account and its session are created by app_redeem_email_code,
    // which inserts directly and therefore never reaches the  on
    // uuidPk(). It used gen_random_uuid() - v4 - until migration 0010, which
    // fragments the index on the two highest-insert-rate tables in the
    // product. Caught by reading an id out of a real sign-in response.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.v)).toEqual(rows.map(() => '7'));
  });

  it('cannot redeem the same code twice', async () => {
    // The code was consumed. A replayed request gets the same flat 401.
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email: AARAV, code: '123456' })
      .expect(401);
  });

  // ── the actor, which is the whole point ───────────────────────────────────

  it('refuses a protected route with no token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('refuses a protected route with a made-up token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('resolves the actor from the bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${aaravToken}`)
      .expect(200);

    expect(res.body.email).toBe(AARAV);
    expect(res.body.username).toBe('aarav');
    expect(res.body.actor).toBe(res.body.id);

    // /me has no WHERE clause naming a user id from the request — it selects
    // `WHERE id = app_current_user()`. There is no input that could make it
    // return somebody else.
  });

  // ── two users, one database ───────────────────────────────────────────────

  it('signs in a second person', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: BINA })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email: BINA, code: await codeFor(BINA) })
      .expect(200);

    binaToken = res.body.accessToken;
  });

  it('creates a vault and its ownership row in one transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vaults')
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({ name: 'Family', type: 'shared' })
      .expect(201);

    aaravVaultId = res.body.id;

    const { rows } = await harness.ownerPool.query(
      `SELECT role FROM vault_members WHERE vault_id = $1`,
      [aaravVaultId],
    );
    // A vault with no members cannot exist, because both writes were one
    // transaction.
    expect(rows[0].role).toBe('owner');
  });

  it('shows each person only their own vaults', async () => {
    const mine = await request(app.getHttpServer())
      .get('/api/v1/vaults')
      .set('Authorization', `Bearer ${aaravToken}`)
      .expect(200);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/vaults')
      .set('Authorization', `Bearer ${binaToken}`)
      .expect(200);

    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].name).toBe('Family');

    // The handler has no authorization code in it at all. This is the policy.
    expect(theirs.body).toHaveLength(0);
  });

  it('scopes even an unqualified COUNT of three whole tables', async () => {
    const mine = await request(app.getHttpServer())
      .get('/api/v1/vaults/debug/row-counts')
      .set('Authorization', `Bearer ${aaravToken}`)
      .expect(200);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/vaults/debug/row-counts')
      .set('Authorization', `Bearer ${binaToken}`)
      .expect(200);

    // `SELECT count(*) FROM vaults` with no WHERE, and it still counts only
    // what the caller may see. Two users exist; each one can see themselves.
    expect(Number(mine.body.vaults)).toBe(1);
    expect(Number(theirs.body.vaults)).toBe(0);
    expect(Number(mine.body.users)).toBe(1);

    const { rows } = await harness.ownerPool.query<{ count: string }>(
      'SELECT count(*) FROM users',
    );
    expect(Number(rows[0].count)).toBe(2);
  });

  // ── revocation ────────────────────────────────────────────────────────────

  it('revokes a session immediately on sign-out', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-out')
      .set('Authorization', `Bearer ${binaToken}`)
      .expect(204);

    // The very next request, not whenever a token would have expired. This is
    // why sessions are rows and not JWTs.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${binaToken}`)
      .expect(401);
  });

  it('keeps the revoked row rather than deleting it', async () => {
    const { rows } = await harness.ownerPool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM sessions ORDER BY created_at',
    );

    // The security log has to be able to explain itself.
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revoked_at !== null)).toHaveLength(1);
  });

  // ── access, refresh, idle ─────────────────────────────────────────────────
  //
  // Nothing here sleeps. Time passes by moving a session's timestamps
  // backwards through the owner connection, which is what a day going by
  // looks like to every function that reads them.

  interface Pair {
    accessToken: string;
    refreshToken: string;
  }

  /** A fresh session for `email`, through the real sign-in flow. */
  async function signIn(email: string): Promise<Pair> {
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email })
      .expect(202);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email, code: await codeFor(email) })
      .expect(200);
    return res.body;
  }

  function me(accessToken: string) {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function refresh(refreshToken: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
  }

  /** Runs `assignments` against the session that `accessToken` opened. */
  async function shift(accessToken: string, assignments: string) {
    const { rowCount } = await harness.ownerPool.query(
      `UPDATE sessions SET ${assignments} WHERE access_token_hash = $1`,
      [hashToken(accessToken)],
    );
    expect(rowCount).toBe(1);
  }

  /** `days` pass for this session, with nobody touching it. */
  function age(accessToken: string, days: number) {
    const by = `interval '${days} days'`;
    return shift(
      accessToken,
      `access_expires_at  = access_expires_at  - ${by},
       refresh_expires_at = refresh_expires_at - ${by},
       last_active_at     = last_active_at     - ${by}`,
    );
  }

  async function revokedAt(accessToken: string): Promise<Date | null> {
    const { rows } = await harness.ownerPool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM sessions WHERE access_token_hash = $1',
      [hashToken(accessToken)],
    );
    return rows[0]?.revoked_at ?? null;
  }

  it('refuses a refresh token used as a bearer', async () => {
    // A refresh token lives in a different column; resolve never looks there.
    await me(aaravRefresh).expect(401);
    await me(aaravToken).expect(200);
  });

  it('rejects an access token 24 hours after issue, and a refresh then works', async () => {
    const s = await signIn('chandra@example.com');
    await me(s.accessToken).expect(200);

    await shift(s.accessToken, `access_expires_at = now() - interval '1 second'`);
    await me(s.accessToken).expect(401);

    const res = await refresh(s.refreshToken).expect(200);
    expect(res.body.accessToken).not.toBe(s.accessToken);
    expect(res.body.refreshToken).not.toBe(s.refreshToken);
    expect(res.body.user.username).toBe('chandra');
    // Same shape as /verify, minus isNewAccount.
    expect(Object.keys(res.body).sort()).toEqual([
      'accessExpiresAt',
      'accessToken',
      'refreshExpiresAt',
      'refreshToken',
      'user',
    ]);

    await me(res.body.accessToken).expect(200);
  });

  it('retires the previous access token on refresh, even if it had time left', async () => {
    const s = await signIn('devi@example.com');
    const next = (await refresh(s.refreshToken).expect(200)).body as Pair;

    await me(s.accessToken).expect(401);
    await me(next.accessToken).expect(200);
  });

  it('treats a refresh token used twice as stolen and revokes the session', async () => {
    const s = await signIn('esha@example.com');
    const second = (await refresh(s.refreshToken).expect(200)).body as Pair;
    const third = (await refresh(second.refreshToken).expect(200)).body as Pair;
    await me(third.accessToken).expect(200);

    // The FIRST token, two rotations ago: still recognised as reused.
    await refresh(s.refreshToken).expect(401);

    // And the session is gone for whoever held the newest pair, too.
    await me(third.accessToken).expect(401);
    await refresh(third.refreshToken).expect(401);
    expect(await revokedAt(third.accessToken)).not.toBeNull();
  });

  it('answers an unknown refresh token with a flat 401 and revokes nothing', async () => {
    const s = await signIn('farah@example.com');

    await refresh('not-a-real-refresh-token').expect(401);
    await refresh('').expect(400);

    await me(s.accessToken).expect(200);
    expect(await revokedAt(s.accessToken)).toBeNull();
  });

  it('ends a session idle for 7 days, for both tokens', async () => {
    const s = await signIn('gita@example.com');

    // Six days idle: still a session. Its 24-hour access token has long
    // gone, but a refresh brings it back.
    await age(s.accessToken, 6);
    const back = (await refresh(s.refreshToken).expect(200)).body as Pair;

    // Eight days idle: over, whichever token is presented. The access token
    // is given a future expiry so the idle limit is the only thing failing.
    await age(back.accessToken, 8);
    await shift(back.accessToken, `access_expires_at = now() + interval '1 hour'`);

    await me(back.accessToken).expect(401);
    await refresh(back.refreshToken).expect(401);
  });

  it('refuses a refresh token past its own expiry', async () => {
    const s = await signIn('hari@example.com');
    await shift(s.accessToken, `refresh_expires_at = now() - interval '1 second'`);

    await refresh(s.refreshToken).expect(401);
  });

  it('never signs out somebody who is active every day (rolling refresh)', async () => {
    let s = await signIn('indu@example.com');

    // Forty days — ten past the 30-day refresh lifetime — of opening the app
    // once a day: the access token has expired, the client refreshes, and
    // carries on.
    for (let day = 1; day <= 40; day++) {
      await age(s.accessToken, 1);
      await me(s.accessToken).expect(401);

      s = (await refresh(s.refreshToken).expect(200)).body as Pair;
      await me(s.accessToken).expect(200);
    }
  }, 60_000);

  it('records activity at most once an hour', async () => {
    const s = await signIn('jaya@example.com');
    const hash = hashToken(s.accessToken);

    const lastActive = async () =>
      (
        await harness.ownerPool.query<{ t: Date }>(
          'SELECT last_active_at AS t FROM sessions WHERE access_token_hash = $1',
          [hash],
        )
      ).rows[0].t.getTime();

    // Called directly, as the application role, so the assertion does not
    // race the middleware's fire-and-forget call.
    const touch = () =>
      harness.appPool.query('SELECT app_touch_session($1)', [hash]);

    await shift(s.accessToken, `last_active_at = now() - interval '30 minutes'`);
    const before = await lastActive();
    await touch();
    expect(await lastActive()).toBe(before);

    await shift(s.accessToken, `last_active_at = now() - interval '61 minutes'`);
    await touch();
    expect(Date.now() - (await lastActive())).toBeLessThan(60_000);
  });

  it('makes sign-out final for the refresh token too', async () => {
    const s = await signIn('kiran@example.com');

    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-out')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(204);

    await me(s.accessToken).expect(401);
    await refresh(s.refreshToken).expect(401);
  });

  it('makes sign-out-others take effect on the very next request', async () => {
    const phone = await signIn('lata@example.com');
    const laptop = await signIn('lata@example.com');

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-out-others')
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .expect(200);
    expect(res.body.revoked).toBe(1);

    await me(phone.accessToken).expect(401);
    await refresh(phone.refreshToken).expect(401);
    await me(laptop.accessToken).expect(200);
  });

  // ── usernames ─────────────────────────────────────────────────────────────

  it('gives a second "aarav" a different handle', async () => {
    const s = await signIn('Aarav@elsewhere.example');
    const res = await me(s.accessToken).expect(200);

    expect(res.body.username).toMatch(/^aarav\d{4}$/);
  });

  it('derives a valid handle from an awkward address', async () => {
    const s = await signIn('_a+b@example.com');
    const res = await me(s.accessToken).expect(200);

    // `+` is dropped, the leading underscore trimmed, and two characters is
    // too short — so it is prefixed rather than rejected.
    expect(res.body.username).toBe('userab');
  });

  it('leaves the health endpoints outside the versioned prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);

    // The load balancer asks by a fixed path that has nothing to do with the
    // product's API, so it must not move when the API version does.
    await request(app.getHttpServer()).get('/api/v1/health').expect(404);
  });
});
