import { Test, type TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';

import { WorkerModule } from '../src/worker/worker.module.js';
import { JobQueueService } from '../src/worker/job-queue.service.js';
import { WorkerService } from '../src/worker/worker.service.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * The delivery engine.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Of the two ways this can fail, only one is recoverable.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A capsule delivered late can be apologised for. A capsule delivered **twice**
 * — a second copy of a message from somebody's dead father — cannot. These
 * tests are mostly about the second.
 *
 * They drive `tick()` directly rather than starting the loop, so each one
 * exercises exactly one pass instead of racing a timer.
 */

const OWNER = '01900000-0000-7000-8000-00000000aa01';
const VAULT = '01900000-0000-7000-8000-0000000aaaa1';

describe('the delivery engine', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let app: TestingModule;
  let worker: WorkerService;
  let queue: JobQueueService;

  let capsuleId: string;
  let jobId: string;

  /** A sealed capsule, one recipient, one due job. */
  async function seedCapsule(options: {
    channel?: string;
    unlockAt?: string;
    state?: string;
  } = {}) {
    const channel = options.channel ?? 'email';
    const unlockAt = options.unlockAt ?? "now() - interval '5 minutes'";
    const state = options.state ?? 'sealed';

    const { rows } = await ownerPool.query<{ id: string }>(
      `INSERT INTO capsules (id, vault_id, owner_id, title, state, unlock_kind, unlock_at, unlock_timezone, sealed_at)
       VALUES (uuid_generate_v7(), $1, $2, 'For her eighteenth', $3, 'datetime', ${unlockAt}, 'Asia/Kolkata', now())
       RETURNING id`,
      [VAULT, OWNER, state],
    );
    const capsule = rows[0].id;

    await ownerPool.query(
      `INSERT INTO capsule_recipients (id, capsule_id, vault_id, name, email, preferred_channel, access_token_hash)
       VALUES (uuid_generate_v7(), $1::uuid, $2::uuid, 'Aaji', 'aaji@example.com', $3,
               encode(sha256(($1::uuid)::text::bytea),'hex'))`,
      [capsule, VAULT, channel],
    );

    const job = await ownerPool.query<{ id: string }>(
      `INSERT INTO scheduled_jobs (id, kind, run_at, payload)
       VALUES (uuid_generate_v7(), 'capsule_delivery', now() - interval '1 minute', $1)
       RETURNING id`,
      [JSON.stringify({ capsuleId: capsule })],
    );

    return { capsuleId: capsule, jobId: job.rows[0].id };
  }

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    await resetDatabase(ownerPool);

    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES ($1, 'a@example.com', 'Aarav')`,
      [OWNER],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES ($1, $2, 'Family')`,
      [VAULT, OWNER],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [VAULT, OWNER],
    );

    app = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await app.init();

    worker = app.get(WorkerService);
    queue = app.get(JobQueueService);
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  // ── the happy path ────────────────────────────────────────────────────────

  it('claims a due job and delivers the capsule', async () => {
    ({ capsuleId, jobId } = await seedCapsule());

    const worked = await worker.tick();
    expect(worked).toBe(true);

    const { rows } = await ownerPool.query<{ state: string; delivered_at: Date | null }>(
      'SELECT state, delivered_at FROM capsules WHERE id = $1',
      [capsuleId],
    );

    // The promise is kept. Before this commit nothing in the system could do
    // this — the role and the policies existed, and no process used them.
    expect(rows[0].state).toBe('delivered');
    expect(rows[0].delivered_at).not.toBeNull();
  });

  it('records the attempt, with a provider and a message id', async () => {
    const { rows } = await ownerPool.query<{
      status: string;
      provider: string;
      provider_message_id: string | null;
      attempt_no: number;
    }>('SELECT status, provider, provider_message_id, attempt_no FROM delivery_attempts WHERE capsule_id = $1', [
      capsuleId,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('delivered');
    expect(rows[0].provider).toBe('resend');
    expect(rows[0].provider_message_id).toBeTruthy();
    expect(rows[0].attempt_no).toBe(1);
  });

  it('marks the job completed and releases the lease', async () => {
    const { rows } = await ownerPool.query<{
      state: string;
      locked_by: string | null;
      completed_at: Date | null;
    }>('SELECT state, locked_by, completed_at FROM scheduled_jobs WHERE id = $1', [jobId]);

    expect(rows[0].state).toBe('completed');
    expect(rows[0].locked_by).toBeNull();
    expect(rows[0].completed_at).not.toBeNull();
  });

  it('writes a system audit row for the delivery', async () => {
    const { rows } = await ownerPool.query<{ action: string; actor_type: string }>(
      `SELECT action, actor_type FROM audit_logs WHERE resource_id = $1`,
      [capsuleId],
    );

    expect(rows[0].actor_type).toBe('system');
    expect(rows[0].action).toBe('capsule.delivered');
  });

  // ── the failure that must never happen ────────────────────────────────────

  it('does not send twice when the same job is replayed', async () => {
    // A worker that crashed after sending but before completing would leave
    // the job claimable again. Simulate exactly that.
    await ownerPool.query(
      `UPDATE scheduled_jobs SET state = 'pending', locked_by = NULL, locked_until = NULL,
              completed_at = NULL, run_at = now() - interval '1 minute'
        WHERE id = $1`,
      [jobId],
    );

    await worker.tick();

    const { rows } = await ownerPool.query<{ count: string }>(
      'SELECT count(*) FROM delivery_attempts WHERE capsule_id = $1',
      [capsuleId],
    );

    // Still ONE attempt. The recipient was already marked delivered, so the
    // handler skipped them — and had it not, ux_attempt_idempotent would have
    // refused the duplicate reservation.
    expect(Number(rows[0].count)).toBe(1);
  });

  it('refuses a duplicate attempt row even when forced', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO delivery_attempts (id, capsule_id, recipient_id, channel, attempt_no, provider, status)
       SELECT uuid_generate_v7(), capsule_id, recipient_id, channel, attempt_no, provider, status
         FROM delivery_attempts WHERE capsule_id = $1`,
      [capsuleId],
    );

    await expect(attempt).rejects.toMatchObject({ code: '23505' });
  });

  // ── retries, in days ──────────────────────────────────────────────────────

  it('retries a failed channel tomorrow, not in a minute', async () => {
    const seeded = await seedCapsule({ channel: 'sms' });

    await worker.tick();

    const { rows } = await ownerPool.query<{
      state: string;
      attempts: number;
      run_at: Date;
      last_error: string | null;
    }>('SELECT state, attempts, run_at, last_error FROM scheduled_jobs WHERE id = $1', [
      seeded.jobId,
    ]);

    expect(rows[0].state).toBe('pending');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].last_error).toMatch(/failed/i);

    // A capsule has waited twenty years; it can wait another day for a mail
    // server. Retrying in a minute would burn the budget on an outage that
    // resolves itself overnight.
    const hoursAway = (rows[0].run_at.getTime() - Date.now()) / 3_600_000;
    expect(hoursAway).toBeGreaterThan(20);

    const { rows: capsule } = await ownerPool.query<{ state: string }>(
      'SELECT state FROM capsules WHERE id = $1',
      [seeded.capsuleId],
    );
    // Visibly undelivered, not quietly marked done.
    expect(capsule[0].state).toBe('delivering');
  });

  it('gives up after five attempts and goes dead, not round again', async () => {
    const seeded = await seedCapsule({ channel: 'whatsapp' });

    for (let i = 0; i < 5; i++) {
      await ownerPool.query(
        `UPDATE scheduled_jobs SET state='pending', run_at = now() - interval '1 minute' WHERE id = $1`,
        [seeded.jobId],
      );
      await worker.tick();
    }

    const { rows } = await ownerPool.query<{ state: string; attempts: number }>(
      'SELECT state, attempts FROM scheduled_jobs WHERE id = $1',
      [seeded.jobId],
    );

    // `dead` is terminal and needs a person. For a capsule delivery that is a
    // Sev-0, and the console counts it as one.
    expect(rows[0].state).toBe('dead');
    expect(rows[0].attempts).toBe(5);
  });

  // ── the reaper ────────────────────────────────────────────────────────────

  it('returns a job abandoned by a dead worker', async () => {
    const seeded = await seedCapsule();

    await ownerPool.query(
      `UPDATE scheduled_jobs
          SET state = 'running', locked_by = 'worker-that-died',
              locked_until = now() - interval '1 minute', attempts = 1
        WHERE id = $1`,
      [seeded.jobId],
    );

    const reaped = await queue.reap();
    expect(reaped).toBeGreaterThanOrEqual(1);

    const { rows } = await ownerPool.query<{
      state: string;
      locked_by: string | null;
      attempts: number;
    }>('SELECT state, locked_by, attempts FROM scheduled_jobs WHERE id = $1', [
      seeded.jobId,
    ]);

    expect(rows[0].state).toBe('pending');
    expect(rows[0].locked_by).toBeNull();

    // The attempt count is NOT incremented. The job was abandoned, not tried,
    // and charging it an attempt would spend the retry budget on a crash.
    expect(rows[0].attempts).toBe(1);
  });

  it('leaves a live lease alone', async () => {
    const seeded = await seedCapsule();

    await ownerPool.query(
      `UPDATE scheduled_jobs
          SET state = 'running', locked_by = 'worker-still-working',
              locked_until = now() + interval '5 minutes'
        WHERE id = $1`,
      [seeded.jobId],
    );

    await queue.reap();

    const { rows } = await ownerPool.query<{ locked_by: string | null }>(
      'SELECT locked_by FROM scheduled_jobs WHERE id = $1',
      [seeded.jobId],
    );

    // Reaping a job somebody is still working on is how you get two workers
    // sending the same capsule.
    expect(rows[0].locked_by).toBe('worker-still-working');
  });

  // ── claiming ──────────────────────────────────────────────────────────────

  it('never hands the same job to two workers', async () => {
    const seeded = await seedCapsule();

    const [first, second] = await Promise.all([
      queue.claim('capsule_delivery'),
      queue.claim('capsule_delivery'),
    ]);

    const ids = [...first, ...second].map((j) => j.id);
    const mine = ids.filter((id) => id === seeded.jobId);

    // FOR UPDATE SKIP LOCKED. Two concurrent claims, and the job appears in
    // exactly one of them — the guarantee the whole engine rests on.
    expect(mine).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('will not claim a job that is not due yet', async () => {
    const { rows } = await ownerPool.query<{ id: string }>(
      `INSERT INTO scheduled_jobs (id, kind, run_at, payload)
       VALUES (uuid_generate_v7(), 'capsule_delivery', now() + interval '1 day', '{}'::jsonb)
       RETURNING id`,
    );

    const claimed = await queue.claim('capsule_delivery');
    expect(claimed.map((j) => j.id)).not.toContain(rows[0].id);
  });

  // ── the edges ─────────────────────────────────────────────────────────────

  it('completes without sending when the capsule was cancelled', async () => {
    const seeded = await seedCapsule({ state: 'cancelled' });

    await worker.tick();

    const { rows } = await ownerPool.query<{ state: string }>(
      'SELECT state FROM scheduled_jobs WHERE id = $1',
      [seeded.jobId],
    );
    expect(rows[0].state).toBe('completed');

    const { rows: attempts } = await ownerPool.query<{ count: string }>(
      'SELECT count(*) FROM delivery_attempts WHERE capsule_id = $1',
      [seeded.capsuleId],
    );

    // A withdrawn promise is not a failed delivery. Nothing was sent and
    // nothing is retried.
    expect(Number(attempts[0].count)).toBe(0);
  });

  it('refuses to deliver a capsule whose unlock is still in the future', async () => {
    const seeded = await seedCapsule({ unlockAt: "now() + interval '2 days'" });

    await worker.tick();

    const { rows } = await ownerPool.query<{ state: string; last_error: string }>(
      'SELECT state, last_error FROM scheduled_jobs WHERE id = $1',
      [seeded.jobId],
    );

    expect(rows[0].last_error).toMatch(/future/i);

    const { rows: capsule } = await ownerPool.query<{ state: string }>(
      'SELECT state FROM capsules WHERE id = $1',
      [seeded.capsuleId],
    );
    expect(capsule[0].state).not.toBe('delivered');
  });
});
