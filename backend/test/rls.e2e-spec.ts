import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import { ActorContext } from '../src/db/actor-context.js';
import type { DbService } from '../src/db/db.service.js';
import { vaults } from '../src/db/schema/index.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * Row-level security, enforced through the application's own code path.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  A policy nobody has watched FAIL is a policy nobody knows is there.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migration 0002 was verified by hand in psql, which proves the policies are
 * correct. This proves something different and equally necessary: that
 * `DbService.tx()` actually carries the actor into the transaction, and that
 * the connection the application opens is subject to the policies at all.
 *
 * Both halves can be right while the join between them is wrong — a pool that
 * quietly connects as the owner would pass every psql check and leak every row.
 *
 * Runs against `mm_test`, never `mm_dev`: this file truncates tables.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const AARAV_VAULT = '01900000-0000-7000-8000-0000000aaaa1';
const BINA_VAULT = '01900000-0000-7000-8000-0000000bbbb1';

describe('row-level security', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let service: DbService;

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    service = harness.service;

    // Seeded as the OWNER, which bypasses RLS. Seeding through the application
    // role would be a chicken-and-egg: the policies would refuse the very rows
    // the test needs in order to exercise them.
    await resetDatabase(ownerPool);
    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES
         ($1, 'a@example.com', 'Aarav'),
         ($2, 'b@example.com', 'Bina')`,
      [AARAV, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES
         ($1, $2, 'Aarav family'),
         ($3, $4, 'Bina family')`,
      [AARAV_VAULT, AARAV, BINA_VAULT, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES
         ($1, $2, 'owner'),
         ($3, $4, 'owner')`,
      [AARAV_VAULT, AARAV, BINA_VAULT, BINA],
    );

  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  it('connects as mm_app, not as a superuser', async () => {
    const { role } = await service.ping();

    // If this ever reads `postgres`, every other test in this file passes for
    // the wrong reason and the service is wide open.
    expect(role).toBe('mm_app');
  });

  it('sees nothing when no actor is set', async () => {
    const rows = await service.tx((tx) => tx.select().from(vaults));

    // Not an error — an empty result. A handler that forgets to authenticate
    // returns an empty list, which is a visible bug, rather than every row.
    expect(rows).toHaveLength(0);
  });

  it('sees only the actor’s own vault', async () => {
    const rows = await service.txAs(AARAV, (tx) => tx.select().from(vaults));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Aarav family');
  });

  it('cannot reach another family’s vault by id', async () => {
    const rows = await service.txAs(AARAV, (tx) =>
      tx.select().from(vaults).where(sql`id = ${BINA_VAULT}`),
    );

    // Asking for it directly is no different from listing: the row does not
    // exist as far as this connection is concerned.
    expect(rows).toHaveLength(0);
  });

  it('refuses to create a vault owned by somebody else', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(vaults).values({
        id: '01900000-0000-7000-8000-0000000cccc1',
        ownerId: BINA,
        name: 'not mine',
      }),
    );

    // Drizzle wraps driver errors, so its own message is only 'Failed query'.
    // The PostgreSQL error hides in `cause`, and the assertion is on its SQLSTATE
    // rather than its text: 42501 is insufficient_privilege, which is what a
    // WITH CHECK violation raises. Error strings are translated and reworded
    // between releases; the code is part of the protocol.
    await expect(attempt).rejects.toThrow();

    const error = await attempt.catch((e: unknown) => e);
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;

    expect(cause?.code).toBe('42501');
    expect(cause?.message).toMatch(/row-level security/i);
  });

  it('silently changes nothing when updating another family’s vault', async () => {
    const updated = await service.txAs(AARAV, (tx) =>
      tx
        .update(vaults)
        .set({ name: 'hijacked' })
        .where(sql`id = ${BINA_VAULT}`)
        .returning(),
    );

    // The documented trap: WITH CHECK raises, USING filters. This UPDATE does
    // not throw — it matches no rows. Every write handler must treat an empty
    // RETURNING as a refusal, or it will answer 200 for a change the database
    // discarded.
    expect(updated).toHaveLength(0);

    const { rows } = await ownerPool.query<{ name: string }>(
      'SELECT name FROM vaults WHERE id = $1',
      [BINA_VAULT],
    );
    expect(rows[0].name).toBe('Bina family');
  });

  it('does not leak the actor beyond its transaction', async () => {
    await service.txAs(AARAV, async (tx) => {
      await tx.select().from(vaults);
    });

    // The pool hands this connection to the next caller. If the actor survived
    // the transaction, that caller would inherit Aarav's identity.
    expect(ActorContext.userId()).toBeNull();

    const after = await service.tx((tx) => tx.select().from(vaults));
    expect(after).toHaveLength(0);
  });
});
