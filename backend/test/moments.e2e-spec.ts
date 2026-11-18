import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import pg from 'pg';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { upcomingSql } from '../src/moments/moments.service.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * BE-06 — upcoming moments for the Home screen.
 *
 * The application clock is frozen (Date only — timers and the database are
 * real), because "in 7 days" and "already tomorrow in Kolkata" are claims
 * about a particular instant. Seeds are written relative to that instant.
 */
describe('upcoming moments, end to end', () => {
  let app: INestApplication;
  let harness: Harness;

  const CODE = '424242';
  /** 15:30 in Kolkata, 03:00 in Los Angeles. */
  const NOON_UTC = new Date('2026-06-15T10:00:00.000Z');
  /** Already 16 June in Kolkata (05:00), still 15 June in Los Angeles (16:30). */
  const LATE_UTC = new Date('2026-06-15T23:30:00.000Z');

  async function signUp(email: string): Promise<{ token: string; id: string }> {
    await harness.ownerPool.query(
      `INSERT INTO email_otps (id, email, code_hash, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now() + interval '10 minutes')`,
      [email, hashToken(CODE)],
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email, code: CODE })
      .expect(200);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  const upcoming = (token: string, query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/moments/upcoming${query}`)
      .set('Authorization', `Bearer ${token}`);

  const q = (text: string, params: unknown[] = []) => harness.ownerPool.query(text, params);

  async function member(
    owner: string,
    name: string,
    fields: { birthday?: string; precision?: string; anniversary?: string; merged?: string } = {},
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO members (id, owner_id, name, birthday, birthday_precision, anniversary, merged_into_id)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6) RETURNING id`,
      [owner, name, fields.birthday ?? null, fields.precision ?? null,
        fields.anniversary ?? null, fields.merged ?? null],
    );
    return rows[0].id;
  }

  async function event(
    owner: string,
    title: string,
    date: string,
    fields: { type?: string; recurrence?: string; archived?: boolean; members?: string[] } = {},
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO events (id, owner_id, title, type, event_date, recurrence, archived_at)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6) RETURNING id`,
      [owner, title, fields.type ?? 'custom', date, fields.recurrence ?? 'none',
        fields.archived ? new Date() : null],
    );
    for (const m of fields.members ?? []) {
      await q(`INSERT INTO event_members (event_id, member_id) VALUES ($1, $2)`, [rows[0].id, m]);
    }
    return rows[0].id;
  }

  async function vault(owner: string): Promise<string> {
    const { rows } = await q(
      `INSERT INTO vaults (id, owner_id, name) VALUES (uuid_generate_v7(), $1, 'Family') RETURNING id`,
      [owner],
    );
    await q(`INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1, $2, 'owner')`, [rows[0].id, owner]);
    return rows[0].id;
  }

  async function capsule(
    vaultId: string,
    owner: string,
    title: string | null,
    fields: { unlockAt?: string; state?: string; milestoneMember?: string; spec?: unknown; delivered?: boolean },
  ): Promise<string> {
    const milestone = fields.milestoneMember !== undefined;
    const { rows } = await q(
      `INSERT INTO capsules (id, vault_id, owner_id, title, state, unlock_kind, unlock_at,
                             unlock_timezone, milestone_member_id, milestone_spec, sealed_at, delivered_at)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6, 'Asia/Kolkata', $7, $8, now(), $9)
       RETURNING id`,
      [vaultId, owner, title, fields.state ?? 'sealed', milestone ? 'milestone' : 'datetime',
        fields.unlockAt ?? null, fields.milestoneMember ?? null,
        fields.spec === undefined ? null : JSON.stringify(fields.spec),
        fields.delivered ? new Date() : null],
    );
    return rows[0].id;
  }

  let aarav: { token: string; id: string };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    harness = await connect();
    await resetDatabase(harness.ownerPool);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    aarav = await signUp('aarav@example.com'); // Asia/Kolkata, the default
    const other = await signUp('other@example.com');
    const v = await vault(aarav.id);
    const otherVault = await vault(other.id);

    // ── Steps to reproduce, seed 1, as seen from 15 June 2026 ───────────────
    ids.mom = await member(aarav.id, 'Mom', { birthday: '1960-06-22', precision: 'day' });   // 7 days
    ids.ravi = await member(aarav.id, 'Ravi', { birthday: '1985-07-25', anniversary: '2010-09-10' }); // 40, 87
    ids.capsule3 = await capsule(v, aarav.id, 'Open on Thursday', {
      unlockAt: '2026-06-18T04:30:00.000Z', // 10:00 IST, 3 days
    });
    ids.event10 = await event(aarav.id, 'Housewarming', '2026-06-25'); // 10 days
    // Three far-off ones.
    ids.wedding = await event(aarav.id, 'Parents’ wedding', '1990-12-01', { type: 'anniversary', recurrence: 'yearly' });
    ids.kid = await member(aarav.id, 'Aarav Jr', { birthday: '2012-05-04', precision: 'exact' }); // 2027-05-04
    ids.milestone = await capsule(v, aarav.id, 'For Aarav Jr at 18', {
      milestoneMember: ids.kid, spec: 'age:18', // 2030-05-04
    });

    // A birthday event for someone with no birthday on their record: kept.
    ids.grandpa = await member(aarav.id, 'Grandpa');
    ids.grandpaEvent = await event(aarav.id, 'Grandpa’s 80th', '1946-08-30', {
      type: 'birthday', recurrence: 'yearly', members: [ids.grandpa],
    });

    // ── Things that must NOT appear ─────────────────────────────────────────
    await event(aarav.id, 'Mom’s birthday party', '1960-06-22', {
      type: 'birthday', recurrence: 'yearly', members: [ids.mom], // duplicate of Mom's record
    });
    await event(aarav.id, 'Last week', '2026-06-08');
    await event(aarav.id, 'Archived', '2026-06-20', { archived: true });
    await member(aarav.id, 'Year only', { birthday: '1950-06-16', precision: 'year' });
    await member(aarav.id, 'Merged away', { birthday: '1960-06-16', merged: ids.mom });
    await capsule(v, aarav.id, 'Draft', { unlockAt: '2026-06-16T00:00:00Z', state: 'draft' });
    await capsule(v, aarav.id, 'Delivered', { unlockAt: '2026-06-16T00:00:00Z', delivered: true });
    await member(other.id, 'Not mine', { birthday: '1990-06-16' });
    await capsule(otherVault, other.id, 'Not mine either', { unlockAt: '2026-06-16T00:00:00Z' });
  }, 90_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  function at(instant: Date) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instant);
  }

  it('step 2: exactly 5 items, in the order 3, 7, 10, 40 days, …', async () => {
    at(NOON_UTC);
    const res = await upcoming(aarav.token).expect(200);
    expect(res.body.items.map((i: { daysLeft: number }) => i.daysLeft)).toEqual([3, 7, 10, 40, 76]);
    expect(res.body.items[0]).toMatchObject({
      type: 'capsule', id: ids.capsule3, source: 'capsule', title: 'Open on Thursday',
      date: '2026-06-18', daysLeft: 3, person: null,
    });
    expect(res.body.items[1]).toMatchObject({
      type: 'birthday', id: ids.mom, source: 'person', title: "Mom's birthday", date: '2026-06-22',
      person: { id: ids.mom, name: 'Mom', avatarUrl: null, deceased: false },
    });
    expect(res.body.items[2]).toMatchObject({ type: 'event', id: ids.event10, title: 'Housewarming' });
    expect(res.body.items[3]).toMatchObject({ type: 'birthday', id: ids.ravi, date: '2026-07-25' });
    // Grandpa's yearly birthday event, 30 August: 76 days.
    expect(res.body.items[4]).toMatchObject({
      type: 'birthday', id: ids.grandpaEvent, source: 'event',
      person: { id: ids.grandpa, name: 'Grandpa' },
    });
  });

  it('everything, with ?limit=20, and nothing that should not be there', async () => {
    at(NOON_UTC);
    const res = await upcoming(aarav.token, '?limit=20').expect(200);
    const seen = res.body.items.map((i: { title: string; date: string }) => `${i.date} ${i.title}`);
    expect(seen).toEqual([
      '2026-06-18 Open on Thursday',
      "2026-06-22 Mom's birthday",
      '2026-06-25 Housewarming',
      "2026-07-25 Ravi's birthday",
      '2026-08-30 Grandpa’s 80th',
      "2026-09-10 Ravi's anniversary",
      '2026-12-01 Parents’ wedding',
      "2027-05-04 Aarav Jr's birthday",
      '2030-05-04 For Aarav Jr at 18',
    ]);
    const milestone = res.body.items.at(-1);
    expect(milestone).toMatchObject({ type: 'capsule', person: { id: ids.kid, name: 'Aarav Jr' } });
    expect(res.body.items.find((i: { type: string; title: string }) => i.type === 'anniversary' && i.title === 'Parents’ wedding'))
      .toMatchObject({ source: 'event', person: null });
  });

  it('timezone: at 23:30 UTC it is already tomorrow in Asia/Kolkata', async () => {
    at(LATE_UTC);
    const res = await upcoming(aarav.token).expect(200);
    // 16 June in Kolkata: the capsule is 2 days off, Mom's birthday 6.
    expect(res.body.items.slice(0, 2).map((i: { daysLeft: number }) => i.daysLeft)).toEqual([2, 6]);
  });

  it('timezone: …and still today in America/Los_Angeles', async () => {
    await q(`UPDATE users SET timezone = 'America/Los_Angeles' WHERE id = $1`, [aarav.id]);
    try {
      at(LATE_UTC);
      const res = await upcoming(aarav.token).expect(200);
      // 15 June in LA. The capsule opens 18 June 04:30 UTC = 17 June 21:30 PDT.
      expect(res.body.items[0]).toMatchObject({ type: 'capsule', date: '2026-06-17', daysLeft: 2 });
      expect(res.body.items[1]).toMatchObject({ title: "Mom's birthday", daysLeft: 7 });
    } finally {
      await q(`UPDATE users SET timezone = 'Asia/Kolkata' WHERE id = $1`, [aarav.id]);
    }
  });

  it('a birthday today is daysLeft 0, not next year', async () => {
    at(new Date('2026-06-22T06:00:00Z'));
    const res = await upcoming(aarav.token).expect(200);
    expect(res.body.items[0]).toMatchObject({ title: "Mom's birthday", date: '2026-06-22', daysLeft: 0 });
  });

  it('step 3: a new account with no data gets items: []', async () => {
    const fresh = await signUp('fresh@example.com');
    const res = await upcoming(fresh.token).expect(200);
    expect(res.body).toEqual({ items: [], counts: { next7Days: 0 } });
  });

  it('ties are broken by type, then title', async () => {
    const tie = await signUp('tie@example.com');
    await member(tie.id, 'Zed', { birthday: '1990-06-22' });
    await member(tie.id, 'Amy', { birthday: '1991-06-22', anniversary: '2015-06-22' });
    await event(tie.id, 'A party', '2026-06-22');
    at(NOON_UTC);
    const res = await upcoming(tie.token).expect(200);
    expect(res.body.items.map((i: { type: string; title: string }) => `${i.type} ${i.title}`)).toEqual([
      "anniversary Amy's anniversary",
      "birthday Amy's birthday",
      "birthday Zed's birthday",
      'event A party',
    ]);
  });

  it('a 29 February birthday falls on 28 February in a common year', async () => {
    const leap = await signUp('leap@example.com');
    await member(leap.id, 'Leapling', { birthday: '2000-02-29' });
    at(new Date('2027-02-20T10:00:00Z'));
    let res = await upcoming(leap.token).expect(200);
    expect(res.body.items[0]).toMatchObject({ date: '2027-02-28', daysLeft: 8 });

    at(new Date('2028-02-20T10:00:00Z'));
    res = await upcoming(leap.token).expect(200);
    expect(res.body.items[0]).toMatchObject({ date: '2028-02-29', daysLeft: 9 });
  });

  it.each([
    ['2000-02-29', 'yearly', '2027-03-01', '2028-02-29'],
    ['2000-02-29', 'yearly', '2027-01-10', '2027-02-28'],
    ['2026-01-31', 'monthly', '2026-04-05', '2026-04-30'],
    ['2026-01-31', 'monthly', '2026-04-30', '2026-04-30'],
    ['2026-01-15', 'monthly', '2026-04-16', '2026-05-15'],
    ['2026-12-31', 'yearly', '2026-06-01', '2026-12-31'],
    ['2026-06-01', 'none', '2026-06-02', null],
    ['2026-09-01', 'monthly', '2026-06-02', '2026-09-01'],
  ])('app_next_occurrence(%s, %s, today %s) = %s', async (date, rec, today, expected) => {
    const { rows } = await q(`SELECT app_next_occurrence($1, $2, $3)::text AS d`, [date, rec, today]);
    expect(rows[0].d).toBe(expected);
  });

  it.each([
    ['"age:18"', 18],
    ['{"age": 21}', 21],
    ['{"age": "x"}', null],
    ['"birthday"', null],
  ])('app_milestone_age(%s) = %s', async (spec, age) => {
    const { rows } = await q(`SELECT app_milestone_age($1::jsonb) AS a`, [spec]);
    expect(rows[0].a).toBe(age);
  });

  it.each(['?limit=0', '?limit=21', '?limit=abc'])('%s is a 400', async (query) => {
    await upcoming(aarav.token, query).expect(400);
  });

  it('?limit=2 returns 2', async () => {
    at(NOON_UTC);
    const res = await upcoming(aarav.token, '?limit=2').expect(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('needs a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/moments/upcoming').expect(401);
  });

  it('does not scan every member (EXPLAIN)', async () => {
    // Somebody else with a big address book, so a sequential scan would
    // have something to cost.
    const big = await signUp('big@example.com');
    await q(
      `INSERT INTO members (id, owner_id, name, birthday, anniversary)
       SELECT uuid_generate_v7(), $1, 'Person ' || g,
              date '1950-01-01' + (g % 20000), date '1980-01-01' + (g % 9000)
         FROM generate_series(1, 20000) g`,
      [big.id],
    );
    await q(
      `INSERT INTO events (id, owner_id, title, event_date, recurrence)
       SELECT uuid_generate_v7(), $1, 'Event ' || g, date '2000-01-01' + (g % 9000), 'yearly'
         FROM generate_series(1, 5000) g`,
      [big.id],
    );
    const bigVault = await vault(big.id);
    await q(
      `INSERT INTO capsules (id, vault_id, owner_id, title, state, unlock_kind, unlock_at, sealed_at)
       SELECT uuid_generate_v7(), $1, $2, 'Capsule ' || g, 'sealed', 'datetime',
              timestamptz '2027-01-01' + make_interval(days => g), now()
         FROM generate_series(1, 5000) g`,
      [bigVault, big.id],
    );
    await q(`ANALYZE members; ANALYZE events; ANALYZE capsules; ANALYZE users`);

    const { sql: text, params } = new PgDialect().sqlToQuery(upcomingSql(5, NOON_UTC));
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [aarav.id]);
      const plan = await client.query(`EXPLAIN ${text}`, params);
      const lines = plan.rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n');
      expect(lines).not.toMatch(/Seq Scan on members/);
      expect(lines).not.toMatch(/Seq Scan on events/);
      expect(lines).not.toMatch(/Seq Scan on capsules/);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});
