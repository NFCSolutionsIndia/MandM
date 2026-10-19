import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { StorageService } from '../src/storage/storage.service.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * The archive endpoints, over HTTP.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Storage is replaced by a fake that REMEMBERS what it was told.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Not because the real client is hard to run, but because the interesting
 * behaviour is on this side of it: that the quota is charged from the size
 * the STORE reports rather than the size the client claimed, that an upload
 * which never landed is refused, and that a retry does not double-charge.
 *
 * A real bucket would prove the network works. This proves the product does.
 */

class FakeStorage {
  readonly objects = new Map<string, { bytes: number; contentType: string }>();
  readonly presigned: string[] = [];

  get configured() {
    return true;
  }

  key(p: { vaultId: string; memoryId: string; assetId: string; variant?: string }) {
    return `vault/${p.vaultId}/memory/${p.memoryId}/asset/${p.assetId}/${p.variant ?? 'original'}`;
  }

  assetIdFromKey(key: string) {
    const parts = key.split('/');
    return parts[4] === 'asset' && parts[5] ? parts[5] : null;
  }

  async presignUpload(key: string) {
    this.presigned.push(key);
    return { url: `https://fake.r2/${key}?signature=x`, expiresInSeconds: 86_400 };
  }

  async presignDownload(key: string) {
    return { url: `https://fake.r2/${key}?download=1`, expiresInSeconds: 300 };
  }

  /** What the client claims is irrelevant; this is what the store says. */
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { bytes: o.bytes, etag: 'abc123', contentType: o.contentType } : null;
  }

  async remove(key: string) {
    this.objects.delete(key);
  }

  /** Stands in for the client actually PUTting the bytes. */
  put(key: string, bytes: number, contentType = 'image/jpeg') {
    this.objects.set(key, { bytes, contentType });
  }
}

const CLIENT_ID = {
  memory: '11111111-1111-4111-8111-111111111111',
  upload: '22222222-2222-4222-8222-222222222222',
  other: '33333333-3333-4333-8333-333333333333',
};

