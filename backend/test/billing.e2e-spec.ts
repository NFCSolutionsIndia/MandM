import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import {
  capsules,
  payments,
  subscriptions,
} from '../src/db/schema/index.js';
import {
  connect,
  disconnect,
  pgCode,
  resetDatabase,
  type Harness,
} from './support/database.js';

/**
 * Billing, and the commitment it has to survive.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Commitment 05: a promise is never cancelled for non-payment.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The tests below check the two halves of that separately: that a lapsed
 * subscription still records what was granted, and that a sealed capsule is
 * untouched by the lapse.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const FAMILY_VAULT = '01900000-0000-7000-8000-0000000aaaa1';

describe('billing domain', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let appPool: Pool;
  let service: DbService;

  let subscriptionId: string;
  let capsuleId: string;

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    appPool = harness.appPool;
    service = harness.service;

    await resetDatabase(ownerPool);

    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES ($1,'a@example.com','Aarav'), ($2,'b@example.com','Bina')`,
      [AARAV, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES ($1,$2,'Family')`,
      [FAMILY_VAULT, AARAV],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1,$2,'owner')`,
      [FAMILY_VAULT, AARAV],
    );

    // Written as the OWNER, the way the webhook handler will — the API has no
    // write policy on any table in this domain.
    const { rows } = await ownerPool.query<{ id: string }>(
      `INSERT INTO subscriptions
         (id, user_id, plan, status, currency, region,
          storage_quota_bytes, max_pending_capsules, max_capsule_horizon_days, max_video_seconds)
       VALUES (gen_random_uuid(), $1, 'premium', 'active', 'INR', 'IN',
               214748364800, NULL, NULL, 600)
       RETURNING id`,
      [AARAV],
    );
    subscriptionId = rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  // ── the posture: read-only to the API ─────────────────────────────────────

  it('lets a user read their own subscription', async () => {
    const rows = await service.txAs(AARAV, (tx) => tx.select().from(subscriptions));

    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe('premium');
  });

  it('shows a stranger nothing', async () => {
    const rows = await service.txAs(BINA, (tx) => tx.select().from(subscriptions));
    expect(rows).toHaveLength(0);
  });

  it('refuses to let the API grant itself a plan', async () => {
    const attempt = service.txAs(BINA, (tx) =>
      tx.insert(subscriptions).values({
        userId: BINA,
        plan: 'family',
        status: 'active',
        currency: 'INR',
        region: 'IN',
      }),
    );

    // There is no INSERT policy anywhere in this domain. An entitlement the
    // user did not pay for is the same bug as a charge they did not make, only
    // quieter.
    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('refuses to let a user upgrade themselves', async () => {
    const upgraded = await service.txAs(AARAV, (tx) =>
      tx
        .update(subscriptions)
        .set({ plan: 'family', maxVideoSeconds: 9999 })
        .where(sql`id = ${subscriptionId}`)
        .returning(),
    );

    // Silent: there is no UPDATE policy, so USING matches nothing.
    expect(upgraded).toHaveLength(0);

    const { rows } = await ownerPool.query<{ plan: string }>(
      'SELECT plan FROM subscriptions WHERE id = $1',
      [subscriptionId],
    );
    expect(rows[0].plan).toBe('premium');
  });

  // ── the money ledger ──────────────────────────────────────────────────────

  it('makes a replayed webhook harmless', async () => {
    await ownerPool.query(
      `INSERT INTO payments (id, user_id, subject_type, subject_id, gateway, gateway_ref, amount, fee, currency, status)
       VALUES (gen_random_uuid(), $1, 'subscription', $2, 'razorpay', 'evt_abc123', 49900, 1150, 'INR', 'captured')`,
      [AARAV, subscriptionId],
    );

    // Providers deliver at least once and resend after any ambiguous response.
    const replay = ownerPool.query(
      `INSERT INTO payments (id, user_id, subject_type, subject_id, gateway, gateway_ref, amount, fee, currency, status)
       VALUES (gen_random_uuid(), $1, 'subscription', $2, 'razorpay', 'evt_abc123', 49900, 1150, 'INR', 'captured')`,
      [AARAV, subscriptionId],
    );

    // Without the unique key this is a second row, a double-counted payment,
    // and a support ticket about a charge that never happened.
    await expect(replay).rejects.toMatchObject({ code: '23505' });
  });

  it('lets the same event id exist on the other gateway', async () => {
    // The key is (gateway, gateway_ref), not gateway_ref alone. Stripe and
    // Razorpay have independent id spaces and will eventually collide.
    const other = await ownerPool.query(
      `INSERT INTO payments (id, user_id, subject_type, gateway, gateway_ref, amount, currency, status)
       VALUES (gen_random_uuid(), $1, 'order', 'stripe', 'evt_abc123', 1000, 'USD', 'captured')
       RETURNING id`,
      [AARAV],
    );
    expect(other.rows).toHaveLength(1);
  });

  it('refuses a fee larger than the payment it came from', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO payments (id, user_id, subject_type, gateway, gateway_ref, amount, fee, currency, status)
       VALUES (gen_random_uuid(), $1, 'order', 'stripe', 'evt_bad_fee', 1000, 5000, 'USD', 'captured')`,
      [AARAV],
    );

    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('allows a refund as a negative row', async () => {
    const refund = await ownerPool.query(
      `INSERT INTO payments (id, user_id, subject_type, gateway, gateway_ref, amount, fee, currency, status)
       VALUES (gen_random_uuid(), $1, 'subscription', 'razorpay', 'evt_refund_1', -49900, -1150, 'INR', 'refunded')
       RETURNING amount`,
      [AARAV],
    );

    // A refund is its own row, so the ledger stays append-only and the history
    // of what happened is readable in order.
    expect(Number(refund.rows[0].amount)).toBe(-49900);
  });

  it('shows a user their receipts and nobody else’s', async () => {
    const mine = await service.txAs(AARAV, (tx) => tx.select().from(payments));
    expect(mine.length).toBeGreaterThan(0);

    const theirs = await service.txAs(BINA, (tx) => tx.select().from(payments));
    expect(theirs).toHaveLength(0);
  });

  it('refuses to let a user rewrite a receipt', async () => {
    const edited = await service.txAs(AARAV, (tx) =>
      tx.update(payments).set({ amount: 1n }).returning(),
    );

    // A ledger that can be rewritten is not a ledger.
    expect(edited).toHaveLength(0);
  });

  it('refuses a currency that is not a currency', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO payments (id, user_id, subject_type, gateway, gateway_ref, amount, currency, status)
       VALUES (gen_random_uuid(), $1, 'order', 'stripe', 'evt_bad_ccy', 100, 'rupees', 'captured')`,
      [AARAV],
    );

    await expect(attempt).rejects.toThrow();
  });

  // ── commitment 05 ─────────────────────────────────────────────────────────

  it('keeps a sealed promise when the subscription lapses', async () => {
    const [capsule] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(capsules)
        .values({
          vaultId: FAMILY_VAULT,
          ownerId: AARAV,
          title: 'For her eighteenth',
          unlockKind: 'datetime',
          unlockAt: new Date('2044-03-14T03:30:00Z'),
          unlockTimezone: 'Asia/Kolkata',
          state: 'sealed',
          sealedAt: new Date(),
        })
        .returning(),
    );
    capsuleId = capsule.id;

    // The card fails. The subscription expires.
    await ownerPool.query(
      `UPDATE subscriptions SET status = 'expired', plan = 'free' WHERE id = $1`,
      [subscriptionId],
    );

    const [after] = await service.txAs(AARAV, (tx) =>
      tx.select().from(capsules).where(sql`id = ${capsuleId}`),
    );

    // Nothing in the delivery path reads the billing domain at all, so there is
    // no code by which a lapsed card could cancel a message from somebody's
    // dead father.
    expect(after.state).toBe('sealed');
    expect(after.unlockAt?.toISOString()).toBe('2044-03-14T03:30:00.000Z');
    expect(after.cancelledAt).toBeNull();
  });

  it('still records what the lapsed subscription had granted', async () => {
    const [row] = await service.txAs(AARAV, (tx) => tx.select().from(subscriptions));

    // Entitlements are columns on the row, not a lookup against a price book.
    // The row has lapsed and still says what was promised, which is what makes
    // an existing obligation legible after the money stops.
    expect(row.status).toBe('expired');
    expect(Number(row.storageQuotaBytes)).toBe(214748364800);
    expect(row.maxVideoSeconds).toBe(600);
  });

  it('asks the entitlement question only in the sealing direction', async () => {
    const { rows } = await appPool.query<{
      max_pending_capsules: number | null;
      pending_now: string;
    }>('SELECT * FROM app_sealing_entitlement($1)', [AARAV]);

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].pending_now)).toBe(1);

    // There is deliberately no function asking whether an ALREADY SEALED
    // capsule is still entitled. Such a function is the thing that would
    // eventually get called in the delivery worker.
    const { rows: fns } = await ownerPool.query<{ proname: string }>(
      `SELECT proname FROM pg_proc WHERE proname LIKE 'app_%entitle%'`,
    );
    expect(fns.map((f) => f.proname)).toEqual(['app_sealing_entitlement']);
  });

  it('refuses nonsensical entitlements', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, currency, region, seats, max_video_seconds)
       VALUES (gen_random_uuid(), $1, 'family', 'active', 'INR', 'IN', 0, 600)`,
      [BINA],
    );

    // Zero seats is a plan nobody can use, and a column that permits it is a
    // column somebody will eventually write.
    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('treats NULL as unlimited rather than inventing a sentinel', async () => {
    const [row] = await service.txAs(AARAV, (tx) => tx.select().from(subscriptions));

    // Not -1, not 999999. A sentinel is a number somebody eventually compares
    // against, and then "unlimited" quietly becomes a limit.
    expect(row.maxPendingCapsules).toBeNull();
    expect(row.maxCapsuleHorizonDays).toBeNull();
  });
});
