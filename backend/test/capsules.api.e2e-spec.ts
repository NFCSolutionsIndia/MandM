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
 * Capsules, through HTTP.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The product's whole reason for existing is one path: seal it today, it
 *  arrives in twenty years, somebody who was not born yet reads it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These assert the refusals as hard as the successes. A capsule that silently
 * fails to seal correctly is not a bug anybody notices until the date arrives
 * and nothing happens — by which time the person who wrote it may be dead.
 */
describe('capsules API', () => {
  let app: INestApplication;
  let harness: Harness;

  const SENDER = 'meera@example.com';
  const STRANGER = 'nobody@example.com';

  let token: string;
  let strangerToken: string;
  let vaultId: string;
  let strangerVaultId: string;
  let capsuleId: string;
  let accessToken: string;
  let memoryId: string;

  async function codeFor(email: string): Promise<string> {
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

  async function signIn(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email, code: await codeFor(email) })
      .expect(200);

    return res.body.token;
  }

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

    token = await signIn(SENDER);
    strangerToken = await signIn(STRANGER);

    const vault = await request(app.getHttpServer())
      .post('/api/v1/vaults')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Family', type: 'shared' })
      .expect(201);
    vaultId = vault.body.id;

    const other = await request(app.getHttpServer())
      .post('/api/v1/vaults')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ name: 'Theirs', type: 'personal' })
      .expect(201);
    strangerVaultId = other.body.id;

    const memory = await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/memories`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'The day she was born',
        occurredAt: '2026-03-01T00:00:00Z',
        clientId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(201);
    memoryId = memory.body.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  const future = () =>
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // ── creating ────────────────────────────────────────────────────────────

  it('creates a draft capsule', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/capsules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'For your eighteenth',
        note: 'You were asleep on my shoulder when I wrote this.',
        unlockKind: 'datetime',
        unlockAt: future(),
        unlockTimezone: 'Asia/Kolkata',
      })
      .expect(201);

    expect(res.body.state).toBe('draft');
    capsuleId = res.body.id;
  });

  it('refuses a datetime capsule with no unlock time', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/capsules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'When?', unlockKind: 'datetime' })
      .expect(400);
  });

  it('gives a stranger 404 for a vault that is not theirs', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vaults/${strangerVaultId}/capsules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unlockKind: 'datetime', unlockAt: future() })
      .expect(404);
  });

  // ── sealing refusals ────────────────────────────────────────────────────

  it('refuses to seal a capsule with no recipients', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    // The worker would otherwise discover this five days later, after
    // day-scale backoff, as a Sev-0.
    expect(res.body.message).toContain('recipient');
  });

  it('adds a recipient and returns the access token exactly once', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/recipients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Aarti', email: 'aarti@example.com' })
      .expect(201);

    expect(res.body.accessToken).toBeTypeOf('string');
    accessToken = res.body.accessToken;

    // Only the digest reaches the database.
    const { rows } = await harness.ownerPool.query<{ access_token_hash: string }>(
      `SELECT access_token_hash FROM capsule_recipients WHERE id = $1`,
      [res.body.id],
    );
    expect(rows[0].access_token_hash).toBe(hashToken(accessToken));
    expect(rows[0].access_token_hash).not.toBe(accessToken);
  });

  it('does not return the token again when reading the capsule', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain(accessToken);
    expect(res.body.recipients).toHaveLength(1);
  });

  it('attaches a memory, idempotently', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/memories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memoryIds: [memoryId] })
      .expect(201);
    expect(first.body).toEqual({ added: 1, total: 1 });

    const again = await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/memories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memoryIds: [memoryId] })
      .expect(201);
    expect(again.body).toEqual({ added: 0, total: 1 });
  });

  it('refuses an unlock time in the past', async () => {
    const past = await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/capsules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unlockKind: 'datetime', unlockAt: '2020-01-01T00:00:00Z' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${past.body.id}/recipients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Someone', email: 'someone@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${past.body.id}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  // ── sealing ─────────────────────────────────────────────────────────────

  it('seals the capsule AND schedules its delivery in one transaction', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.state).toBe('sealed');
    expect(res.body.scheduled).toBe(true);

    // A capsule sealed without a job is a promise nothing will ever keep.
    const { rows } = await harness.ownerPool.query<{
      kind: string;
      state: string;
      run_at: Date;
      payload: { capsuleId: string };
    }>(
      `SELECT kind, state, run_at, payload FROM scheduled_jobs
        WHERE payload->>'capsuleId' = $1`,
      [capsuleId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('capsule_delivery');
    expect(rows[0].state).toBe('pending');
  });

  it('keeps editable_until inside the unlock time', async () => {
    const { rows } = await harness.ownerPool.query<{
      ok: boolean;
    }>(
      `SELECT editable_until <= unlock_at AS ok FROM capsules WHERE id = $1`,
      [capsuleId],
    );

    // A capsule unlocking in two minutes with a fifteen-minute grace window
    // would otherwise still be editable while it was being delivered.
    expect(rows[0].ok).toBe(true);
  });

  it('refuses to seal twice', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('refuses to add a recipient after sealing', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/recipients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Late', email: 'late@example.com' })
      .expect(409);
  });

  // ── the freeze ──────────────────────────────────────────────────────────

  it('allows an edit inside the grace window', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'For your eighteenth birthday' })
      .expect(200);
  });

  it('the database freezes the message once the grace window passes', async () => {
    // Move the window into the past rather than waiting fifteen minutes.
    await harness.ownerPool.query(
      `UPDATE capsules SET editable_until = now() - interval '1 minute' WHERE id = $1`,
      [capsuleId],
    );

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Actually, I changed my mind about all of it.' })
      .expect(400);

    expect(res.body.message).toBeDefined();

    // And the original survived.
    const { rows } = await harness.ownerPool.query<{ sender_note: string }>(
      `SELECT sender_note FROM capsules WHERE id = $1`,
      [capsuleId],
    );
    expect(rows[0].sender_note).toContain('asleep on my shoulder');
  });

  // ── the recipient's side ────────────────────────────────────────────────

  it('a token opens nothing before the capsule is delivered', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/open/${accessToken}`)
      .expect(404);
  });

  it('a wrong token is the same flat 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/open/not-a-real-token')
      .expect(404);
  });

  it('opens once delivered, with no account and no session', async () => {
    await harness.ownerPool.query(
      `UPDATE capsules SET state = 'delivered', delivered_at = now() WHERE id = $1`,
      [capsuleId],
    );

    const res = await request(app.getHttpServer())
      .get(`/api/v1/open/${accessToken}`)
      .expect(200);

    expect(res.body.note).toContain('asleep on my shoulder');
    expect(res.body.from).toBeDefined();
    expect(res.body.memories).toHaveLength(1);
  });

  it('records the FIRST opening, not the most recent', async () => {
    const { rows: before } = await harness.ownerPool.query<{ t: Date }>(
      `SELECT first_opened_at AS t FROM capsules WHERE id = $1`,
      [capsuleId],
    );

    await request(app.getHttpServer())
      .get(`/api/v1/open/${accessToken}`)
      .expect(200);

    const { rows: after } = await harness.ownerPool.query<{ t: Date }>(
      `SELECT first_opened_at AS t FROM capsules WHERE id = $1`,
      [capsuleId],
    );

    // "She opened it on her eighteenth birthday" is the fact worth keeping.
    expect(after[0].t.getTime()).toBe(before[0].t.getTime());
  });

  it('lets the recipient reply', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/open/${accessToken}/reply`)
      .send({ body: 'I read it on the morning of my birthday. Thank you.' })
      .expect(201);

    expect(res.body.posted).toBe(true);
  });

  // ── withdrawing ─────────────────────────────────────────────────────────

  it('cancels a sealed capsule without deleting its job', async () => {
    const draft = await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/capsules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unlockKind: 'datetime', unlockAt: future(), note: 'withdrawn' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${draft.body.id}/recipients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nobody', email: 'nobody-else@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${draft.body.id}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/capsules/${draft.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.state).toBe('cancelled');

    // The job stays. The worker completes it without sending, which keeps the
    // record that something was scheduled and then withdrawn.
    const { rows } = await harness.ownerPool.query(
      `SELECT state FROM scheduled_jobs WHERE payload->>'capsuleId' = $1`,
      [draft.body.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('a stranger cannot see, seal or cancel somebody else’s capsule', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/capsules/${capsuleId}/cancel`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(404);
  });

  it('requires a session for the sender-side endpoints', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vaults/${vaultId}/capsules`)
      .expect(401);
  });
});
