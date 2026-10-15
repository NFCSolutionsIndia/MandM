import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import {
  albums,
  mediaAssets,
  memories,
  memoryMembers,
} from '../src/db/schema/index.js';
import { connect, disconnect, pgCode, resetDatabase, type Harness } from './support/database.js';

/**
 * The archive — the first vault-scoped domain, and the first use of the role
 * hierarchy.
 *
 * Three people and two vaults:
 *
 *   Aarav      owner of the family vault
 *   Vikram     VIEWER of the same vault — may read everything, write nothing
 *   Bina       not a member at all, with a vault of her own
 *
 * Vikram is the interesting one. Every earlier test proved that an outsider
 * sees nothing; this proves that an *insider with the wrong role* also cannot
 * write, which is a boundary no amount of "they are in the vault" reasoning
 * should be allowed to blur.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const VIKRAM = '01900000-0000-7000-8000-00000000cc01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const FAMILY_VAULT = '01900000-0000-7000-8000-0000000aaaa1';
const BINA_VAULT = '01900000-0000-7000-8000-0000000bbbb1';

describe('archive domain', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let service: DbService;

  let memoryId: string;

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    service = harness.service;

    await resetDatabase(ownerPool);

    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES
         ($1,'a@example.com','Aarav'), ($2,'v@example.com','Vikram'), ($3,'b@example.com','Bina')`,
      [AARAV, VIKRAM, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES
         ($1,$2,'Family'), ($3,$4,'Bina family')`,
      [FAMILY_VAULT, AARAV, BINA_VAULT, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES
         ($1,$2,'owner'), ($1,$3,'viewer'), ($4,$5,'owner')`,
      [FAMILY_VAULT, AARAV, VIKRAM, BINA_VAULT, BINA],
    );

    const [created] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(memories)
        .values({
          vaultId: FAMILY_VAULT,
          authorId: AARAV,
          title: 'Aaji at the wedding',
          note: 'She wore the green sari.',
          occurredAt: new Date('1974-03-14T00:00:00Z'),
          occurredPrecision: 'year',
          clientId: '01900000-0000-7000-8000-00000000c101',
        })
        .returning(),
    );
    memoryId = created.id;
  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  it('keeps a memory inside its vault', async () => {
    const aarav = await service.txAs(AARAV, (tx) => tx.select().from(memories));
    const bina = await service.txAs(BINA, (tx) => tx.select().from(memories));

    expect(aarav).toHaveLength(1);
    expect(bina).toHaveLength(0);
  });

  it('lets a viewer read', async () => {
    const rows = await service.txAs(VIKRAM, (tx) => tx.select().from(memories));

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Aaji at the wedding');
  });

  it('refuses to let a viewer write', async () => {
    const attempt = service.txAs(VIKRAM, (tx) =>
      tx.insert(memories).values({
        vaultId: FAMILY_VAULT,
        authorId: VIKRAM,
        title: 'not allowed',
        occurredAt: new Date(),
        clientId: '01900000-0000-7000-8000-00000000c102',
      }),
    );

    // Membership is not permission. Reading and writing are separate grants,
    // and the role hierarchy is what separates them.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('refuses to attribute a memory to somebody else', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(memories).values({
        vaultId: FAMILY_VAULT,
        authorId: VIKRAM,
        title: 'planted',
        occurredAt: new Date(),
        clientId: '01900000-0000-7000-8000-00000000c103',
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('refuses to move a memory into a vault you do not belong to', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx
        .update(memories)
        .set({ vaultId: BINA_VAULT })
        .where(sql`id = ${memoryId}`)
        .returning(),
    );

    // This one RAISES rather than silently matching nothing, and the reason is
    // worth stating precisely: USING decides which existing rows the statement
    // may touch, WITH CHECK decides whether the resulting row is allowed.
    //
    // Aarav may edit this memory, so USING matches and the row is selected.
    // The NEW row names a vault he has no role in, so WITH CHECK rejects it —
    // and a WITH CHECK rejection is an error. An UPDATE is silent only when
    // USING filters the row out before it is ever considered.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');

    const { rows } = await ownerPool.query<{ vault_id: string }>(
      'SELECT vault_id FROM memories WHERE id = $1',
      [memoryId],
    );
    expect(rows[0].vault_id).toBe(FAMILY_VAULT);
  });

  it('makes an offline retry a conflict, not a duplicate', async () => {
    const duplicate = service.txAs(AARAV, (tx) =>
      tx.insert(memories).values({
        vaultId: FAMILY_VAULT,
        authorId: AARAV,
        title: 'the same moment, sent twice',
        occurredAt: new Date(),
        clientId: '01900000-0000-7000-8000-00000000c101', // the first memory's
      }),
    );

    // The outbox retries after an ambiguous failure. Without ux_memories_client
    // the user gets two copies of one moment and no way to tell which is which.
    await expect(duplicate).rejects.toThrow();
    expect(pgCode(await duplicate.catch((e: unknown) => e))).toBe('23505');
  });

  it('denies DELETE on memories to the application role entirely', async () => {
    const deleted = await service.txAs(AARAV, (tx) =>
      tx.delete(memories).where(sql`id = ${memoryId}`).returning(),
    );

    // No DELETE policy exists. Deletion is an UPDATE of deleted_at, and the
    // purge job that eventually issues a real DELETE runs under another role.
    // A request handler cannot destroy a family's archive even if it tries.
    expect(deleted).toHaveLength(0);

    const { rows } = await ownerPool.query('SELECT 1 FROM memories WHERE id = $1', [
      memoryId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('soft-deletes instead, and drops the row out of the timeline', async () => {
    await service.txAs(AARAV, (tx) =>
      tx
        .update(memories)
        .set({ deletedAt: new Date() })
        .where(sql`id = ${memoryId}`)
        .returning(),
    );

    const live = await service.txAs(AARAV, (tx) =>
      tx.select().from(memories).where(sql`deleted_at IS NULL`),
    );
    expect(live).toHaveLength(0);

    // Still there, still recoverable — the whole point of Trash.
    await service.txAs(AARAV, (tx) =>
      tx.update(memories).set({ deletedAt: null }).where(sql`id = ${memoryId}`).returning(),
    );
    const restored = await service.txAs(AARAV, (tx) =>
      tx.select().from(memories).where(sql`deleted_at IS NULL`),
    );
    expect(restored).toHaveLength(1);
  });

  it('refuses a media asset whose vault is not the one you may write', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(mediaAssets).values({
        memoryId,
        vaultId: BINA_VAULT, // denormalised, and therefore forgeable in a payload
        ownerId: AARAV,
        kind: 'image',
        mime: 'image/jpeg',
        bytes: 120_000n,
        storageKey: 'vault/bina/forged',
        checksumSha256: 'a'.repeat(64),
      }),
    );

    // The denormalised vault_id is what the policy reads, so it has to be
    // checked rather than trusted.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('rejects a negative byte count, which PostgreSQL has no unsigned type for', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(mediaAssets).values({
        memoryId,
        vaultId: FAMILY_VAULT,
        ownerId: AARAV,
        kind: 'image',
        mime: 'image/jpeg',
        bytes: -1n,
        storageKey: 'vault/family/negative',
        checksumSha256: 'b'.repeat(64),
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  it('refuses an album whose end date precedes its start', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(albums).values({
        vaultId: FAMILY_VAULT,
        ownerId: AARAV,
        name: 'backwards',
        startDate: '2024-06-01',
        endDate: '2024-05-01',
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  it('refuses to tag another user’s member in your memory', async () => {
    const { rows } = await ownerPool.query<{ id: string }>(
      `INSERT INTO members (id, owner_id, name) VALUES (gen_random_uuid(), $1, 'Bina''s aunt') RETURNING id`,
      [BINA],
    );
    const binaMember = rows[0].id;

    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(memoryMembers).values({ memoryId, memberId: binaMember }),
    );

    // The one policy spanning two ownership models: permission to write the
    // memory AND ownership of the person. A shared vault must not become a way
    // to enumerate another family's address book.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('refuses a confidence score on a manual tag', async () => {
    const { rows } = await ownerPool.query<{ id: string }>(
      `INSERT INTO members (id, owner_id, name) VALUES (gen_random_uuid(), $1, 'Aaji') RETURNING id`,
      [AARAV],
    );

    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(memoryMembers).values({
        memoryId,
        memberId: rows[0].id,
        source: 'manual',
        confidence: '0.900',
      }),
    );

    // A person's statement is not a probability. Allowing both would let a
    // suggestion masquerade as a confirmation.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  it('preserves the date a memory happened, not the date it was uploaded', async () => {
    const [row] = await service.txAs(AARAV, (tx) =>
      tx.select().from(memories).where(sql`id = ${memoryId}`),
    );

    // The whole premise: a 1974 photograph belongs in 1974.
    expect(row.occurredAt.getUTCFullYear()).toBe(1974);
    expect(row.occurredPrecision).toBe('year');
    expect(row.createdAt.getUTCFullYear()).toBeGreaterThan(2020);
  });
});
