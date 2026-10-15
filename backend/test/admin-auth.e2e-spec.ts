import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * Admin sign-in — the second realm, over HTTP.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Two factors, neither of them a password, and no bypass.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. an emailed code — proves control of the corporate mailbox
 *   2. a TOTP code     — proves possession of the enrolled device
 *
 * The tests that matter most are the negative ones: that a first-factor token
 * reaches nothing, that a customer session reaches nothing, and that an admin
 * session is not a customer session either.
 */

const ADMIN_EMAIL = 'agent@mm.internal';
const AARAV = 'aarav@example.com';

describe('admin authentication', () => {
  let app: INestApplication;
  let harness: Harness;

  let mfaToken: string;
  let adminToken: string;
  let totpSecret: string;
  let backupCodes: string[];

  /** Recovers a code the way the auth suite does: by matching its hash. */
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

  function totpNow(secret: string): string {
    return new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).generate();
  }

  beforeAll(async () => {
    harness = await connect();
    await resetDatabase(harness.ownerPool);

    const role = await harness.ownerPool.query<{ id: string }>(
      `INSERT INTO roles (id, name) VALUES (uuid_generate_v7(), 'support') RETURNING id`,
    );
    await harness.ownerPool.query(
      `INSERT INTO permissions (role_id, module, action)
       VALUES ($1,'users','read'), ($1,'support','write')`,
      [role.rows[0].id],
    );
    await harness.ownerPool.query(
      `INSERT INTO admin_users (id, email, role_id) VALUES (uuid_generate_v7(), $1, $2)`,
      [ADMIN_EMAIL, role.rows[0].id],
    );
    await harness.ownerPool.query(
      `INSERT INTO admin_users (id, email, role_id, is_active)
       VALUES (uuid_generate_v7(), 'gone@mm.internal', $1, false)`,
      [role.rows[0].id],
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

  // ── factor one ────────────────────────────────────────────────────────────

  it('says the same thing for a staff address and a stranger', async () => {
    const staff = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: ADMIN_EMAIL })
      .expect(202);

    const stranger = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: 'someone@example.com' })
      .expect(202);

    // The staff list is worth having if you intend to phish somebody.
    expect(staff.body).toEqual(stranger.body);
  });

  it('refuses an address that is not an admin, after spending the code', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: AARAV })
      .expect(202);

    const code = await codeFor(AARAV);

    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-email')
      .send({ email: AARAV, code })
      .expect(401);

    // Spent anyway, so a valid code cannot be replayed while somebody works
    // out which addresses are staff.
    const { rows } = await harness.ownerPool.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM email_otps WHERE email = $1',
      [AARAV],
    );
    expect(rows[0].consumed_at).not.toBeNull();
  });

  it('creates no account for a non-admin address', async () => {
    const { rows } = await harness.ownerPool.query('SELECT 1 FROM users');

    // The user flow creates an account when the address is unknown, which is
    // right there and catastrophic here: it would mean anybody who can receive
    // mail could mint themselves an admin.
    expect(rows).toHaveLength(0);
  });

  it('refuses a deactivated admin', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: 'gone@mm.internal' })
      .expect(202);

    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-email')
      .send({ email: 'gone@mm.internal', code: await codeFor('gone@mm.internal') })
      .expect(401);
  });

  it('issues enrolment material on a first sign-in, exactly once', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: ADMIN_EMAIL })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-email')
      .send({ email: ADMIN_EMAIL, code: await codeFor(ADMIN_EMAIL) })
      .expect(200);

    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.enrolmentRequired).toBe(true);
    expect(res.body.enrolment.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(res.body.enrolment.backupCodes).toHaveLength(8);

    mfaToken = res.body.mfaToken;
    totpSecret = res.body.enrolment.secret;
    backupCodes = res.body.enrolment.backupCodes;
  });

  it('stores the TOTP secret encrypted, not in the clear', async () => {
    const { rows } = await harness.ownerPool.query<{ totp_secret_enc: string }>(
      'SELECT totp_secret_enc FROM admin_users WHERE email = $1',
      [ADMIN_EMAIL],
    );

    // A TOTP secret is a bearer credential and cannot be hashed, because the
    // server must reproduce it. So it is encrypted with a key held outside the
    // database — a leaked dump alone generates no second factors.
    expect(rows[0].totp_secret_enc).not.toContain(totpSecret);
    expect(rows[0].totp_secret_enc.split('.')).toHaveLength(3);
  });

  // ── the half-authenticated token ──────────────────────────────────────────

  it('gives a first-factor token access to nothing', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/v1/auth/me')
      .set('Authorization', `Bearer ${mfaToken}`)
      .expect(401);

    // The whole point of MFA. A compromised mailbox buys an attacker the right
    // to be asked for a TOTP code, and nothing else.
  });

  it('refuses a wrong TOTP code', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-totp')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ code: '000000' })
      .expect(401);
  });

  // ── factor two ────────────────────────────────────────────────────────────

  it('completes sign-in with a valid TOTP code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-totp')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ code: totpNow(totpSecret) })
      .expect(200);

    expect(res.body.expiresInHours).toBe(8);
    adminToken = res.body.token;
  });

  it('resolves the admin on the console connection', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.email).toBe(ADMIN_EMAIL);
    expect(res.body.role).toBe('support');
    expect(res.body.actor).toBe(res.body.id);
    expect(res.body.permissions).toEqual([
      { module: 'support', action: 'write' },
      { module: 'users', action: 'read' },
    ]);
  });

  it('audits the sign-in', async () => {
    const { rows } = await harness.ownerPool.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE actor_type = 'admin' ORDER BY created_at`,
    );

    // Enrolment and sign-in both leave a row, written by the database function
    // rather than trusted to the handler.
    expect(rows.map((r) => r.action)).toContain('admin.signed_in');
    expect(rows.map((r) => r.action)).toContain('admin.totp_enrolled');
  });

  it('refuses to re-enrol over an existing secret', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: ADMIN_EMAIL })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-email')
      .send({ email: ADMIN_EMAIL, code: await codeFor(ADMIN_EMAIL) })
      .expect(200);

    // Otherwise anybody holding a first-factor token could replace the second
    // factor with one of their own, which would make it decorative.
    expect(res.body.enrolmentRequired).toBe(false);
    expect(res.body.enrolment).toBeUndefined();

    const { rows } = await harness.ownerPool.query<{ totp_secret_enc: string }>(
      'SELECT totp_secret_enc FROM admin_users WHERE email = $1',
      [ADMIN_EMAIL],
    );
    expect(rows).toHaveLength(1);
  });

  // ── the two realms do not meet ────────────────────────────────────────────

  it('refuses an admin token on a customer route', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(401);

    // `app_resolve_session` looks in `sessions`, which an admin has no row in.
    // One request is never both.
  });

  it('refuses a customer token on an admin route', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: AARAV })
      .expect(202);

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email: AARAV, code: await codeFor(AARAV) })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/admin/v1/auth/me')
      .set('Authorization', `Bearer ${signIn.body.token}`)
      .expect(401);

    // The boundary that `admin_users` being its own table exists to draw: a
    // compromised customer account is not one step from the console.
  });

  // ── backup codes ──────────────────────────────────────────────────────────

  it('accepts a backup code once, and not twice', async () => {
    const used = backupCodes[0];

    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: ADMIN_EMAIL })
      .expect(202);

    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-email')
      .send({ email: ADMIN_EMAIL, code: await codeFor(ADMIN_EMAIL) })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-totp')
      .set('Authorization', `Bearer ${first.body.mfaToken}`)
      .send({ code: used })
      .expect(200);

    // The second attempt with the same code must fail: a backup code that
    // works twice is a password.
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/request-code')
      .send({ email: ADMIN_EMAIL })
      .expect(202);

    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-email')
      .send({ email: ADMIN_EMAIL, code: await codeFor(ADMIN_EMAIL) })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/verify-totp')
      .set('Authorization', `Bearer ${second.body.mfaToken}`)
      .send({ code: used })
      .expect(401);
  });

  // ── revocation ────────────────────────────────────────────────────────────

  it('revokes the admin session immediately on sign-out', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/v1/auth/sign-out')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/admin/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(401);
  });
});
