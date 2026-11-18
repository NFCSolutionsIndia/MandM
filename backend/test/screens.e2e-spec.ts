import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { writeFileSync } from 'node:fs';

import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * The mobile designs of 2026-11-17, end to end: Home, Notifications, Search,
 * Calendar (month, "Jump to", list). See Docs/development/SCREEN_API_MAP.md.
 *
 * The clock is frozen at Sunday 15 March 2026, 15:30 in Kolkata, the "today"
 * the designs show. The fixtures are the designs' people: Mom (Linda Carter)
 * on the 17th, Dad (Mike Carter) turning 60 on the 21st, Grandma Rose turning
 * 85 on the 28th, St. Patrick's Day on the 17th.
 */
describe('mobile screens: home, notifications, search, calendar', () => {
  let app: INestApplication;
  let harness: Harness;

  const CODE = '424242';
  const NOW = new Date('2026-03-15T10:00:00.000Z');

  const http = () => request(app.getHttpServer());
  const q = (text: string, params: unknown[] = []) => harness.ownerPool.query(text, params);

  async function signUp(email: string): Promise<{ token: string; id: string }> {
    await q(
      `INSERT INTO email_otps (id, email, code_hash, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now() + interval '10 minutes')`,
      [email, hashToken(CODE)],
    );
    const res = await http().post('/api/v1/auth/verify').send({ email, code: CODE }).expect(200);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  async function member(
    owner: string,
    name: string,
    f: { nickname?: string; location?: string; birthday?: string; precision?: string; anniversary?: string } = {},
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO members (id, owner_id, name, nickname, location, birthday, birthday_precision, anniversary)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [owner, name, f.nickname ?? null, f.location ?? null, f.birthday ?? null,
        f.precision ?? null, f.anniversary ?? null],
    );
    return rows[0].id;
  }

  async function event(
    owner: string,
    title: string,
    date: string,
    f: { type?: string; recurrence?: string; archived?: boolean; members?: string[] } = {},
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO events (id, owner_id, title, type, event_date, recurrence, archived_at)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6) RETURNING id`,
      [owner, title, f.type ?? 'custom', date, f.recurrence ?? 'none', f.archived ? new Date() : null],
    );
    for (const m of f.members ?? []) {
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

  async function memory(
    vaultId: string,
    author: string,
    title: string | null,
    occurred: string,
    f: { note?: string; tagged?: string[]; deleted?: boolean; media?: 'image' | 'video' } = {},
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO memories (id, vault_id, author_id, title, note, occurred_at, client_id, deleted_at)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, uuid_generate_v7(), $6) RETURNING id`,
      [vaultId, author, title, f.note ?? null, occurred, f.deleted ? new Date() : null],
    );
    const id = rows[0].id;
    for (const m of f.tagged ?? []) {
      await q(`INSERT INTO memory_members (memory_id, member_id) VALUES ($1, $2)`, [id, m]);
    }
    if (f.media) {
      await q(
        `INSERT INTO media_assets (id, memory_id, vault_id, owner_id, kind, mime, bytes, storage_key, checksum_sha256)
         VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, 1000, 'k/' || uuid_generate_v7(), repeat('a', 64))`,
        [id, vaultId, author, f.media, f.media === 'video' ? 'video/mp4' : 'image/jpeg'],
      );
    }
    return id;
  }

  async function capsule(
    vaultId: string,
    owner: string,
    title: string,
    unlockAt: string,
    state = 'sealed',
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO capsules (id, vault_id, owner_id, title, state, unlock_kind, unlock_at,
                             unlock_timezone, sealed_at, delivered_at)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, 'datetime', $5, 'Asia/Kolkata', now(), $6)
       RETURNING id`,
      [vaultId, owner, title, state, unlockAt, ['delivered', 'opened'].includes(state) ? unlockAt : null],
    );
    return rows[0].id;
  }

  async function notification(
    user: string,
    type: string,
    payload: Record<string, unknown> | null,
    createdAt: string,
    read = false,
  ): Promise<string> {
    const { rows } = await q(
      `INSERT INTO notifications (id, user_id, type, payload, created_at, read_at)
       VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5) RETURNING id`,
      [user, type, payload === null ? null : JSON.stringify(payload), createdAt, read ? createdAt : null],
    );
    return rows[0].id;
  }

  const get = (token: string, path: string) =>
    http().get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

  function freeze() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  }

  let emma: { token: string; id: string };
  let other: { token: string; id: string };
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

    emma = await signUp('emma@example.com'); // Asia/Kolkata, the default
    other = await signUp('other@example.com');
    const v = await vault(emma.id);
    const ov = await vault(other.id);

    // People, as on the designs.
    ids.mom = await member(emma.id, 'Linda Carter', {
      nickname: 'Mom', location: 'Austin, TX', birthday: '1958-03-17', precision: 'day',
    });
    ids.dad = await member(emma.id, 'Mike Carter', {
      nickname: 'Dad', location: 'Austin, TX', birthday: '1966-03-21', anniversary: '1988-06-10',
    });
    ids.grandma = await member(emma.id, 'Rose Carter', { nickname: 'Grandma Rose', birthday: '1941-03-28' });
    ids.leap = await member(emma.id, 'Leap Kid', { birthday: '2000-02-29' });
    ids.baby = await member(emma.id, 'Baby Noah', { birthday: '2026-03-10' });
    ids.grandpa = await member(emma.id, 'Grandpa');
    await member(emma.id, 'Year Only', { birthday: '1990-03-20', precision: 'year' });

    // Events.
    ids.stpat = await event(emma.id, 'St. Patrick’s Day', '2020-03-17', { type: 'festival', recurrence: 'yearly' });
    ids.book = await event(emma.id, 'Book club', '2026-01-05', { recurrence: 'monthly' });
    ids.house = await event(emma.id, 'Housewarming', '2026-03-08');
    ids.grandpaBday = await event(emma.id, 'Grandpa’s birthday', '1946-03-30', {
      type: 'birthday', recurrence: 'yearly', members: [ids.grandpa],
    });
    await event(emma.id, 'Archived', '2026-03-09', { archived: true });
    await event(emma.id, 'Mom party', '1958-03-17', { type: 'birthday', recurrence: 'yearly', members: [ids.mom] });

    // Capsules.
    ids.forDad = await capsule(v, emma.id, 'For Dad', '2026-03-25T04:30:00.000Z');
    ids.delivered = await capsule(v, emma.id, 'Delivered one', '2026-03-02T04:30:00.000Z', 'delivered');
    await capsule(v, emma.id, 'Draft one', '2026-03-12T04:30:00.000Z', 'draft');

    // Memories.
    ids.m60 = await memory(v, emma.id, 'Dad’s 60th video', '2026-03-01T10:00:00Z', { media: 'video' });
    ids.voice = await memory(v, emma.id, 'Voice for Dad', '2026-02-01T10:00:00Z');
    ids.thanks = await memory(v, emma.id, 'Thanksgiving 2025', '2025-11-27T10:00:00Z', {
      tagged: [ids.dad, ids.mom], media: 'image',
    });
    ids.noted = await memory(v, emma.id, 'Lake trip', '2025-07-01T10:00:00Z', { note: 'dad caught a fish', tagged: [ids.dad] });
    await memory(v, emma.id, 'Dad deleted', '2026-03-03T10:00:00Z', { deleted: true, tagged: [ids.dad] });

    // Somebody else's, all of which must stay invisible to Emma.
    await member(other.id, 'Other Dad', { nickname: 'Dad', birthday: '1960-03-16' });
    await memory(ov, other.id, 'Other Dad memory', '2026-03-01T10:00:00Z');
    await event(other.id, 'Other event', '2026-03-16');
  }, 120_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  // ── People: nickname, location, memory count ──────────────────────────────

  describe('people (members) carry nickname, location and a memory count', () => {
    it('create and read back', async () => {
      const res = await http()
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${emma.token}`)
        .send({ name: 'Olivia Park', nickname: 'Liv', location: 'Seattle, WA' })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Olivia Park', nickname: 'Liv', displayName: 'Liv', location: 'Seattle, WA', memoryCount: 0,
      });

      const patched = await http()
        .patch(`/api/v1/members/${res.body.id}`)
        .set('Authorization', `Bearer ${emma.token}`)
        .send({ nickname: null, location: 'Portland, OR' })
        .expect(200);
      expect(patched.body).toMatchObject({ nickname: null, displayName: 'Olivia Park', location: 'Portland, OR' });

      await http().delete(`/api/v1/members/${res.body.id}`).set('Authorization', `Bearer ${emma.token}`).expect(204);
    });

    it('memoryCount counts tagged memories that are not deleted', async () => {
      const res = await get(emma.token, `/members/${ids.dad}`).expect(200);
      expect(res.body).toMatchObject({ displayName: 'Dad', name: 'Mike Carter', location: 'Austin, TX', memoryCount: 2 });
    });

    it('the list search matches the nickname too', async () => {
      const res = await get(emma.token, '/members?q=dad').expect(200);
      expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([ids.dad]);
    });

    it('rejects a nickname over 64 characters and a location over 120', async () => {
      await http()
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${emma.token}`)
        .send({ name: 'X', nickname: 'n'.repeat(65) })
        .expect(422);
      await http()
        .post('/api/v1/members')
        .set('Authorization', `Bearer ${emma.token}`)
        .send({ name: 'X', location: 'l'.repeat(121) })
        .expect(422);
    });
  });

  // ── Home ──────────────────────────────────────────────────────────────────

  describe('Home', () => {
    it('users/me gives the greeting name, timezone and avatar', async () => {
      const res = await get(emma.token, '/users/me').expect(200);
      expect(res.body).toMatchObject({ timezone: 'Asia/Kolkata', avatarUrl: null });
      expect(typeof res.body.name).toBe('string');
    });

    it('"3 moments coming up this week", whatever the limit', async () => {
      freeze();
      const res = await get(emma.token, '/moments/upcoming?limit=1').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.counts).toEqual({ next7Days: 3 }); // Mom 17th, St. Patrick's 17th, Dad 21st
    });

    it('"Mom\'s birthday": the nickname leads, the name and city sit under it', async () => {
      freeze();
      const res = await get(emma.token, '/moments/upcoming?limit=5').expect(200);
      expect(res.body.items[0]).toMatchObject({
        type: 'birthday', title: "Mom's birthday", date: '2026-03-17', daysLeft: 2, turns: 68,
        person: { id: ids.mom, name: 'Linda Carter', nickname: 'Mom', displayName: 'Mom', location: 'Austin, TX' },
      });
      const dad = res.body.items.find((i: { id: string }) => i.id === ids.dad);
      expect(dad).toMatchObject({ title: "Dad's birthday", turns: 60, daysLeft: 6 });
    });

    it('"Sending soon": types=capsule returns only capsules', async () => {
      freeze();
      const res = await get(emma.token, '/moments/upcoming?types=capsule').expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([ids.forDad]);
      expect(res.body.items[0].turns).toBeNull();
      expect(res.body.counts).toEqual({ next7Days: 0 });
    });

    it('an unknown type is a 400', async () => {
      await get(emma.token, '/moments/upcoming?types=capsule,chats').expect(400);
    });
  });

  // ── Calendar ──────────────────────────────────────────────────────────────

  describe('Calendar: month grid', () => {
    it('March 2026: every date, in order, with "turns" and recurrence', async () => {
      freeze();
      const res = await get(emma.token, '/calendar?from=2026-03-01&to=2026-03-31').expect(200);
      expect(res.body).toMatchObject({ from: '2026-03-01', to: '2026-03-31', today: '2026-03-15' });
      const seen = res.body.items.map((i: { date: string; type: string; title: string }) => `${i.date} ${i.type} ${i.title}`);
      expect(seen).toEqual([
        '2026-03-02 capsule Delivered one',
        '2026-03-05 event Book club',
        '2026-03-08 event Housewarming',
        "2026-03-10 birthday Baby Noah's birthday",
        "2026-03-17 birthday Mom's birthday",
        '2026-03-17 holiday St. Patrick’s Day',
        "2026-03-21 birthday Dad's birthday",
        '2026-03-25 capsule For Dad',
        "2026-03-28 birthday Grandma Rose's birthday",
        '2026-03-30 birthday Grandpa’s birthday',
      ]);
      const by = (t: string) => res.body.items.find((i: { title: string }) => i.title === t);
      expect(by("Dad's birthday")).toMatchObject({ turns: 60, daysLeft: 6, recurrence: 'yearly', source: 'person' });
      expect(by("Grandma Rose's birthday")).toMatchObject({ turns: 85, daysLeft: 13 });
      expect(by('Grandpa’s birthday')).toMatchObject({ turns: 80, source: 'event', person: { id: ids.grandpa } });
      expect(by("Baby Noah's birthday")).toMatchObject({ turns: 0, daysLeft: -5 });
      expect(by('Delivered one')).toMatchObject({ capsuleState: 'delivered', daysLeft: -13 });
      expect(by('For Dad')).toMatchObject({ capsuleState: 'sealed', recurrence: 'none' });
      expect(by('St. Patrick’s Day')).toMatchObject({ type: 'holiday', recurrence: 'yearly', turns: null });
    });

    it('a 29 February birthday falls on 28 February in 2026', async () => {
      const res = await get(emma.token, '/calendar?from=2026-02-01&to=2026-02-28&types=birthday').expect(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({ title: "Leap Kid's birthday", date: '2026-02-28', turns: 26 }),
      ]);
    });

    it('nothing repeats before it began: no birthday for Baby Noah in 2025', async () => {
      const res = await get(emma.token, '/calendar?from=2025-03-01&to=2025-03-31&types=birthday').expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).not.toContain(ids.baby);
    });

    it('validates the range', async () => {
      await get(emma.token, '/calendar?from=2026-03-31&to=2026-03-01').expect(400);
      await get(emma.token, '/calendar?from=2026-01-01&to=2027-01-02').expect(400);
      await get(emma.token, '/calendar?from=2026-02-30&to=2026-03-01').expect(400);
      await get(emma.token, '/calendar?from=2026-03-01').expect(400);
      await get(emma.token, '/calendar?from=2026-03-01&to=2026-03-31&types=gifts').expect(400);
    });

    it('needs a session', async () => {
      await http().get('/api/v1/calendar?from=2026-03-01&to=2026-03-31').expect(401);
    });
  });

  describe('Calendar: list view (filter chips and search)', () => {
    it('Birthdays chip + "birthday" in the search box, rest of the year', async () => {
      freeze();
      const res = await get(emma.token, '/calendar?from=2026-03-15&to=2026-12-31&types=birthday&q=birthday').expect(200);
      expect(res.body.items.map((i: { title: string; daysLeft: number }) => `${i.title} ${i.daysLeft}`)).toEqual([
        "Mom's birthday 2",
        "Dad's birthday 6",
        "Grandma Rose's birthday 13",
        'Grandpa’s birthday 15',
      ]);
    });

    it('search matches a person\'s nickname, not only the title', async () => {
      const res = await get(emma.token, '/calendar?from=2026-01-01&to=2026-12-31&q=mike').expect(200);
      expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(["Dad's birthday", "Dad's anniversary"]);
    });

    it('Holidays and Capsules chips', async () => {
      const h = await get(emma.token, '/calendar?from=2026-01-01&to=2026-12-31&types=holiday').expect(200);
      expect(h.body.items.map((i: { id: string }) => i.id)).toEqual([ids.stpat]);
      const c = await get(emma.token, '/calendar?from=2026-01-01&to=2026-12-31&types=capsule').expect(200);
      expect(c.body.items.map((i: { id: string }) => i.id)).toEqual([ids.delivered, ids.forDad]);
    });

    it('a search for "%" is a percent sign, not a wildcard', async () => {
      const res = await get(emma.token, '/calendar?from=2026-01-01&to=2026-12-31&q=%25').expect(200);
      expect(res.body.items).toEqual([]);
    });
  });

  describe('Calendar: "Jump to" sheet', () => {
    it('per-month counts for the year', async () => {
      freeze();
      const res = await get(emma.token, '/calendar/summary?year=2026').expect(200);
      expect(res.body.months).toHaveLength(12);
      const march = res.body.months[2];
      expect(march).toMatchObject({ month: 3, count: 10, days: 9 });
      expect(march.byType).toEqual({ birthday: 5, holiday: 1, event: 2, capsule: 2 });
      // Book club repeats monthly, so no month of 2026 is empty.
      expect(res.body.months.every((m: { count: number }) => m.count >= 1)).toBe(true);
    });

    it('types narrows the counts', async () => {
      const res = await get(emma.token, '/calendar/summary?year=2026&types=birthday').expect(200);
      // 10th, 17th, 21st, 28th, 30th: five birthdays on five days.
      expect(res.body.months[2]).toMatchObject({ count: 5, days: 5 });
      expect(res.body.months[0]).toMatchObject({ count: 0, days: 0, byType: {} });
    });

    it('validates the year', async () => {
      await get(emma.token, '/calendar/summary').expect(400);
      await get(emma.token, '/calendar/summary?year=99999').expect(400);
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────

  describe('Search', () => {
    it('"dad": People, Memories and Dates', async () => {
      freeze();
      const res = await get(emma.token, '/search?q=dad').expect(200);

      expect(res.body.people.items).toEqual([
        expect.objectContaining({
          id: ids.dad, displayName: 'Dad', name: 'Mike Carter', location: 'Austin, TX', memoryCount: 2,
        }),
      ]);
      expect(res.body.memories.items.map((m: { id: string }) => m.id)).toEqual([
        ids.m60, ids.voice, ids.thanks, ids.noted,
      ]);
      expect(res.body.memories.items[0]).toMatchObject({ mediaKind: 'video', title: 'Dad’s 60th video' });
      expect(res.body.memories.items[1]).toMatchObject({ mediaKind: null, thumbnailUrl: null });
      expect(res.body.dates.items.map((d: { title: string; date: string }) => `${d.date} ${d.title}`)).toEqual([
        "2026-03-21 Dad's birthday",
        '2026-03-25 For Dad',
        "2026-06-10 Dad's anniversary",
      ]);
      expect(res.body.dates.items[0]).toMatchObject({ turns: 60, daysLeft: 6 });
      expect(res.body).not.toHaveProperty('chats');
    });

    it('only the requested sections come back', async () => {
      const res = await get(emma.token, '/search?q=dad&types=people').expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['people', 'q']);
    });

    it('"See all" pages one section with its cursor', async () => {
      const first = await get(emma.token, '/search?q=dad&types=memories&limit=2').expect(200);
      expect(first.body.memories.items.map((m: { id: string }) => m.id)).toEqual([ids.m60, ids.voice]);
      const cursor = first.body.memories.nextCursor;
      expect(cursor).toEqual(expect.any(String));

      const second = await get(emma.token, `/search?q=dad&types=memories&limit=2&cursor=${cursor}`).expect(200);
      expect(second.body.memories.items.map((m: { id: string }) => m.id)).toEqual([ids.thanks, ids.noted]);
      expect(second.body.memories.nextCursor).toBeNull();
    });

    it('dates page too', async () => {
      freeze();
      const first = await get(emma.token, '/search?q=dad&types=dates&limit=1').expect(200);
      const second = await get(
        emma.token,
        `/search?q=dad&types=dates&limit=2&cursor=${first.body.dates.nextCursor}`,
      ).expect(200);
      expect(second.body.dates.items.map((d: { title: string }) => d.title)).toEqual(['For Dad', "Dad's anniversary"]);
    });

    it('never shows another family\'s people, memories or dates', async () => {
      const res = await get(other.token, '/search?q=carter').expect(200);
      expect(res.body.people.items).toEqual([]);
      expect(res.body.memories.items).toEqual([]);
      expect(res.body.dates.items).toEqual([]);
      const mine = await get(emma.token, '/search?q=other').expect(200);
      expect(mine.body.people.items).toEqual([]);
      expect(mine.body.memories.items).toEqual([]);
    });

    it('validation', async () => {
      await get(emma.token, '/search?q=d').expect(422);
      await get(emma.token, '/search').expect(422);
      await get(emma.token, '/search?q=dad&types=chats').expect(422);
      await get(emma.token, '/search?q=dad&cursor=abc').expect(422); // cursor with every type
      await get(emma.token, '/search?q=dad&types=people&cursor=not-ours').expect(400);
      await http().get('/api/v1/search?q=dad').expect(401);
    });

    it('a search for "%%" matches nothing', async () => {
      const res = await get(emma.token, '/search?q=%25%25').expect(200);
      expect(res.body.people.items).toEqual([]);
      expect(res.body.memories.items).toEqual([]);
      expect(res.body.dates.items).toEqual([]);
    });
  });

  // ── Scale ─────────────────────────────────────────────────────────────────

  describe('at scale: 10,000 memories, 500 people, 200 events', () => {
    let big: { token: string; id: string };
    const timings: Record<string, number> = {};

    beforeAll(async () => {
      big = await signUp('big@example.com');
      const bv = await vault(big.id);
      await q(
        `INSERT INTO members (id, owner_id, name, nickname, birthday, anniversary)
         SELECT uuid_generate_v7(), $1, 'Person ' || g, CASE WHEN g % 10 = 0 THEN 'Nick ' || g END,
                date '1950-01-01' + g * 37, CASE WHEN g % 3 = 0 THEN date '1980-01-01' + g * 11 END
           FROM generate_series(1, 500) g`,
        [big.id],
      );
      await q(
        `INSERT INTO events (id, owner_id, title, type, event_date, recurrence)
         SELECT uuid_generate_v7(), $1, 'Event ' || g, 'custom', date '2026-01-01' + g,
                (ARRAY['none', 'yearly', 'monthly'])[1 + g % 3]
           FROM generate_series(1, 200) g`,
        [big.id],
      );
      await q(
        `INSERT INTO memories (id, vault_id, author_id, title, note, occurred_at, client_id)
         SELECT uuid_generate_v7(), $1, $2, 'Memory ' || g, 'A note about day ' || g,
                timestamptz '2010-01-01' + make_interval(hours => g), uuid_generate_v7()
           FROM generate_series(1, 10000) g`,
        [bv, big.id],
      );
      await q(`ANALYZE members; ANALYZE events; ANALYZE memories; ANALYZE memory_members`);
    }, 120_000);

    afterAll(() => {
      // Printed so the number lands in the test log and the coverage report.
      console.info('screen API timings (ms, warm, local Docker):', timings);
      if (process.env.SCREEN_TIMINGS_FILE) writeFileSync(process.env.SCREEN_TIMINGS_FILE, JSON.stringify(timings));
    });

    async function timed(name: string, path: string) {
      await get(big.token, path).expect(200); // warm
      const started = performance.now();
      const res = await get(big.token, path).expect(200);
      timings[name] = Math.round(performance.now() - started);
      return res;
    }

    it('search "All" at 10,000 memories: a regression guard, not the 300 ms target (BE-17)', async () => {
      const res = await timed('search all', '/search?q=memory 99&limit=5');
      expect(res.body.memories.items.length).toBe(5);
      // Measured ~900 ms end to end on local Docker for Windows, ~410 ms of it the
      // memories query: row-level security checks every row before ILIKE can
      // filter. BE-17 replaces it with indexed full-text search. Until then
      // this only catches a regression, such as JIT coming back (3.8 s).
      expect(timings['search all']).toBeLessThan(2500);
    });

    it('the calendar month and the "Jump to" year are quick too', async () => {
      await timed('calendar month', '/calendar?from=2026-03-01&to=2026-03-31');
      await timed('calendar year summary', '/calendar/summary?year=2026');
      await timed('calendar list, rest of year', '/calendar?from=2026-03-15&to=2026-12-31&q=person');
      // ~60-120 ms measured; 2.5-3 s before JIT was switched off for these queries.
      const calendar = Object.entries(timings).filter(([k]) => k.startsWith('calendar'));
      expect(Math.max(...calendar.map(([, v]) => v))).toBeLessThan(500);
    });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  describe('Notifications', () => {
    const n: Record<string, string> = {};

    beforeAll(async () => {
      n.loved = await notification(emma.id, 'capsule_reply',
        { title: 'Mom loved your video', body: '“Best birthday surprise ever!”', memberId: ids.mom },
        '2026-03-15T09:58:00.000Z');
      n.turns = await notification(emma.id, 'occasion_reminder',
        { title: 'Dad turns 60 in 6 days', body: 'Video ready · gift not picked yet', memberId: ids.dad },
        '2026-03-15T03:30:00.000Z');
      n.plain = await notification(emma.id, 'vault_invite', null, '2026-03-12T10:00:00.000Z', true);
      // Two in the same microsecond, to prove the cursor neither skips nor repeats.
      n.tieA = await notification(emma.id, 'memory_added', { actorName: 'Jake' }, '2026-03-10T10:00:00.123456Z');
      n.tieB = await notification(emma.id, 'memory_added', { actorName: 'Jake' }, '2026-03-10T10:00:00.123456Z');
      // Not Emma's; also points at Emma's person, which must not leak a name.
      n.theirs = await notification(other.id, 'capsule_reply', { title: 'Theirs', memberId: ids.mom }, '2026-03-15T09:59:00.000Z');
    });

    it('the bell: unread count', async () => {
      const res = await get(emma.token, '/notifications/unread-count').expect(200);
      expect(res.body).toEqual({ unread: 4 });
    });

    it('the list: newest first, with the person\'s avatar slot and the payload', async () => {
      const res = await get(emma.token, '/notifications').expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id).slice(0, 3)).toEqual([n.loved, n.turns, n.plain]);
      expect(res.body.items[0]).toMatchObject({
        type: 'capsule_reply', title: 'Mom loved your video', body: '“Best birthday surprise ever!”',
        actor: { memberId: ids.mom, name: 'Mom', avatarUrl: null }, read: false, readAt: null,
      });
      expect(res.body.items[2]).toMatchObject({
        type: 'vault_invite', title: 'You were invited to a vault', body: null, actor: null, read: true,
      });
      expect(res.body.items[3]).toMatchObject({ actor: { memberId: null, name: 'Jake' } });
      expect(res.body.items.map((i: { id: string }) => i.id)).not.toContain(n.theirs);
    });

    it('another user\'s notification cannot name my person', async () => {
      const res = await get(other.token, '/notifications').expect(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({ id: n.theirs, title: 'Theirs', actor: null }),
      ]);
    });

    it('pages with no gap and no repeat, even within one microsecond', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await get(emma.token, `/notifications?limit=1${cursor ? `&cursor=${cursor}` : ''}`).expect(200);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it('unread=true filters', async () => {
      const res = await get(emma.token, '/notifications?unread=true').expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).not.toContain(n.plain);
      expect(res.body.items).toHaveLength(4);
    });

    it('tapping one marks it read; again is still 204; not mine is 404', async () => {
      const read = (token: string, id: string) =>
        http().post(`/api/v1/notifications/${id}/read`).set('Authorization', `Bearer ${token}`);
      await read(emma.token, n.turns).expect(204);
      await read(emma.token, n.turns).expect(204);
      await read(emma.token, n.theirs).expect(404);
      await read(emma.token, 'not-a-uuid').expect(404);
      const res = await get(emma.token, '/notifications/unread-count').expect(200);
      expect(res.body).toEqual({ unread: 3 });
    });

    it('"Mark all read" changes only mine', async () => {
      const res = await http()
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${emma.token}`)
        .expect(200);
      expect(res.body).toEqual({ updated: 3 });
      expect((await get(emma.token, '/notifications/unread-count')).body).toEqual({ unread: 0 });
      expect((await get(other.token, '/notifications/unread-count')).body).toEqual({ unread: 1 });
    });

    it('quiet hours: off by default, set, read back, cleared', async () => {
      const before = await get(emma.token, '/notifications/preferences').expect(200);
      expect(before.body.quietHours).toBeNull();
      expect(before.body.types).toHaveLength(11);
      expect(before.body.types.find((t: { type: string }) => t.type === 'security_alert'))
        .toEqual({ type: 'security_alert', push: true, email: true, suppressible: false });

      const set = await http()
        .put('/api/v1/notifications/preferences/quiet-hours')
        .set('Authorization', `Bearer ${emma.token}`)
        .send({ start: '22:00', end: '07:00' })
        .expect(200);
      expect(set.body.quietHours).toEqual({ start: '22:00', end: '07:00', timezone: 'Asia/Kolkata' });

      // Not applied to what a user may not silence.
      const { rows } = await q(
        `SELECT type FROM notification_preferences WHERE user_id = $1 AND quiet_hours_start IS NOT NULL ORDER BY type`,
        [emma.id],
      );
      expect(rows.map((r: { type: string }) => r.type)).not.toContain('security_alert');
      expect(rows).toHaveLength(8);

      const cleared = await http()
        .delete('/api/v1/notifications/preferences/quiet-hours')
        .set('Authorization', `Bearer ${emma.token}`)
        .expect(200);
      expect(cleared.body.quietHours).toBeNull();
      expect((await get(other.token, '/notifications/preferences')).body.quietHours).toBeNull();
    });

    it('quiet hours validation', async () => {
      const put = (body: object) =>
        http().put('/api/v1/notifications/preferences/quiet-hours').set('Authorization', `Bearer ${emma.token}`).send(body);
      await put({ start: '22:00', end: '22:00' }).expect(422);
      await put({ start: '24:00', end: '07:00' }).expect(422);
      await put({ start: '10 PM', end: '7 AM' }).expect(422);
      await put({ start: '22:00' }).expect(422);
      await put({ start: '22:00', end: '07:00', extra: 1 }).expect(422);
    });

    it('needs a session', async () => {
      await http().get('/api/v1/notifications').expect(401);
      await http().get('/api/v1/notifications/unread-count').expect(401);
      await http().post('/api/v1/notifications/read-all').expect(401);
    });
  });
});
