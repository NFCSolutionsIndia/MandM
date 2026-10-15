import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import { connect, disconnect, pgCode, resetDatabase, type Harness } from './support/database.js';
import {
  capsuleMemories,
  capsuleRecipients,
  capsules,
  deliveryAttempts,
  memories,
  scheduledJobs,
} from '../src/db/schema/index.js';

/**
 * Promises — the domain the product exists for, and the one whose failures are
 * not recoverable.
 *
 * Everything asserted here protects something that cannot be fixed afterwards:
 * a sealed message that changed, a capsule delivered twice, a promise quietly
 * cancelled by somebody who did not make it.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const VIKRAM = '01900000-0000-7000-8000-00000000cc01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const FAMILY_VAULT = '01900000-0000-7000-8000-0000000aaaa1';

/** The PostgreSQL message behind Drizzle's wrapper. */
function pgMessage(error: unknown): string {
  return (error as { cause?: { message?: string } }).cause?.message ?? '';
}

const RAW_TOKEN = 'a-token-that-only-ever-lives-in-the-emailed-link';
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

describe('promises domain', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let appPool: Pool;
  let service: DbService;

  let capsuleId: string;
  let memoryId: string;
  let recipientId: string;

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    appPool = harness.appPool;
    service = harness.service;

    await resetDatabase(ownerPool);

    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES
         ($1,'a@example.com','Aarav'), ($2,'v@example.com','Vikram'), ($3,'b@example.com','Bina')`,
      [AARAV, VIKRAM, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES ($1,$2,'Family')`,
      [FAMILY_VAULT, AARAV],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1,$2,'owner'), ($1,$3,'admin')`,
      [FAMILY_VAULT, AARAV, VIKRAM],
    );

    const [memory] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(memories)
        .values({
          vaultId: FAMILY_VAULT,
          authorId: AARAV,
          title: 'For her eighteenth',
          occurredAt: new Date(),
          clientId: '01900000-0000-7000-8000-00000000d101',
        })
        .returning(),
    );
    memoryId = memory.id;

    const [capsule] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(capsules)
        .values({
          vaultId: FAMILY_VAULT,
          ownerId: AARAV,
          title: 'Open on your eighteenth birthday',
          senderNote: 'I hope the world has been kind to you.',
          unlockKind: 'datetime',
          unlockAt: new Date('2044-03-14T03:30:00Z'),
          unlockTimezone: 'Asia/Kolkata',
        })
        .returning(),
    );
    capsuleId = capsule.id;
  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  // ── the schedule itself ───────────────────────────────────────────────────

  it('keeps an unlock time 18 years out, to the millisecond', async () => {
    const [row] = await service.txAs(AARAV, (tx) =>
      tx.select().from(capsules).where(sql`id = ${capsuleId}`),
    );

    // The 2038 problem, asserted rather than assumed. A 32-bit time_t would
    // have wrapped this into 1970 or thrown.
    expect(row.unlockAt?.toISOString()).toBe('2044-03-14T03:30:00.000Z');
    expect(row.unlockTimezone).toBe('Asia/Kolkata');
  });

  it('refuses a datetime capsule with no unlock time', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(capsules).values({
        vaultId: FAMILY_VAULT,
        ownerId: AARAV,
        title: 'a promise with no date',
        unlockKind: 'datetime',
      }),
    );

    // It would sit in the table forever and never fire — a promise that is
    // silently never kept.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  it('refuses a milestone capsule with nobody to reach the milestone', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(capsules).values({
        vaultId: FAMILY_VAULT,
        ownerId: AARAV,
        title: 'when she turns 18',
        unlockKind: 'milestone',
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  // ── who may touch a promise ───────────────────────────────────────────────

  it('lets a vault admin read a capsule but never cancel it', async () => {
    const seen = await service.txAs(VIKRAM, (tx) =>
      tx.select().from(capsules).where(sql`id = ${capsuleId}`),
    );
    expect(seen).toHaveLength(1);

    const cancelled = await service.txAs(VIKRAM, (tx) =>
      tx
        .update(capsules)
        .set({ state: 'cancelled', cancelledAt: new Date() })
        .where(sql`id = ${capsuleId}`)
        .returning(),
    );

    // Vikram is an ADMIN of this vault and still cannot withdraw the promise.
    // A promise belongs to the person who made it. Silent, because USING
    // filtered the row rather than WITH CHECK rejecting it.
    expect(cancelled).toHaveLength(0);
  });

  it('refuses a recipient with no way to reach them', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(capsuleRecipients).values({
        capsuleId,
        vaultId: FAMILY_VAULT,
        name: 'nobody',
        accessTokenHash: 'f'.repeat(64),
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  // ── sealing ───────────────────────────────────────────────────────────────

  it('seals the capsule and schedules its delivery in one transaction', async () => {
    await service.txAs(AARAV, async (tx) => {
      await tx
        .insert(capsuleRecipients)
        .values({
          capsuleId,
          vaultId: FAMILY_VAULT,
          name: 'Aaji',
          email: 'Aaji@Example.com',
          accessTokenHash: TOKEN_HASH,
        })
        .returning();

      await tx.insert(capsuleMemories).values({ capsuleId, memoryId });

      await tx
        .update(capsules)
        .set({ state: 'sealed', sealedAt: new Date() })
        .where(sql`id = ${capsuleId}`)
        .returning();

      // The promise and its alarm clock are written together. If either fails,
      // neither happened.
      await tx.insert(scheduledJobs).values({
        kind: 'capsule_delivery',
        runAt: new Date('2044-03-14T03:30:00Z'),
        payload: { capsuleId },
      });
    });

    const { rows } = await ownerPool.query<{ state: string; kind: string }>(
      `SELECT c.state, j.kind FROM capsules c, scheduled_jobs j WHERE c.id = $1`,
      [capsuleId],
    );
    expect(rows[0].state).toBe('sealed');
    expect(rows[0].kind).toBe('capsule_delivery');

    const [recipient] = await service.txAs(AARAV, (tx) =>
      tx.select().from(capsuleRecipients).where(sql`capsule_id = ${capsuleId}`),
    );
    recipientId = recipient.id;
  });

  // ── sealed means sealed ───────────────────────────────────────────────────

  it('freezes the message once sealed', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx
        .update(capsules)
        .set({ senderNote: 'actually, never mind' })
        .where(sql`id = ${capsuleId}`)
        .returning(),
    );

    // Not a convention the application remembers — a trigger. The owner cannot
    // do this, an admin cannot, and neither can a stray UPDATE in psql.
    //
    // The message is asserted on the CAUSE: Drizzle wraps driver errors, so its
    // own message is only "Failed query".
    await expect(attempt).rejects.toThrow();
    const error = await attempt.catch((e: unknown) => e);
    expect(pgCode(error)).toBe('23514');
    expect(pgMessage(error)).toMatch(/sealed/i);
  });

  it('freezes the schedule once sealed', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx
        .update(capsules)
        .set({ unlockAt: new Date('2030-01-01T00:00:00Z') })
        .where(sql`id = ${capsuleId}`)
        .returning(),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgMessage(await attempt.catch((e: unknown) => e))).toMatch(/sealed/i);
  });

  it('freezes the contents once sealed', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.delete(capsuleMemories).where(sql`capsule_id = ${capsuleId}`).returning(),
    );

    // Removing a memory changes the message as surely as editing the note.
    await expect(attempt).rejects.toThrow();
    expect(pgMessage(await attempt.catch((e: unknown) => e))).toMatch(/sealed/i);
  });

  it('still allows the delivery bookkeeping to advance', async () => {
    const updated = await service.txAs(AARAV, (tx) =>
      tx
        .update(capsules)
        .set({ state: 'delivering' })
        .where(sql`id = ${capsuleId}`)
        .returning(),
    );

    // The promise is frozen; the machinery of keeping it is not. A freeze that
    // blocked state transitions would stop the capsule being delivered at all.
    expect(updated).toHaveLength(1);
    expect(updated[0].state).toBe('delivering');
  });

  it('refuses to delete a memory that a sealed capsule carries', async () => {
    // Two different controls stop this, and they stop it at different layers.
    //
    // Through the application role, RLS gets there first: there is no DELETE
    // policy on memories at all, so the statement matches nothing and the
    // foreign key is never consulted.
    const viaApi = await service.txAs(AARAV, (tx) =>
      tx.delete(memories).where(sql`id = ${memoryId}`).returning(),
    );
    expect(viaApi).toHaveLength(0);

    // As the OWNER — which is how the purge job will connect, bypassing RLS —
    // the foreign key is what holds. ON DELETE restrict, so a sealed capsule
    // cannot be quietly emptied from the other end even by a privileged role.
    const asOwner = ownerPool.query('DELETE FROM memories WHERE id = $1', [
      memoryId,
    ]);
    await expect(asOwner).rejects.toMatchObject({ code: '23503' });
  });

  // ── delivery ──────────────────────────────────────────────────────────────

  it('cannot send the same message twice', async () => {
    // Written as the owner, the way the delivery worker will.
    await ownerPool.query(
      `INSERT INTO delivery_attempts (id, capsule_id, recipient_id, channel, attempt_no, provider, status)
       VALUES (gen_random_uuid(), $1, $2, 'email', 1, 'resend', 'sent')`,
      [capsuleId, recipientId],
    );

    // A worker that crashed after sending but before recording retries.
    const retry = ownerPool.query(
      `INSERT INTO delivery_attempts (id, capsule_id, recipient_id, channel, attempt_no, provider, status)
       VALUES (gen_random_uuid(), $1, $2, 'email', 1, 'resend', 'sent')`,
      [capsuleId, recipientId],
    );

    // It hits the unique key instead of sending again. For a message from a
    // deceased parent, a duplicate is its own kind of harm.
    await expect(retry).rejects.toMatchObject({ code: '23505' });
  });

  it('shows the owner the delivery log but never lets them write it', async () => {
    const seen = await service.txAs(AARAV, (tx) =>
      tx.select().from(deliveryAttempts).where(sql`capsule_id = ${capsuleId}`),
    );
    expect(seen).toHaveLength(1);

    const forged = service.txAs(AARAV, (tx) =>
      tx.insert(deliveryAttempts).values({
        capsuleId,
        recipientId,
        channel: 'email',
        attemptNo: 99,
        provider: 'resend',
        status: 'delivered',
      }),
    );

    // A request handler may show delivery status. It may not invent it.
    await expect(forged).rejects.toThrow();
    expect(pgCode(await forged.catch((e: unknown) => e))).toBe('42501');
  });

  // ── the job table ─────────────────────────────────────────────────────────

  it('hides the job table from the API entirely', async () => {
    const jobs = await service.txAs(AARAV, (tx) => tx.select().from(scheduledJobs));

    // Insert-only. A compromised request handler cannot enumerate who is
    // expecting a capsule, cannot move a run_at, and cannot cancel a delivery.
    expect(jobs).toHaveLength(0);

    const { rows } = await ownerPool.query('SELECT 1 FROM scheduled_jobs');
    expect(rows).toHaveLength(1);
  });

  it('refuses a job of any kind but capsule_delivery', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(scheduledJobs).values({
        kind: 'retention_purge',
        runAt: new Date(),
        payload: {},
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  // ── the recipient with no account ─────────────────────────────────────────

  it('gives nothing to a token holder before delivery', async () => {
    const { rows } = await appPool.query(
      'SELECT * FROM app_resolve_recipient($1)',
      [TOKEN_HASH],
    );

    // The capsule is 'delivering', not 'delivered'. Possessing the link early
    // is worth nothing.
    expect(rows).toHaveLength(0);
  });

  it('lets a recipient with no account open it and reply', async () => {
    await ownerPool.query(
      `UPDATE capsules SET state = 'delivered', delivered_at = now() WHERE id = $1`,
      [capsuleId],
    );

    const resolved = await appPool.query<{ capsule_id: string }>(
      'SELECT * FROM app_resolve_recipient($1)',
      [TOKEN_HASH],
    );
    expect(resolved.rows[0].capsule_id).toBe(capsuleId);

    const { rows } = await appPool.query<{ app_post_reply: string }>(
      'SELECT app_post_reply($1, $2, NULL)',
      [TOKEN_HASH, 'I read it on the train and cried. Thank you.'],
    );
    expect(rows[0].app_post_reply).toBeTruthy();

    // Replying marks the capsule opened, in the same call — a reply cannot
    // exist against a capsule nobody is recorded as having read.
    const { rows: after } = await ownerPool.query<{
      state: string;
      first_opened_at: Date | null;
    }>('SELECT state, first_opened_at FROM capsules WHERE id = $1', [capsuleId]);
    expect(after[0].state).toBe('opened');
    expect(after[0].first_opened_at).not.toBeNull();
  });

  it('rejects a reply from a token that opens nothing', async () => {
    const attempt = appPool.query('SELECT app_post_reply($1, $2, NULL)', [
      'd'.repeat(64),
      'let me in',
    ]);

    await expect(attempt).rejects.toMatchObject({ code: '42501' });
  });

  it('shows the sender the reply', async () => {
    const replies = await service.txAs(AARAV, (tx) =>
      tx.execute(sql`SELECT body FROM capsule_replies WHERE capsule_id = ${capsuleId}`),
    );

    expect(replies.rows).toHaveLength(1);
    expect(replies.rows[0].body).toMatch(/cried/);
  });

  it('shows a stranger nothing', async () => {
    const replies = await service.txAs(BINA, (tx) =>
      tx.execute(sql`SELECT body FROM capsule_replies WHERE capsule_id = ${capsuleId}`),
    );

    expect(replies.rows).toHaveLength(0);
  });
});
