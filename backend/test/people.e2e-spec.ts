import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import { eventMembers, events, members } from '../src/db/schema/index.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * The people domain is owner-scoped, and that is the thing to prove.
 *
 * Every other domain so far is reachable through a vault. These tables are not:
 * a member is a record about a real person who never consented to being in this
 * database, written by somebody else. Two users in the *same* vault must still
 * be unable to read each other's members — which is a different boundary from
 * the one `vault_members` enforces, and so needs its own test.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const BINA = '01900000-0000-7000-8000-00000000bb01';

describe('people domain', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let service: DbService;

  let aaravMember: string;
  let binaMember: string;
  let aaravEvent: string;

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    service = harness.service;

    await resetDatabase(ownerPool);
    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES
         ($1, 'a@example.com', 'Aarav'),
         ($2, 'b@example.com', 'Bina')`,
      [AARAV, BINA],
    );

    const mine = await service.txAs(AARAV, (tx) =>
      tx
        .insert(members)
        .values({ ownerId: AARAV, name: 'Aaji', relationship: 'grandmother' })
        .returning(),
    );
    aaravMember = mine[0].id;

    const theirs = await service.txAs(BINA, (tx) =>
      tx
        .insert(members)
        .values({ ownerId: BINA, name: 'Nana', relationship: 'grandfather' })
        .returning(),
    );
    binaMember = theirs[0].id;

    const ev = await service.txAs(AARAV, (tx) =>
      tx
        .insert(events)
        .values({
          ownerId: AARAV,
          title: "Aaji's birthday",
          type: 'birthday',
          eventDate: '1948-03-14',
          recurrence: 'yearly',
        })
        .returning(),
    );
    aaravEvent = ev[0].id;
  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  it('shows each owner only their own members', async () => {
    const aaravSees = await service.txAs(AARAV, (tx) => tx.select().from(members));
    const binaSees = await service.txAs(BINA, (tx) => tx.select().from(members));

    expect(aaravSees.map((m) => m.name)).toEqual(['Aaji']);
    expect(binaSees.map((m) => m.name)).toEqual(['Nana']);
  });

  it('hides another owner’s member even when asked for by id', async () => {
    const rows = await service.txAs(AARAV, (tx) =>
      tx.select().from(members).where(sql`id = ${binaMember}`),
    );

    // Holding the id is not access. This is the assertion that would fail if
    // the policy filtered lists but not point reads.
    expect(rows).toHaveLength(0);
  });

  it('refuses to create a member owned by somebody else', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(members).values({ ownerId: BINA, name: 'planted' }),
    );

    await expect(attempt).rejects.toThrow();
    const err = await attempt.catch((e: unknown) => e);
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('42501');
  });

  it('refuses to link another owner’s member to your event', async () => {
    // Both sides are checked on write. The id is unguessable in practice, but
    // "they could not have known it" is not an access control.
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(eventMembers).values({ eventId: aaravEvent, memberId: binaMember }),
    );

    await expect(attempt).rejects.toThrow();
    const err = await attempt.catch((e: unknown) => e);
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('42501');
  });

  it('links your own member to your own event', async () => {
    const linked = await service.txAs(AARAV, (tx) =>
      tx
        .insert(eventMembers)
        .values({ eventId: aaravEvent, memberId: aaravMember })
        .returning(),
    );

    expect(linked).toHaveLength(1);
  });

  it('keeps a birthday on its calendar date, with no timezone drift', async () => {
    const [row] = await service.txAs(AARAV, (tx) =>
      tx.select().from(events).where(sql`id = ${aaravEvent}`),
    );

    // `date`, not `timestamptz`. Stored as 1948-03-14 and read back as
    // 1948-03-14 regardless of the server's zone — an instant would come back
    // as the 13th for anyone west of UTC.
    expect(row.eventDate).toBe('1948-03-14');
  });

  it('rejects a reminder channel that is not a real channel', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.execute(
        sql`INSERT INTO event_reminders (id, event_id, offset_days, channels)
            VALUES (gen_random_uuid(), ${aaravEvent}, 7, ARRAY['pigeon']::text[])`,
      ),
    );

    // 23514 is check_violation. A comma-separated string column could not have
    // caught this — the database would have stored 'pigeon' without complaint.
    await expect(attempt).rejects.toThrow();
    const err = await attempt.catch((e: unknown) => e);
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('23514');
  });

  it('refuses a second reminder at the same offset', async () => {
    await service.txAs(AARAV, (tx) =>
      tx.execute(
        sql`INSERT INTO event_reminders (id, event_id, offset_days)
            VALUES (gen_random_uuid(), ${aaravEvent}, 1)`,
      ),
    );

    const duplicate = service.txAs(AARAV, (tx) =>
      tx.execute(
        sql`INSERT INTO event_reminders (id, event_id, offset_days)
            VALUES (gen_random_uuid(), ${aaravEvent}, 1)`,
      ),
    );

    // Without this constraint, editing a reminder by inserting a new one
    // quietly doubles the notification.
    await expect(duplicate).rejects.toThrow();
    const err = await duplicate.catch((e: unknown) => e);
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('23505');
  });

  it('refuses to merge a member into itself', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.execute(
        sql`UPDATE members SET merged_into_id = ${aaravMember} WHERE id = ${aaravMember}`,
      ),
    );

    // A self-merge would make duplicate resolution loop forever.
    await expect(attempt).rejects.toThrow();
    const err = await attempt.catch((e: unknown) => e);
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('23514');
  });

  it('maintains updated_at by trigger, not only through the ORM', async () => {
    const before = await ownerPool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM members WHERE id = $1',
      [aaravMember],
    );

    // Raw SQL, bypassing Drizzle's $onUpdate hook entirely — which is the whole
    // reason the trigger exists.
    await ownerPool.query('UPDATE members SET name = $2 WHERE id = $1', [
      aaravMember,
      'Aaji (Pune)',
    ]);

    const after = await ownerPool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM members WHERE id = $1',
      [aaravMember],
    );

    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(
      before.rows[0].updated_at.getTime(),
    );
  });
});
