import type { Pool, PoolClient } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * The worker and admin roles.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Two things written in earlier migrations were promises, not facts.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   "`scheduled_jobs` is insert-only to the API because the worker claims
 *    under its own role" — and no such role existed, so nothing could claim a
 *    job and no capsule would ever have been delivered.
 *
 *   "the governance tables are invisible to `mm_app` because the console
 *    connects as its own role" — and no such role existed either.
 *
 * These tests are what make both statements true. Each one runs inside a
 * transaction with `SET LOCAL ROLE`, which is exactly how the real connections
 * will behave: `current_user` becomes the role, so it is neither superuser nor
 * table owner and every policy applies.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const VAULT = '01900000-0000-7000-8000-0000000aaaa1';

describe('the worker and admin roles', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let service: DbService;

  let adminId: string;
  let approverId: string;
  let expiredAdminId: string;
  let sealedMemoryId: string;
  let privateMemoryId: string;
  let capsuleId: string;

  /** Run a block as `role`, inside one transaction, then roll it back. */
  async function asRole<T>(
    role: 'mm_worker' | 'mm_admin',
    fn: (client: PoolClient) => Promise<T>,
    adminActor?: string,
  ): Promise<T> {
    const client = await ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${role}`);
      if (adminActor) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.admin_id',
          adminActor,
        ]);
      }
      return await fn(client);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    service = harness.service;

    await resetDatabase(ownerPool);

    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES ($1,'a@example.com','Aarav'), ($2,'b@example.com','Bina')`,
      [AARAV, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES ($1,$2,'Family')`,
      [VAULT, AARAV],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1,$2,'owner')`,
      [VAULT, AARAV],
    );

    const role = await ownerPool.query<{ id: string }>(
      `INSERT INTO roles (id, name) VALUES (gen_random_uuid(), 'support') RETURNING id`,
    );
    const admins = await ownerPool.query<{ id: string }>(
      `INSERT INTO admin_users (id, email, role_id) VALUES
         (gen_random_uuid(),'agent@mm.internal',$1),
         (gen_random_uuid(),'lead@mm.internal',$1),
         (gen_random_uuid(),'yesterday@mm.internal',$1) RETURNING id`,
      [role.rows[0].id],
    );
    adminId = admins.rows[0].id;
    approverId = admins.rows[1].id;
    expiredAdminId = admins.rows[2].id;

    // One memory that ends up in a sealed capsule, one that never does.
    const memories = await ownerPool.query<{ id: string }>(
      `INSERT INTO memories (id, vault_id, author_id, title, occurred_at, client_id) VALUES
         (uuid_generate_v7(), $1, $2, 'In the capsule', now(), gen_random_uuid()),
         (uuid_generate_v7(), $1, $2, 'Private, never sealed', now(), gen_random_uuid())
       RETURNING id`,
      [VAULT, AARAV],
    );
    sealedMemoryId = memories.rows[0].id;
    privateMemoryId = memories.rows[1].id;

    // Draft first, fill, then seal — the order the application must use, and
    // the order the freeze trigger from migration 0005 enforces. Sealing an
    // empty capsule and then adding to it is refused, for the owner and for
    // this fixture alike.
    const capsule = await ownerPool.query<{ id: string }>(
      `INSERT INTO capsules (id, vault_id, owner_id, title, unlock_kind, unlock_at, state)
       VALUES (uuid_generate_v7(), $1, $2, 'For her eighteenth', 'datetime', now() + interval '1 day', 'draft')
       RETURNING id`,
      [VAULT, AARAV],
    );
    capsuleId = capsule.rows[0].id;

    await ownerPool.query(
      `INSERT INTO capsule_memories (capsule_id, memory_id) VALUES ($1,$2)`,
      [capsuleId, sealedMemoryId],
    );

    await ownerPool.query(
      `UPDATE capsules SET state = 'sealed', sealed_at = now() WHERE id = $1`,
      [capsuleId],
    );
    await ownerPool.query(
      `INSERT INTO capsule_recipients (id, capsule_id, vault_id, name, email, access_token_hash)
       VALUES (uuid_generate_v7(), $1, $2, 'Aaji', 'aaji@example.com', $3)`,
      [capsuleId, VAULT, 'c'.repeat(64)],
    );
    await ownerPool.query(
      `INSERT INTO scheduled_jobs (id, kind, run_at, payload)
       VALUES (uuid_generate_v7(), 'capsule_delivery', now(), $1)`,
      [JSON.stringify({ capsuleId })],
    );
  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  // ── the worker ────────────────────────────────────────────────────────────

  it('lets the worker claim a job that the API cannot even see', async () => {
    const apiSees = await service.txAs(AARAV, (tx) =>
      tx.execute('SELECT id FROM scheduled_jobs'),
    );
    expect(apiSees.rows).toHaveLength(0);

    const claimed = await asRole('mm_worker', (c) =>
      c.query(
        `UPDATE scheduled_jobs SET state = 'claimed', locked_by = 'worker-1',
              locked_until = now() + interval '5 minutes'
          WHERE id IN (
            SELECT id FROM scheduled_jobs
             WHERE state = 'pending' AND run_at <= now()
             ORDER BY run_at LIMIT 100 FOR UPDATE SKIP LOCKED)
        RETURNING id`,
      ),
    );

    // The claim query from the design, running for real. Before this role
    // existed, nothing in the system could execute it.
    expect(claimed.rows).toHaveLength(1);
  });

  it('lets the worker read a memory that is inside a sealed capsule', async () => {
    const seen = await asRole('mm_worker', (c) =>
      c.query('SELECT title FROM memories ORDER BY title'),
    );

    // The tightest policy in the schema. The worker sees the one memory it has
    // to deliver, and not the one beside it.
    expect(seen.rows.map((r) => r.title)).toEqual(['In the capsule']);
  });

  it('hides the rest of the archive from the worker', async () => {
    const direct = await asRole('mm_worker', (c) =>
      c.query('SELECT title FROM memories WHERE id = $1', [privateMemoryId]),
    );

    // Asking by id is no different. A compromised delivery worker cannot walk
    // the archive, only the handful of rows currently in flight.
    expect(direct.rows).toHaveLength(0);
  });

  it('still refuses to let the worker edit a sealed promise', async () => {
    const attempt = asRole('mm_worker', (c) =>
      c.query('UPDATE capsules SET sender_note = $1 WHERE id = $2', [
        'rewritten by a worker',
        capsuleId,
      ]),
    );

    // The freeze trigger from migration 0005 applies to every role. Advancing
    // the state machine is allowed; changing the message is not.
    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('lets the worker advance the state machine', async () => {
    const advanced = await asRole('mm_worker', (c) =>
      c.query(
        `UPDATE capsules SET state = 'delivering' WHERE id = $1 RETURNING state`,
        [capsuleId],
      ),
    );

    expect(advanced.rows[0].state).toBe('delivering');
  });

  it('lets the worker write only `system` audit rows', async () => {
    // No RETURNING, and that is not a style choice.
    //
    // INSERT ... RETURNING evaluates the SELECT policy against the new row and
    // raises if it is not visible. The worker may write to the audit trail and
    // may not read it, so asking for the row back turns a successful insert
    // into "new row violates row-level security policy" — an error that reads
    // like the write was refused when it was the read that failed.
    //
    // The general rule: a role with INSERT but no SELECT cannot use RETURNING.
    const ok = await asRole('mm_worker', (c) =>
      c.query(
        `INSERT INTO audit_logs (id, actor_type, action, resource_type)
         VALUES (uuid_generate_v7(), 'system', 'capsule.delivered', 'capsule')`,
      ),
    );
    expect(ok.rowCount).toBe(1);

    const forged = asRole('mm_worker', (c) =>
      c.query(
        `INSERT INTO audit_logs (id, actor_type, action, resource_type)
         VALUES (uuid_generate_v7(), 'admin', 'break_glass.read', 'vault')`,
      ),
    );

    // Its trail can never be mistaken for somebody else's action.
    await expect(forged).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses to let the worker read the audit trail back', async () => {
    const seen = await asRole('mm_worker', (c) =>
      c.query('SELECT action FROM audit_logs'),
    );

    // Write-only. The delivery engine records what it did and cannot review
    // what anybody else did — which is also why its inserts cannot RETURNING.
    expect(seen.rows).toHaveLength(0);
  });

  it('refuses the worker any DELETE at all', async () => {
    const attempt = asRole('mm_worker', (c) =>
      c.query('DELETE FROM scheduled_jobs'),
    );

    // Not a policy — a missing table privilege, which no policy can route
    // around. Deletion in this product is a soft delete plus a purge job.
    await expect(attempt).rejects.toMatchObject({ code: '42501' });
  });

  // ── the admin ─────────────────────────────────────────────────────────────

  it('lets an admin find an account', async () => {
    const found = await asRole(
      'mm_admin',
      (c) => c.query('SELECT email, plan FROM users ORDER BY email'),
      adminId,
    );

    expect(found.rows.map((r) => r.email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('refuses an admin the content behind that account', async () => {
    const content = await asRole(
      'mm_admin',
      (c) => c.query('SELECT title FROM memories'),
      adminId,
    );

    // `read` and `read_content` are different powers, and this is where that
    // stops being a row in an enum. Support can find the account; support
    // cannot open the archive.
    expect(content.rows).toHaveLength(0);
  });

  it('opens the archive only under a live, approved break-glass grant', async () => {
    await ownerPool.query(
      `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, 'Investigating a reported upload on ticket 4417', $3, now() + interval '4 hours')`,
      [adminId, AARAV, approverId],
    );

    const withGrant = await asRole(
      'mm_admin',
      (c) => c.query('SELECT title FROM memories ORDER BY title'),
      adminId,
    );
    expect(withGrant.rows.length).toBeGreaterThan(0);

    // The grant names one admin. A colleague gets nothing from it.
    const colleague = await asRole(
      'mm_admin',
      (c) => c.query('SELECT title FROM memories'),
      approverId,
    );
    expect(colleague.rows).toHaveLength(0);
  });

  it('gives nothing for a grant that has already expired', async () => {
    await ownerPool.query(
      `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, 'Looked into this yesterday on ticket 4290', $3, now() - interval '1 minute')`,
      [expiredAdminId, AARAV, approverId],
    );

    const expired = await asRole(
      'mm_admin',
      (c) => c.query('SELECT title FROM memories'),
      expiredAdminId,
    );

    // Access is time-boxed, and the expiry cannot be extended: expires_at is
    // one of the columns the immutability trigger freezes, so a longer look
    // means a new request with a new approver.
    expect(expired.rows).toHaveLength(0);
  });

  it('refuses to extend an expiry rather than request a new grant', async () => {
    const attempt = ownerPool.query(
      `UPDATE break_glass_access SET expires_at = now() + interval '1 day'
        WHERE admin_id = $1`,
      [expiredAdminId],
    );

    await expect(attempt).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses an admin a grant they approved for themselves', async () => {
    const attempt = asRole(
      'mm_admin',
      (c) =>
        c.query(
          `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
           VALUES (uuid_generate_v7(), $1, $2, 'Looking at something I should not be', $1, now() + interval '1 hour')`,
          [adminId, BINA],
        ),
      adminId,
    );

    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses an admin a grant in somebody else’s name', async () => {
    const attempt = asRole(
      'mm_admin',
      (c) =>
        c.query(
          `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
           VALUES (uuid_generate_v7(), $1, $2, 'Requested under a colleague name', $3, now() + interval '1 hour')`,
          [approverId, BINA, adminId],
        ),
      adminId,
    );

    // `WITH CHECK (admin_id = app_current_admin())`. An admin cannot file a
    // request that will be audited against a colleague.
    await expect(attempt).rejects.toMatchObject({ code: '42501' });
  });

  it('lets an admin read the whole audit trail and write none of it', async () => {
    const read = await asRole(
      'mm_admin',
      (c) => c.query('SELECT action FROM audit_logs'),
      adminId,
    );
    expect(read.rows.length).toBeGreaterThanOrEqual(0);

    const write = asRole(
      'mm_admin',
      (c) =>
        c.query(
          `INSERT INTO audit_logs (id, actor_type, action, resource_type)
           VALUES (uuid_generate_v7(), 'admin', 'nothing.happened', 'vault')`,
        ),
      adminId,
    );

    // No INSERT policy. The console cannot write its own history, and the
    // append-only trigger means it cannot edit what is already there.
    await expect(write).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps the two actor settings separate', async () => {
    const result = await asRole(
      'mm_admin',
      (c) => c.query('SELECT app_current_user() AS u, app_current_admin() AS a'),
      adminId,
    );

    // One connection is never both. Sharing the key would let an admin session
    // satisfy a user policy.
    expect(result.rows[0].u).toBeNull();
    expect(result.rows[0].a).toBe(adminId);
  });
});
