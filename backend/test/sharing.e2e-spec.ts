import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import {
  albums,
  memories,
  notificationPreferences,
  notifications,
  shares,
} from '../src/db/schema/index.js';
import {
  connect,
  disconnect,
  pgCode,
  resetDatabase,
  type Harness,
} from './support/database.js';

/**
 * Sharing — how things leave the vault — and notifications.
 *
 * Two of these tests are about holes rather than features: a polymorphic
 * reference that no foreign key can guard, and a "you cannot switch this off"
 * rule that is worthless if it lives only in the UI.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const VIKRAM = '01900000-0000-7000-8000-00000000cc01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const FAMILY_VAULT = '01900000-0000-7000-8000-0000000aaaa1';
const BINA_VAULT = '01900000-0000-7000-8000-0000000bbbb1';

const token = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('sharing domain', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let appPool: Pool;
  let service: DbService;

  let aaravMemory: string;
  let binaMemory: string;
  let shareId: string;

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
      `INSERT INTO vaults (id, owner_id, name) VALUES ($1,$2,'Family'), ($3,$4,'Bina family')`,
      [FAMILY_VAULT, AARAV, BINA_VAULT, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES
         ($1,$2,'owner'), ($1,$3,'admin'), ($4,$5,'owner')`,
      [FAMILY_VAULT, AARAV, VIKRAM, BINA_VAULT, BINA],
    );

    const [mine] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(memories)
        .values({
          vaultId: FAMILY_VAULT,
          authorId: AARAV,
          title: 'The wedding',
          occurredAt: new Date(),
          clientId: '01900000-0000-7000-8000-00000000e101',
        })
        .returning(),
    );
    aaravMemory = mine.id;

    const [theirs] = await service.txAs(BINA, (tx) =>
      tx
        .insert(memories)
        .values({
          vaultId: BINA_VAULT,
          authorId: BINA,
          title: 'Not for you',
          occurredAt: new Date(),
          clientId: '01900000-0000-7000-8000-00000000e102',
        })
        .returning(),
    );
    binaMemory = theirs.id;
  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  // ── the polymorphic hole ──────────────────────────────────────────────────

  it('refuses a share naming another family’s memory', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(shares).values({
        vaultId: FAMILY_VAULT, // his own vault, so the RLS policy passes
        ownerId: AARAV,
        resourceType: 'memory',
        resourceId: binaMemory, // but somebody else's memory
        tokenHash: token('forged'),
      }),
    );

    // This is the test that matters in this file. No foreign key can point at
    // one of two tables, so row-level security alone would have allowed it:
    // the policy compares vault_id, and vault_id is whatever the client sent.
    // A trigger checks that the resource actually lives in the stated vault.
    await expect(attempt).rejects.toThrow();
    const error = await attempt.catch((e: unknown) => e);
    expect(pgCode(error)).toBe('23503');
  });

  it('refuses a share naming a resource that does not exist at all', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(shares).values({
        vaultId: FAMILY_VAULT,
        ownerId: AARAV,
        resourceType: 'album',
        resourceId: '01900000-0000-7000-8000-00000000ffff',
        tokenHash: token('ghost'),
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23503');
  });

  it('accepts a share of your own memory', async () => {
    const [created] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(shares)
        .values({
          vaultId: FAMILY_VAULT,
          ownerId: AARAV,
          resourceType: 'memory',
          resourceId: aaravMemory,
          tokenHash: token('the-real-link'),
          permission: 'view',
        })
        .returning(),
    );

    shareId = created.id;
    expect(created.allowDownload).toBe(false); // the stronger grant is opt-in
    expect(created.viewCount).toBe(0);
  });

  // ── the link holder with no account ───────────────────────────────────────

  it('resolves a live link for somebody with no account', async () => {
    const { rows } = await appPool.query<{ resource_id: string }>(
      'SELECT * FROM app_resolve_share($1)',
      [token('the-real-link')],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].resource_id).toBe(aaravMemory);
  });

  it('counts the view, because the owner is shown the number', async () => {
    await appPool.query('SELECT app_record_share_view($1)', [
      token('the-real-link'),
    ]);

    const [row] = await service.txAs(AARAV, (tx) =>
      tx.select().from(shares).where(sql`id = ${shareId}`),
    );

    // Control over a link is only meaningful if it is verifiable.
    expect(row.viewCount).toBe(1);
    expect(row.lastViewedAt).not.toBeNull();
  });

  it('kills the link the instant it is revoked', async () => {
    await service.txAs(AARAV, (tx) =>
      tx
        .update(shares)
        .set({ revokedAt: new Date() })
        .where(sql`id = ${shareId}`)
        .returning(),
    );

    const { rows } = await appPool.query('SELECT * FROM app_resolve_share($1)', [
      token('the-real-link'),
    ]);

    // Revocation is immediate. Real-world exposure after this point is bounded
    // by the five-minute signed-media TTL, which is why that TTL is never
    // raised for convenience.
    expect(rows).toHaveLength(0);
  });

  it('keeps the revoked link in the owner’s list', async () => {
    const rows = await service.txAs(AARAV, (tx) =>
      tx.select().from(shares).where(sql`id = ${shareId}`),
    );

    // There is no DELETE policy. The owner needs to see that the link existed,
    // and that it was opened once before they killed it — deleting the row
    // would erase the evidence of an exposure.
    expect(rows).toHaveLength(1);
    expect(rows[0].revokedAt).not.toBeNull();
    expect(rows[0].viewCount).toBe(1);
  });

  it('lets a vault admin revoke somebody else’s link', async () => {
    const [live] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(shares)
        .values({
          vaultId: FAMILY_VAULT,
          ownerId: AARAV,
          resourceType: 'memory',
          resourceId: aaravMemory,
          tokenHash: token('second-link'),
        })
        .returning(),
    );

    const revoked = await service.txAs(VIKRAM, (tx) =>
      tx
        .update(shares)
        .set({ revokedAt: new Date() })
        .where(sql`id = ${live.id}`)
        .returning(),
    );

    // Unlike a capsule, a share is not a promise to a third party — it is an
    // open door, and whoever is responsible for the vault must be able to
    // close it.
    expect(revoked).toHaveLength(1);
  });

  it('shows a stranger no links at all', async () => {
    const rows = await service.txAs(BINA, (tx) => tx.select().from(shares));
    expect(rows).toHaveLength(0);
  });

  // ── notifications ─────────────────────────────────────────────────────────

  it('cannot be made to invent a notification', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(notifications).values({
        userId: AARAV,
        type: 'security_alert',
        payload: { message: 'your account is fine, honestly' },
      }),
    );

    // Notifications are written by background jobs under their own role. A
    // request handler cannot invent one, so the product cannot be made to tell
    // a user something it never decided.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('lets a user read and mark their own notifications', async () => {
    await ownerPool.query(
      `INSERT INTO notifications (id, user_id, type, payload)
       VALUES (gen_random_uuid(), $1, 'capsule_delivered', '{"capsuleId":"x"}')`,
      [AARAV],
    );

    const unread = await service.txAs(AARAV, (tx) => tx.select().from(notifications));
    expect(unread).toHaveLength(1);

    const marked = await service.txAs(AARAV, (tx) =>
      tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(sql`id = ${unread[0].id}`)
        .returning(),
    );
    expect(marked).toHaveLength(1);

    const stranger = await service.txAs(BINA, (tx) => tx.select().from(notifications));
    expect(stranger).toHaveLength(0);
  });

  // ── the rule that must not live only in the UI ────────────────────────────

  it('derives suppressible from the type, and refuses to let it be set', async () => {
    const [pref] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(notificationPreferences)
        .values({ userId: AARAV, type: 'capsule_delivered' })
        .returning(),
    );
    expect(pref.suppressible).toBe(true);

    const [locked] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(notificationPreferences)
        .values({ userId: AARAV, type: 'security_alert' })
        .returning(),
    );
    expect(locked.suppressible).toBe(false);

    // A generated column cannot be written at all, so no row can ever claim a
    // security alert is optional.
    const attempt = service.txAs(AARAV, (tx) =>
      tx.execute(
        sql`UPDATE notification_preferences SET suppressible = true
            WHERE user_id = ${AARAV} AND type = 'security_alert'`,
      ),
    );
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('428C9');
  });

  it('refuses to switch off a notification that may not be switched off', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx
        .update(notificationPreferences)
        .set({ pushEnabled: false, emailEnabled: false })
        .where(sql`user_id = ${AARAV} AND type = 'security_alert'`)
        .returning(),
    );

    // Without this the lock is a label the UI is trusted to respect. A security
    // alert nobody receives is worse than none at all, because the product
    // believes it warned them.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  it('allows switching off one that may be', async () => {
    const quiet = await service.txAs(AARAV, (tx) =>
      tx
        .update(notificationPreferences)
        .set({ pushEnabled: false, emailEnabled: false })
        .where(sql`user_id = ${AARAV} AND type = 'capsule_delivered'`)
        .returning(),
    );

    expect(quiet).toHaveLength(1);
    expect(quiet[0].pushEnabled).toBe(false);
  });

  it('refuses half a quiet-hours window', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx
        .update(notificationPreferences)
        .set({ quietHoursStart: '22:00:00' })
        .where(sql`user_id = ${AARAV} AND type = 'capsule_delivered'`)
        .returning(),
    );

    // One bound without the other describes no window, and the job would have
    // to guess.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  it('accepts a whole one', async () => {
    const set = await service.txAs(AARAV, (tx) =>
      tx
        .update(notificationPreferences)
        .set({ quietHoursStart: '22:00:00', quietHoursEnd: '07:00:00' })
        .where(sql`user_id = ${AARAV} AND type = 'capsule_delivered'`)
        .returning(),
    );

    // `time`, not `timestamptz`: "do not wake me between 22:00 and 07:00" is a
    // wall-clock rule that travels with the person.
    expect(set[0].quietHoursStart).toBe('22:00:00');
  });

  it('shares an album too, not only a memory', async () => {
    const [album] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(albums)
        .values({ vaultId: FAMILY_VAULT, ownerId: AARAV, name: 'The wedding' })
        .returning(),
    );

    const [shared] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(shares)
        .values({
          vaultId: FAMILY_VAULT,
          ownerId: AARAV,
          resourceType: 'album',
          resourceId: album.id,
          tokenHash: token('album-link'),
          permission: 'contribute',
          allowDownload: true,
        })
        .returning(),
    );

    // `contribute` is how a wedding album collects photographs from forty
    // guests who will never sign up.
    expect(shared.permission).toBe('contribute');
  });
});