describe('archive API', () => {
  let app: INestApplication;
  let harness: Harness;
  let storage: FakeStorage;

  let token: string;
  let strangerToken: string;
  let vaultId: string;
  let memoryId: string;
  let uploadKey: string;
  let uploadId: string;
  let assetId: string;

  async function signIn(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email })
      .expect(202);

    const { rows } = await harness.ownerPool.query<{ code_hash: string }>(
      `SELECT code_hash FROM email_otps WHERE email = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [email],
    );

    let code = '';
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, '0');
      if (hashToken(candidate) === rows[0].code_hash) {
        code = candidate;
        break;
      }
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email, code })
      .expect(200);

    return res.body.token;
  }

  beforeAll(async () => {
    // The app under test must use mm_test, not the mm_dev that .env names.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    harness = await connect();
    await resetDatabase(harness.ownerPool);

    storage = new FakeStorage();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    token = await signIn('owner@example.com');
    strangerToken = await signIn('stranger@example.com');

    const vault = await request(app.getHttpServer())
      .post('/api/v1/vaults')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Family', type: 'shared' })
      .expect(201);
    vaultId = vault.body.id;
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  // ── memories ──────────────────────────────────────────────────────────────

  it('creates a memory dated when it happened, not when it was uploaded', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/memories`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Aaji at the wedding',
        note: 'She wore the green sari.',
        occurredAt: '1974-03-14T00:00:00Z',
        occurredPrecision: 'year',
        clientId: CLIENT_ID.memory,
      })
      .expect(201);

    memoryId = res.body.id;
    expect(res.body.deduplicated).toBe(false);
  });

  it('returns the same memory for a repeated clientId', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/memories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ occurredAt: '1974-03-14T00:00:00Z', clientId: CLIENT_ID.memory })
      .expect(201);

    // The outbox retried after an ambiguous failure. One moment, not two.
    expect(res.body.id).toBe(memoryId);
    expect(res.body.deduplicated).toBe(true);
  });

  it('keeps the timeline on the date it happened', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/vaults/${vaultId}/memories`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.memories).toHaveLength(1);
    expect(new Date(res.body.memories[0].occurredAt).getUTCFullYear()).toBe(1974);
    expect(res.body.memories[0].mediaCount).toBe(0);
  });

  it('answers 404 — not 403 — for a vault that is not yours', async () => {
    // The policy already decided the vault does not exist for this caller.
    // "Forbidden" would confirm it exists for somebody.
    await request(app.getHttpServer())
      .post(`/api/v1/vaults/${vaultId}/memories`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ occurredAt: '2026-01-01T00:00:00Z', clientId: CLIENT_ID.other })
      .expect(404);
  });

  it('shows a stranger an empty timeline rather than an error', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/vaults/${vaultId}/memories`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(200);

    expect(res.body.memories).toHaveLength(0);
  });

  // ── uploads ───────────────────────────────────────────────────────────────

  it('signs an upload and reserves a session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memoryId,
        filename: 'wedding.jpg',
        contentType: 'image/jpeg',
        bytes: 2_400_000,
        kind: 'image',
        clientId: CLIENT_ID.upload,
      })
      .expect(201);

    uploadId = res.body.uploadId;
    uploadKey = res.body.storageKey;

    expect(res.body.method).toBe('PUT');
    expect(res.body.url).toContain(uploadKey);

    // Vault first in the key, so a whole family's objects share a prefix.
    expect(uploadKey.startsWith(`vault/${vaultId}/memory/${memoryId}/asset/`)).toBe(true);
  });

  it('resumes the same session for a repeated clientId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memoryId,
        filename: 'wedding.jpg',
        contentType: 'image/jpeg',
        bytes: 2_400_000,
        kind: 'image',
        clientId: CLIENT_ID.upload,
      })
      .expect(201);

    // A retry resumes rather than stranding the parts already uploaded.
    expect(res.body.uploadId).toBe(uploadId);
  });

  it('refuses to complete an upload that never landed', async () => {
    // The client says it finished; the store has never heard of the object.
    await request(app.getHttpServer())
      .post(`/api/v1/uploads/${uploadId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'image', contentType: 'image/jpeg' })
      .expect(409);
  });

  it('refuses an object larger than the upload was opened for', async () => {
    // The signature covers ContentLength, so the store should never accept
    // this. Arriving here means something is wrong — and it must say so
    // rather than failing on a check constraint.
    storage.put(uploadKey, 9_000_000, 'image/jpeg');

    await request(app.getHttpServer())
      .post(`/api/v1/uploads/${uploadId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'image', contentType: 'image/jpeg' })
      .expect(413);
  });

  it('charges the quota from the size the STORE reports', async () => {
    // The client declared 2,400,000. The object that actually landed is
    // smaller — a truncated upload, or a client that over-estimated.
    storage.put(uploadKey, 2_000_000, 'image/jpeg');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/uploads/${uploadId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'image', contentType: 'image/jpeg' })
      .expect(200);

    assetId = res.body.assetId;

    const { rows } = await harness.ownerPool.query<{
      used: string;
      bytes: string;
    }>(
      `SELECT u.storage_used_bytes AS used, a.bytes
         FROM users u, media_assets a
        WHERE a.id = $1 AND u.id = a.owner_id`,
      [assetId],
    );

    // Trusting the client here would bill 2,400,000 for 2,000,000 of object,
    // and the same trust in the other direction is how somebody claims 5 MB
    // and writes 5 GB.
    expect(Number(rows[0].bytes)).toBe(2_000_000);
    expect(Number(rows[0].used)).toBe(2_000_000);
  });

  it('does not double-charge a retried completion', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/uploads/${uploadId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'image', contentType: 'image/jpeg' })
      .expect(200);

    expect(res.body.deduplicated).toBe(true);

    const { rows } = await harness.ownerPool.query<{ used: string }>(
      `SELECT storage_used_bytes AS used FROM users
        WHERE id = (SELECT owner_id FROM media_assets WHERE id = $1)`,
      [assetId],
    );

    // Still 2 MB, not 4. A confirmation the client sent twice is one upload.
    expect(Number(rows[0].used)).toBe(2_000_000);
  });

  it('refuses an upload that would exceed the quota', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memoryId,
        filename: 'huge.mp4',
        contentType: 'video/mp4',
        bytes: 4 * 1024 * 1024 * 1024, // 4 GiB against a 10 GiB free tier
        kind: 'video',
        clientId: '44444444-4444-4444-8444-444444444444',
      })
      .expect(201);

    // 4 GiB fits. 8 more does not — and it is refused BEFORE a byte moves,
    // rather than after twenty minutes on a mobile connection.
    await harness.ownerPool.query(
      `UPDATE users SET storage_used_bytes = storage_quota_bytes - 1000
        WHERE id = (SELECT owner_id FROM media_assets WHERE id = $1)`,
      [assetId],
    );

    await request(app.getHttpServer())
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memoryId,
        filename: 'huge.mp4',
        contentType: 'video/mp4',
        bytes: 50_000,
        kind: 'video',
        clientId: '55555555-5555-4555-8555-555555555555',
      })
      .expect(413);
  });

  // ── media URLs ────────────────────────────────────────────────────────────

  it('signs a short-lived URL for an asset', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/media/${assetId}/url`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.url).toContain(uploadKey);

    // Five minutes, and it is the bound on how long a revoked share can still
    // be opened — not a tuning knob.
    expect(res.body.expiresInSeconds).toBe(300);
  });

  it('gives a stranger 404 for the same asset', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/media/${assetId}/url`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(404);
  });

  it('requires a session for every archive route', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vaults/${vaultId}/memories`)
      .expect(401);

    await request(app.getHttpServer()).post('/api/v1/uploads').send({}).expect(401);
  });
});
